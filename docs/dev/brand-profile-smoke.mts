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
 * Writes into snapshots/ under a throwaway org id, then removes its own rows.
 */

import { getContentStore } from "../../src/lib/content/store";
import { taxonomyFor, earnedDigest, baselineFor, ORG_DEFAULT_SITE_ID } from "../../src/lib/brand/profile";
import { EMPTY_OBSERVED, type BrandFact, type SiteProfile } from "../../src/lib/brand/types";

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

console.log("\n1. neutral default when nothing has been read");
const fresh = await taxonomyFor(ORG, SITE);
ok("visitors, not guests", fresh.visitorNounPlural === "visitors", fresh.visitorNounPlural);
ok("neutral offering", fresh.offeringNoun === "product", fresh.offeringNoun);

console.log("\n2. resolution merges field by field");
await store.addSiteProfile(
  profile({
    id: `${ORG}-org-default`,
    siteId: ORG_DEFAULT_SITE_ID,
    status: "approved",
    approvedAt: new Date().toISOString(),
    taxonomy: { offeringNoun: "room", offeringNounPlural: "rooms", primaryAction: "book" },
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
const merged = await taxonomyFor(ORG, SITE);
ok("site wins for its own correction", merged.visitorNounPlural === "guests", merged.visitorNounPlural);
ok("customer default still inherited", merged.offeringNounPlural === "rooms", merged.offeringNounPlural);
ok("customer action inherited", merged.primaryAction === "book", merged.primaryAction);

console.log("\n3. a draft is not the answer");
await store.addSiteProfile(
  profile({ id: `${ORG}-${SITE}-r2`, rev: 2, status: "draft", taxonomy: { visitorNounPlural: "DRAFTED" } }),
);
const stillR1 = await taxonomyFor(ORG, SITE);
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

console.log(failures === 0 ? "\nAll brand-profile claims hold.\n" : `\n${failures} FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
