import { NextRequest, NextResponse } from "next/server";
import { getStore } from "@/lib/auth/store";
import { hashToken } from "@/lib/auth/codes";
import { signSession } from "@/lib/auth/session";
import { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from "@/lib/auth/config";

/** POST { token } → consumes a one-time access link, sets a 365-day member session. */
export async function POST(req: NextRequest) {
  const { token } = await req.json().catch(() => ({}));
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });

  const store = await getStore();
  const code = await store.findValidCodeByHash(hashToken(String(token)));
  if (!code) return NextResponse.json({ error: "This link is invalid, already used, or expired." }, { status: 401 });

  const user = await store.getUser(code.email);
  if (!user || user.status !== "active") {
    return NextResponse.json({ error: "Account is not active. Contact an admin." }, { status: 403 });
  }

  await store.markCodeUsed(code.id);
  await store.touchLogin(user.email);

  const session = await signSession({ sub: user.email, role: user.role, name: user.name });
  const res = NextResponse.json({ ok: true, email: user.email, role: user.role });
  res.cookies.set(SESSION_COOKIE, session, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return res;
}
