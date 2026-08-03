/**
 * THE CONDUCTOR — the iteration loop as a derived, ordered, executable queue.
 *
 * The console already derives all the causality (brief changed → branch copy
 * stale → build moves → QA stale → cut stale → push stale); before this it
 * presented that knowledge as disconnected per-room dots and made the HUMAN
 * the workflow engine. deriveFlow() turns the same ground truth into "Up
 * next": the pending actions in EXECUTION order, each either runnable inline
 * (the loop's actions are all one-button server POSTs), a paste-line for the
 * agent, a deep link for human-judgment work, or a self-ticking wait.
 *
 * Pure and client-safe: the page computes the primitive inputs from truth it
 * already fetches. No new state anywhere — an action disappears the moment
 * ground truth says it's done.
 */

export interface FlowInputs {
  briefComplete: boolean;
  briefDrifted: boolean;
  /** The current (code, brief) pair hasn't been judged yet — audit in flight. */
  auditPending: boolean;
  /** The branch has been provisioned at least once. Unprovisioned reads as
   *  synced (there's nothing to be out of sync WITH) — without this input
   *  the queue would show an un-tickable build wait instead of the one
   *  action that creates the branch. */
  provisioned: boolean;
  /** Branch .opmc matches the console (provision hash current). */
  synced: boolean;
  buildFound: boolean;
  /** A frozen cut with code exists — push/rollback stay possible even when
   *  the branch artifact is momentarily unreadable. */
  hasCutWithCode: boolean;
  pages: number;
  pagesPassing: number;
  hasScenarios: boolean;
  scenariosStale: boolean;
  scenariosReviewed: boolean;
  qaFailing: boolean;
  hasTestCases: boolean;
  testsStale: boolean;
  testsRun: boolean;
  latestVersion?: number;
  needsCut: boolean;
  certFailed: boolean;
  bound: boolean;
  pushCurrent: boolean;
  experimentRunning: boolean;
  /** The measurement plan is confirmed — declared-before-traffic. The
   *  conductor orders "Confirm the measurement plan" BEFORE "Start". */
  measurementPlanned: boolean;
  /** Built in Optimizely's editor — the queue is brief → bind → plan →
   *  start → adjudicate; no repo items ever appear. */
  externalBuild: boolean;
  /** The run ended with an unstamped verdict — adjudication outranks
   *  everything (close the record before iterating). */
  adjudicationPending: boolean;
  shipped: boolean;
}

export interface FlowAction {
  id: string;
  /** Imperative label — what pressing it does. */
  label: string;
  /** The one-line WHY — the cause, so nobody has to re-derive it. */
  why: string;
  kind: "post" | "link" | "paste" | "wait";
  /** kind=post: fire this from the queue, then refresh. */
  post?: { url: string; body: Record<string, unknown> };
  /** Room to open (post-kinds may also carry one for error recovery). */
  tab?: string;
  /** Section anchor inside the room — lands the user on the exact card. */
  anchor?: string;
  /** kind=paste: hand this line to the running agent. */
  paste?: string;
}

