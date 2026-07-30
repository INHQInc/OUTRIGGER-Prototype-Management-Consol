import { NextRequest, NextResponse } from "next/server";
import { guardPrototypeAccess } from "@/lib/prototypes/guard";
import { resolveRepoSource } from "@/lib/prototypes/source";
import { listArtifactVersions } from "@/lib/prototypes/versions";
import { generateCoverage, generateTestCases } from "@/lib/ai/coverage";
import { codeHashOf } from "@/lib/prototypes/brief-audit";
import {
  getCoverage, mutateCoverage, coverageReviewed, coverageHasFailures, testCasesRun,
  type CoverageSpec, type CoverageDevice, type CheckResult, type TestStatus, type TestResult,
} from "@/lib/prototypes/coverage";
import { addIdea, listRecommendations } from "@/lib/ideas/ideas";
import { currentUser } from "@/lib/auth/current";
import { audit } from "@/lib/audit";

export const maxDuration = 60;

const RESULTS = ["pass", "fail", "na"];
const TEST_STATUSES: TestStatus[] = ["pass", "fail", "blocked", "na"];

/**
 * GET  ?key=                        → the QA spec (scenarios + test cases +
 *                                     all results). Token-allowed — the agent
 *                                     fetches its test cases here.
 * POST { key, generate: true }      → derive scenarios from brief + built code
 *                                     (session-only; results carried over by id)
 * POST { key, generateTests: true } → expand scenarios into traditional test
 *                                     cases (session-only; runs carried over)
 * POST { key, results: {...} }      → save scenario review results (session-only)
 * POST { key, testResults: {...} }  → save test-case runs. Token-ALLOWED: the
 *                                     agent posts its runs here (mode:"agent",
 *                                     stamped server-side; the token can WRITE
 *                                     runs, never clear them); humans post
 *                                     from the console (mode:"human"). Agent
 *                                     failures auto-file Recommendations.
 *
 * All spec writes go through mutateCoverage (compare-and-set + retry): an
 * agent batch and a human's cell click are concurrent serverless writers over
 * one blob — last-write-wins here silently destroyed QA evidence.
 */
export async function GET(req: NextRequest) {
  const g = await guardPrototypeAccess(req.nextUrl.searchParams.get("key"), req.headers.get("authorization"));
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  return NextResponse.json({ coverage: await getCoverage(g.proto.key) });
}

async function resolveBuild(key: string): Promise<{ variationJs?: string; builtSha?: string }> {
  const source = await resolveRepoSource(key).catch(() => null);
  if (source?.found && source.variationJs) return { variationJs: source.variationJs, builtSha: source.headSha };
  const latest = (await listArtifactVersions(key))[0];
  return { variationJs: latest?.variationJs, builtSha: latest?.gitSha };
}

