import { readdir, readFile, writeFile, mkdir, stat, rm } from "node:fs/promises";
import { join } from "node:path";
import type { ContentStore } from "./store";
import type { PageVersionMeta } from "../capture/types";
import type { SiteConfig } from "../sites";
import type { SiteRepoBinding } from "../git/types";
import type { PrototypeRecord } from "../prototypes/types";
import type { Org, OrgMember } from "../orgs";

const TYPE_BY_EXT: Record<string, string> = {
  css: "text/css", js: "text/javascript", jpg: "image/jpeg", jpeg: "image/jpeg",
  png: "image/png", gif: "image/gif", webp: "image/webp", avif: "image/avif",
  svg: "image/svg+xml", ico: "image/x-icon", woff: "font/woff", woff2: "font/woff2",
  ttf: "font/ttf", mp4: "video/mp4", webm: "video/webm", json: "application/json",
};

/** Local filesystem backend — the snapshots/ tree. Full asset mirror. */
export class FsContentStore implements ContentStore {
  readonly curlAvailable = true;

  private root(): string { return join(process.cwd(), "snapshots"); }
  private sitesFile(): string { return join(this.root(), "_sites.json"); }
  private repoFile(): string { return join(this.root(), "_repo-bindings.json"); }
  private protoFile(): string { return join(this.root(), "_prototypes.json"); }
  private metaFile(): string { return join(this.root(), "_meta.json"); }
  private orgsFile(): string { return join(this.root(), "_orgs.json"); }
  private membersFile(): string { return join(this.root(), "_members.json"); }

  private async readJson<T>(file: string, fallback: T): Promise<T> {
    try { return JSON.parse(await readFile(file, "utf8")); } catch { return fallback; }
  }
  private async writeJson(file: string, data: unknown): Promise<void> {
    await mkdir(this.root(), { recursive: true });
    await writeFile(file, JSON.stringify(data, null, 2) + "\n", "utf8");
  }