export function deriveFlow(t: FlowInputs): FlowAction[] {
  const q: FlowAction[] = [];

  if (t.shipped) return q; // handed off — the loop is over

  // ── Adjudicate: a finished run outranks EVERYTHING — close the record
  // (stamp the verdict against the pre-registered brief) before iterating.
  // Adjudication reads the FROZEN briefSnapshot, so even live brief drift
  // doesn't block it.
  if (t.adjudicationPending) {
    q.push({ id: "adjudicate", kind: "link", tab: "experiment", anchor: "results", label: "Close out the experiment", why: "the run ended — review the final verdict against what was predicted, then stamp it as the record" });
  }

  // ── Plan: the brief must be true before anything downstream matters ──
  if (!t.briefComplete) {
    q.push({ id: "finish-brief", kind: "link", tab: "brief", label: "Finish the brief", why: "no change or no decision metric — the gate is closed" });
    return q; // everything else is noise until the gate opens
  }

  // ── EXTERNAL build (made in Optimizely's editor): no repo items, ever.
  // brief → bind → measurement plan → start → running → adjudicate.
  if (t.externalBuild) {
    if (!t.bound) {
      q.push({ id: "bind", kind: "link", tab: "experiment", anchor: "ship", label: "Bind the Optimizely experiment", why: "pick the experiment built in Optimizely — everything downstream reads from it" });
    } else if (!t.experimentRunning) {
      if (!t.measurementPlanned) {
        q.push({ id: "measurement-plan", kind: "link", tab: "experiment", anchor: "measurement", label: "Confirm the measurement plan", why: "declare the decision metric over real events before traffic — a plan stamped pre-start makes the verdict defensible" });
      }
      // A run that ENDED wants adjudication (queued above), not a restart.
      if (!t.adjudicationPending) {
        q.push({ id: "start-experiment", kind: "link", tab: "experiment", label: "Start the experiment in Optimizely", why: "starting traffic is a human act — the console never does it" });
      }
    } else {
      if (!t.measurementPlanned) {
        q.push({ id: "measurement-plan-late", kind: "link", tab: "experiment", anchor: "measurement", label: "Confirm the measurement plan (post-start)", why: "traffic started without a confirmed plan — confirming now is disclosed in the verdict; not confirming leaves nothing to adjudicate" });
      }
      q.push({ id: "running", kind: "wait", tab: "experiment", label: "Experiment RUNNING", why: "let it decide — the readout adjudicates when it ends" });
    }
    return q;
  }
  if (t.briefDrifted) {
    q.push({ id: "resolve-drift", kind: "link", tab: "brief", label: "Resolve brief ↔ build drift", why: "the audit found the brief no longer matches the build — update it or dismiss" });
    return q; // drift blocks re-sync and cuts; nothing downstream can run
  }

  // ── Sync: the branch must exist and carry the current brief ──
  if (!t.provisioned) {
    q.push({ id: "provision", kind: "post", tab: "build", post: { url: "/api/prototypes/provision", body: {} }, label: "Prepare the branch", why: "creates the prototype's branch with the brief, snapshots, and skills" });
  } else if (!t.synced) {
    q.push({ id: "resync", kind: "post", tab: "build", post: { url: "/api/prototypes/provision", body: {} }, label: "Re-sync the branch", why: "the brief or pages changed since the last sync" });
  }
  if (t.buildFound && t.auditPending) {
    q.push({ id: "await-audit", kind: "wait", tab: "brief", label: "Self-audit running", why: "checking the current brief against the build — ticks itself" });
  }
  if (!t.buildFound) {
    if (t.provisioned) {
      q.push({ id: "await-build", kind: "wait", tab: "build", label: "Waiting for a build", why: "ticks the moment dist/variation.js lands on the branch" });
    }
    // A frozen cut keeps bind/push (incl. rollback) actionable even when the
    // branch artifact is unreadable — don't starve them behind the wait.
    if (!t.hasCutWithCode) return q;
  }

  // ── Target: seen working on the real page ──
  if (t.pages === 0) {
    q.push({ id: "add-pages", kind: "link", tab: "review", label: "Add the target page(s)", why: "nowhere to review or ship to yet" });
  } else if (t.pagesPassing < t.pages) {
    q.push({ id: "verify-pages", kind: "link", tab: "review", label: `Verify the page${t.pages === 1 ? "" : "s"} (${t.pagesPassing}/${t.pages})`, why: "review happens on the real environment, not a mockup" });
  }

  // ── QA: failures first, then freshness, then coverage of the review ──
  if (t.qaFailing) {
    q.push({
      id: "fix-qa", kind: "paste", tab: "review", label: "QA has failures — send the agent to fix",
      why: "failing checks red the gate; the failing runs are the evidence",
      paste: "QA has failing checks — read the failing runs (console → QA), fix the build, push, then re-run the test cases and report results.",
    });
  }
  if (!t.hasScenarios) {
    q.push({ id: "gen-scenarios", kind: "post", tab: "review", post: { url: "/api/prototypes/coverage", body: { generate: true } }, label: "Generate QA scenarios", why: "derived from the brief and the built code" });
  } else if (t.scenariosStale) {
    q.push({ id: "regen-scenarios", kind: "post", tab: "review", post: { url: "/api/prototypes/coverage", body: { generate: true } }, label: "Regenerate QA scenarios", why: "the build moved past the current spec" });
  }
  if (t.hasScenarios && !t.scenariosStale) {
    if (!t.hasTestCases) {
      q.push({ id: "gen-tests", kind: "post", tab: "review", post: { url: "/api/prototypes/coverage", body: { generateTests: true } }, label: "Generate test cases", why: "the step-scripts the agent (and humans) execute" });
    } else if (t.testsStale) {
      q.push({ id: "regen-tests", kind: "post", tab: "review", post: { url: "/api/prototypes/coverage", body: { generateTests: true } }, label: "Regenerate test cases", why: "the build or scenarios moved past them" });
    } else if (!t.testsRun && !t.qaFailing) {
      q.push({
        id: "run-tests", kind: "paste", tab: "review", label: "Have the agent run the test cases",
        why: "results post back with 🤖 attribution; failures auto-file recommendations",
        paste: "Run the QA test cases and report results.",
      });
    }
    if (!t.scenariosReviewed && !t.qaFailing) {
      q.push({ id: "review-scenarios", kind: "link", tab: "review", label: "Review the scenarios per device", why: "unreviewed core scenarios make the push demand an acknowledgement" });
    }
  }

  // ── Experiment: freeze, bind, push, start ──
  if (t.needsCut) {
    q.push({
      id: "cut", kind: "post", tab: "experiment", post: { url: "/api/prototypes/versions", body: { fromRepo: true } },
      label: `Cut v${(t.latestVersion ?? 0) + 1}`,
      why: t.certFailed ? `v${t.latestVersion} failed certification — fix landed? re-cut` : t.latestVersion ? `the build moved past v${t.latestVersion}` : "freeze the first immutable version",
    });
  }
  if (!t.bound) {
    q.push({ id: "bind", kind: "link", tab: "experiment", label: "Bind the experiment", why: "pick (or create) the Optimizely experiment this ships into" });
  } else if (!t.pushCurrent && !t.needsCut) {
    if (t.experimentRunning) {
      q.push({ id: "paused-push", kind: "wait", tab: "experiment", label: "Experiment is RUNNING — push locked", why: "pause it in Optimizely first; changing a live variation corrupts results" });
    } else {
      q.push({ id: "push", kind: "post", tab: "experiment", post: { url: "/api/prototypes/ship", body: { push: true } }, label: `Push v${t.latestVersion} to Optimizely`, why: "replaces the variation code by API, read-back verified" });
    }
  }
  if (t.bound && t.pushCurrent && !t.needsCut && !t.experimentRunning && !t.adjudicationPending) {
    if (!t.measurementPlanned) {
      // Declare how you'll judge it BEFORE the first visitor — this ordering
      // is what makes the eventual verdict's pre-registration claim hold.
      q.push({ id: "measurement-plan", kind: "link", tab: "experiment", anchor: "measurement", label: "Confirm the measurement plan", why: "declare the decision metric over real events before traffic — a plan stamped pre-start makes the verdict defensible" });
    }
    // A human ACT, not a machine wait — it gets a link, not a pulse.
    q.push({ id: "start-experiment", kind: "link", tab: "experiment", label: "Start the experiment in Optimizely", why: "starting traffic is a human act — the console never does it" });
  }
  if (t.experimentRunning && t.pushCurrent) {
    if (!t.measurementPlanned) {
      // Started without a plan — late is disclosed, but later is worse.
      q.push({ id: "measurement-plan-late", kind: "link", tab: "experiment", anchor: "measurement", label: "Confirm the measurement plan (post-start)", why: "traffic started without a confirmed plan — confirming now is disclosed in the verdict; not confirming leaves nothing to adjudicate" });
    }
    q.push({ id: "running", kind: "wait", tab: "experiment", label: "Experiment RUNNING · locked", why: "let it decide; ship the winner from Handoff when it's done" });
  }

  return q;
}
