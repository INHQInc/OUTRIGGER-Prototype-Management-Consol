import { NextRequest, NextResponse } from "next/server";
import { readManifest } from "@/lib/features/registry";
import { updateInjections } from "@/lib/features/write";
import type { Injection } from "@/lib/features/types";

const VALID_TYPES = new Set(["html", "css", "js"]);
const VALID_MODES = new Set(["before", "after", "prepend", "append", "replace"]);

function sanitize(list: unknown): Injection[] | null {
  if (!Array.isArray(list)) return null;
  const out: Injection[] = [];
  for (const raw of list) {
    if (!raw || typeof raw !== "object") return null;
    const r = raw as Record<string, unknown>;
    if (!VALID_TYPES.has(String(r.type))) return null;
    const inj: Injection = { type: r.type as Injection["type"] };
    if (r.selector != null) inj.selector = String(r.selector);
    if (r.mode != null) {
      if (!VALID_MODES.has(String(r.mode))) return null;
      inj.mode = r.mode as Injection["mode"];
    }
    if (r.fragment != null) inj.fragment = String(r.fragment);
    if (r.file != null) inj.file = String(r.file);
    if (inj.type === "html" && !inj.selector) return null; // html needs an anchor
    out.push(inj);
  }
  return out;
}

/** GET current manifest. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const m = await readManifest(key);
  if (!m) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ manifest: m });
}

/** PATCH { injections } — replace the feature's injection list. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const body = await req.json().catch(() => ({}));
  const injections = sanitize(body.injections);
  if (!injections) return NextResponse.json({ error: "Invalid injections" }, { status: 400 });
  const updated = await updateInjections(key, injections);
  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ manifest: updated });
}
