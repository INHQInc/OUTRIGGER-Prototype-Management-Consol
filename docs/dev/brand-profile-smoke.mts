/**
 * THE BRAND PROFILE STORE — asserted against the real filesystem backend.
 *
 *     npx tsx docs/dev/brand-profile-smoke.mts
 *
 * This is the seam every prompt and every derivation will ask, so the claims
 * that matter are not "it saves" but the ones that protect the record:
 *
 *  1. The NEUTRAL DEFAULT holds when nothing has been read. A brand-new tenant
 *     must get "visitors", never "guests" — the whole point of the seam.
 *  2. Resolution is most-specific-first and merges FIELD BY FIELD. A site that
 *     corrected only its visitor noun still inherits the customer's product
 *     noun; it does not fall back to neutral for everything else.
 *  3. A DRAFT is not readable as the answer. getSiteProfile with no rev returns
 *     the latest APPROVED revision, because the builder must never build
 *     against prose no human has accepted.
 *  4. Revisions are additive. Approving r2 leaves r1 fetchable by number, which
 *     is what makes "what did the AI know when it built this" answerable a year
 *     later.
 *  5. EXPIRED facts are excluded. A direction ruled out in March, on a page
 *     since redesigned, must not come back as evidence.
 *  6. Superseding is a POINTER. The superseded row still exists; it just stops
 *     being returned.
 *
 * HERMETIC BY CONSTRUCTION. It runs in a throwaway snapshots tree and refuses
 * to run against a database at all — see the guard below, which exists because
 * an earlier version of this line claimed a cleanup that no code performed.
 */

import { getContentStore } from "../../src/lib/content/store";
import { requireTaxonomy, TaxonomyUnavailable, earnedDigest, baselineFor, ORG_DEFAULT_SITE_ID } from "../../src/lib/brand/profile";
import { EMPTY_OBSERVED, type BrandFact, type SiteProfile } from "../../src/lib/brand/types";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// THE GUARD. getContentStore() picks its backend from DATABASE_URL, and this
// file writes ~90 rows of deliberate nonsense. Pointed at a real database it
// would seed junk profiles and facts into a live tenant — silently, because
// every write here is a legitimate API call. A test must not be able to do
// that by inheriting a shell variable.
if (process.env.DATABASE_URL) {
  console.error(
    "\nRefusing to run: DATABASE_URL is set.\n" +
      "This suite writes throwaway rows and must only ever touch the filesystem backend.\n" +
      "Run it as:  env -u DATABASE_URL npx tsx docs/dev/brand-profile-smoke.mts\n",
  );
  process.exit(2);
}

// FsContentStore roots itself at process.cwd()/snapshots on every call, so
// moving cwd moves the whole store. The test therefore cannot see, corrupt or
// grow the dev snapshots tree, and cleanup is one rmSync rather than a delete
// method added to the production interface for a test's convenience.
const SANDBOX = mkdtempSync(join(tmpdir(), "prism-brand-smoke-"));
process.chdir(SANDBOX);
const cleanup = () => rmSync(SANDBOX, { recursive: true, force: true });
process.on("exit", cleanup);

const ORG = `smoke-org-${Date.now()}`;
const SITE = "site-a";
let failures = 0;

