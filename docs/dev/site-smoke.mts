/**
 * SITES — Customer → Site → Environment (src/lib/site/).
 *
 *     env -u DATABASE_URL npx tsx docs/dev/site-smoke.mts
 *
 * What this holds, and why each one exists:
 *
 *  1. A brand-new customer has NO site (the sidebar offers "Add a site"); a
 *     customer that already had environments, prototypes or a brand profile gets
 *     exactly ONE starting site on first read, and everything moves into it.
 *     One, not one per domain: Outrigger's two sites share outrigger.com.
 *  2. The starting site is created once even when requests race.
 *  3. Site ids are `${orgId}--${slug}`, never "*" (the brand profile's
 *     org-default sentinel), and a customer cannot read another's site.
 *  4. The environment id collision is fixed: "acme" + "EU Prod" and "acme-eu" +
 *     "Prod" were both "acme-eu-prod", and the second was silently dropped
 *     while the API said 201.
 *  5. A prototype's site comes from its record; legacy records are moved into
 *     the starting site on first read.
 *  6. The Neon store lists environment columns BY HAND, so a new field
 *     round-trips here (filesystem) and is silently dropped in production.
 *     This suite runs on the filesystem, so it asserts the Neon source instead.
 *
 * Writes throwaway rows in its own sandbox. Refuses to run against a database.
 */
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

if (process.env.DATABASE_URL) {
  console.error("\nRefusing to run: DATABASE_URL is set. This suite writes throwaway rows.\n" +
    "Run it as:  env -u DATABASE_URL npx tsx docs/dev/site-smoke.mts\n");
  process.exit(2);
}
const SANDBOX = mkdtempSync(join(tmpdir(), "prism-site-"));
process.chdir(SANDBOX);
process.on("exit", () => rmSync(SANDBOX, { recursive: true, force: true }));

const { getContentStore } = await import("../../src/lib/content/store");
const { addOrgEnvironment, listOrgEnvironments } = await import("../../src/lib/environments");
const { listSites, createSite, updateSite, getSiteById, defaultSiteId, resolvePrototypeSite, startingSiteId, normalizeSiteUrl } =
  await import("../../src/lib/site/sites");
const { EMPTY_OBSERVED } = await import("../../src/lib/brand/types");
type PrototypeRecord = import("../../src/lib/prototypes/types").PrototypeRecord;
type SiteProfile = import("../../src/lib/brand/types").SiteProfile;

