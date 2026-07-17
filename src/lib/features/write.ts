import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { featuresRoot, readManifest } from "./registry";
import type { FeatureManifest, Injection } from "./types";

/** Persist an updated injection list for a feature (writes feature.json). */
export async function updateInjections(key: string, injections: Injection[]): Promise<FeatureManifest | null> {
  if (!/^[a-zA-Z0-9_-]+$/.test(key)) return null;
  const current = await readManifest(key);
  if (!current) return null;
  const next: FeatureManifest = {
    ...current,
    injections,
    updatedAt: new Date().toISOString(),
  };
  await writeFile(join(featuresRoot(), key, "feature.json"), JSON.stringify(next, null, 2) + "\n", "utf8");
  return next;
}

/** Basic manifest field updates (name, status, description, targets, liveUrls). */
export async function updateManifest(
  key: string,
  patch: Partial<Pick<FeatureManifest, "name" | "status" | "description" | "targets" | "liveUrls">>
): Promise<FeatureManifest | null> {
  if (!/^[a-zA-Z0-9_-]+$/.test(key)) return null;
  const current = await readManifest(key);
  if (!current) return null;
  const next: FeatureManifest = { ...current, ...patch, updatedAt: new Date().toISOString() };
  await writeFile(join(featuresRoot(), key, "feature.json"), JSON.stringify(next, null, 2) + "\n", "utf8");
  return next;
}
