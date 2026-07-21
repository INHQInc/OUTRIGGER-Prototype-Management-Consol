import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import type { ContentStore } from "./store";
import type { PageVersionMeta } from "../capture/types";
import type { SiteConfig } from "../sites";
import type { SiteRepoBinding } from "../git/types";
import type { PrototypeRecord, ArtifactVersion, PrototypeOverlay, OverlayBlock } from "../prototypes/types";
import type { Org, OrgMember } from "../orgs";
import type { Environment, EnvironmentKind } from "../environments";
import type { ExperimentationConfig } from "../experimentation/types";
import type { Promotion, PromotionStatus, PromotionVehicle } from "../promotions/types";
import type { AuditEvent } from "../audit/types";

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

  /**
   * Run one idempotent DDL statement, tolerating the Postgres catalog race.
   * `create table/index if not exists` checks the catalog and inserts the new
   * pg_type/pg_class row non-atomically, so two concurrent bootstraps can still
   * collide (23505 on pg_type_typname_nsp_index, or 42P07/42710 duplicate
   * object). All of those mean "it already exists" — exactly the end state we
   * want — so they're safe to swallow.
   */
  private async ddl(run: () => Promise<unknown>): Promise<void> {
    try {
      await run();
    } catch (e) {
      const code = (e as { code?: string })?.code;
      if (code === "23505" || code === "42P07" || code === "42710") return;
      throw e;
    }
  }

  private async ensureSchema(): Promise<void> {
    await this.ddl(() => this.sql`
      create table if not exists site (
        site_key text primary key,
        origin text not null,
        asset_hosts text not null,
        label text not null,
        created_at timestamptz not null default now()
      )`);
    await this.ddl(() => this.sql`alter table site add column if not exists mode text not null default 'clone'`);
    await this.ddl(() => this.sql`alter table site add column if not exists org_id text not null default ''`);
    await this.ddl(() => this.sql`
      create table if not exists org (
        id text primary key,
        name text not null,
        created_at timestamptz not null default now()
      )`);
    await this.ddl(() => this.sql`
      create table if not exists org_member (
        org_id text not null,
        email text not null,
        role text not null default 'member',
        primary key (org_id, email)
      )`);
    await this.ddl(() => this.sql`create index if not exists org_member_email_idx on org_member (email)`);
    await this.ddl(() => this.sql`
      create table if not exists environment (
        id text primary key,
        site_key text not null,
        label text not null,
        url text not null,
        kind text not null default 'production',
        created_at timestamptz not null default now()
      )`);
    await this.ddl(() => this.sql`create index if not exists environment_site_idx on environment (site_key)`);
    await this.ddl(() => this.sql`
      create table if not exists experimentation_config (
        org_id text primary key,
        provider text not null,
        config text not null,
        updated_at timestamptz not null default now()
      )`);
    await this.ddl(() => this.sql`
      create table if not exists page_version (
        site_key text not null,
        slug text not null,
        version text not null,
        html text not null,
        meta text not null,
        captured_at timestamptz not null default now(),
        primary key (site_key, slug, version)
      )`);
    await this.ddl(() => this.sql`create index if not exists page_version_site_slug_idx on page_version (site_key, slug)`);
    await this.ddl(() => this.sql`
      create table if not exists asset (
        site_key text not null,
        name text not null,
        content_type text not null,
        bytes_b64 text not null,
        primary key (site_key, name)
      )`);
    await this.ddl(() => this.sql`
      create table if not exists repo_binding (
        site_key text primary key,
        config text not null,
        updated_at timestamptz not null default now()
      )`);
    await this.ddl(() => this.sql`
      create table if not exists prototype (
        key text primary key,
        site_key text not null,
        data text not null,
        updated_at timestamptz not null default now()
      )`);
    await this.ddl(() => this.sql`create index if not exists prototype_site_idx on prototype (site_key)`);
    await this.ddl(() => this.sql`
      create table if not exists prototype_overlay (
        prototype_key text primary key,
        site_key text not null,
        css text not null default '',
        js text not null default '',
        blocks text not null default '[]',
        updated_at timestamptz not null default now()
      )`);
    await this.ddl(() => this.sql`
      create table if not exists artifact_version (
        id text primary key,
        prototype_key text not null,
        site_key text not null,
        version int not null,
        git_sha text not null,
        git_ref text,
        notes text,
        created_at timestamptz not null default now(),
        created_by text
      )`);
    await this.ddl(() => this.sql`create index if not exists artifact_version_proto_idx on artifact_version (prototype_key)`);
    await this.ddl(() => this.sql`
      create table if not exists promotion (
        id text primary key,
        prototype_key text not null,
        site_key text not null,
        version_id text not null,
        version_number int not null,
        environment_id text not null,
        environment_kind text not null,
        environment_label text not null,
        vehicle text not null,
        status text not null,
        experiment_id text,
        experiment_url text,
        detail text,
        promoted_by text,
        promoted_at timestamptz not null default now()
      )`);
    await this.ddl(() => this.sql`create index if not exists promotion_proto_idx on promotion (prototype_key)`);
    await this.ddl(() => this.sql`
      create table if not exists audit_event (
        id text primary key,
        org_id text not null,
        actor text not null,
        action text not null,
        target text not null,
        detail text,
        at timestamptz not null default now()
      )`);
    await this.ddl(() => this.sql`create index if not exists audit_event_org_idx on audit_event (org_id, at desc)`);
    await this.ddl(() => this.sql`
      create table if not exists content_meta (
        key text primary key,
        val text not null,
        updated_at timestamptz not null default now()
      )`);
  }

  async getFlag(key: string): Promise<string | null> {
    const rows = await this.sql`select val from content_meta where key = ${key}`;
    return rows[0] ? (rows[0].val as string) : null;
  }
  async setFlag(key: string, value: string): Promise<void> {
    await this.sql`
      insert into content_meta (key, val, updated_at) values (${key}, ${value}, now())
      on conflict (key) do update set val = excluded.val, updated_at = now()`;
  }

  async listPrototypes(siteKey?: string): Promise<PrototypeRecord[]> {
    const rows = siteKey
      ? await this.sql`select data from prototype where site_key = ${siteKey} order by updated_at desc`
      : await this.sql`select data from prototype order by updated_at desc`;
    return rows.map((r) => JSON.parse(r.data as string) as PrototypeRecord);
  }
  async getPrototype(key: string): Promise<PrototypeRecord | null> {
    const rows = await this.sql`select data from prototype where key = ${key}`;
    return rows[0] ? (JSON.parse(rows[0].data as string) as PrototypeRecord) : null;
  }
  async putPrototype(record: PrototypeRecord): Promise<void> {
    await this.sql`
      insert into prototype (key, site_key, data, updated_at)
      values (${record.key}, ${record.siteKey}, ${JSON.stringify(record)}, now())
      on conflict (key) do update set site_key = excluded.site_key, data = excluded.data, updated_at = now()`;
  }

  async getPrototypeOverlay(prototypeKey: string): Promise<PrototypeOverlay | null> {
    const rows = await this.sql`select * from prototype_overlay where prototype_key = ${prototypeKey}`;
    if (!rows[0]) return null;
    let blocks: OverlayBlock[] = [];
    try { blocks = JSON.parse(rows[0].blocks as string) as OverlayBlock[]; } catch { blocks = []; }
    return {
      prototypeKey: rows[0].prototype_key as string,
      siteKey: rows[0].site_key as string,
      css: rows[0].css as string,
      js: rows[0].js as string,
      blocks,
      updatedAt: new Date(rows[0].updated_at as string).toISOString(),
    };
  }
  async putPrototypeOverlay(o: PrototypeOverlay): Promise<void> {
    await this.sql`
      insert into prototype_overlay (prototype_key, site_key, css, js, blocks, updated_at)
      values (${o.prototypeKey}, ${o.siteKey}, ${o.css}, ${o.js}, ${JSON.stringify(o.blocks)}, ${o.updatedAt})
      on conflict (prototype_key) do update set site_key = excluded.site_key, css = excluded.css, js = excluded.js, blocks = excluded.blocks, updated_at = excluded.updated_at`;
  }

  async listArtifactVersions(prototypeKey: string): Promise<ArtifactVersion[]> {
    const rows = await this.sql`select * from artifact_version where prototype_key = ${prototypeKey} order by version desc`;
    return rows.map((r) => ({
      id: r.id as string,
      prototypeKey: r.prototype_key as string,
      siteKey: r.site_key as string,
      version: Number(r.version),
      gitSha: r.git_sha as string,
      gitRef: (r.git_ref as string) || undefined,
      notes: (r.notes as string) || undefined,
      createdAt: new Date(r.created_at as string).toISOString(),
      createdBy: (r.created_by as string) || undefined,
    }));
  }
  async addArtifactVersion(v: ArtifactVersion): Promise<void> {
    await this.sql`
      insert into artifact_version (id, prototype_key, site_key, version, git_sha, git_ref, notes, created_at, created_by)
      values (${v.id}, ${v.prototypeKey}, ${v.siteKey}, ${v.version}, ${v.gitSha}, ${v.gitRef ?? null}, ${v.notes ?? null}, ${v.createdAt}, ${v.createdBy ?? null})
      on conflict (id) do nothing`;
  }

  async listPromotions(prototypeKey: string): Promise<Promotion[]> {
    const rows = await this.sql`select * from promotion where prototype_key = ${prototypeKey} order by promoted_at desc`;
    return rows.map((r) => ({
      id: r.id as string,
      prototypeKey: r.prototype_key as string,
      siteKey: r.site_key as string,
      versionId: r.version_id as string,
      versionNumber: Number(r.version_number),
      environmentId: r.environment_id as string,
      environmentKind: r.environment_kind as EnvironmentKind,
      environmentLabel: r.environment_label as string,
      vehicle: r.vehicle as PromotionVehicle,
      status: r.status as PromotionStatus,
      experimentId: (r.experiment_id as string) || undefined,
      experimentUrl: (r.experiment_url as string) || undefined,
      detail: (r.detail as string) || undefined,
      promotedBy: (r.promoted_by as string) || undefined,
      promotedAt: new Date(r.promoted_at as string).toISOString(),
    }));
  }
  async addPromotion(p: Promotion): Promise<void> {
    await this.sql`
      insert into promotion (id, prototype_key, site_key, version_id, version_number, environment_id, environment_kind, environment_label, vehicle, status, experiment_id, experiment_url, detail, promoted_by, promoted_at)
      values (${p.id}, ${p.prototypeKey}, ${p.siteKey}, ${p.versionId}, ${p.versionNumber}, ${p.environmentId}, ${p.environmentKind}, ${p.environmentLabel}, ${p.vehicle}, ${p.status}, ${p.experimentId ?? null}, ${p.experimentUrl ?? null}, ${p.detail ?? null}, ${p.promotedBy ?? null}, ${p.promotedAt})
      on conflict (id) do nothing`;
  }
  async updatePromotionStatus(id: string, status: PromotionStatus): Promise<void> {
    await this.sql`update promotion set status = ${status} where id = ${id}`;
  }

  async listAuditEvents(orgId: string, limit = 100): Promise<AuditEvent[]> {
    const rows = await this.sql`select * from audit_event where org_id = ${orgId} order by at desc limit ${limit}`;
    return rows.map((r) => ({
      id: r.id as string,
      orgId: r.org_id as string,
      actor: r.actor as string,
      action: r.action as string,
      target: r.target as string,
      detail: (r.detail as string) || undefined,
      at: new Date(r.at as string).toISOString(),
    }));
  }
  async addAuditEvent(e: AuditEvent): Promise<void> {
    await this.sql`
      insert into audit_event (id, org_id, actor, action, target, detail, at)
      values (${e.id}, ${e.orgId}, ${e.actor}, ${e.action}, ${e.target}, ${e.detail ?? null}, ${e.at})
      on conflict (id) do nothing`;
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
      mode: ((r.mode as string) || "clone") as SiteConfig["mode"],
      orgId: (r.org_id as string) || "",
    }));
  }
  async addDynamicSite(site: SiteConfig): Promise<void> {
    await this.sql`
      insert into site (site_key, origin, asset_hosts, label, mode, org_id)
      values (${site.siteKey}, ${site.origin}, ${JSON.stringify(site.assetHosts)}, ${site.label}, ${site.mode}, ${site.orgId})
      on conflict (site_key) do nothing`;
  }
  async updateDynamicSite(siteKey: string, patch: Partial<SiteConfig>): Promise<void> {
    if (patch.mode !== undefined) await this.sql`update site set mode = ${patch.mode} where site_key = ${siteKey}`;
    if (patch.label !== undefined) await this.sql`update site set label = ${patch.label} where site_key = ${siteKey}`;
    if (patch.origin !== undefined) await this.sql`update site set origin = ${patch.origin} where site_key = ${siteKey}`;
    if (patch.assetHosts !== undefined) await this.sql`update site set asset_hosts = ${JSON.stringify(patch.assetHosts)} where site_key = ${siteKey}`;
    if (patch.orgId !== undefined) await this.sql`update site set org_id = ${patch.orgId} where site_key = ${siteKey}`;
  }
  async listOrgs(): Promise<Org[]> {
    const rows = await this.sql`select * from org order by created_at`;
    return rows.map((r) => ({ id: r.id as string, name: r.name as string, createdAt: new Date(r.created_at as string).toISOString() }));
  }
  async getOrg(id: string): Promise<Org | null> {
    const rows = await this.sql`select * from org where id = ${id}`;
    return rows[0] ? { id: rows[0].id as string, name: rows[0].name as string, createdAt: new Date(rows[0].created_at as string).toISOString() } : null;
  }
  async addOrg(org: Org): Promise<void> {
    await this.sql`insert into org (id, name) values (${org.id}, ${org.name}) on conflict (id) do nothing`;
  }
  async deleteOrg(id: string): Promise<void> {
    await this.sql`delete from org_member where org_id = ${id}`;
    await this.sql`delete from experimentation_config where org_id = ${id}`;
    await this.sql`delete from audit_event where org_id = ${id}`;
    await this.sql`delete from org where id = ${id}`;
  }
  async listMembers(orgId: string): Promise<OrgMember[]> {
    const rows = await this.sql`select * from org_member where org_id = ${orgId} order by email`;
    return rows.map((r) => ({ orgId: r.org_id as string, email: r.email as string, role: r.role as OrgMember["role"] }));
  }
  async putMember(m: OrgMember): Promise<void> {
    await this.sql`
      insert into org_member (org_id, email, role) values (${m.orgId}, ${m.email}, ${m.role})
      on conflict (org_id, email) do update set role = excluded.role`;
  }
  async removeMember(orgId: string, email: string): Promise<void> {
    await this.sql`delete from org_member where org_id = ${orgId} and email = ${email}`;
  }
  async orgIdsForMember(email: string): Promise<string[]> {
    const rows = await this.sql`select org_id from org_member where email = ${email}`;
    return rows.map((r) => r.org_id as string);
  }

  async listEnvironments(siteKey: string): Promise<Environment[]> {
    const rows = await this.sql`select * from environment where site_key = ${siteKey} order by created_at`;
    return rows.map((r) => ({
      id: r.id as string,
      siteKey: r.site_key as string,
      label: r.label as string,
      url: r.url as string,
      kind: r.kind as EnvironmentKind,
      createdAt: new Date(r.created_at as string).toISOString(),
    }));
  }
  async addEnvironment(env: Environment): Promise<void> {
    await this.sql`
      insert into environment (id, site_key, label, url, kind, created_at)
      values (${env.id}, ${env.siteKey}, ${env.label}, ${env.url}, ${env.kind}, ${env.createdAt})
      on conflict (id) do nothing`;
  }
  async updateEnvironment(id: string, patch: Partial<Environment>): Promise<void> {
    if (patch.label !== undefined) await this.sql`update environment set label = ${patch.label} where id = ${id}`;
    if (patch.url !== undefined) await this.sql`update environment set url = ${patch.url} where id = ${id}`;
    if (patch.kind !== undefined) await this.sql`update environment set kind = ${patch.kind} where id = ${id}`;
  }
  async deleteEnvironment(id: string): Promise<void> {
    await this.sql`delete from environment where id = ${id}`;
  }

  async getExperimentationConfig(orgId: string): Promise<ExperimentationConfig | null> {
    const rows = await this.sql`select config from experimentation_config where org_id = ${orgId}`;
    if (!rows[0]) return null;
    try { return JSON.parse(rows[0].config as string) as ExperimentationConfig; } catch { return null; }
  }
  async setExperimentationConfig(config: ExperimentationConfig): Promise<void> {
    await this.sql`
      insert into experimentation_config (org_id, provider, config, updated_at)
      values (${config.orgId}, ${config.provider}, ${JSON.stringify(config)}, now())
      on conflict (org_id) do update set provider = excluded.provider, config = excluded.config, updated_at = now()`;
  }
  async deleteExperimentationConfig(orgId: string): Promise<void> {
    await this.sql`delete from experimentation_config where org_id = ${orgId}`;
  }
  async deleteSite(siteKey: string): Promise<void> {
    await this.sql`delete from page_version where site_key = ${siteKey}`;
    await this.sql`delete from asset where site_key = ${siteKey}`;
    await this.sql`delete from artifact_version where site_key = ${siteKey}`;
    await this.sql`delete from promotion where site_key = ${siteKey}`;
    await this.sql`delete from prototype_overlay where site_key = ${siteKey}`;
    await this.sql`delete from prototype where site_key = ${siteKey}`;
    await this.sql`delete from repo_binding where site_key = ${siteKey}`;
    await this.sql`delete from environment where site_key = ${siteKey}`;
    await this.sql`delete from site where site_key = ${siteKey}`;
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
