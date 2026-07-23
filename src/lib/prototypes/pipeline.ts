/**
 * The pipeline — ONE derivation of "where is this prototype and what's next,"
 * computed from ground truth the system already stores. Nothing self-reported.
 *
 * This is the state machine behind the prototype page's stepper, the primary
 * CTA, the ground-truth strip, the dashboard's needs-attention rows — and,
 * later, the Program Board's columns (B1/B2 read the same derivation).
 *
 * Every session-burning confusion this encodes: "did it save?", "is it
 * synced?", "why isn't it live?", "what do I do next?" — the answer is now a
 * pure function of stored state, rendered once, everywhere the same.
 */
import type { PrototypeRecord, ArtifactVersion } from "./types";
import type { RepoSource } from "./source";
import type { PushResult } from "./ship";
import { injectionPasses } from "./types";
import { contentHashOf } from "./provision";
import { artifactProblem } from "./served";

export type StepState = "done" | "current" | "todo" | "blocked";

export interface PipelineStep {
  id: "brief" | "build" | "review" | "cut" | "ship" | "live";
  title: string;
  state: StepState;
  /** One line of honest status, e.g. "3/3 pages inject ✓" or "v4 · certified ✓". */
  status: string;
  /** Anchor on the prototype page this step's card carries. */
  anchor: string;
}

export interface PipelineAlert {
  level: "warn" | "danger";
  text: string;
  anchor?: string; // on-page anchor to fix it
}

export interface GroundTruth {
  servingSha?: string;   // what the loader serves (branch HEAD when found)
  headSha?: string;
  built: boolean;
  artifactProblem: string | null;
  synced: boolean;       // provision flag's contentHash matches the record now
  certified: boolean | null; // null = no certified version yet
  pushedVersion?: number;
  latestVersion?: number;
  pushVerified?: boolean;
  claudeSeenAt?: string | null;
}

export interface Pipeline {
  steps: PipelineStep[];
  /** The one thing to do next. */
  primaryAction: { label: string; anchor: string };
  alerts: PipelineAlert[];
  truth: GroundTruth;
}

export interface PipelineInputs {
  proto: PrototypeRecord;
  provisionFlagRaw: string | null;   // store flag `provision:<key>`
  source: RepoSource | null;         // resolveRepoSource result (null = unreachable)
  versions: ArtifactVersion[];       // newest first
  lastPush: PushResult | null;
  claudeSeenAt?: string | null;      // flag `claude:seen:<key>`
}

