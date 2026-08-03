/**
 * The pipeline — ONE derivation of "where is this prototype and what's next,"
 * computed from ground truth the system already stores. Nothing self-reported.
 *
 * ONE canonical stage list, everywhere (tabs, board, header chip, checklist):
 *   Brief · Build · Review · Experimentation · Handoff.
 * There are no other "steps." Experimentation is one stage that runs
 * cut → certify → bind → push → start → live (the live/locked state is a
 * badge, not a separate stage). Handoff is the winner graduating to source.
 *
 * Position derives from the WORK axis; requirements (like a missing brief on
 * started work) block gates and badge — they never teleport position backwards.
 */
import type { PrototypeRecord, ArtifactVersion } from "./types";
import type { RepoSource } from "./source";
import type { PushResult } from "./ship";
import { injectionPasses, normalizeStage, isBriefComplete, isExternalBuild } from "./types";
import { contentHashOf } from "./provision";
import { artifactProblem } from "./served";

export type StepState = "done" | "current" | "todo" | "blocked";

export interface PipelineStep {
  id: "brief" | "build" | "review" | "experiment" | "handoff";
  title: string;
  state: StepState;
  /** One line of honest status, e.g. "3/3 pages inject ✓" or "v4 certified · not pushed". */
  status: string;
  /** The workspace ROOM this step deep-links to (?tab=…). */
  anchor: string;
  /** Not applicable for this prototype (externally-built: no repo stages). */
  na?: boolean;
}

export interface PipelineAlert {
  level: "warn" | "danger";
  text: string;
  anchor?: string;
}

export interface GroundTruth {
  servingSha?: string;
  headSha?: string;
  built: boolean;
  artifactProblem: string | null;
  synced: boolean;
  certified: boolean | null;
  pushedVersion?: number;
  latestVersion?: number;
  pushVerified?: boolean;
  claudeSeenAt?: string | null;
  experimentStatus?: string | null; // not_started | running | paused | archived
}

/**
 * THE stage — the one word for where this prototype is, shared verbatim with
 * the board column. Derived here so the header chip and the kanban can never
 * drift apart.
 */
export interface PipelineStage {
  id: PipelineStep["id"];
  label: string;
  /** The stage step's honest status line. */
  status: string;
  blocked: boolean;
  live: boolean;
}

// The four-color severity model lives in ./severity (client-safe); imported for
// local use AND re-exported so server consumers can import it from the pipeline.
import { stepSeverity, type StepSeverity } from "./severity";
export { stepSeverity };
export type { StepSeverity };

/** One row of the Overview checklist: a room, how urgent it is, what to do. */
export interface ChecklistItem {
  tab: string;         // room to deep-link to (?tab=)
  label: string;       // room name
  severity: StepSeverity;
  description: string; // what needs doing (or the current status)
}

export interface Pipeline {
  steps: PipelineStep[];
  stage: PipelineStage;
  checklist: ChecklistItem[];
  primaryAction: { label: string; anchor: string };
  alerts: PipelineAlert[];
  truth: GroundTruth;
}

export interface PipelineInputs {
  proto: PrototypeRecord;
  provisionFlagRaw: string | null;
  source: RepoSource | null;
  versions: ArtifactVersion[];
  lastPush: PushResult | null;
  claudeSeenAt?: string | null;
  /** Live experiment status from the Optimizely API, when bound + reachable. */
  experimentStatus?: string | null;
  /** Unresolved Brief ↔ Build drift (persisted audit verdict) — blocks the Brief step + re-sync. */
  briefDrifted?: boolean;
  /** QA state (coverage gate) — escalates the Review step via alerts so
   *  EVERY surface (rail dot, table strip, board) agrees by construction. */
  qaFailing?: boolean;
  /** Stopped experiment + unstamped verdict → the Experiment stage nags. */
  adjudicationPending?: boolean;
  qaStale?: boolean;
}