  async listOrgs(): Promise<Org[]> {
    const orgs = await this.readJson<Org[]>(this.orgsFile(), []);
    return orgs.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
  async getOrg(id: string): Promise<Org | null> {
    return (await this.readJson<Org[]>(this.orgsFile(), [])).find((o) => o.id === id) ?? null;
  }
  async addOrg(org: Org): Promise<void> {
    const orgs = await this.readJson<Org[]>(this.orgsFile(), []);
    orgs.push(org);
    await this.writeJson(this.orgsFile(), orgs);
  }
  async deleteOrg(id: string): Promise<void> {
    const orgs = (await this.readJson<Org[]>(this.orgsFile(), [])).filter((o) => o.id !== id);
    await this.writeJson(this.orgsFile(), orgs);
    const members = (await this.readJson<OrgMember[]>(this.membersFile(), [])).filter((m) => m.orgId !== id);
    await this.writeJson(this.membersFile(), members);
  }

  async listMembers(orgId: string): Promise<OrgMember[]> {
    return (await this.readJson<OrgMember[]>(this.membersFile(), [])).filter((m) => m.orgId === orgId);
  }
  async putMember(m: OrgMember): Promise<void> {
    const members = (await this.readJson<OrgMember[]>(this.membersFile(), [])).filter((x) => !(x.orgId === m.orgId && x.email === m.email));
    members.push(m);
    await this.writeJson(this.membersFile(), members);
  }
  async removeMember(orgId: string, email: string): Promise<void> {
    const members = (await this.readJson<OrgMember[]>(this.membersFile(), [])).filter((m) => !(m.orgId === orgId && m.email === email));
    await this.writeJson(this.membersFile(), members);
  }
  async orgIdsForMember(email: string): Promise<string[]> {
    return (await this.readJson<OrgMember[]>(this.membersFile(), [])).filter((m) => m.email === email).map((m) => m.orgId);
  }

  async getFlag(key: string): Promise<string | null> {
    try { return (JSON.parse(await readFile(this.metaFile(), "utf8")) as Record<string, string>)[key] ?? null; } catch { return null; }
  }
  async setFlag(key: string, value: string): Promise<void> {
    let m: Record<string, string> = {};
    try { m = JSON.parse(await readFile(this.metaFile(), "utf8")); } catch { /* new */ }
    m[key] = value;
    await mkdir(this.root(), { recursive: true });
    await writeFile(this.metaFile(), JSON.stringify(m, null, 2) + "\n", "utf8");
  }
  private pagesDir(siteKey: string): string { return join(this.root(), siteKey, "pages"); }
  private assetsDir(siteKey: string): string { return join(this.root(), siteKey, "assets"); }

  private async listDirs(p: string): Promise<string[]> {
    try {
      const entries = await readdir(p, { withFileTypes: true });
      return entries.filter((e) => e.isDirectory()).map((e) => e.name);
    } catch { return []; }
  }

  async listDynamicSites(): Promise<SiteConfig[]> {
    try {
      const arr = JSON.parse(await readFile(this.sitesFile(), "utf8"));
      return Array.isArray(arr) ? (arr as SiteConfig[]) : [];
    } catch { return []; }
  }
  async addDynamicSite(site: SiteConfig): Promise<void> {
    const sites = await this.listDynamicSites();
    sites.push(site);
    await mkdir(this.root(), { recursive: true });
    await writeFile(this.sitesFile(), JSON.stringify(sites, null, 2) + "\n", "utf8");
  }
  async updateDynamicSite(siteKey: string, patch: Partial<SiteConfig>): Promise<void> {
    const sites = await this.listDynamicSites();
    const i = sites.findIndex((s) => s.siteKey === siteKey);
    if (i === -1) return;
    sites[i] = { ...sites[i], ...patch };
    await mkdir(this.root(), { recursive: true });
    await writeFile(this.sitesFile(), JSON.stringify(sites, null, 2) + "\n", "utf8");
  }
  async deleteSite(siteKey: string): Promise<void> {
    // site record
    const sites = (await this.listDynamicSites()).filter((s) => s.siteKey !== siteKey);
    await mkdir(this.root(), { recursive: true });
    await writeFile(this.sitesFile(), JSON.stringify(sites, null, 2) + "\n", "utf8");
    // repo binding
    try {
      const map = JSON.parse(await readFile(this.repoFile(), "utf8"));
      delete map[siteKey];
      await writeFile(this.repoFile(), JSON.stringify(map, null, 2) + "\n", "utf8");
    } catch { /* none */ }
    // prototypes
    const protos = await this.readProtos();
    for (const k of Object.keys(protos)) if (protos[k].siteKey === siteKey) delete protos[k];
    await writeFile(this.protoFile(), JSON.stringify(protos, null, 2) + "\n", "utf8");
    // pages + assets (whole site dir)
    await rm(join(this.root(), siteKey), { recursive: true, force: true });
  }

  async getRepoBinding(siteKey: string): Promise<SiteRepoBinding | null> {
    try {
      const map = JSON.parse(await readFile(this.repoFile(), "utf8")) as Record<string, SiteRepoBinding>;
      return map[siteKey] ?? null;
    } catch { return null; }
  }
  async setRepoBinding(siteKey: string, binding: SiteRepoBinding): Promise<void> {
    let map: Record<string, SiteRepoBinding> = {};
    try { map = JSON.parse(await readFile(this.repoFile(), "utf8")); } catch { /* new */ }
    map[siteKey] = binding;
    await mkdir(this.root(), { recursive: true });
    await writeFile(this.repoFile(), JSON.stringify(map, null, 2) + "\n", "utf8");
  }

  private async readProtos(): Promise<Record<string, PrototypeRecord>> {
    try { return JSON.parse(await readFile(this.protoFile(), "utf8")); } catch { return {}; }
  }
  async listPrototypes(siteKey?: string): Promise<PrototypeRecord[]> {
    const all = Object.values(await this.readProtos());
    const rows = siteKey ? all.filter((p) => p.siteKey === siteKey) : all;
    return rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  async getPrototype(key: string): Promise<PrototypeRecord | null> {
    return (await this.readProtos())[key] ?? null;
  }
  async putPrototype(record: PrototypeRecord): Promise<void> {
    const map = await this.readProtos();
    map[record.key] = record;
    await mkdir(this.root(), { recursive: true });
    await writeFile(this.protoFile(), JSON.stringify(map, null, 2) + "\n", "utf8");
  }

  async listSlugs(siteKey: string): Promise<string[]> {
    return this.listDirs(this.pagesDir(siteKey));
  }
  async listVersions(siteKey: string, slug: string): Promise<string[]> {
    return (await this.listDirs(join(this.pagesDir(siteKey), slug))).sort();
  }
  async getMeta(siteKey: string, slug: string, version: string): Promise<PageVersionMeta | null> {
    try {
      const raw = await readFile(join(this.pagesDir(siteKey), slug, version, "meta.json"), "utf8");
      return JSON.parse(raw) as PageVersionMeta;
    } catch { return null; }
  }
  async getHtml(siteKey: string, slug: string, version: string): Promise<string | null> {
    try {
      return await readFile(join(this.pagesDir(siteKey), slug, version, "index.html"), "utf8");
    } catch { return null; }
  }
  async putPageVersion({ siteKey, slug, version, html, meta }: { siteKey: string; slug: string; version: string; html: string; meta: PageVersionMeta }): Promise<void> {
    const dir = join(this.pagesDir(siteKey), slug, version);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "index.html"), html, "utf8");
    await writeFile(join(dir, "meta.json"), JSON.stringify(meta, null, 2), "utf8");
  }

  async hasAsset(siteKey: string, name: string): Promise<boolean> {
    try { await stat(join(this.assetsDir(siteKey), name)); return true; } catch { return false; }
  }
  async putAsset(siteKey: string, name: string, bytes: Buffer): Promise<void> {
    await mkdir(this.assetsDir(siteKey), { recursive: true });
    await writeFile(join(this.assetsDir(siteKey), name), bytes);
  }
  async getAsset(siteKey: string, name: string): Promise<{ bytes: Buffer; contentType: string } | null> {
    try {
      const bytes = await readFile(join(this.assetsDir(siteKey), name));
      const ext = name.split(".").pop() ?? "";
      return { bytes, contentType: TYPE_BY_EXT[ext] ?? "application/octet-stream" };
    } catch { return null; }
  }
}