function ok(label: string, cond: boolean, detail?: string) {
  if (cond) return console.log(`  ok   ${label}`);
  failures++;
  console.error(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
}

function profile(over: Partial<SiteProfile>): SiteProfile {
  return {
    id: `${ORG}-${over.siteId ?? SITE}-r${over.rev ?? 1}`,
    orgId: ORG,
    siteId: SITE,
    rev: 1,
    status: "draft",
    taxonomy: {},
    sections: {},
    observed: { ...EMPTY_OBSERVED },
    sources: { urls: [], derivedAt: new Date().toISOString(), crawler: "smoke" },
    corrections: [],
    createdAt: new Date().toISOString(),
    ...over,
  };
}

function fact(over: Partial<BrandFact>): BrandFact {
  return {
    id: `${ORG}-f-${Math.random().toString(36).slice(2, 9)}`,
    orgId: ORG,
    siteId: SITE,
    kind: "ruled-out",
    subject: "A thing",
    predicate: "does nothing",
    value: {},
    sourceType: "verdict",
    sourceId: "proto-x",
    observedAt: new Date().toISOString(),
    ...over,
  };
}

const store = await getContentStore();

console.log("\n1. nothing read yet means NO WORDS, not neutral ones");
// This assertion is inverted from what it said this morning. It used to check
// that a brand-new tenant resolved to "visitors"/"product". Decided 22 Sep:
// generic language is never served, so an undescribed tenant gets refused.
const freshErr = await (async () => {
  try { await requireTaxonomy(ORG, SITE); return null; }
  catch (e) { return e instanceof TaxonomyUnavailable ? e : null; }
})();
ok("an unread site refuses", freshErr?.reason === "no-profile", String(freshErr?.reason));
ok("...and says what to do about it", Boolean(freshErr?.message.includes("onboard")), freshErr?.message);

console.log("\n2. resolution merges field by field");
await store.addSiteProfile(
  profile({
    id: `${ORG}-org-default`,
    siteId: ORG_DEFAULT_SITE_ID,
    status: "approved",
    approvedAt: new Date().toISOString(),
    // A COMPLETE org default: every field, because requireTaxonomy now refuses a
    // partial one. The site row below still overrides only what it disagrees with,
    // which is the inheritance this section exists to prove.
    taxonomy: { visitorNoun: "visitor", visitorNounPlural: "visitors", offeringNoun: "room",
      offeringNounPlural: "rooms", primaryAction: "book", conversionSurface: "booking engine",
      entityKinds: ["property"] },
  }),
);
await store.addSiteProfile(
  profile({
    id: `${ORG}-${SITE}-r1`,
    rev: 1,
    status: "approved",
    approvedAt: new Date().toISOString(),
    taxonomy: { visitorNoun: "guest", visitorNounPlural: "guests" },
  }),
);
const merged = await requireTaxonomy(ORG, SITE);
ok("site wins for its own correction", merged.visitorNounPlural === "guests", merged.visitorNounPlural);
ok("customer default still inherited", merged.offeringNounPlural === "rooms", merged.offeringNounPlural);
ok("customer action inherited", merged.primaryAction === "book", merged.primaryAction);

console.log("\n3. a draft is not the answer");
await store.addSiteProfile(
  profile({ id: `${ORG}-${SITE}-r2`, rev: 2, status: "draft", taxonomy: { visitorNounPlural: "DRAFTED" } }),
);
const stillR1 = await requireTaxonomy(ORG, SITE);
ok("draft r2 ignored", stillR1.visitorNounPlural === "guests", stillR1.visitorNounPlural);

console.log("\n4. revisions are additive");
await store.updateSiteProfile(`${ORG}-${SITE}-r2`, { status: "approved", approvedAt: new Date().toISOString() });
const nowR2 = await store.getSiteProfile(ORG, SITE);
ok("latest approved is r2", nowR2?.rev === 2, String(nowR2?.rev));
const backToR1 = await store.getSiteProfile(ORG, SITE, 1);
ok("r1 still fetchable by number", backToR1?.rev === 1 && backToR1.taxonomy.visitorNounPlural === "guests");

console.log("\n5. expired facts are excluded");
const past = new Date(Date.now() - 86_400_000).toISOString();
const live = fact({ subject: "Offer badges in the hero", predicate: "have never won" });
const dead = fact({ subject: "A stale direction", predicate: "was ruled out", expiresAt: past });
await store.addBrandFact(live);
await store.addBrandFact(dead);
const digest = await earnedDigest(ORG, SITE);
ok("live fact present", digest.some((l) => l.includes("Offer badges")), JSON.stringify(digest));
ok("expired fact absent", !digest.some((l) => l.includes("stale direction")));

console.log("\n6. superseding is a pointer, and baselines resolve");
const b1 = fact({ kind: "baseline", predicate: "visit_booking_engine", value: { rate: 0.0596, n: 25181 } });
await store.addBrandFact(b1);
ok("baseline resolves", (await baselineFor(ORG, SITE, "visit_booking_engine")) === 0.0596);
await store.supersedeBrandFact(b1.id, "replacement-id");
ok("superseded baseline stops resolving", (await baselineFor(ORG, SITE, "visit_booking_engine")) === null);
const all = await store.listBrandFacts(ORG, { siteId: SITE, includeExpired: true });
ok("superseded row still exists, just not returned", !all.some((f) => f.id === b1.id));

console.log("\n7. the STRICT resolver refuses rather than degrades");
// Customer-facing prose must not quietly fall back to "visitors"/"checkout".
// These four claims are the difference between refusing and degrading.
async function threw(fn: () => Promise<unknown>): Promise<TaxonomyUnavailable | null> {
  try { await fn(); return null; } catch (e) { return e instanceof TaxonomyUnavailable ? e : null; }
}

const blank = await threw(() => requireTaxonomy("  "));
ok("a blank org is a tenancy bug, not a missing profile", blank?.reason === "no-org", String(blank?.reason));

const unseeded = await threw(() => requireTaxonomy(`never-seeded-${ORG}`));
ok("an org with no profile refuses", unseeded?.reason === "no-profile", String(unseeded?.reason));

// Not asserting the visitor noun here: by this point section 4 has approved r2,
// so the site's own value is legitimately "DRAFTED". The inherited field is the
// order-independent one, and it is also the one that proves the merge ran.
const seeded = await requireTaxonomy(ORG, SITE);
ok("an org WITH a profile resolves, inheriting the customer default", seeded.offeringNounPlural === "rooms", seeded.offeringNounPlural);

// THE SUBTLE ONE, and it survives the per-field rule unchanged. Refusing on
// "the values look neutral" would reject a SaaS
// customer whose own words genuinely are visitor/product/convert — telling them
// their profile is missing when it is present and correct. Existence is the
// question, never the values.
const NEUTRAL_ORG = `${ORG}-neutral`;
await store.addSiteProfile(
  profile({
    id: `${NEUTRAL_ORG}-org-default`,
    orgId: NEUTRAL_ORG,
    siteId: ORG_DEFAULT_SITE_ID,
    status: "approved",
    approvedAt: new Date().toISOString(),
    // COMPLETE, and every word happens to equal the neutral default. That is
    // the whole point: this customer really does say "visitor" and "product",
    // and refusing them for it would be telling a SaaS company its profile is
    // missing when it is present and correct.
    taxonomy: { visitorNoun: "visitor", visitorNounPlural: "visitors", offeringNoun: "product",
      offeringNounPlural: "products", primaryAction: "convert", conversionSurface: "checkout",
      entityKinds: ["plan"] },
  }),
);
const neutralButReal = await threw(() => requireTaxonomy(NEUTRAL_ORG));
ok("a genuinely vertical-neutral profile is NOT mistaken for a missing one", neutralButReal === null);

console.log("\n8. a HALF-described customer is refused too");
// The bug this closes: taxonomy is Partial<Taxonomy> by design and the merge
// used to spread gaps from DEFAULT_TAXONOMY, so a profile recording only a
// visitor noun silently served "product", "convert" and "checkout" to someone
// who had described none of them. The guard caught the unseeded customer and
// missed the half-described one — the likelier case once onboarding exists.
const PARTIAL = `${ORG}-partial`;
await store.addSiteProfile(
  profile({
    id: `${PARTIAL}-org-default`,
    orgId: PARTIAL,
    siteId: ORG_DEFAULT_SITE_ID,
    status: "approved",
    approvedAt: new Date().toISOString(),
    taxonomy: { visitorNoun: "member", visitorNounPlural: "members" },
  }),
);
const partialErr = await threw(() => requireTaxonomy(PARTIAL));
ok("a profile missing fields is refused", partialErr?.reason === "incomplete", String(partialErr?.reason));
ok("...naming every field that is missing",
   Boolean(partialErr?.message.includes("offeringNoun") && partialErr?.message.includes("primaryAction") && partialErr?.message.includes("conversionSurface")),
   partialErr?.message);
ok("...and not naming the ones that ARE recorded", !partialErr?.message.includes("visitorNoun,"), partialErr?.message);

console.log(failures === 0 ? "\nAll brand-profile claims hold.\n" : `\n${failures} FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
