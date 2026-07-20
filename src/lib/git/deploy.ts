import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { getGitClient, prototypeBranch } from "./provider";
import { GitError } from "./github";
import { getContentStore } from "../content/store";
import { readManifest } from "../features/registry";
import { buildBundle } from "../deploy/bundle";

async function collectFiles(dir: string, root = dir): Promise<{ path: string; content: Buffer }[]> {
  const out: { path: string; content: Buffer }[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await collectFiles(full, root)));
    else out.push({ path: relative(root, full).split(sep).join("/"), content: await readFile(full) });
  }
  return out;
}

export interface GitDeployResult {
  repo: string;
  branch: string;
  commitUrl: string;
  fileCount: number;
  password: string;
}

/**
 * Bake a prototype's bundle and commit it to `prototype/<key>` in the site's
 * feature repo — one commit, off the base branch. If the feature repo is
 * connected to Vercel, that push yields a versioned preview deployment.
 * Re-deploying the same prototype updates the existing branch.
 */
export async function deployPrototypeToGit(featureKey: string): Promise<GitDeployResult> {
  const client = getGitClient();
  if (!client) throw new Error("GITHUB_TOKEN is not set.");

  const manifest = await readManifest(featureKey);
  if (!manifest) throw new Error(`Feature not found: ${featureKey}`);
  const siteKey = manifest.targets[0]?.siteKey;
  if (!siteKey) throw new Error("Feature has no target site.");

  const store = await getContentStore();
  const binding = await store.getRepoBinding(siteKey);
  if (!binding) throw new Error(`No feature repo bound for site "${siteKey}" — set it in Settings → Repositories.`);
  const { owner, repo, baseBranch, branchPrefix } = binding.feature;

  const bundle = await buildBundle(manifest);
  const files = await collectFiles(bundle.dir);
  const branch = prototypeBranch(featureKey, branchPrefix);

  let baseSha: string;
  try {
    baseSha = await client.getBranchSha(owner, repo, baseBranch);
  } catch (e) {
    if (e instanceof GitError && (e.status === 409 || e.status === 404)) {
      // Empty repo — create an initial commit so the base branch exists.
      await client.putFile(owner, repo, {
        path: "README.md",
        content: `# ${repo}\n\nPrototype deployments managed by the OUTRIGGER Prototype Console.\nEach \`${branchPrefix}*\` branch is one prototype; connect this repo to Vercel for per-branch preview deployments.\n`,
        message: "chore: initialize prototypes repo",
        branch: baseBranch,
      });
      baseSha = await client.getBranchSha(owner, repo, baseBranch);
    } else {
      throw e;
    }
  }
  try {
    await client.createBranch(owner, repo, branch, baseSha);
  } catch (e) {
    if (!(e instanceof GitError && e.status === 422)) throw e; // 422 = branch exists → re-deploy
  }
  const commit = await client.commitFiles(owner, repo, {
    branch,
    baseSha,
    message: `Prototype: ${manifest.name} (${featureKey})`,
    files,
  });

  return { repo: `${owner}/${repo}`, branch, commitUrl: commit.url, fileCount: files.length, password: bundle.password };
}