export function derivePipeline(inp: PipelineInputs): Pipeline {
  const { proto, source, versions, lastPush } = inp;
  const latest = versions[0];
  const alerts: PipelineAlert[] = [];

  // ── ground truth ──────────────────────────────────────────────
  let provisionHash: string | null = null;
  try { provisionHash = inp.provisionFlagRaw ? (JSON.parse(inp.provisionFlagRaw).contentHash as string) : null; } catch { /* legacy flag */ }
  const provisioned = Boolean(inp.provisionFlagRaw);
  const synced = !provisioned || provisionHash === null || provisionHash === contentHashOf(proto);
  const built = Boolean(source?.found && source.variationJs);
  const problem = artifactProblem(source?.variationJs ?? null);
  const cert = latest?.certification ?? null;
  const certified = latest ? (cert ? cert.passed : null) : null;
  const cutFresh = Boolean(latest && source?.headSha && latest.gitSha === source.headSha);
  const bound = Boolean(proto.experiment?.experimentId && proto.experiment?.variationId);
  const pushCurrent = Boolean(lastPush && latest && lastPush.version === latest.version && lastPush.verified);

  const truth: GroundTruth = {
    servingSha: built ? source?.headSha : undefined,
    headSha: source?.headSha,
    built,
    artifactProblem: problem,
    synced,
    certified,
    pushedVersion: lastPush?.version,
    latestVersion: latest?.version,
    pushVerified: lastPush?.verified,
    claudeSeenAt: inp.claudeSeenAt ?? null,
  };

  // ── alerts (operational, each with the fix location) ──────────
  if (!synced) alerts.push({ level: "warn", text: "The brief or pages changed since the branch was last synced — Re-sync so Claude builds against the current brief.", anchor: "step-build" });
  if (problem === "starter-build") alerts.push({ level: "danger", text: "The branch is serving the inherited starter build — the review URL shows the wrong prototype. Build and push once.", anchor: "step-build" });
  if (latest && cert && !cert.passed) alerts.push({ level: "danger", text: `Certification failed on v${latest.version} (${cert.checks.filter((c) => c.level === "fail").map((c) => c.title).join(" · ")}). Fix and re-cut.`, anchor: "step-cut" });
  if (lastPush && latest && lastPush.version < latest.version) alerts.push({ level: "warn", text: `Optimizely is running v${lastPush.version}; the latest cut is v${latest.version}. Push to update the experiment.`, anchor: "step-ship" });
  if (lastPush && lastPush.verified === false) alerts.push({ level: "danger", text: "The last push did not read-back verify — inspect the variation in Optimizely before publishing.", anchor: "step-ship" });

  // ── steps ─────────────────────────────────────────────────────
  const steps: PipelineStep[] = [];

  // 1 · Brief
  const briefDone = Boolean(proto.brief.change?.trim());
  steps.push({
    id: "brief", title: "Brief", anchor: "step-brief",
    state: briefDone ? "done" : "todo",
    status: briefDone
      ? proto.metrics.primary ? "described · metric set" : "described · no metric yet"
      : "what are we building?",
  });

  // 2 · Build
  const buildDone = provisioned && built && !problem;
  steps.push({
    id: "build", title: "Build", anchor: "step-build",
    state: buildDone ? "done" : "todo",
    status: !provisioned ? "get the init script"
      : problem === "placeholder" || !built ? (inp.claudeSeenAt ? "Claude engaged · no build pushed yet" : "provisioned · waiting on the first build")
      : problem === "starter-build" ? "serving the starter build"
      : `built · ${source?.headSha?.slice(0, 7) ?? ""}`,
  });

  // 3 · Review
  const pages = proto.targets.length;
  const passing = proto.targets.filter(injectionPasses).length;
  const reviewDone = pages > 0 && passing === pages;
  steps.push({
    id: "review", title: "Review", anchor: "step-review",
    state: reviewDone ? "done" : "todo",
    status: pages === 0 ? "add the page(s) it runs on" : `${passing}/${pages} page${pages === 1 ? "" : "s"} inject${reviewDone ? " ✓" : ""}`,
  });

  // 4 · Cut & Certify
  const cutDone = Boolean(latest && cutFresh && certified !== false);
  steps.push({
    id: "cut", title: "Cut & Certify", anchor: "step-cut",
    state: latest && cert && !cert.passed ? "blocked" : cutDone ? "done" : "todo",
    status: !latest ? "no version cut"
      : !cutFresh ? `v${latest.version} · HEAD has moved — cut a new version`
      : cert ? (cert.passed ? `v${latest.version} · certified ✓` : `v${latest.version} · certification FAILED`)
      : `v${latest.version} · pre-certification — re-cut to run the gate`,
  });

  // 5 · Ship
  const shipDone = bound && pushCurrent;
  steps.push({
    id: "ship", title: "Ship", anchor: "step-ship",
    state: shipDone ? "done" : "todo",
    status: !bound ? "no experiment bound"
      : !lastPush ? "bound · never pushed"
      : lastPush.version < (latest?.version ?? 0) ? `v${lastPush.version} live · v${latest?.version} ready`
      : `v${lastPush.version} pushed · read-back ${lastPush.verified ? "verified ✓" : "MISMATCH"}`,
  });

  // 6 · Live (until results read-back lands, stage carries this)
  const liveDone = proto.status === "live" || proto.status === "shipped";
  steps.push({
    id: "live", title: "Live", anchor: "step-ship",
    state: liveDone ? "done" : "todo",
    status: liveDone ? (proto.status === "shipped" ? "shipped" : "experiment running") : shipDone ? "start it in Optimizely" : "—",
  });

  // current = first not-done (blocked counts as current so the CTA points at the fix)
  const firstOpen = steps.find((s) => s.state !== "done");
  if (firstOpen && firstOpen.state !== "blocked") firstOpen.state = "current";

  // ── the one next action ───────────────────────────────────────
  let primaryAction: Pipeline["primaryAction"];
  if (!briefDone) primaryAction = { label: "Write the brief", anchor: "step-brief" };
  else if (!provisioned) primaryAction = { label: "Get the init script", anchor: "step-build" };
  else if (!built || problem) primaryAction = { label: "Build with Claude", anchor: "step-build" };
  else if (!reviewDone) primaryAction = { label: "Verify the pages", anchor: "step-review" };
  else if (!latest || !cutFresh) primaryAction = { label: latest ? "Cut a new version" : "Cut a version", anchor: "step-cut" };
  else if (cert && !cert.passed) primaryAction = { label: "Fix certification & re-cut", anchor: "step-cut" };
  else if (!bound) primaryAction = { label: "Bind the experiment", anchor: "step-ship" };
  else if (!pushCurrent) primaryAction = { label: `Push v${latest!.version} to Optimizely`, anchor: "step-ship" };
  else if (!liveDone) primaryAction = { label: "Open in Optimizely & start", anchor: "step-ship" };
  else primaryAction = { label: "Running — watch results", anchor: "step-ship" };

  return { steps, primaryAction, alerts, truth };
}
