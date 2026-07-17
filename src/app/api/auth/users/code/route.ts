import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getStore } from "@/lib/auth/store";
import { requireAdmin } from "@/lib/auth/current";
import { generateToken } from "@/lib/auth/codes";
import { ACCESS_CODE_TTL_SECONDS } from "@/lib/auth/config";

/**
 * POST { email } — generate a one-time access link for a user.
 * Returns the full URL for the admin to send (email auto-send is a later add).
 */
export async function POST(req: NextRequest) {
  try { await requireAdmin(); }
  catch { return NextResponse.json({ error: "Forbidden" }, { status: 403 }); }

  const { email } = await req.json().catch(() => ({}));
  if (!email) return NextResponse.json({ error: "email required" }, { status: 400 });
  const e = String(email).toLowerCase();

  const store = await getStore();
  const user = await store.getUser(e);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const { raw, hash } = generateToken();
  const now = new Date();
  await store.createCode({
    id: randomUUID(),
    email: e,
    tokenHash: hash,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ACCESS_CODE_TTL_SECONDS * 1000).toISOString(),
    usedAt: null,
  });

  const origin = req.nextUrl.origin;
  const link = `${origin}/login/verify?token=${raw}`;
  return NextResponse.json({ link, email: e, expiresInDays: Math.round(ACCESS_CODE_TTL_SECONDS / 86400) });
}
