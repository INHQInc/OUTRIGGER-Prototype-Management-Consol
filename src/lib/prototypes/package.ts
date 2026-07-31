/**
 * The INTEGRATION PACKAGE — the third handoff method ("local compute,
 * hosted record"): the building agent, which has BOTH codebases in front of
 * it (the prototype it wrote + the real site source via the source-site
 * clone), writes a complete production implementation into `handoff/` on the
 * feature branch — full new files (CSHTML views, SCSS, JS, C# backend/API),
 * diffs to existing site files, and an integration guide. Git is the
 * transport; the console reads and presents it here. One shot, everything a
 * dev team needs to build the winner natively in the CMS.
 *
 * Contract (agent-authored, normalized here — trust boundary):
 *   handoff/manifest.json  — the index (see PackageManifest)
 *   handoff/README.md      — the integration guide, human-first
 *   handoff/files/**       — complete new/replacement files, at paths
 *                            mirroring their SITE-relative destination
 *   handoff/diffs/**.patch — unified diffs for modifications to existing
 *                            site files
 */
import { getGitClientForOrg } from "../git/connection";
import { resolvePrototypeRepo } from "./repo";
import type { PrototypeRecord } from "./types";

export type PackageFileKind = "cshtml" | "cs" | "js" | "ts" | "scss" | "css" | "config" | "content-type" | "other";

export interface PackageFile {
  /** SITE-relative destination path (where the dev puts it). */
  path: string;
  action: "add" | "modify";
  kind: PackageFileKind;
  description: string;
  /** Repo path under handoff/ carrying the content (file or .patch). */
  source: string;
}

export interface PackageApi {
  name: string;
  method: string;
  route: string;
  description: string;
}

export interface PackageManifest {
  summary: string;
  generatedAt?: string;
  /** The cut version this package implements, if the agent recorded it. */
  forVersion?: number;
  files: PackageFile[];
  apis?: PackageApi[];
  notes?: string;
}

export interface IntegrationPackage {
  found: boolean;
  /**
   * Why found is false — the UI renders each differently:
   *   absent     — no manifest on the branch (the honest empty state)
   *   unreadable — repo unreachable right now (transient; do NOT tell the
   *                user to regenerate a package that exists)
   *   invalid    — a manifest exists but failed parsing/normalization (tell
   *                the agent to fix it; regenerating blind loops forever)
   */
  state: "found" | "absent" | "unreadable" | "invalid";
  /** One-line diagnostic for the invalid state. */
  problem?: string;
  /** Branch HEAD the package was read at. */
  sha?: string;
  manifest?: PackageManifest;
  readme?: string;
}

const KINDS: PackageFileKind[] = ["cshtml", "cs", "js", "ts", "scss", "css", "config", "content-type", "other"];

/** Normalize agent-authored JSON at the boundary — the UI never sees a partial shape. */
export function normalizeManifest(raw: unknown): PackageManifest | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const seenSources = new Set<string>();
  const files = (Array.isArray(o.files) ? o.files : [])
    .filter((f): f is Record<string, unknown> => Boolean(f) && typeof f === "object")
    .map((f) => ({
      path: String(f.path ?? "").trim().slice(0, 500),
      action: f.action === "modify" ? "modify" as const : "add" as const,
      kind: (KINDS as string[]).includes(String(f.kind)) ? (f.kind as PackageFileKind) : "other" as const,
      description: String(f.description ?? "").trim().slice(0, 500),
      source: String(f.source ?? "").trim().slice(0, 500),
    }))
    // Only sources inside handoff/ are servable — anything else is dropped,
    // not followed (the file API enforces the same prefix). De-duped by
    // source (it's the selection + React key) and count-capped: the manifest
    // is agent-authored and only transport-bounded otherwise.
    .filter((f) => f.path && f.source.startsWith("handoff/") && !f.source.split("/").some((s) => s === "" || s === "." || s === "..")
      && !seenSources.has(f.source) && seenSources.add(f.source) !== undefined)
    .slice(0, 500);
  if (!files.length) return null;
  const apis = (Array.isArray(o.apis) ? o.apis : [])
    .filter((a): a is Record<string, unknown> => Boolean(a) && typeof a === "object")
    .map((a) => ({
      name: String(a.name ?? "").trim().slice(0, 120),
      method: String(a.method ?? "").trim().toUpperCase().slice(0, 10),
      route: String(a.route ?? "").trim().slice(0, 300),
      description: String(a.description ?? "").trim().slice(0, 500),
    }))
    .filter((a) => a.name && a.route)
    .slice(0, 100);
  return {
    summary: String(o.summary ?? "").trim().slice(0, 1000),
    generatedAt: typeof o.generatedAt === "string" ? o.generatedAt : undefined,
    forVersion: typeof o.forVersion === "number" && Number.isFinite(o.forVersion) ? o.forVersion : undefined,
    files,
    apis: apis.length ? apis : undefined,
    notes: typeof o.notes === "string" ? o.notes.trim().slice(0, 4000) || undefined : undefined,
  };
}

/** Read the package (manifest + README) from the branch HEAD. */
export async function readIntegrationPackage(proto: PrototypeRecord, orgId: string | null): Promise<IntegrationPackage> {
  if (!orgId) return { found: false, state: "absent" };
  const repo = await resolvePrototypeRepo(proto, orgId);
  if (!repo?.fullName) return { found: false, state: "absent" };
  const [owner, name] = repo.fullName.split("/");
  const client = await getGitClientForOrg(orgId);
  if (!client) return { found: false, state: "absent" };
  const branch = repo.branch || `prototype/${proto.key}`;
  // ONE generation: resolve the sha FIRST and read everything AT it, so the
  // "read at <sha>" label, the manifest, and the README can never mix
  // package generations (the agent may push mid-render). File clicks pin to
  // this same sha via the API's sha param.
  // readFileAtRef distinguishes ABSENT (404 → null) from repo-unreachable
  // (throws) — keep that distinction; a rate limit must not render as "no
  // package yet, go generate one".
  let sha: string;
  try { sha = await client.getBranchSha(owner, name, branch); }
  catch { return { found: false, state: "unreadable" }; }
  let raw: string | null;
  try { raw = await client.readFileAtRef(owner, name, "handoff/manifest.json", sha); }
  catch { return { found: false, state: "unreadable" }; }
  if (!raw) return { found: false, state: "absent" };
  let manifest: PackageManifest | null = null;
  let problem: string | undefined;
  try {
    manifest = normalizeManifest(JSON.parse(raw));
    if (!manifest) problem = "manifest parsed but has no valid files[] entries (every source must live under handoff/)";
  } catch { problem = "handoff/manifest.json is not valid JSON"; }
  if (!manifest) return { found: false, state: "invalid", problem };
  const readme = await client.readFileAtRef(owner, name, "handoff/README.md", sha).catch(() => null);
  return { found: true, state: "found", sha, manifest, readme: readme ?? undefined };
}
