import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth/session";
import { SESSION_COOKIE } from "@/lib/auth/config";

/**
 * Session gate for the whole console. Unauthenticated requests are redirected
 * to /login (pages) or 401'd (API). Session is a signed 365-day JWT cookie;
 * verification is stateless (jose), so this stays edge-fast with no DB hit.
 *
 * Requires AUTH_SECRET. If unset (misconfigured deploy), we fail closed.
 */
// Public: auth entry points + the Live loader (runs on customers' external
// pages for anonymous visitors, gated by the ?opmc preview token, not by the
// console session).
const PUBLIC_PATHS = ["/login", "/api/auth/admin-login", "/api/auth/verify", "/loader", "/api/loader"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
  if (isPublic) return NextResponse.next();

  // CLI tooling (the prototype skill) authenticates with a per-customer API
  // token instead of a session cookie. Only /api/prototypes* may pass; the
  // routes validate the token and enforce org scope themselves.
  if (pathname.startsWith("/api/prototypes") && req.headers.get("authorization")?.startsWith("Bearer opmc_")) {
    return NextResponse.next();
  }

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = process.env.AUTH_SECRET ? await verifySession(token) : null;

  if (session) {
    const res = NextResponse.next();
    res.headers.set("x-console-user", session.sub);
    res.headers.set("x-console-role", session.role);
    return res;
  }

  if (pathname.startsWith("/api/")) {
    return new NextResponse(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json", "x-robots-tag": "noindex, nofollow" },
    });
  }

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", pathname);
  const res = NextResponse.redirect(url);
  res.headers.set("x-robots-tag", "noindex, nofollow");
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt).*)"],
};
