import { NextRequest, NextResponse } from "next/server";
import { guardPrototypeAccess } from "@/lib/prototypes/guard";
import { listArtifactVersions } from "@/lib/prototypes/versions";
import { resolvePrototypeRepo } from "@/lib/prototypes/repo";
import { getGitClientForOrg } from "@/lib/git/connection";

const MAX_FILE_BYTES = 400_000;

/**
 * The Handoff explorer's data source — browse a CUT VERSION's exact tree.
 *
 * GET ?key=&sha=            → { files: [{ path, size }] }
 * GET ?key=&sha=&path=…     → { path, content, truncated? } | { path, binary: true }
 *
 * The sha MUST be one of the prototype's cut versions — the explorer shows
 * byte-for-byte what was certified/ran, never an arbitrary ref.
 */
export async function GET(req: NextRequest) {
  const g = await guardPrototypeAccess(req.nextUrl.searchParams.get("key"), req.headers.get("authorization"));
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });

  const sha = req.nextUrl.searchParams.get("sha") ?? "";
  const path = req.nextUrl.searchParams.get("path");
  if (!/^[0-9a-f]{7,40}$/i.test(sha)) return NextResponse.json({ error: "sha must be a commit SHA" }, { status: 400 });
  // Traversal guard: "." / ".." / empty segments survive encodeURIComponent and
  // the URL parser collapses them, which would escape /contents/ and turn the
  // org's GitHub token into a free-roaming proxy. Repo paths never need them.
  if (path && (path.startsWith("/") || path.split("/").some((seg) => seg === "" || seg === "." || seg === ".."))) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  const versions = await listArtifactVersions(g.proto.key);
  const version = versions.find((v) => v.gitSha === sha || v.gitSha.startsWith(sha));
  if (!version) return NextResponse.json({ error: "That SHA is not a cut version of this prototype — the explorer only shows frozen cuts." }, { status: 400 });

  const repo = await resolvePrototypeRepo(g.proto, g.orgId);
  if (!repo?.fullName) return NextResponse.json({ error: "No repo set on this prototype." }, { status: 400 });
  const [owner, name] = repo.fullName.split("/");
  const client = await getGitClientForOrg(g.orgId);
  if (!client) return NextResponse.json({ error: "GitHub isn't connected — Settings → Repositories." }, { status: 400 });

  try {
    if (!path) {
      const files = await client.listTreeAtRef(owner, name, version.gitSha);
      return NextResponse.json({ files, gitSha: version.gitSha, version: version.version });
    }
    const content = await client.readFileAtRef(owner, name, path, version.gitSha);
    if (content === null) return NextResponse.json({ error: `${path} not found at ${version.gitSha.slice(0, 7)}` }, { status: 404 });
    if (content.includes("\u0000")) return NextResponse.json({ path, binary: true });
    const truncated = Buffer.byteLength(content, "utf8") > MAX_FILE_BYTES;
    return NextResponse.json({ path, content: truncated ? content.slice(0, MAX_FILE_BYTES) : content, truncated: truncated || undefined });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
