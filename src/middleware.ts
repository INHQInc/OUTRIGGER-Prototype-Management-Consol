import { NextRequest, NextResponse } from "next/server";

/**
 * Console-wide HTTP Basic Auth.
 *
 * Vercel's free Standard Protection covers preview/deployment URLs but leaves
 * the production domain public; this middleware closes that gap (invariant:
 * no publicly reachable clones). Set CONSOLE_PASSWORD in the environment to
 * activate. Username is ignored. Local dev without the var runs open.
 */
export function middleware(req: NextRequest) {
  const password = process.env.CONSOLE_PASSWORD;
  if (!password) return NextResponse.next(); // not configured (local dev)

  const header = req.headers.get("authorization") ?? "";
  if (header.startsWith("Basic ")) {
    try {
      const [, pass] = atob(header.slice(6)).split(":");
      if (pass === password) return NextResponse.next();
    } catch {
      /* fall through to 401 */
    }
  }

  return new NextResponse("Authentication required", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="OUTRIGGER Prototype Management Console"',
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

export const config = {
  // Everything except Next.js internals and static chunks
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
