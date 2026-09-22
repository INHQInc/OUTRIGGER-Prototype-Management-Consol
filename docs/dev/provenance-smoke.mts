/**
 * THE WORDS A READOUT IS WRITTEN IN ARE PART OF WHAT MAKES IT STALE.
 *
 *     npx tsx docs/dev/provenance-smoke.mts
 *
 * A cached readout is keyed on a basis — snapshot day, verdict, mapping,
 * notebooks. The brand profile was not in it, so correcting a customer's
 * vocabulary left every cached readout standing in the old words.
 *
 * That is not theoretical. On 22 Sep the taxonomy was repaired, the page was
 * reloaded, and the same stale prose came back — so a working fix read as a
 * broken one for several minutes. Nothing had told the cache that the thing
 * the prose is MADE OF had changed.
 *
 * Writes into snapshots/ under a throwaway org, in its own sandbox. Refuses to
 * run against a database.
 */
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

if (process.env.DATABASE_URL) {
  console.error("\nRefusing to run: DATABASE_URL is set. This suite writes throwaway rows.\n" +
    "Run it as:  env -u DATABASE_URL npx tsx docs/dev/provenance-smoke.mts\n");
  process.exit(2);
}
const REPO = process.cwd();
const SANDBOX = mkdtempSync(join(tmpdir(), "prism-provenance-"));
process.chdir(SANDBOX);
process.on("exit", () => rmSync(SANDBOX, { recursive: true, force: true }));

const { getContentStore } = await import("../../src/lib/content/store");
const { taxonomyRevision, ORG_DEFAULT_SITE_ID } = await import("../../src/lib/brand/profile");
const { readingBasisKey } = await import("../../src/lib/prototypes/notebook");
const { EMPTY_OBSERVED } = await import("../../src/lib/brand/types");
type Taxonomy = import("../../src/lib/brand/types").Taxonomy;
type SiteProfile = import("../../src/lib/brand/types").SiteProfile;

let failures = 0;
const ok = (label: string, cond: boolean, detail?: string) => {
  if (cond) return console.log(`  ok   ${label}`);
  failures++;
  console.error(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
};

const ORG = "prov-org";
const store = await getContentStore();
const TAX: Taxonomy = { visitorNoun: "visitor", visitorNounPlural: "visitors", offeringNoun: "product",
  offeringNounPlural: "products", primaryAction: "sign up", conversionSurface: "sign-up form", entityKinds: [] };

async function approve(siteId: string, rev: number, taxonomy: Taxonomy) {
  const now = new Date(2026, 0, rev).toISOString();
  await store.addSiteProfile({
    id: `${ORG}-${siteId}-r${rev}`, orgId: ORG, siteId, rev, status: "approved", taxonomy,
    sections: {}, observed: { ...EMPTY_OBSERVED }, sources: { urls: [], derivedAt: now, crawler: "test" },
    corrections: [], createdAt: now, approvedAt: now,
  } as SiteProfile);
}

console.log("\n1. an unseeded org has no revision, and that is not an error");
ok("null, not a throw", (await taxonomyRevision(ORG)) === null);
ok("a blank org is null too", (await taxonomyRevision("  ")) === null);

console.log("\n2. the revision tracks the approved org default");
await approve(ORG_DEFAULT_SITE_ID, 1, TAX);
const r1 = await taxonomyRevision(ORG);
ok("org:1", r1 === "org:1", String(r1));
await approve(ORG_DEFAULT_SITE_ID, 2, { ...TAX, visitorNounPlural: "guests" });
const r2 = await taxonomyRevision(ORG);
ok("correcting the vocabulary moves it", r2 === "org:2", String(r2));
ok("...to a DIFFERENT value — the whole point", r1 !== r2);

console.log("\n3. a site revision counts too — resolution merges both");
// A site can change the words while the org default sits still, so a basis
// built from the org default alone would miss it.
await approve("site-a", 5, { visitorNoun: "member" });
const both = await taxonomyRevision(ORG, "site-a");
ok("both revisions are named", both === "org:2+site:5", String(both));
ok("and it differs from the org-only answer", both !== r2);

console.log("\n4. the basis key actually changes with it");
const base = { latestSnapshotDate: "2026-09-22", verdict: "underpowered", mapConfirmedAt: "x",
  orgNotebookUpdatedAt: "y", protoNotebookUpdatedAt: "z", supporting: ["a", "b"] };
const before = readingBasisKey({ ...base, profileRev: "org:1" });
const after = readingBasisKey({ ...base, profileRev: "org:2" });
ok("a new profile revision retires the cached reading", before !== after);
ok("the revision is visible in the key, not hashed away", after.includes("rev:org:2"), after);
ok("nothing else moved", before.replace("rev:org:1", "") === after.replace("rev:org:2", ""));
// Membership, not noise: the same inputs must still produce the same key, or
// every load buys a fresh generation.
ok("identical inputs still give an identical key", readingBasisKey({ ...base, profileRev: "org:2" }) === after);
ok("an org with no profile is stable, not random", readingBasisKey({ ...base }) === readingBasisKey({ ...base, profileRev: null }));

console.log("\n5. the format bump retires everything cached before it");
ok("fmt17", after.startsWith("fmt17|"), after.split("|")[0]);

console.log("\n6. the route and the generator are wired to it");
const route = readFileSync(join(REPO, "src/app/api/prototypes/results/route.ts"), "utf8");
ok("the basis resolves a revision", /profileRev: await taxonomyRevision\(opts\.orgId\)/.test(route));
ok("both the reading AND the per-metric observation use it",
   (route.match(/profileRev: await taxonomyRevision/g) ?? []).length === 2,
   "the deep observation caches separately and goes stale the same way");
const gen = readFileSync(join(REPO, "src/lib/ai/results.ts"), "utf8");
ok("the reading records which revision it was written in", /\.\.\.\(profileRev \? \{ profileRev \} : \{\}\)/.test(gen));

console.log(failures === 0 ? "\nA vocabulary change retires the words it was made of.\n" : `\n${failures} FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
