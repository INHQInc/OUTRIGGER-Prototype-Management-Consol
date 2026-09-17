import { createHash } from "node:crypto";
import { getContentStore } from "../content/store";
import type { BriefAttachment } from "./types";

/**
 * SUPPORTING FILES ON A BRIEF — the audit PDF, the offer terms spreadsheet,
 * the content doc.
 *
 * Stored content-addressed in the asset store (same shelf as evidence
 * screenshots) and written into `.opmc/attachments/` when the branch syncs, so
 * the agent opens the real file with its own tools. No server-side text
 * extraction: Claude Code reads a PDF or a sheet directly, and an extraction
 * step would be a second, worse copy of the file that goes stale.
 */

/** What is worth handing an agent. Deliberately not "anything": an executable
 *  or an archive in a build input is a supply-chain problem, not a brief. */
const EXT: Record<string, string> = {
  "application/pdf": "pdf",
  "text/csv": "csv",
  "text/plain": "txt",
  "text/markdown": "md",
  "application/json": "json",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
};

export const ACCEPT = Object.keys(EXT).join(",");

/** 15 MB. Big enough for a real audit deck, small enough that a branch stays
 *  clonable — these bytes land in git, and git never forgets them. */
const MAX_BYTES = 15_000_000;

/** A name the branch can carry: no directories, no dotfiles, no surprises. */
export function safeFileName(raw: string, ext: string): string {
  const base = (raw.split(/[\\/]/).pop() ?? "file")
    .replace(/\.[^.]+$/, "")
    .replace(/[^A-Za-z0-9._ -]+/g, "-")
    .replace(/^[-. ]+|[-. ]+$/g, "")
    .slice(0, 80) || "file";
  return `${base}.${ext}`;
}

export async function putBriefAttachment(opts: {
  siteKey: string; dataUrl: string; fileName: string; note?: string; addedBy?: string;
}): Promise<BriefAttachment> {
  const m = /^data:([^;,]+);base64,([\s\S]+)$/.exec(opts.dataUrl.trim());
  if (!m) throw new Error("That file didn't arrive in a form the console can read.");
  const contentType = m[1].toLowerCase();
  const ext = EXT[contentType];
  if (!ext) throw new Error(`${contentType} isn't a supported attachment — PDFs, spreadsheets, documents, text and images are.`);
  const bytes = Buffer.from(m[2], "base64");
  if (!bytes.length) throw new Error("That file is empty.");
  if (bytes.length > MAX_BYTES) {
    throw new Error(`That file is ${(bytes.length / 1e6).toFixed(1)} MB — the limit is 15 MB, because attachments are committed to the prototype's branch.`);
  }
  const asset = `brief-${createHash("sha1").update(bytes).digest("hex")}.${ext}`;
  const store = await getContentStore();
  if (!(await store.hasAsset(opts.siteKey, asset))) {
    await store.putAsset(opts.siteKey, asset, bytes, contentType);
  }
  return {
    asset,
    name: safeFileName(opts.fileName || `attachment.${ext}`, ext),
    contentType,
    bytes: bytes.length,
    addedAt: new Date().toISOString(),
    ...(opts.addedBy ? { addedBy: opts.addedBy } : {}),
    ...(opts.note?.trim() ? { note: opts.note.trim() } : {}),
  };
}

export async function getBriefAttachment(siteKey: string, asset: string) {
  // Names are content-addressed and minted here; refuse anything else so a
  // caller-supplied name cannot walk out of the asset namespace.
  if (!/^brief-[a-f0-9]{40}\.[a-z0-9]{1,5}$/.test(asset)) return null;
  return (await getContentStore()).getAsset(siteKey, asset);
}
