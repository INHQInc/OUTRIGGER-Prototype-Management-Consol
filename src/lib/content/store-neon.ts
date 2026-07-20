import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import type { ContentStore } from "./store";
import type { PageVersionMeta } from "../capture/types";
import type { SiteConfig } from "../sites";
import type { SiteRepoBinding } from "../git/types";

/**
 * Neon-backed content store for hosted deployments. Tables auto-created on
 * first use (same pattern as the auth store). Serverless has no curl
 * (curlAvailable = false), so capture tries Node fetch per asset and stores
 * what it can as base64 text (reliable over the Neon HTTP driver); assets it
 * can't fetch (WAF-blocked) are left at their origin CDN by the caller.
 */
export class NeonContentStore implements ContentStore {
  readonly curlAvailable = false;

  private constructor(private sql: NeonQueryFunction<false, false>) {}

  static async create(): Promise<NeonContentStore> {
    const sql = neon(process.env.DATABASE_URL!);
    const store = new NeonContentStore(sql);
    await store.ensureSchema();
    return store;
  }

  private async ensureSchema(): Promise<void> {
    await this.sql`
      create table if not exists site (
        site_key text primary key,
        origin text not null,
        asset_hosts text not null,
        label text not null,
        created_at timestamptz not null default now()
      )`;
    await this.sql`
      create table if not exists page_version (
        site_key text not null,
        slug text not null,
        version text not null,
        html text not null,
        meta text not null,
        captured_at timestamptz not null default now(),
        primary key (site_key, slug, version)
      )`;
    await this.sql`create index if not exists page_version_site_slug_idx on page_version (site_key, slug)`;
    await this.sql`
      create table if not exists asset (
        site_key text not null,
        name text not null,
        content_type text not null,
        bytes_b64 text not null,
        primary key (site_key, name)
      )`;
    await this.sql`
      create table if not exists repo_binding (
        site_key text primary key,
        config text not null,
        updated_at timestamptz not null default now()
      )`;
  }

  async getRepoBinding(siteKey: string): Promise<SiteRepoBinding | null> {
    const rows = await this.sql`select config from repo_binding where site_key = ${siteKey}`;
    if (!rows[0]) return null;
    try { return JSON.parse(rows[0].config as string) as SiteRepoBinding; } catch { return null; }
  }
  async setRepoBinding(siteKey: string, binding: SiteRepoBinding): Promise<void> {
    await this.sql`
      insert into repo_binding (site_key, config, updated_at)
      values (${siteKey}, ${JSON.stringify(binding)}, now())
      on conflict (site_key) do update set config = excluded.config, updated_at = now()`;
  }

  async listDynamicSites(): Promise<SiteConfig[]> {
    const rows = await this.sql`select * from site order by created_at`;
    return rows.map((r) => ({
      siteKey: r.site_key as string,
      origin: r.origin as string,
      assetHosts: JSON.parse((r.asset_hosts as string) || "[]"),
      label: r.label as string,
    }));
  }
  async addDynamicSite(site: SiteConfig): Promise<void> {
    await this.sql`
      insert into site (site_key, origin, asset_hosts, label)
      values (${site.siteKey}, ${site.origin}, ${JSON.stringify(site.assetHosts)}, ${site.label})
      on conflict (site_key) do nothing`;
  }

  async listSlugs(siteKey: string): Promise<string[]> {
    const rows = await this.sql`select distinct slug from page_version where site_key = ${siteKey}`;
    return rows.map((r) => r.slug as string);
  }
  async listVersions(siteKey: string, slug: string): Promise<string[]> {
    const rows = await this.sql`select version from page_version where site_key = ${siteKey} and slug = ${slug} order by version asc`;
    return rows.map((r) => r.version as string);
  }
  async getMeta(siteKey: string, slug: string, version: string): Promise<PageVersionMeta | null> {
    const rows = await this.sql`select meta from page_version where site_key = ${siteKey} and slug = ${slug} and version = ${version}`;
    if (!rows[0]) return null;
    try { return JSON.parse(rows[0].meta as string) as PageVersionMeta; } catch { return null; }
  }
  async getHtml(siteKey: string, slug: string, version: string): Promise<string | null> {
    const rows = await this.sql`select html from page_version where site_key = ${siteKey} and slug = ${slug} and version = ${version}`;
    return rows[0] ? (rows[0].html as string) : null;
  }
  async putPageVersion({ siteKey, slug, version, html, meta }: { siteKey: string; slug: string; version: string; html: string; meta: PageVersionMeta }): Promise<void> {
    await this.sql`
      insert into page_version (site_key, slug, version, html, meta)
      values (${siteKey}, ${slug}, ${version}, ${html}, ${JSON.stringify(meta)})
      on conflict (site_key, slug, version) do update set html = excluded.html, meta = excluded.meta`;
  }

  async hasAsset(siteKey: string, name: string): Promise<boolean> {
    const rows = await this.sql`select 1 from asset where site_key = ${siteKey} and name = ${name} limit 1`;
    return rows.length > 0;
  }
  async putAsset(siteKey: string, name: string, bytes: Buffer, contentType: string): Promise<void> {
    await this.sql`
      insert into asset (site_key, name, content_type, bytes_b64)
      values (${siteKey}, ${name}, ${contentType}, ${bytes.toString("base64")})
      on conflict (site_key, name) do nothing`;
  }
  async getAsset(siteKey: string, name: string): Promise<{ bytes: Buffer; contentType: string } | null> {
    const rows = await this.sql`select content_type, bytes_b64 from asset where site_key = ${siteKey} and name = ${name}`;
    if (!rows[0]) return null;
    return { bytes: Buffer.from(rows[0].bytes_b64 as string, "base64"), contentType: rows[0].content_type as string };
  }
}
