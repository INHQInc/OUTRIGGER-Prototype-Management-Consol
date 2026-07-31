import { NextRequest, NextResponse } from "next/server";
import { guardPrototypeAccess } from "@/lib/prototypes/guard";
import { resolvePrototypeRepo } from "@/lib/prototypes/repo";
import { getGitClientForOrg } from "@/lib/git/connection";
import { readIntegrationPackage } from "@/lib/prototypes/package";

const MAX_FILE_BYTES = 400_000;

/**
 * The Integration package's data source.
 *
 * GET ?key=              → { package } (manifest + README, pinned to one sha)
 * GET ?key=&path=&sha=   → { path, content, truncated? } | { path, binary } —
 *                          a package file, read at `sha` when given (the
 *                          panel pins clicks to the generation it rendered)
 *                          else branch HEAD. The path MUST live under
 *                          handoff/; the traversal guard mirrors handoff-files.
 */
export async function GET(req: NextRequest) {
  const g = await guardPrototypeAccess(req.nextUrl.searchParams.get("key"), req.headers.get("authorization"));
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });

  const path = req.nextUrl.searchParams.get("path");
  if (!path) {
    return NextResponse.json({ package: await readIntegrationPackage(g.proto, g.orgId) });
  }

  // Only the package's own tree is servable, and no traversal segments —
  // "." / ".." would escape /contents/ and turn the org's GitHub token into
  // a free-roaming proxy.
  if (!path.startsWith("handoff/") || path.split("/").some((seg) => seg === "" || seg === "." || seg === "..")) {
    return NextResponse.json({ error: "Invalid path — package files live under handoff/." }, { status: 400 });
  }

  const repo = await resolvePrototypeRepo(g.proto, g.orgId);
  if (!repo?.fullName) return NextResponse.json({ error: "No repo set on this prototype." }, { status: 400 });
  const [owner, name] = repo.fullName.split("/");
  const client = await getGitClientForOrg(g.orgId);
  if (!client) return NextResponse.json({ error: "GitHub isn't connected — Settings → Repositories." }, { status: 400 });
  const sha = req.nextUrl.searchParams.get("sha") ?? "";
  if (sha && !/^[0-9a-f]{7,40}$/i.test(sha)) return NextResponse.json({ error: "sha must be a commit SHA" }, { status: 400 });
  const ref = sha || repo.branch || `prototype/${g.proto.key}`;

  const content = await client.readFileAtRef(owner, name, path, ref).catch(() => null);
  if (content === null) return NextResponse.json({ error: "That file isn't in the package (was it pushed?)." }, { status: 404 });
  // Mirror handoff-files exactly: binary sentinel + BYTE-measured cap.
  if (content.includes("\u0000")) return NextResponse.json({ path, binary: true });
  if (Buffer.byteLength(content, "utf8") > MAX_FILE_BYTES) {
    return NextResponse.json({ path, content: content.slice(0, MAX_FILE_BYTES), truncated: true });
  }
  return NextResponse.json({ path, content });
}