export function derivePipeline(inp: PipelineInputs): Pipeline {
  const { proto, source, versions, lastPush } = inp;
  // Externally-built (in Optimizely's editor): the repo stages don't exist.
  // Brief + Experiment carry everything; Build/Review/Handoff read n/a and
  // no repo-shaped alert may fire.
  const external = isExternalBuild(proto);
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
  const running = inp.experimentStatus === "running";
  // normalizeStage, like every other reader — a legacy "handed-off" record must
  // say Shipped here AND on the board, or the one-vocabulary contract is a lie.
  const stageShipped = normalizeStage(proto.status) === "shipped";

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
    experimentStatus: inp.experimentStatus ?? null,
  };

  // ── alerts (operational; each links to its fix) ───────────────
  if (!external && !synced) alerts.push({ level: "warn", text: "The brief or pages changed since the branch was last synced — Re-sync so the agent builds against the current brief.", anchor: "build" });
  if (!external && problem === "starter-build") alerts.push({ level: "danger", text: "The branch is serving the inherited starter build — the review URL shows the wrong prototype. Build and push once.", anchor: "build" });
  if (!external && latest && cert && !cert.passed) alerts.push({ level: "danger", text: `Certification failed on v${latest.version} (${cert.checks.filter((c) => c.level === "fail").map((c) => c.title).join(" · ")}). Fix and re-cut.`, anchor: "experiment" });
  if (inp.adjudicationPending) alerts.push({ level: "warn", text: "The experiment run ended but its verdict isn't stamped — adjudicate the results against the pre-registered brief.", anchor: "experiment" });
  if (!external && inp.qaFailing) alerts.push({ level: "danger", text: "QA has failing checks — fix and re-run the tests before shipping.", anchor: "review" });
  else if (!external && inp.qaStale) alerts.push({ level: "warn", text: "QA is stale — the build moved past the spec. Regenerate the scenarios/test cases.", anchor: "review" });
  if (!external && lastPush && latest && lastPush.version < latest.version) alerts.push({ level: "warn", text: `Optimizely is running v${lastPush.version}; the latest cut is v${latest.version}. Push to update the experiment.`, anchor: "experiment" });
  if (!external && lastPush && lastPush.verified === false) alerts.push({ level: "danger", text: "The last push did not read-back verify — inspect the variation in Optimizely before publishing.", anchor: "experiment" });

  // ── steps ─────────────────────────────────────────────────────
  const steps: PipelineStep[] = [];

  // 1 · Brief — a REQUIREMENT, not a position. A brief is only DONE when it
  // says what we're building AND how we judge it (a decision metric); a bare
  // change is in-progress, not done.
  const hasChange = Boolean(proto.brief.change?.trim());
  const briefDone = isBriefComplete(proto.brief, proto.metrics);
  // Repo drift is meaningless without a repo build — a record left over from
  // before a flip to external must never block the Brief step.
  const drifted = !external && Boolean(inp.briefDrifted);
  const workStarted = !external && (provisioned || built);
  steps.push({
    id: "brief", title: "Brief", anchor: "brief",
    state: drifted ? "blocked"         // the audit proved the brief wrong — resolve before anything syncs
      : briefDone ? "done"
      : workStarted ? "blocked"        // building against an incomplete brief — must fix
      : hasChange ? "current"          // mid-brief: has the change, needs the metric
      : "todo",
    status: drifted ? "brief ↔ build drift — update the brief or dismiss the audit"
      : briefDone ? "described · metric set"
      : hasChange ? "needs a success metric — how do we know it worked?"
      : workStarted ? "missing — required before launch"
      : "what are we building?",
  });
  // NO alert for a missing brief: the blocked step already says it — the chip
  // shows "Blocked at Brief" and Overview's Needs Attention lists the gate.
  // One fact, one place; a banner here made the same sentence appear 5×.

  // 2 · Build
  const buildDone = provisioned && built && !problem;
  steps.push(external
    ? { id: "build", title: "Build", anchor: "build", state: "done", na: true, status: "n/a — built in Optimizely" }
    : {
        id: "build", title: "Build", anchor: "build",
        state: buildDone ? "done" : "todo",
        status: !provisioned ? (briefDone ? "prepare the branch, then build" : "waiting on the brief")
          : problem === "placeholder" || !built ? (inp.claudeSeenAt ? "Agent engaged · no build pushed yet" : "provisioned · waiting on the first build")
          : problem === "starter-build" ? "serving the starter build"
          : `built · ${source?.headSha?.slice(0, 7) ?? ""}`,
      });

  // 3 · Review
  const pages = proto.targets.length;
  const passing = proto.targets.filter(injectionPasses).length;
  const reviewDone = pages > 0 && passing === pages;
  steps.push(external
    ? { id: "review", title: "Review", anchor: "review", state: "done", na: true, status: "n/a — built in Optimizely" }
    : {
        id: "review", title: "Review", anchor: "review",
        state: reviewDone ? "done" : "todo",
        status: pages === 0 ? "add the page(s) it runs on" : `${passing}/${pages} page${pages === 1 ? "" : "s"} inject${reviewDone ? " ✓" : ""}`,
      });

  // 4 · Experimentation — cut → certify → bind → push → start → live, ONE stage.
  // The running/locked state is a badge (stage.live), not a separate stage.
  // DONE only once the experiment is actually live or concluded — a pushed-but-
  // not-started version is still IN this stage (you must click Start), so it is
  // NOT done. (Marking it done here promoted Handoff to current and stranded
  // the card in the Handoff column, un-shippable.)
  const certBlocked = !external && Boolean(latest && cert && !cert.passed);
  const expDone = Boolean(running || stageShipped);
  const ended = inp.experimentStatus === "concluded" || inp.experimentStatus === "archived";
  const expStatus = external
    ? (!bound ? "no experiment bound"
      : running ? "live — running in Optimizely"
      : stageShipped ? "concluded"
      : ended ? "concluded — adjudicate the results"
      : "bound · plan measurement, then start it in Optimizely")
    : !latest ? "no version cut"
    : !cutFresh ? `v${latest.version} · HEAD moved — cut a new version`
    : certBlocked ? `v${latest.version} · certification FAILED`
    : !bound ? `v${latest.version}${certified ? " certified ✓" : ""} · no experiment bound`
    : !pushCurrent ? `v${latest.version}${certified ? " certified ✓" : ""} · not pushed`
    : running ? "live — prototype locked"
    : stageShipped ? "concluded"
    : `v${lastPush?.version} pushed ✓ · start it in Optimizely`;
  steps.push({
    id: "experiment", title: "Experimentation", anchor: "experiment",
    state: certBlocked ? "blocked" : expDone ? "done" : "todo",
    status: expStatus,
  });

  // 5 · Handoff — the winner graduates into production code.
  steps.push(external
    ? { id: "handoff", title: "Handoff", anchor: "handoff", state: "done", na: true, status: "n/a — built in Optimizely" }
    : {
        id: "handoff", title: "Handoff", anchor: "handoff",
        state: stageShipped ? "done" : "todo",
        status: stageShipped ? "winner in production code" : "when the experiment wins",
      });

  // THE RULE: the pipeline holds at the FIRST gate that needs you. A blocked
  // step (missing brief, failed certification) is that gate — no later step
  // gets "current" while one is red. Work already done stays green; the card
  // simply can't pass the gate until it clears.
  if (!running && !stageShipped) {
    const gate = steps.find((s) => s.state === "blocked");
    if (!gate) {
      // Handoff is terminal — reached only by shipping, never auto-promoted.
      const firstOpen = steps.find((s) => s.id !== "handoff" && !s.na && s.state !== "done");
      if (firstOpen && firstOpen.state === "todo") firstOpen.state = "current";
    }
  }

  // ── the one stage word (shared verbatim with the board column) ──
  const stageId: PipelineStep["id"] = stageShipped ? (external ? "experiment" : "handoff")
    : running ? "experiment"
    : (steps.find((s) => s.state === "blocked" || s.state === "current")?.id ?? "experiment");
  const stageStep = steps.find((s) => s.id === stageId)!;
  const stage: PipelineStage = {
    id: stageId,
    label: stageStep.title,
    status: stageStep.status,
    blocked: stageStep.state === "blocked",
    live: running,
  };

  // ── the one next action ───────────────────────────────────────
  let primaryAction: Pipeline["primaryAction"];
  if (external) {
    primaryAction = !briefDone ? { label: hasChange ? "Add a success metric" : "Write the brief", anchor: "brief" }
      : !bound ? { label: "Bind the Optimizely experiment", anchor: "experiment" }
      : running ? { label: "Running — watch results", anchor: "experiment" }
      : stageShipped ? { label: "Concluded", anchor: "experiment" }
      : ended || inp.adjudicationPending ? { label: "Adjudicate the results", anchor: "experiment" }
      : { label: "Plan measurement, then start it", anchor: "experiment" };
  }
  else if (drifted) primaryAction = { label: "Resolve brief ↔ build drift", anchor: "brief" };
  else if (!briefDone) primaryAction = { label: hasChange ? "Add a success metric" : "Write the brief", anchor: "brief" };
  else if (!provisioned) primaryAction = { label: "Prepare the branch", anchor: "build" };
  else if (!built || problem) primaryAction = { label: "Build with the agent", anchor: "build" };
  else if (!reviewDone) primaryAction = { label: "Verify the pages", anchor: "review" };
  else if (!latest || !cutFresh) primaryAction = { label: latest ? "Cut a new version" : "Cut a version", anchor: "experiment" };
  else if (certBlocked) primaryAction = { label: "Fix certification & re-cut", anchor: "experiment" };
  else if (!bound) primaryAction = { label: "Bind the experiment", anchor: "experiment" };
  else if (!pushCurrent) primaryAction = { label: `Push v${latest!.version} to Optimizely`, anchor: "experiment" };
  else if (running) primaryAction = { label: "Running — watch results", anchor: "experiment" };
  else if (!stageShipped) primaryAction = { label: "Start the experiment in Optimizely", anchor: "experiment" };
  else primaryAction = { label: "Hand off the winner", anchor: "handoff" };

  // ── the Overview checklist: one row per stage, in flow order ──
  const ROOMS: { step: PipelineStep["id"]; tab: string; label: string; pending: string }[] = [
    { step: "brief", tab: "brief", label: "Brief", pending: "Describe the change and how success is judged." },
    { step: "build", tab: "build", label: "Build", pending: "Provision the branch and build the variation with the agent." },
    { step: "review", tab: "review", label: "Review", pending: "Add the page(s) and verify the variation injects on the real site." },
    { step: "experiment", tab: "experiment", label: "Experimentation", pending: "Cut a version, bind an Optimizely experiment, and push." },
    { step: "handoff", tab: "handoff", label: "Handoff", pending: "When the experiment wins, hand the winning version to the dev team." },
  ];
  const checklist: ChecklistItem[] = ROOMS.map(({ step: sid, tab, label, pending }) => {
    const st = steps.find((s) => s.id === sid)!;
    const severity = stepSeverity(st, alerts);
    const targeting = alerts.filter((a) => a.anchor === st.anchor);
    const alert = targeting.find((a) => a.level === "danger") ?? targeting.find((a) => a.level === "warn");
    const description = alert?.text ?? (st.status && st.status !== "—" ? st.status : pending);
    return { tab, label, severity, description };
  });

  return { steps, stage, checklist, primaryAction, alerts, truth };
}
