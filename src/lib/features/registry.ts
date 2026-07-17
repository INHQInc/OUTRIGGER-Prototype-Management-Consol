import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import type { FeatureManifest, Injection } from "./types";

/** features/ dir at the repo root holds all overlay features (git-tracked). */
export function featuresRoot(): string {
  return join(process.cwd(), "features");
}

async function exists(p: string): Promise<boolean> {
  try { await stat(p); return true; } catch { return false; }
}

export async function listFeatureKeys(): Promise<string[]> {
  const root = featuresRoot();
  if (!(await exists(root))) return [];
  const entries = await readdir(root, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory()).map((e) => e.name);
}

export async function readManifest(key: string): Promise<FeatureManifest | null> {
  try {
    const raw = await readFile(join(featuresRoot(), key, "feature.json"), "utf8");
    return JSON.parse(raw) as FeatureManifest;
  } catch {
    return null;
  }
}

export async function listFeatures(): Promise<FeatureManifest[]> {
  const keys = await listFeatureKeys();
  const out: FeatureManifest[] = [];
  for (const k of keys) {
    const m = await readManifest(k);
    if (m) out.push(m);
  }
  return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** Read a feature's file (fragment, css, js) by relative name. */
export async function readFeatureFile(key: string, relName: string): Promise<string | null> {
  // Guard against traversal
  if (relName.includes("..")) return null;
  try {
    return await readFile(join(featuresRoot(), key, relName), "utf8");
  } catch {
    return null;
  }
}

/** Resolve the file each injection references, with defaults. */
export function resolveInjectionFile(inj: Injection): string | null {
  if (inj.type === "css") return inj.file ?? "overlay.css";
  if (inj.type === "js") return inj.file ?? "overlay.js";
  if (inj.type === "html") return inj.fragment ? join("fragments", inj.fragment) : null;
  return null;
}
