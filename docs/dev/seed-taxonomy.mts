/**
 * SEED A CUSTOMER'S TAXONOMY — the retro-onboard, before onboarding exists.
 *
 *     npx tsx docs/dev/seed-taxonomy.mts outrigger          # write it
 *     npx tsx docs/dev/seed-taxonomy.mts outrigger --dry    # show, change nothing
 *
 * Targets whatever `DATABASE_URL` points at, exactly like the app does: unset
 * means the local filesystem store, set means that Neon branch. Run it against
 * staging first — the whole point of having a staging tier is that this is the
 * kind of thing you try somewhere else.
 *
 * WHY THIS EXISTS. `src/lib/brand/` shipped with no callers so the eighteen —
 * actually forty-four — hardcoded hospitality strings get replaced once rather
 * than twice. But swapping them for `taxonomyPrompt()` while Outrigger has no
 * profile row would resolve to DEFAULT_TAXONOMY and turn "guests who reach the
 * booking engine" into "visitors who reach the checkout". Shipping that to the
 * one live customer, in the name of vertical-neutrality, would be a regression
 * dressed as progress.
 *
 * So the row comes first. Then the prompt work produces output IDENTICAL to
 * today's for Outrigger, which is the strongest available check that the seam
 * is correct: the diff in the readout should be empty.
 *
 * WHY ORG-DEFAULT (`siteId = "*"`) RATHER THAN PER-SITE. Outrigger's sites
 * share a vocabulary — a guest is a guest on every property. The customer level
 * holds inherited defaults; a single site that disagrees can still override one
 * field later, because resolution merges field by field rather than replacing.
 * That is the behaviour `brand-profile-smoke.mts` assertion 2 pins.
 *
 * WHY IT IS NOT A CRAWL. Everything written here is CHARACTERIZED, not
 * OBSERVED: a human asserting the vocabulary, with `crawler: "seed"` and no
 * source URLs, so the provenance never claims a crawl happened. When onboarding
 * lands it will supersede this with a real revision and real sources.
 */

import { getContentStore } from "../../src/lib/content/store";
import { requireTaxonomy, isTaxonomyUnavailable, ORG_DEFAULT_SITE_ID } from "../../src/lib/brand/profile";
import { EMPTY_OBSERVED, DEFAULT_TAXONOMY, type Taxonomy, type SiteProfile } from "../../src/lib/brand/types";

/**
 * The customers we can currently assert a vocabulary for, by hand.
 *
 * `entityKinds` is the field worth arguing about — it drives how the builder
 * and the analyst name what they are looking at, and it is the one here that is
 * inferred from the site's URL structure rather than stated by the customer.
 * Correct it rather than trusting it.
 */
const SEEDS: Record<string, Taxonomy> = {
  // KEYED BY THE REAL ORG ID, not a readable slug. This said `outrigger` for a
  // day; the tenant is `outrigger-resorts-hotels`. requireTaxonomy() is handed
  // the org id off the request, so a friendly key here writes a row nothing can
  // ever resolve. The guard below now refuses that, but the key has to be right
  // for the guard to pass at all.
  "outrigger-resorts-hotels": {
    visitorNoun: "guest",
    visitorNounPlural: "guests",
    offeringNoun: "room",
    offeringNounPlural: "rooms",
    primaryAction: "book",
    conversionSurface: "booking engine",
    entityKinds: ["property", "island", "room type"],
  },
};

const org = process.argv[2];
const dry = process.argv.includes("--dry");

if (!org || !SEEDS[org]) {
  console.error(`usage: seed-taxonomy.mts <org> [--dry]\nknown: ${Object.keys(SEEDS).join(", ")}`);
  process.exit(1);
}

const want = SEEDS[org];
const store = await getContentStore();

// THE ORG MUST EXIST. This wrote "outrigger" for a day while the real
// organisation was "outrigger-resorts-hotels", so the row was an orphan: a
// taxonomy attached to a tenant that does not exist. Everything looked right —
// the insert succeeded, the script printed the resolved words, and a SELECT
// showed an approved profile. It only surfaced when requireTaxonomy was called
// with the REAL org id and threw no-profile at a customer.
//
// A seed keyed by a slug someone typed is a guess. Check it against the tenants
// the store actually holds, and name them when it is wrong.
const orgs = await store.listOrgs();
const known = orgs.map((o) => o.id);
if (!known.includes(org)) {
  console.error(`\nNo organisation "${org}" in this database.\n`);
  console.error(known.length ? `orgs here: ${known.join(", ")}` : "This database has no organisations at all — wrong DATABASE_URL?");
  console.error(`\nSeeding it anyway would write a profile no caller can ever resolve:`);
  console.error(`requireTaxonomy() is called with the org id from the request, not this slug.\n`);
  process.exit(1);
}

console.log(`\nbackend : ${process.env.DATABASE_URL ? "Neon (DATABASE_URL is set)" : "filesystem (snapshots/)"}`);
console.log(`org     : ${org}`);

// Before seeding there may be nothing, or something incomplete. Both are
// expected here and neither is an error — this is the only place in the
// codebase that legitimately reads a taxonomy that may not resolve.
const before = await requireTaxonomy(org).catch((e) => {
  if (isTaxonomyUnavailable(e)) return null;
  throw e;
});
const existing = await store.getSiteProfile(org, ORG_DEFAULT_SITE_ID);

console.log(`\nresolves today:`);
for (const k of Object.keys(want) as (keyof Taxonomy)[]) {
  const b = JSON.stringify(before[k]);
  const w = JSON.stringify(want[k]);
  const neutral = JSON.stringify(DEFAULT_TAXONOMY[k]);
  const mark = b === w ? "  " : "->";
  console.log(`  ${mark} ${String(k).padEnd(19)} ${b === neutral ? `${b} (neutral default)` : b}${b === w ? "" : `  ${mark}  ${w}`}`);
}

if (dry) {
  console.log(`\n--dry: nothing written.\n`);
  process.exit(0);
}

// Additive, never an edit. An existing org-default is superseded by a higher
// revision so the earlier one stays fetchable — "what did the AI know when it
// built this" has to remain answerable after onboarding rewrites all of it.
const rev = (existing?.rev ?? 0) + 1;
const now = new Date().toISOString();

const profile: SiteProfile = {
  id: `${org}-orgdefault-r${rev}`,
  orgId: org,
  siteId: ORG_DEFAULT_SITE_ID,
  rev,
  status: "approved",
  taxonomy: want,
  sections: {},
  observed: { ...EMPTY_OBSERVED },
  sources: { urls: [], derivedAt: now, crawler: "seed" },
  corrections: [],
  createdAt: now,
  approvedAt: now,
  approvedBy: "seed-taxonomy.mts",
};

await store.addSiteProfile(profile);

// Strict on purpose: if the row we just wrote does not resolve COMPLETELY,
// the seed did not do its job and saying so now is the whole point.
const after = await requireTaxonomy(org);
const ok = (Object.keys(want) as (keyof Taxonomy)[]).every((k) => JSON.stringify(after[k]) === JSON.stringify(want[k]));

console.log(`\nwrote   : ${profile.id} (rev ${rev}, approved)`);
console.log(`resolves now:`);
for (const k of Object.keys(want) as (keyof Taxonomy)[]) console.log(`     ${String(k).padEnd(19)} ${JSON.stringify(after[k])}`);
console.log(ok ? `\nSeeded. requireTaxonomy("${org}") now resolves every field.\n` : `\nMISMATCH — resolution did not return what was written.\n`);
process.exit(ok ? 0 : 1);
