/**
 * WHAT DOES THIS TIER ACTUALLY KNOW? — read-only, writes nothing.
 *
 *     DATABASE_URL="…" npx tsx docs/dev/check-taxonomy.mts outrigger
 *
 * Exists because "we seeded staging" and "staging resolves a taxonomy" are
 * different claims, and only the second one keeps the readout working. A row
 * can be present and still not answer: requireTaxonomy reads the latest
 * APPROVED revision at the org-default sentinel, so a draft, a different org
 * id, or a per-site row with no org default all look like "seeded" in a table
 * and throw in the product.
 *
 * Prints every profile it can see before resolving, so the gap between the two
 * is visible rather than inferred.
 */
import { getContentStore } from "../../src/lib/content/store";
import { requireTaxonomy, isTaxonomyUnavailable, ORG_DEFAULT_SITE_ID } from "../../src/lib/brand/profile";

const org = process.argv[2] ?? "outrigger";
const store = await getContentStore();

console.log(`backend : ${process.env.DATABASE_URL ? "Neon (DATABASE_URL is set)" : "filesystem (snapshots/)"}`);
console.log(`org     : ${org}\n`);

const all = await store.listSiteProfiles(org).catch((e) => { console.error("listSiteProfiles failed:", (e as Error).message); return []; });
if (!all.length) console.log("NO PROFILE ROWS AT ALL for this org.");
for (const p of all) {
  const flag = p.siteId === ORG_DEFAULT_SITE_ID ? "  <- org default" : "";
  console.log(`  ${p.id}  site=${p.siteId}  rev=${p.rev}  ${p.status}${flag}`);
}

const orgDefault = await store.getSiteProfile(org, ORG_DEFAULT_SITE_ID);
console.log(`\nlatest APPROVED org-default: ${orgDefault ? `${orgDefault.id} (rev ${orgDefault.rev})` : "NONE — this is what makes requireTaxonomy throw"}`);

try {
  const t = await requireTaxonomy(org);
  console.log("\nrequireTaxonomy RESOLVES:");
  for (const [k, v] of Object.entries(t)) console.log(`   ${k.padEnd(19)} ${JSON.stringify(v)}`);
  console.log("\nThe readout will work on this tier.");
} catch (e) {
  console.log(`\nrequireTaxonomy THREW: ${isTaxonomyUnavailable(e) ? e.reason : "unexpected"} — ${(e as Error).message}`);
  console.log("This is the 409 you are seeing.");
}
