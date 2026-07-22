import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { getContentStore } from "@/lib/content/store";

/**
 * GitHub push webhook. Public (GitHub POSTs unauthenticated); verifies the
 * HMAC signature when GITHUB_WEBHOOK_SECRET is set. On a push to a prototype's
 * branch, stamps push:<key> = { sha, at } so the console can show "pushed Xm
 * ago" and flag drift (HEAD moved past the last cut version).
 */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (secret) {
    const sig = req.headers.get("x-hub-signature-256") ?? "";
    const expected = "sha256=" + crypto.createHmac("sha256", secret).update(raw).digest("hex");
    const a = Buffer.from(sig), b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return NextResponse.json({ error: "bad signature" }, { status: 401 });
    }
  }
  if (req.headers.get("x-github-event") !== "push") return NextResponse.json({ ok: true, ignored: true });
  let payload: { ref?: string; after?: string; repository?: { full_name?: string } };
  try { payload = JSON.parse(raw); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  const branch = payload.ref?.replace(/^refs\/heads\//, "");
  const repoFull = payload.repository?.full_name;
  const sha = payload.after;
  if (!branch || !repoFull) return NextResponse.json({ ok: true });

  const store = await getContentStore();
  const protos = await store.listPrototypes();
  const match = protos.find((p) => p.repo?.fullName === repoFull && (p.repo?.branch || `prototype/${p.key}`) === branch);
  if (match) {
    try { await store.setFlag(`push:${match.key}`, JSON.stringify({ sha, at: new Date().toISOString() })); } catch { /* best-effort */ }
  }
  return NextResponse.json({ ok: true, matched: match?.key ?? null });
}
