/**
 * Deploy a store prototype's authored overlay to its feature repo: commit the
 * compiled variation + raw overlay as ONE commit on `prototype/<key>`, then
 * auto-cut an immutable version pinned to that commit. This is the git deploy
 * for store prototypes (the legacy deploy is bundle/feature-based).
 */
import { getContentStore } from "../content/store";
import { getSite } from "../sites";
import { getGitClient, prototypeBranch } from "../git/provider";
import { GitError } from "../git/github";
import { getPrototypeOverlay, buildOverlayVariation } from "./overlay";
import { cutArtifactVersion } from "./versions";
import { audit } from "../audit";
import type { ArtifactVersion } from "./types";

export interface OverlayDeployResult {
  repo: string;
  branch: string;
  commitSha: string;
  commitUrl: string;
  fileCount: number;
  version: ArtifactVersion;
}

export async function deployOverlayToGit(prototypeKey: string, actor?: string): Promise<OverlayDeployResult> {
  const store = await getContentStore();
  const proto = await store.getPrototype(prototypeKey);
  if (!proto) throw new Error("Unknown prototype");

  const overlay = await getPrototypeOverlay(prototypeKey);
  const built = buildOverlayVariation(prototypeKey, overlay);
  if (built.isEmpty) throw new Error("Author the overlay (HTML/CSS/JS) before deploying.");

  const binding = await store.getRepoBinding(proto.siteKey);
  if (!binding) throw new Error("No feature repo bound for this site — set it in Settings → Repositories.");
  const client = getGitClient();
  if (!client) throw new Error("GitHub isn't connected (GITHUB_TOKEN not set).");

  const { owner, repo, baseBranch, branchPrefix } = binding.feature;
  const branch = prototypeBranch(prototypeKey, branchPrefix);
  const dir = `prototypes/${prototypeKey}`;
  const files = [
    { path: `${dir}/variation.js`, content: Buffer.from(built.variationJs, "utf8") },
    { path: `${dir}/overlay.css`, content: Buffer.from(overlay?.css ?? "", "utf8") },
    { path: `${dir}/overlay.json`, content: Buffer.from(JSON.stringify({ css: overlay?.css ?? "", js: overlay?.js ?? "", blocks: overlay?.blocks ?? [] }, null, 2), "utf8") },
    { path: `${dir}/prototype.json`, content: Buffer.from(JSON.stringify({ key: proto.key, name: proto.name, status: proto.status, targets: proto.targets, hypothesis: proto.hypothesis, metrics: proto.metrics }, null, 2), "utf8") },
    { path: `${dir}/README.md`, content: Buffer.from(`# ${proto.name}\n\nPrototype \`${proto.key}\` overlay. \`variation.js\` is the self-contained injection (Optimizely custom code / loader). Managed by the OUTRIGGER Prototype Console.\n`, "utf8") },
  ];

  // Resolve base sha, bootstrapping an empty repo if needed.
  let baseSha: string;
  try {
    baseSha = await client.getBranchSha(owner, repo, baseBranch);
  } catch (e) {
    if (e instanceof GitError && (e.status === 409 || e.status === 404)) {
      await client.putFile(owner, repo, {
        path: "README.md",
        content: `# ${repo}\n\nPrototype overlays managed by the OUTRIGGER Prototype Console.\nEach \`${branchPrefix}*\` branch is one prototype.\n`,
        message: "chore: initialize prototypes repo",
        branch: baseBranch,
      });
      baseSha = await client.getBranchSha(owner, repo, baseBranch);
    } else throw e;
  }
  try {
    await client.createBranch(owner, repo, branch, baseSha);
  } catch (e) {
    if (!(e instanceof GitError && e.status === 422)) throw e; // 422 = exists → re-deploy
  }

  const commit = await client.commitFiles(owner, repo, {
    branch,
    baseSha,
    message: `Prototype overlay: ${proto.name} (${prototypeKey})`,
    files,
  });

  const version = await cutArtifactVersion(prototypeKey, proto.siteKey, {
    gitSha: commit.sha,
    gitRef: branch,
    notes: `overlay deploy → ${owner}/${repo}`,
    createdBy: actor,
  });

  const site = await getSite(proto.siteKey);
  await audit(site?.orgId ?? "", actor ?? "system", "prototype.deploy", `${proto.name} → ${owner}/${repo}@${branch}`, `v${version.version} · ${commit.sha.slice(0, 7)}`);

  return { repo: `${owner}/${repo}`, branch, commitSha: commit.sha, commitUrl: commit.url, fileCount: files.length, version };
}
