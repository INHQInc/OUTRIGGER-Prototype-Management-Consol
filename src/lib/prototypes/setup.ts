/**
 * Set up, then operate — the two-mode workspace.
 *
 * Setup is genuinely LINEAR (brief → branch/agent → first build → page
 * verification: each step depends on the last), so until the base is set the
 * workspace renders a guided single-column flow, one step at a time. The
 * working model (command rail, rooms) is genuinely NON-linear and takes over
 * permanently once the base is set. Completion is GROUND TRUTH — steps tick
 * themselves; nothing here is a checkbox a human asserts.
 *
 * Pure derivation, client-safe: the page supplies the truth inputs it
 * already fetches. The "base is set" flip is ONE-WAY — the page writes
 * setupdone:<key> the first time this derives complete, so later
 * regressions (drift, a deleted branch) never throw an operating prototype
 * back into setup.
 */

export interface SetupInputs {
  briefComplete: boolean;
  /** An unresolved Brief ↔ Build drift verdict — blocks step 1. */
  briefDrifted: boolean;
  provisioned: boolean;
  /** The agent checked in (claude:seen beacon). */
  agentStarted: boolean;
  /** dist/variation.js exists at the branch HEAD. */
  buildFound: boolean;
  pages: number;
  pagesPassing: number;
}

export interface SetupStep {
  id: "brief" | "agent" | "build" | "pages";
  n: number;
  label: string;
  /** What this step is for — shown while pending. */
  sub: string;
  done: boolean;
  /** One-line proof shown when done. */
  summary: string;
  /** WHY a step that was satisfied is blocked again — shown loud while active. */
  blockedNote?: string;
}

export interface SetupState {
  steps: SetupStep[];
  /** First not-done step (index into steps); steps.length when all done. */
  activeIndex: number;
  complete: boolean;
}

export function deriveSetup(inp: SetupInputs): SetupState {
  const steps: SetupStep[] = [
    {
      id: "brief", n: 1, label: "Write the brief",
      sub: "What are we building, and how do we know it worked? The brief becomes the agent's instructions and the experiment's description — nothing proceeds without it.",
      done: inp.briefComplete && !inp.briefDrifted,
      summary: "change + decision metric saved",
      blockedNote: inp.briefComplete && inp.briefDrifted
        ? "The audit found the brief no longer matches the build — resolve the Brief ↔ Build card below (update the brief, or dismiss if the brief is right)."
        : undefined,
    },
    {
      id: "agent", n: 2, label: "Branch & agent",
      sub: "Provision the prototype's branch, point it at your local folder, and start Claude. This step completes itself when the agent checks in.",
      done: inp.provisioned && (inp.agentStarted || inp.buildFound),
      summary: inp.agentStarted ? "branch provisioned · agent checked in" : "branch provisioned · build landed",
    },
    {
      id: "build", n: 3, label: "First build",
      sub: "Claude builds in your terminal and pushes; this ticks the moment dist/variation.js lands on the branch. Nothing to do in the console but watch.",
      done: inp.buildFound,
      summary: "built variation on the branch",
    },
    {
      id: "pages", n: 4, label: "See it on the page",
      sub: "Verify the variation actually injects on the real review URL — the base isn't set until you've seen it live.",
      done: inp.pages > 0 && inp.pagesPassing === inp.pages,
      summary: `${inp.pagesPassing}/${inp.pages} page${inp.pages === 1 ? "" : "s"} inject`,
    },
  ];
  const activeIndex = steps.findIndex((s) => !s.done);
  return {
    steps,
    activeIndex: activeIndex === -1 ? steps.length : activeIndex,
    complete: activeIndex === -1,
  };
}
