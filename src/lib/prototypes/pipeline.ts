/**
 * The pipeline — ONE derivation of "where is this prototype and what's next,"
 * computed from ground truth the system already stores. Nothing self-reported.
 *
 * ONE VOCABULARY, everywhere: Brief · Build · Review · Launch · Testing ·
 * Shipped. The workspace stepper and the program board render THIS — same
 * words, same states, two zoom levels. (Cut & certify are substeps of Launch:
 * cut → certify → bind → push → start.)
 *
 * Position derives from the WORK axis; requirements (like a missing brief on
 * started work) block gates and badge — they never teleport position backwards.
 */
import type { PrototypeRecord, ArtifactVersion } from "./types";
import type { RepoSource } from "./source";
import type { PushResult } from "./ship";
import { injectionPasses, normalizeStage } from "./types";
import { contentHashOf } from "./provision";
import { artifactProblem } from "./served";

export type StepState = "done" | "current" | "todo" | "blocked";

export interface PipelineStep {
  id: "brief" | "build" | "review" | "launch" | "testing" | "shipped";
  title: string;
  state: StepState;
  /** One line of honest status, e.g. "3/3 pages inject ✓" or "v4 certified · not pushed". */
  status: string;
  /** The workspace ROOM this step deep-links to (?tab=…). */
  anchor: string;
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

export interface Pipeline {
  steps: PipelineStep[];
  stage: PipelineStage;
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
  if (!synced) alerts.push({ level: "warn", text: "The brief or pages changed since the branch was last synced — Re-sync so Claude builds against the current brief.", anchor: "source" });
  if (problem === "starter-build") alerts.push({ level: "danger", text: "The branch is serving the inherited starter build — the review URL shows the wrong prototype. Build and push once.", anchor: "source" });
  if (latest && cert && !cert.passed) alerts.push({ level: "danger", text: `Certification failed on v${latest.version} (${cert.checks.filter((c) => c.level === "fail").map((c) => c.title).join(" · ")}). Fix and re-cut.`, anchor: "experiment" });
  if (lastPush && latest && lastPush.version < latest.version) alerts.push({ level: "warn", text: `Optimizely is running v${lastPush.version}; the latest cut is v${latest.version}. Push to update the experiment.`, anchor: "experiment" });
  if (lastPush && lastPush.verified === false) alerts.push({ level: "danger", text: "The last push did not read-back verify — inspect the variation in Optimizely before publishing.", anchor: "experiment" });

  // ── steps ─────────────────────────────────────────────────────
  const steps: PipelineStep[] = [];

  // 1 · Brief — a REQUIREMENT, not a position.
  const briefDone = Boolean(proto.brief.change?.trim());
  const workStarted = provisioned || built;
  steps.push({
    id: "brief", title: "Brief", anchor: "brief",
    state: briefDone ? "done" : workStarted ? "blocked" : "todo",
    status: briefDone
      ? proto.metrics.primary ? "described · metric set" : "described · no metric yet"
      : workStarted ? "missing — required before launch" : "what are we building?",
  });
  if (!briefDone && workStarted) alerts.push({ level: "warn", text: "No brief on record — one sentence unblocks the launch gate (and gives the experiment its description).", anchor: "brief" });

  // 2 · Build
  const buildDone = provisioned && built && !problem;
  steps.push({
    id: "build", title: "Build", anchor: "source",
    state: buildDone ? "done" : "todo",
    status: !provisioned ? (briefDone ? "get the init script" : "waiting on the brief") 
      : problem === "placeholder" || !built ? (inp.claudeSeenAt ? "Claude engaged · no build pushed yet" : "provisioned · waiting on the first build")
      : problem === "starter-build" ? "serving the starter build"
      : `built · ${source?.headSha?.slice(0, 7) ?? ""}`,
  });

