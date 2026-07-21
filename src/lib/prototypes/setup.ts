/**
 * Prototype setup state — the "ready to build" checklist, mirroring the org
 * Customer-setup checklist. These are the things genuinely required before
 * someone (with Claude) can start building this prototype:
 *
 *   1. Code location   — a registered repo + branch (needs GitHub connected)
 *   2. Build brief     — what to build; Claude's skill reads this from the console
 *   3. Test pages      — at least one URL to review/inject on
 *   4. Injection ready — the loader tag is live on the review environment
 *
 * When all four are done we hand over the exact local commands (clone → branch
 * → push → claude). The built variation is the OUTPUT of running them, tracked
 * separately as the build status.
 */
import type { PrototypeRecord } from "./types";
import { getGitClientForOrg } from "../git/connection";
import { listOrgEnvironments, envLoaderSeenAt } from "../environments";
import { defaultOrgRepo } from "../git/org-repos";

export interface SetupStepState {
  key: "code" | "brief" | "pages" | "injection";
  label: string;
  done: boolean;
  hint?: string;
  tab: "build" | "pages" | "setup";
  action: string;
}

export interface PrototypeSetupState {
  steps: SetupStepState[];
  doneCount: number;
  total: number;
  ready: boolean;
  gitConnected: boolean;
  repoRegistered: boolean;
  repo?: { fullName: string; branch: string };
  envsWithLoader: number;
  totalEnvs: number;
}

export async function getPrototypeSetup(proto: PrototypeRecord, orgId: string): Promise<PrototypeSetupState> {
  const [gitClient, environments, protoRepoDefault] = await Promise.all([
    orgId ? getGitClientForOrg(orgId) : Promise.resolve(null),
    orgId ? listOrgEnvironments(orgId) : Promise.resolve([]),
    orgId ? defaultOrgRepo(orgId, "prototypes") : Promise.resolve(null),
  ]);
  const gitConnected = Boolean(gitClient);
  const repoRegistered = Boolean(protoRepoDefault);

  const seen = await Promise.all(environments.map((e) => envLoaderSeenAt(e)));
  const envsWithLoader = seen.filter(Boolean).length;

  const hasRepo = Boolean(proto.repo?.fullName);
  const hasBrief = Boolean(proto.brief.problem?.trim() || proto.brief.change?.trim() || proto.brief.doneLooksLike?.trim());
  const hasPages = proto.targets.length > 0;
  const hasInjection = envsWithLoader > 0;

  const steps: SetupStepState[] = [
    {
      key: "code",
      label: "Code location — repo & branch",
      done: hasRepo,
      tab: "build",
      action: "Set repo",
      hint: !gitConnected
        ? "Connect GitHub for this customer first (Settings → Repositories)."
        : !repoRegistered
        ? "Register a prototypes repo first (Settings → Repositories)."
        : "Pick the repo + branch this prototype builds in.",
    },
    {
      key: "brief",
      label: "Build brief — what to build",
      done: hasBrief,
      tab: "setup",
      action: "Write brief",
      hint: "One or two lines is enough — Claude reads this to know what to build.",
    },
    {
      key: "pages",
      label: "Test pages — where to inject",
      done: hasPages,
      tab: "pages",
      action: "Add pages",
      hint: "The page(s) on the site the prototype changes and gets reviewed on.",
    },
    {
      key: "injection",
      label: "Injection script live on the environment",
      done: hasInjection,
      tab: "pages",
      action: "Install tag",
      hint: environments.length === 0
        ? "Add an environment (Configuration → Environments) and install its loader tag."
        : "Place the loader tag on the site once — it self-verifies on first page view.",
    },
  ];

  const doneCount = steps.filter((s) => s.done).length;
  return {
    steps,
    doneCount,
    total: steps.length,
    ready: doneCount === steps.length,
    gitConnected,
    repoRegistered,
    repo: proto.repo ? { fullName: proto.repo.fullName, branch: proto.repo.branch } : undefined,
    envsWithLoader,
    totalEnvs: environments.length,
  };
}