export async function POST(req: NextRequest) {
  let body: {
    key?: string;
    generate?: boolean;
    generateTests?: boolean;
    results?: Record<string, Record<string, string>>;
    testResults?: Record<string, Record<string, { status?: string; note?: string } | string>>;
  };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const g = await guardPrototypeAccess(body.key ?? null, req.headers.get("authorization"));
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  // Generation spends API credit and scenario review is a human act —
  // session-only. Test-case RUNS are the one token-allowed write: that's the
  // agent reporting what it executed.
  if ((body.generate || body.generateTests || body.results) && g.viaToken) {
    return NextResponse.json({ error: "Session-only — the agent token can read the spec and post test runs, nothing else." }, { status: 403 });
  }
  const user = await currentUser();
  const actor = g.viaToken ? "claude (agent)" : user?.name ?? user?.sub ?? "user";

  try {
    if (body.generate) {
      const { variationJs, builtSha } = await resolveBuild(g.proto.key);
      if (!variationJs) return NextResponse.json({ error: "Nothing built yet — the QA spec is derived from the built code." }, { status: 400 });
      const builtCodeHash = codeHashOf(variationJs);

      // The LLM call happens OUTSIDE the write — a multi-second RMW window
      // would silently revert every result that lands during generation.
      const scenarios = await generateCoverage({ proto: g.proto, variationJs, builtSha });
      const now = new Date().toISOString();
      const spec = await mutateCoverage(g.proto.key, (s) => {
        // Carry review results forward where scenario ids survived — pruned
        // to each NEW scenario's devices (an orphaned result is invisible in
        // the UI and would wedge the gate).
        const results: CoverageSpec["results"] = {};
        for (const sc of scenarios) {
          const old = s.results[sc.id];
          if (!old) continue;
          const kept: CoverageSpec["results"][string] = {};
          for (const d of sc.devices) { if (old[d]) kept[d] = old[d]; }
          if (Object.keys(kept).length) results[sc.id] = kept;
        }
        // Surviving test cases: parent must survive; devices intersect with
        // the regenerated parent's; runs pruned the same way. They're kept
        // but flagged stale — the parent's MEANING may have shifted.
        const byNewScenario = new Map(scenarios.map((sc) => [sc.id, sc]));
        const keptCases = (s.testCases ?? [])
          .map((t) => {
            const parent = byNewScenario.get(t.scenarioId);
            if (!parent) return null;
            const devices = t.devices.filter((d) => parent.devices.includes(d));
            return devices.length ? { ...t, devices } : null;
          })
          .filter((t): t is NonNullable<typeof t> => t !== null);
        const keptRuns: CoverageSpec["testResults"] = {};
        for (const t of keptCases) {
          const old = s.testResults?.[t.id];
          if (!old) continue;
          const kept: Partial<Record<CoverageDevice, TestResult>> = {};
          for (const d of t.devices) { if (old[d]) kept[d] = old[d]; }
          if (Object.keys(kept).length) keptRuns[t.id] = kept;
        }
        s.scenarios = scenarios;
        s.generatedAt = now;
        s.generatedBy = actor;
        s.builtSha = builtSha;
        s.builtCodeHash = builtCodeHash;
        s.results = results;
        s.testCases = keptCases.length ? keptCases : undefined;
        s.testResults = keptCases.length ? keptRuns : undefined;
        s.testsStale = keptCases.length ? true : undefined;
        if (!keptCases.length) { s.testsGeneratedAt = undefined; s.testsBuiltSha = undefined; s.testsBuiltCodeHash = undefined; }
      }, { init: () => ({ scenarios: [], generatedAt: now, results: {} }) });
      const gaps = scenarios.filter((s) => s.gap).length;
      await audit(g.orgId, actor, "coverage.generated", g.proto.name,
        `${scenarios.length} scenarios${gaps ? ` · ${gaps} GAP${gaps === 1 ? "" : "S"} (unhandled by the build)` : ""}${builtSha ? ` · vs ${builtSha.slice(0, 7)}` : ""}`);
      return NextResponse.json({ coverage: spec });
    }

    if (body.generateTests) {
      const current = await getCoverage(g.proto.key);
      if (!current || !current.scenarios.length) return NextResponse.json({ error: "No scenarios yet — generate the QA spec first; test cases derive from it." }, { status: 400 });
      const { variationJs, builtSha } = await resolveBuild(g.proto.key);
      if (!variationJs) return NextResponse.json({ error: "Nothing built yet — test cases are grounded in the built code." }, { status: 400 });
      const builtCodeHash = codeHashOf(variationJs);

      // Gap scenarios are untestable until built — excluded IN CODE, not
      // just in the prompt. LLM outside the write window, as above.
      const testable = current.scenarios.filter((s) => !s.gap);
      if (!testable.length) return NextResponse.json({ error: "Every scenario is a gap — nothing testable until the build handles them." }, { status: 400 });
      // Content snapshot of what the LLM derived FROM — if the scenarios move
      // while it runs, the new cases describe superseded parents.
      const scenarioSnapshot = JSON.stringify(current.scenarios);
      const generated = await generateTestCases({ proto: g.proto, scenarios: testable, variationJs, builtSha });
      const now = new Date().toISOString();
      const spec = await mutateCoverage(g.proto.key, (s) => {
        // Validate against the FRESH spec — scenarios may have regenerated
        // while the LLM ran: cases pointing at vanished parents drop, device
        // matrices intersect with the CURRENT parent's (an id can survive a
        // regen while its devices shrink), and if the scenario CONTENT moved
        // at all the cases are committed but flagged stale — they encode the
        // superseded parents' meaning.
        const byLiveScenario = new Map(s.scenarios.filter((sc) => !sc.gap).map((sc) => [sc.id, sc]));
        const testCases = generated
          .map((t) => {
            const parent = byLiveScenario.get(t.scenarioId);
            if (!parent) return null;
            const devices = t.devices.filter((d) => parent.devices.includes(d));
            return devices.length ? { ...t, devices } : null;
          })
          .filter((t): t is NonNullable<typeof t> => t !== null);
        // Runs carry forward ONLY when they're still evidence: same code AND
        // identical steps. A run against old code or an old script relabeled
        // as current would fake completeness.
        const oldById = new Map((s.testCases ?? []).map((t) => [t.id, t]));
        const sameCode = s.testsBuiltCodeHash === builtCodeHash;
        const testResults: CoverageSpec["testResults"] = {};
        for (const t of testCases) {
          const old = s.testResults?.[t.id];
          const oldCase = oldById.get(t.id);
          if (!old || !sameCode || !oldCase || JSON.stringify(oldCase.steps) !== JSON.stringify(t.steps)) continue;
          const kept: Partial<Record<CoverageDevice, TestResult>> = {};
          for (const d of t.devices) { if (old[d]) kept[d] = old[d]; }
          if (Object.keys(kept).length) testResults[t.id] = kept;
        }
        s.testCases = testCases;
        s.testResults = testResults;
        s.testsGeneratedAt = now;
        s.testsBuiltSha = builtSha;
        s.testsBuiltCodeHash = builtCodeHash;
        s.testsStale = JSON.stringify(s.scenarios) !== scenarioSnapshot ? true : undefined;
      });
      if (!spec?.testCases?.length) return NextResponse.json({ error: "The scenarios changed while test cases were generating — regenerate them." }, { status: 409 });
      await audit(g.orgId, actor, "coverage.tests-generated", g.proto.name,
        `${spec.testCases.length} test cases across ${new Set(spec.testCases.map((t) => t.scenarioId)).size} scenarios${builtSha ? ` · vs ${builtSha.slice(0, 7)}` : ""}`);
      return NextResponse.json({ coverage: spec });
    }

    if (body.results) {
      const payload = body.results;
      let applied = false;
      let wasReviewed = false;
      const spec = await mutateCoverage(g.proto.key, (s) => {
        applied = false;
        wasReviewed = coverageReviewed(s);
        const byId = new Map(s.scenarios.map((sc) => [sc.id, sc]));
        for (const [sid, byDevice] of Object.entries(payload)) {
          const scenario = byId.get(sid);
          if (!scenario || !byDevice || typeof byDevice !== "object") continue;
          s.results[sid] = s.results[sid] ?? {};
          for (const [dev, val] of Object.entries(byDevice)) {
            // Valid only for devices THIS scenario lists — a result on any
            // other device would be invisible in the UI and unclearable.
            if (!scenario.devices.includes(dev as CoverageDevice)) continue;
            if (val === "") { delete s.results[sid][dev as CoverageDevice]; applied = true; }
            else if (RESULTS.includes(val)) { s.results[sid][dev as CoverageDevice] = val as CheckResult; applied = true; }
          }
        }
      });
      if (!spec) return NextResponse.json({ error: "No QA spec yet — generate it first." }, { status: 400 });
      if (applied && !wasReviewed && coverageReviewed(spec)) {
        await audit(g.orgId, actor, "coverage.reviewed", g.proto.name,
          coverageHasFailures(spec) ? "all core scenarios reviewed — WITH FAILURES" : "all core scenarios reviewed · pass");
      }
      return NextResponse.json({ coverage: spec });
    }

    if (body.testResults) {
      const payload = body.testResults;
      const mode: TestResult["mode"] = g.viaToken ? "agent" : "human";
      let saved = 0, failed = 0, dropped = 0;
      let wasRun = false;
      let failures: { tc: string; device: string; note?: string }[] = [];
      const spec = await mutateCoverage(g.proto.key, (s) => {
        // The mutation re-runs on CAS retry — reset the tallies each attempt.
        saved = 0; failed = 0; dropped = 0; failures = [];
        wasRun = testCasesRun(s);
        if (!s.testCases?.length) return;
        const byId = new Map(s.testCases.map((t) => [t.id, t]));
        s.testResults = s.testResults ?? {};
        for (const [tid, byDevice] of Object.entries(payload)) {
          const tc = byId.get(tid);
          if (!tc || !byDevice || typeof byDevice !== "object") { dropped++; continue; }
          s.testResults[tid] = s.testResults[tid] ?? {};
          for (const [dev, val] of Object.entries(byDevice)) {
            if (!tc.devices.includes(dev as CoverageDevice)) { dropped++; continue; }
            // typeof null === "object" — guard before touching val.status.
            if (val === null || val === undefined) { dropped++; continue; }
            if (val === "") {
              // Clearing a recorded run destroys QA evidence — humans only.
              // The agent token WRITES runs; it never erases them.
              if (g.viaToken) { dropped++; continue; }
              delete s.testResults[tid][dev as CoverageDevice];
              continue;
            }
            if (typeof val !== "object" && typeof val !== "string") { dropped++; continue; }
            // An agent run never OVERWRITES a human verdict either — a human
            // fail un-redded by an agent pass would defeat the one gate.
            // Humans overrule agents; never the reverse.
            const existing = s.testResults[tid][dev as CoverageDevice];
            if (g.viaToken && existing?.mode === "human") { dropped++; continue; }
            const status = typeof val === "object" ? String(val.status ?? "") : String(val);
            if (!(TEST_STATUSES as string[]).includes(status)) { dropped++; continue; }
            const note = typeof val === "object" && typeof val.note === "string" ? val.note.trim().slice(0, 2000) : undefined;
            // Attribution is stamped SERVER-side — the client never sets who/how.
            s.testResults[tid][dev as CoverageDevice] = {
              status: status as TestStatus, note: note || undefined, by: actor, mode, at: new Date().toISOString(),
            };
            saved++;
            if (status === "fail") { failed++; failures.push({ tc: tid, device: dev, note }); }
          }
        }
      });
      if (!spec) return NextResponse.json({ error: "No QA spec yet — generate it first." }, { status: 400 });
      if (!spec.testCases?.length) return NextResponse.json({ error: "No test cases yet — generate them first." }, { status: 400 });

      // Agent runs are audited as a batch; agent failures auto-file
      // Recommendations so fixes get queued without anyone transcribing.
      // Dedupe is keyed by a stable Case/Device marker in the BODY — titles
      // are LLM-authored and collide/retitle across regenerations.
      if (mode === "agent" && (saved > 0 || dropped > 0)) {
        await audit(g.orgId, actor, "coverage.tests-run", g.proto.name,
          `${saved} run${saved === 1 ? "" : "s"} · ${failed ? `${failed} FAIL${failed === 1 ? "" : "S"}` : "all pass/na"}${dropped ? ` · ${dropped} entr${dropped === 1 ? "y" : "ies"} DROPPED (stale ids/devices — re-fetch the spec)` : ""}`);
        if (failures.length) {
          const byId = new Map(spec.testCases.map((t) => [t.id, t]));
          const open = await listRecommendations(g.orgId, g.proto.key).catch(() => []);
          const openMarkers = new Set(
            open.filter((i) => i.status === "new" || i.status === "planned")
              .flatMap((i) => { const m = i.body.match(/^Case: \S+ · Device: \S+$/m); return m ? [m[0]] : []; }));
          for (const f of failures) {
            const marker = `Case: ${f.tc} · Device: ${f.device}`;
            if (openMarkers.has(marker)) continue;
            openMarkers.add(marker);
            const tc = byId.get(f.tc);
            await addIdea({
              orgId: g.orgId, kind: "recommendation", prototypeKey: g.proto.key, category: "bug", source: "claude",
              title: `Test case failed: ${tc?.title ?? f.tc} (${f.device})`.slice(0, 200),
              body: `Automated QA run failed.\n\n${marker}\nScenario: ${tc?.scenarioId ?? "?"}\n\nObserved: ${f.note ?? "(no note recorded)"}\n\nSteps:\n${(tc?.steps ?? []).map((s, i) => `${i + 1}. ${s.action} → expect: ${s.expect}`).join("\n")}`,
            }).catch(() => { /* a failed rec must not fail the run report */ });
          }
        }
      }
      if (saved > 0 && !wasRun && testCasesRun(spec)) {
        await audit(g.orgId, actor, "coverage.tests-complete", g.proto.name,
          coverageHasFailures(spec) ? "every core test case run — WITH FAILURES" : "every core test case run · pass");
      }
      return NextResponse.json({ coverage: spec, saved, dropped });
    }

    return NextResponse.json({ error: "Nothing to do — pass generate, generateTests, results, or testResults." }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
