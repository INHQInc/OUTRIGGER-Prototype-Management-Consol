import type { AccessCode, ConsoleUser, Role } from "./types";

/**
 * Persistence seam for auth. JSON-file impl for local dev; Neon impl when
 * DATABASE_URL is set (hosted). Same swap pattern as the page registry.
 */
export interface UserStore {
  listUsers(): Promise<ConsoleUser[]>;
  getUser(email: string): Promise<ConsoleUser | null>;
  upsertUser(u: { email: string; name?: string; role: Role }): Promise<ConsoleUser>;
  setStatus(email: string, status: ConsoleUser["status"]): Promise<void>;
  deleteUser(email: string): Promise<void>;
  touchLogin(email: string): Promise<void>;

  createCode(c: AccessCode): Promise<void>;
  findValidCodeByHash(hash: string): Promise<AccessCode | null>;
  markCodeUsed(id: string): Promise<void>;
}

let cached: UserStore | null = null;

export async function getStore(): Promise<UserStore> {
  if (cached) return cached;
  if (process.env.DATABASE_URL) {
    const { NeonStore } = await import("./store-neon");
    cached = await NeonStore.create();
  } else {
    const { JsonStore } = await import("./store-json");
    cached = new JsonStore();
  }
  return cached;
}