  // 3 · Review
  const pages = proto.targets.length;
  const passing = proto.targets.filter(injectionPasses).length;
  const reviewDone = pages > 0 && passing === pages;
  steps.push({
    id: "review", title: "Review", anchor: "review",
    state: reviewDone ? "done" : "todo",
    status: pages === 0 ? "add the page(s) it runs on" : `${passing}/${pages} page${pages === 1 ? "" : "s"} inject${reviewDone ? " ✓" : ""}`,
  });

  // 4 · Launch — cut → certify → bind → push → start, one stage.
  const certBlocked = Boolean(latest && cert && !cert.passed);
  const launchDone = Boolean(cutFresh && !certBlocked && bound && pushCurrent && (running || stageShipped));
  const launchStatus = !latest ? "no version cut"
    : !cutFresh ? `v${latest.version} · HEAD moved — cut a new version`
    : certBlocked ? `v${latest.version} · certification FAILED`
    : !bound ? `v${latest.version}${certified ? " certified ✓" : ""} · no experiment bound`
    : !pushCurrent ? `v${latest.version}${certified ? " certified ✓" : ""} · not pushed`
    : running || stageShipped ? `v${lastPush?.version} pushed ✓ · started`
    : `v${lastPush?.version} pushed ✓ · start it in Optimizely`;
  steps.push({
    id: "launch", title: "Launch", anchor: "experiment",
    state: certBlocked ? "blocked" : launchDone ? "done" : "todo",
    status: launchStatus,
  });

  // 5 · Testing — the experiment's live status is the truth.
  steps.push({
    id: "testing", title: "Testing", anchor: "experiment",
    state: stageShipped ? "done" : running ? "current" : "todo",
    status: running ? "experiment LIVE — prototype locked"
      : stageShipped ? "concluded"
      : inp.experimentStatus === "paused" ? "paused in Optimizely"
      : "—",
  });

  // 6 · Shipped — the decision (until winner→PR automates it).
  steps.push({
    id: "shipped", title: "Shipped", anchor: "handoff",
    state: stageShipped ? "done" : "todo",
    status: stageShipped ? "winner in production code" : "—",
  });

  // THE RULE: the pipeline holds at the FIRST gate that needs you. A blocked
  // step (missing brief, failed certification) is that gate — no later step
  // gets "current" while one is red. Work already done stays green; the card
  // simply can't pass the gate until it clears.
  if (!running && !stageShipped) {
    const gate = steps.find((s) => s.state === "blocked");
    if (!gate) {
      const firstOpen = steps.find((s) => s.id !== "testing" && s.state !== "done");
      if (firstOpen && firstOpen.state === "todo") firstOpen.state = "current";
    }
  }

  // ── the one stage word (shared verbatim with the board column) ──
  const stageId: PipelineStep["id"] = stageShipped ? "shipped"
    : running ? "testing"
    : (steps.find((s) => s.state === "blocked" || s.state === "current")?.id ?? "launch");
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
  if (!briefDone) primaryAction = { label: workStarted ? "Write the brief — it's the gate" : "Write the brief", anchor: "brief" };
  else if (!provisioned) primaryAction = { label: "Get the init script", anchor: "source" };
  else if (!built || problem) primaryAction = { label: "Build with Claude", anchor: "source" };
  else if (!reviewDone) primaryAction = { label: "Verify the pages", anchor: "review" };
  else if (!latest || !cutFresh) primaryAction = { label: latest ? "Cut a new version" : "Cut a version", anchor: "experiment" };
  else if (certBlocked) primaryAction = { label: "Fix certification & re-cut", anchor: "experiment" };
  else if (!bound) primaryAction = { label: "Bind the experiment", anchor: "experiment" };
  else if (!pushCurrent) primaryAction = { label: `Push v${latest!.version} to Optimizely`, anchor: "experiment" };
  else if (running) primaryAction = { label: "Running — watch results", anchor: "experiment" };
  else if (!stageShipped) primaryAction = { label: "Start the experiment in Optimizely", anchor: "experiment" };
  else primaryAction = { label: "Shipped ✓", anchor: "experiment" };

  return { steps, stage, primaryAction, alerts, truth };
}
