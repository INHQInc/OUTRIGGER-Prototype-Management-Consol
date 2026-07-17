import { SignJWT, jwtVerify } from "jose";
import { authSecret, SESSION_MAX_AGE_SECONDS } from "./config";
import type { SessionPayload } from "./types";

/** Sign a 365-day session token. */
export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ role: payload.role, name: payload.name })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(authSecret());
}

/** Verify a session token; returns null if invalid/expired. Edge-safe (jose). */
export async function verifySession(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, authSecret());
    if (!payload.sub) return null;
    return {
      sub: payload.sub,
      role: (payload.role as SessionPayload["role"]) ?? "member",
      name: payload.name as string | undefined,
    };
  } catch {
    return null;
  }
}