let failures = 0;
const ok = (label: string, cond: boolean, detail?: string) => {
  if (cond) return console.log(`  ok   ${label}`);
  failures++;
  console.error(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
};
const throws = async (fn: () => Promise<unknown>): Promise<string | null> => {
  try { await fn(); return null; } catch (e) { return (e as Error).message; }
};

const store = await getContentStore();
const T0 = "2026-01-01T00:00:00.000Z";
async function org(id: string, name = id) { await store.addOrg({ id, name, createdAt: T0 }); }
function proto(key: string, orgId: string, extra: Partial<PrototypeRecord> = {}): PrototypeRecord {
  return {
    key, name: key, siteKey: "", orgId, status: "draft",
    brief: { change: "something", doneLooksLike: "it works" },
    hypothesis: { change: "", audience: "", outcome: "", rationale: "" },
    metrics: { primary: "clicks", guardrails: [] },
    targets: [], createdAt: T0, updatedAt: T0, ...extra,
  } as unknown as PrototypeRecord;
}

console.log("\n1. a new customer has no site; an existing one gets exactly one");
{
  await org("fresh");
  ok("a brand-new customer has no sites", (await listSites("fresh")).length === 0);
  ok("…and no default site", (await defaultSiteId("fresh")) === null);
  ok("an empty org id lists nothing (never every unassigned row)", (await listSites("")).length === 0);

  await org("outrigger", "Outrigger Hotels & Resorts");
  await addOrgEnvironment("outrigger", { label: "Prep", url: "https://prep.outrigger.com", kind: "staging" });
  await addOrgEnvironment("outrigger", { label: "Production", url: "https://www.outrigger.com", kind: "production" });
  await store.putPrototype(proto("spa-test", "outrigger"));
  await store.putPrototype(proto("rooms-test", "outrigger"));

  const sites = await listSites("outrigger");
  ok("an existing customer gets exactly one starting site", sites.length === 1, JSON.stringify(sites));
  const s = sites[0];
  ok("its id is fixed per customer", s?.id === startingSiteId("outrigger") && s?.id === "outrigger--site", s?.id);
  ok("named after the production host, www. dropped", s?.name === "outrigger.com", s?.name);
  ok("its URL is the production origin", s?.url === "https://www.outrigger.com", s?.url);
  ok("it starts ready (it is what the customer already had)", s?.status === "ready");
  const envs = await listOrgEnvironments("outrigger");
  ok("every environment moved into it", envs.length === 2 && envs.every((e) => e.siteId === s?.id), JSON.stringify(envs.map((e) => e.siteId)));
  const protos = (await store.listPrototypes()).filter((p) => p.orgId === "outrigger");
  ok("every prototype moved into it", protos.length === 2 && protos.every((p) => p.siteId === s?.id));
  ok("a second read does not make another", (await listSites("outrigger")).length === 1);
  ok("the default site is the starting site", (await defaultSiteId("outrigger")) === s?.id);

  await org("described", "Described Co");
  await store.addSiteProfile({
    id: "described-*-r1", orgId: "described", siteId: "*", rev: 1, status: "approved",
    taxonomy: {}, sections: {}, observed: EMPTY_OBSERVED,
    sources: { urls: [], derivedAt: T0, crawler: "stated by test" }, corrections: [], createdAt: T0,
  } as SiteProfile);
  const described = await listSites("described");
  ok("a customer with only a brand profile also gets its starting site", described.length === 1);
  ok("…named after the customer when there is no environment", described[0]?.name === "Described Co", described[0]?.name);
}

console.log("\n2. the starting site is created once even when requests race");
{
  await org("racer");
  await addOrgEnvironment("racer", { url: "https://www.racer.example", kind: "production" });
  await Promise.all([listSites("racer"), listSites("racer"), listSites("racer"), defaultSiteId("racer")]);
  ok("four concurrent first reads leave one site", (await store.listOrgSites("racer")).length === 1);
}

console.log("\n3. adding a site: ids, validation, the tenant boundary");
{
  const hvc = await createSite("outrigger", { name: "Hawaii Vacation Condos", url: "hawaiivacationcondos.outrigger.com", industry: "hospitality" });
  ok("a bare host is accepted and stored as an origin", hvc.url === "https://hawaiivacationcondos.outrigger.com", hvc.url);
  ok("the id is `${orgId}--${slug}`", hvc.id === "outrigger--hawaii-vacation-condos", hvc.id);
  ok("a new site starts in setup", hvc.status === "setup");
  ok("the industry is kept", hvc.industry === "hospitality");
  ok("the same URL twice is refused, by name",
    ((await throws(() => createSite("outrigger", { name: "Again", url: "https://hawaiivacationcondos.outrigger.com/" }))) ?? "").includes("Hawaii Vacation Condos"));
  const twin = await createSite("outrigger", { name: "Hawaii Vacation Condos", url: "https://condos-two.example.com" });
  ok("the same name twice gets a numbered id", twin.id === "outrigger--hawaii-vacation-condos-2", twin.id);
  ok("a nameless site is refused", (await throws(() => createSite("outrigger", { name: " ", url: "https://x.example.com" }))) !== null);
  ok("a non-address is refused", (await throws(() => createSite("outrigger", { name: "Nope", url: "not a url" }))) !== null);
  ok("an invalid industry is dropped, not stored",
    (await createSite("outrigger", { name: "Odd", url: "https://odd.example.com", industry: "casino" as never })).industry === undefined);
  ok("a relative local folder is refused",
    (await throws(() => createSite("outrigger", { name: "Rel", url: "https://rel.example.com", source: { kind: "local-folder", path: "Projects/site" } }))) !== null);
  ok("another customer cannot read it", (await getSiteById("racer", hvc.id)) === null);
  ok("its own customer can", (await getSiteById("outrigger", hvc.id))?.id === hvc.id);
  const every = [...(await store.listOrgSites("outrigger")), ...(await store.listOrgSites("racer")), ...(await store.listOrgSites("described"))];
  ok("no site id is ever the org-default sentinel \"*\"", every.every((x) => x.id !== "*" && x.id.includes("--")));
  ok("normalizeSiteUrl keeps an explicit http origin", normalizeSiteUrl("http://localhost.test:3000/x") === "http://localhost.test:3000");
}

console.log("\n4. updating a site");
{
  const hvc = (await getSiteById("outrigger", "outrigger--hawaii-vacation-condos"))!;
  const renamed = await updateSite("outrigger", hvc.id, { name: "HVC", source: { kind: "local-folder", path: "~/Projects/Outrigger_Website" }, status: "ready" });
  ok("rename, source and status are saved", renamed.name === "HVC" && renamed.status === "ready" && renamed.source?.kind === "local-folder");
  ok("the id and customer never change", renamed.id === hvc.id && renamed.orgId === "outrigger");
  ok("moving onto another site's URL is refused",
    (await throws(() => updateSite("outrigger", hvc.id, { url: "https://www.outrigger.com" }))) !== null);
  const cleared = await updateSite("outrigger", hvc.id, { source: null });
  ok("the source can be cleared", cleared.source === undefined);
  ok("another customer cannot update it", (await throws(() => updateSite("racer", hvc.id, { name: "x" }))) === "Unknown site.");
}

console.log("\n5. the environment id collision");
{
  await org("acme");
  await org("acme-eu");
  const a = await addOrgEnvironment("acme", { label: "EU Prod", url: "https://eu.acme.example", kind: "production" });
  const b = await addOrgEnvironment("acme-eu", { label: "Prod", url: "https://www.acme-eu.example", kind: "production" });
  ok("the two ids differ", a.id !== b.id, `${a.id} / ${b.id}`);
  ok("both were saved and are listed under their own customer",
    (await listOrgEnvironments("acme")).some((e) => e.id === a.id) && (await listOrgEnvironments("acme-eu")).some((e) => e.id === b.id));
  const c = await addOrgEnvironment("acme", { label: "EU Prod", url: "https://eu2.acme.example", kind: "production" });
  ok("the same label twice in one customer is numbered", c.id === `${a.id}-2`, c.id);
  const sited = await addOrgEnvironment("acme", { label: "Staging", url: "https://staging.acme.example", kind: "staging", siteId: "acme--site" });
  ok("an environment keeps the site it was added to",
    (await listOrgEnvironments("acme")).find((e) => e.id === sited.id)?.siteId === "acme--site");
}

console.log("\n6. a prototype's site comes from its record");
{
  await org("legacy");
  await addOrgEnvironment("legacy", { url: "https://www.legacy.example", kind: "production" });
  const old = proto("old-test", "legacy");
  await store.putPrototype(old);
  const siteId = await resolvePrototypeSite(old);
  ok("a record made before sites resolves to its customer's starting site", siteId === "legacy--site", siteId);
  ok("…and the answer is written back to the record", (await store.getPrototype("old-test"))?.siteId === "legacy--site");
  ok("a record that already has a site keeps it", (await resolvePrototypeSite(proto("x", "legacy", { siteId: "legacy--other" }))) === "legacy--other");
  ok("a record with no customer has no site", (await resolvePrototypeSite(proto("orphan", ""))) === "");
}

console.log("\n7. deleting a customer deletes its sites");
{
  await store.deleteOrg("racer");
  ok("no site of a deleted customer remains", (await store.listOrgSites("racer")).length === 0);
  ok("another customer's sites are untouched", (await store.listOrgSites("outrigger")).length >= 3);
}

console.log("\n8. the hosted store carries every site field");
{
  const neon = readFileSync(new URL("../../src/lib/content/store-neon.ts", import.meta.url), "utf8");
  const mapEnv = neon.slice(neon.indexOf("private mapEnv"), neon.indexOf("async listEnvironmentsByOrg"));
  const addEnv = neon.slice(neon.indexOf("async addEnvironment"), neon.indexOf("async updateEnvironment"));
  const updEnv = neon.slice(neon.indexOf("async updateEnvironment"), neon.indexOf("async deleteEnvironment"));
  ok("mapEnv reads site_id", /siteId:\s*\(r\.site_id/.test(mapEnv));
  ok("addEnvironment writes site_id", addEnv.includes("site_id") && addEnv.includes("env.siteId"));
  ok("updateEnvironment writes site_id", /patch\.siteId[\s\S]*site_id/.test(updEnv));
  ok("the environment site_id column is added through ddl()",
    /this\.ddl\(\(\) => this\.sql`alter table environment add column if not exists site_id/.test(neon));
  ok("org_site is created through ddl()", /this\.ddl\(\(\) => this\.sql`\s*create table if not exists org_site/.test(neon));
  const delOrg = neon.slice(neon.indexOf("async deleteOrg"), neon.indexOf("async listMembers"));
  ok("deleting a customer deletes its org_site rows", delOrg.includes("delete from org_site where org_id"));
}

console.log(`\n${failures === 0 ? "All site checks passed." : `${failures} FAILED.`}\n`);
process.exit(failures === 0 ? 0 : 1);
