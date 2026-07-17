/** Central auth config read from environment. */

export function authSecret(): Uint8Array {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not set");
  return new TextEncoder().encode(s);
}

export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function adminLoginSecret(): string | null {
  return process.env.ADMIN_LOGIN_SECRET ?? null;
}

export function isAdminEmail(email: string): boolean {
  return adminEmails().includes(email.trim().toLowerCase());
}

/** Session lifetime — 365 days, per requirement. */
export const SESSION_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

/** One-time access link validity window (until first use). */
export const ACCESS_CODE_TTL_SECONDS = 30 * 24 * 60 * 60;

export const SESSION_COOKIE = "opmc_session";
