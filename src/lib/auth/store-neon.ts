import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import type { UserStore } from "./store";
import type { AccessCode, ConsoleUser, Role } from "./types";

/** Neon-backed store for hosted deployments. Tables auto-created on first use. */
export class NeonStore implements UserStore {
  private constructor(private sql: NeonQueryFunction<false, false>) {}

  static async create(): Promise<NeonStore> {
    const sql = neon(process.env.DATABASE_URL!);
    const store = new NeonStore(sql);
    await store.ensureSchema();
    return store;
  }

  private async ensureSchema(): Promise<void> {
    await this.sql`
      create table if not exists console_user (
        email text primary key,
        name text,
        role text not null default 'member',
        status text not null default 'active',
        created_at timestamptz not null default now(),
        last_login_at timestamptz
      )`;
    await this.sql`
      create table if not exists access_code (
        id text primary key,
        email text not null references console_user(email) on delete cascade,
        token_hash text not null,
        created_at timestamptz not null default now(),
        expires_at timestamptz not null,
        used_at timestamptz
      )`;
    await this.sql`create index if not exists access_code_hash_idx on access_code (token_hash)`;
  }

  private mapUser(r: Record<string, unknown>): ConsoleUser {
    return {
      email: r.email as string,
      name: (r.name as string) ?? undefined,
      role: r.role as Role,
      status: r.status as ConsoleUser["status"],
      createdAt: new Date(r.created_at as string).toISOString(),
      lastLoginAt: r.last_login_at ? new Date(r.last_login_at as string).toISOString() : null,
    };
  }

  async listUsers(): Promise<ConsoleUser[]> {
    const rows = await this.sql`select * from console_user order by email`;
    return rows.map((r) => this.mapUser(r));
  }
  async getUser(email: string): Promise<ConsoleUser | null> {
    const rows = await this.sql`select * from console_user where email = ${email.toLowerCase()}`;
    return rows[0] ? this.mapUser(rows[0]) : null;
  }
  async upsertUser({ email, name, role }: { email: string; name?: string; role: Role }): Promise<ConsoleUser> {
    const e = email.toLowerCase();
    const rows = await this.sql`
      insert into console_user (email, name, role, status)
      values (${e}, ${name ?? null}, ${role}, 'active')
      on conflict (email) do update set role = ${role}, name = coalesce(${name ?? null}, console_user.name), status = 'active'
      returning *`;
    return this.mapUser(rows[0]);
  }
  async setStatus(email: string, status: ConsoleUser["status"]): Promise<void> {
    await this.sql`update console_user set status = ${status} where email = ${email.toLowerCase()}`;
  }
  async deleteUser(email: string): Promise<void> {
    await this.sql`delete from console_user where email = ${email.toLowerCase()}`;
  }
  async touchLogin(email: string): Promise<void> {
    await this.sql`update console_user set last_login_at = now() where email = ${email.toLowerCase()}`;
  }

  async createCode(c: AccessCode): Promise<void> {
    await this.sql`
      insert into access_code (id, email, token_hash, created_at, expires_at, used_at)
      values (${c.id}, ${c.email.toLowerCase()}, ${c.tokenHash}, ${c.createdAt}, ${c.expiresAt}, ${c.usedAt ?? null})`;
  }
  async findValidCodeByHash(hash: string): Promise<AccessCode | null> {
    const rows = await this.sql`
      select * from access_code
      where token_hash = ${hash} and used_at is null and expires_at > now()
      limit 1`;
    const r = rows[0];
    if (!r) return null;
    return {
      id: r.id as string,
      email: r.email as string,
      tokenHash: r.token_hash as string,
      createdAt: new Date(r.created_at as string).toISOString(),
      expiresAt: new Date(r.expires_at as string).toISOString(),
      usedAt: r.used_at ? new Date(r.used_at as string).toISOString() : null,
    };
  }
  async markCodeUsed(id: string): Promise<void> {
    await this.sql`update access_code set used_at = now() where id = ${id}`;
  }
}
