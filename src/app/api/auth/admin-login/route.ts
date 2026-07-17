import { NextRequest, NextResponse } from "next/server";
import { getStore } from "@/lib/auth/store";
import { signSession } from "@/lib/auth/session";
import { isAdminEmail, adminLoginSecret, SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from "@/lib/auth/config";

/** POST { email, secret } → 365-day admin session if email∈ADMIN_EMAILS and secret matches. */
export async function POST(req: NextRequest) {
  const { email, secret } = await req.json().catch(() => ({}));
  const configured = adminLoginSecret();
  if (!configured) return NextResponse.json({ error: "Admin login not configured" }, { status: 500 });
  if (!email || !secret) return NextResponse.json({ error: "Email and access secret required" }, { status: 400 });

  const e = String(email).trim().toLowerCase();
  const ok = isAdminEmail(e) && timingSafeEqual(String(secret), configured);
  if (!ok) return NextResponse.json({ error: "Invalid admin credentials" }, { status: 401 });

  // Ensure an admin user record exists
  const store = await getStore();
  const user = await store.upsertUser({ email: e, role: "admin" });
  await store.touchLogin(e);

  const token = await signSession({ sub: e, role: "admin", name: user.name });
  const res = NextResponse.json({ ok: true, email: e, role: "admin" });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return res;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}
