import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { UserStore } from "./store";
import type { AccessCode, ConsoleUser, Role } from "./types";

interface Db {
  users: ConsoleUser[];
  codes: AccessCode[];
}

const FILE = join(process.cwd(), ".data", "auth.json");

/** Local-dev store. Not for multi-instance hosting (use Neon there). */
export class JsonStore implements UserStore {
  private async read(): Promise<Db> {
    try {
      return JSON.parse(await readFile(FILE, "utf8")) as Db;
    } catch {
      return { users: [], codes: [] };
    }
  }
  private async write(db: Db): Promise<void> {
    await mkdir(dirname(FILE), { recursive: true });
    await writeFile(FILE, JSON.stringify(db, null, 2), "utf8");
  }

  async listUsers(): Promise<ConsoleUser[]> {
    return (await this.read()).users.sort((a, b) => a.email.localeCompare(b.email));
  }
  async getUser(email: string): Promise<ConsoleUser | null> {
    const e = email.toLowerCase();
    return (await this.read()).users.find((u) => u.email === e) ?? null;
  }
  async upsertUser({ email, name, role }: { email: string; name?: string; role: Role }): Promise<ConsoleUser> {
    const db = await this.read();
    const e = email.toLowerCase();
    let u = db.users.find((x) => x.email === e);
    if (u) {
      u.role = role;
      if (name !== undefined) u.name = name;
      u.status = "active";
    } else {
      u = { email: e, name, role, status: "active", createdAt: new Date().toISOString(), lastLoginAt: null };
      db.users.push(u);
    }
    await this.write(db);
    return u;
  }
  async setStatus(email: string, status: ConsoleUser["status"]): Promise<void> {
    const db = await this.read();
    const u = db.users.find((x) => x.email === email.toLowerCase());
    if (u) { u.status = status; await this.write(db); }
  }
  async deleteUser(email: string): Promise<void> {
    const db = await this.read();
    const e = email.toLowerCase();
    db.users = db.users.filter((u) => u.email !== e);
    db.codes = db.codes.filter((c) => c.email !== e);
    await this.write(db);
  }
  async touchLogin(email: string): Promise<void> {
    const db = await this.read();
    const u = db.users.find((x) => x.email === email.toLowerCase());
    if (u) { u.lastLoginAt = new Date().toISOString(); await this.write(db); }
  }

  async createCode(c: AccessCode): Promise<void> {
    const db = await this.read();
    db.codes.push(c);
    await this.write(db);
  }
  async findValidCodeByHash(hash: string): Promise<AccessCode | null> {
    const db = await this.read();
    const now = Date.now();
    return (
      db.codes.find((c) => c.tokenHash === hash && !c.usedAt && new Date(c.expiresAt).getTime() > now) ?? null
    );
  }
  async markCodeUsed(id: string): Promise<void> {
    const db = await this.read();
    const c = db.codes.find((x) => x.id === id);
    if (c) { c.usedAt = new Date().toISOString(); await this.write(db); }
  }
}
