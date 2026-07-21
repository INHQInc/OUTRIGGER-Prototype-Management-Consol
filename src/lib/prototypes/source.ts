/**
 * Repo-sourced variation. The prototype's code is built in its feature-repo
 * branch (with Claude, real tooling) and committed as a self-contained
 * `variation.js`. The console PULLS that artifact — it never authors the code.
 * The variation does its own DOM targeting (selectors live in the code); the
 * console only holds the URL target + lifecycle.
 */
import { getContentStore } from "../content/store";
import { getGitClient, prototypeBranch } from "../git/provider";
import { GitError } from "../git/github";

const DEFAULT_ARTIFACT = "dist/variation.js";

export interface RepoSource {
  repo: string;          // owner/repo
  branch: string;        // the prototype's branch
  artifactPath: string;  // where the built variation lives
  branchExists: boolean;
  headSha?: string;      // branch HEAD commit
  found: boolean;        // artifact present at HEAD
  variationJs?: string;  // the built variation (present iff found)
  error?: string;
}

/**
 * Resolve the built variation for a prototype from its feature-repo branch.
 * Never throws for the "not built yet" cases — returns a descriptive status so
 * the UI can guide the user (create the branch / commit the artifact).
 */
export async function resolveRepoSource(prototypeKey: string): Promise<RepoSource> {
  const store = await getContentStore();
  const proto = await store.getPrototype(prototypeKey);
  if (!proto) throw new Error("Unknown prototype");
  const client = getGitClient();
  if (!client) throw new Error("GitHub isn't connected (GITHUB_TOKEN not set).");

  // The prototype's own repo pick (brand registry) is the source of truth;
  // legacy prototypes without one fall back to the old per-site binding.
  let owner: string, repo: string, branch: string, artifactPath: string;
  if (proto.repo?.fullName) {
    const [o, r] = proto.repo.fullName.split("/");
    if (!o || !r) throw new Error(`Invalid repo on prototype: ${proto.repo.fullName}`);
    owner = o; repo = r;
    branch = proto.repo.branch || prototypeBranch(prototypeKey);
    artifactPath = proto.repo.artifactPath?.trim() || DEFAULT_ARTIFACT;
  } else {
    const binding = await store.getRepoBinding(proto.siteKey);
    if (!binding) throw new Error("No repo set on this prototype — pick one in the Source panel (Settings → Repositories holds the registry).");
    owner = binding.feature.owner; repo = binding.feature.repo;
    branch = prototypeBranch(prototypeKey, binding.feature.branchPrefix);
    artifactPath = binding.feature.artifactPath?.trim() || DEFAULT_ARTIFACT;
  }
  const base: RepoSource = { repo: `${owner}/${repo}`, branch, artifactPath, branchExists: false, found: false };

  let headSha: string;
  try {
    headSha = await client.getBranchSha(owner, repo, branch);
  } catch (e) {
    if (e instanceof GitError && (e.status === 404 || e.status === 422)) {
      return { ...base, error: `Branch ${branch} doesn't exist yet — build the prototype there and commit ${artifactPath}.` };
    }
    throw e;
  }
  base.branchExists = true;
  base.headSha = headSha;

  const variationJs = await client.readFileAtRef(owner, repo, artifactPath, headSha);
  if (variationJs == null) {
    return { ...base, error: `${artifactPath} not found on ${branch} — build it and commit it.` };
  }
  return { ...base, found: true, variationJs };
}
