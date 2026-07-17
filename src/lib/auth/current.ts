import { cookies } from "next/headers";
import { verifySession } from "./session";
import { SESSION_COOKIE } from "./config";
import type { SessionPayload } from "./types";

/** Current session in a server component / route handler, or null. */
export async function currentUser(): Promise<SessionPayload | null> {
  if (!process.env.AUTH_SECRET) return null;
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return verifySession(token);
}

export async function requireAdmin(): Promise<SessionPayload> {
  const u = await currentUser();
  if (!u || u.role !== "admin") throw new Error("Forbidden");
  return u;
}
