/**
 * EVIDENCE BOARD — the experiment as a picture.
 *
 * Screenshots of each arm with a box over every tracked element, carrying that
 * metric's live number. The board stores a REFERENCE to the metric, never a
 * copied number: a stored figure is stale the moment the counts move, which is
 * the same defect that once put "+91.8%" in FINDINGS beside a live +90.8%.
 *
 * Images go to the content store's asset path (content-addressed, already
 * pluggable FS/Neon), so this adds no new storage backend.
 */

import { createHash } from "crypto";
import { getContentStore } from "../content/store";

export interface EvidenceShot {
  id: string;
  /** The variation this screenshot shows — bound to Optimizely's id so a
   *  renamed arm doesn't orphan the picture. Empty = unassigned. */
  variationId: string;
  label: string;
  /** Content-addressed asset name inside the site's asset store. */
  asset: string;
  contentType: string;
  width?: number;
  height?: number;
  addedAt: string;
}

export interface EvidenceMark {
  id: string;
  shotId: string;
  /** A stats metric key ("composite:<id>" / "metric:<name>") — the SAME key
   *  space the readout's index and the verdict engine use. */
  measureKey: string;
  /** Percentages of the shot's rendered box, so overlays scale with the image. */
  x: number; y: number; w: number; h: number;
  /** Optional annotation colour. Presentation only — the reading beside it
   *  keeps the earned tone, so emphasis can never restate the data. */
  tone?: "up" | "down" | "warn" | "new" | "flat";
  /** A human line about THIS element on THIS screen. */
  note?: string;
}

export interface EvidenceBoard {
  shots: EvidenceShot[];
  marks: EvidenceMark[];
  /** One-line framing above the pictures. The verdict and findings still come
   *  from the readout — this is the caption, not a second narrative. */
  caption?: string;
  updatedAt?: string;
  updatedBy?: string;
}

const boardKey = (k: string) => `evidence:${k}`;
const EMPTY: EvidenceBoard = { shots: [], marks: [] };

export async function getEvidenceBoard(prototypeKey: string): Promise<EvidenceBoard> {
  const raw = await (await getContentStore()).getFlag(boardKey(prototypeKey));
  if (!raw) return { ...EMPTY };
  try {
    const b = JSON.parse(raw) as EvidenceBoard;
    return { shots: b.shots ?? [], marks: b.marks ?? [], caption: b.caption, updatedAt: b.updatedAt, updatedBy: b.updatedBy };
  } catch {
    return { ...EMPTY };
  }
}

/** CAS read-modify-write — two people annotating the same board is normal. */
export async function mutateEvidenceBoard(
  prototypeKey: string,
  actor: string,
  apply: (cur: EvidenceBoard) => EvidenceBoard | null,
): Promise<EvidenceBoard> {
  const store = await getContentStore();
  const key = boardKey(prototypeKey);
  for (let attempt = 0; attempt < 5; attempt++) {
    const raw = await store.getFlag(key);
    const cur = await getEvidenceBoard(prototypeKey);
    const next = apply(cur);
    if (!next) return cur; // the mutation decided there was nothing to do
    next.updatedAt = new Date().toISOString();
    next.updatedBy = actor;
    if (await store.compareAndSetFlag(key, raw, JSON.stringify(next))) return next;
  }
  throw new Error("The board is being edited elsewhere — reload and try again.");
}

/** Blank the board (the store has no delete; readers treat empty as absent). */
export async function clearEvidenceBoard(prototypeKey: string): Promise<void> {
  await (await getContentStore()).setFlag(boardKey(prototypeKey), "");
}

const EXT: Record<string, string> = {
  "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif",
};

/** Store a screenshot. Content-addressed: re-uploading the same picture costs
 *  nothing and can never fork into two copies. */
export async function putEvidenceImage(opts: {
  siteKey: string; dataUrl: string;
}): Promise<{ asset: string; contentType: string; bytes: number }> {
  const m = /^data:([^;,]+);base64,([\s\S]+)$/.exec(opts.dataUrl.trim());
  if (!m) throw new Error("That doesn't look like an image.");
  const contentType = m[1].toLowerCase();
  const ext = EXT[contentType];
  if (!ext) throw new Error("Screenshots must be PNG, JPEG, WebP or GIF.");
  const bytes = Buffer.from(m[2], "base64");
  // 6 MB ceiling: the client downsizes before upload, so anything larger is a
  // mistake rather than a screenshot.
  if (bytes.length > 6_000_000) throw new Error("That image is too large — the console downsizes screenshots before upload; try again.");
  const asset = `evidence-${createHash("sha1").update(bytes).digest("hex")}.${ext}`;
  const store = await getContentStore();
  if (!(await store.hasAsset(opts.siteKey, asset))) {
    await store.putAsset(opts.siteKey, asset, bytes, contentType);
  }
  return { asset, contentType, bytes: bytes.length };
}

export async function getEvidenceImage(siteKey: string, asset: string) {
  // Names are content-addressed and generated here; refuse anything else so a
  // caller-supplied name can never walk out of the asset namespace.
  if (!/^evidence-[a-f0-9]{40}\.(png|jpg|webp|gif)$/.test(asset)) return null;
  return (await getContentStore()).getAsset(siteKey, asset);
}
