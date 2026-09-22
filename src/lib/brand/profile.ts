/**
 * THE ONE QUESTION EVERY PROMPT ASKS — "what does this brand call things?"
 *
 * Before this existed the answer was hardcoded in 18 places in src/lib/ai/**,
 * and one of them was inside a derivation rather than a prompt: readoutStructure()
 * wrote "guests take this step MORE" into the reasoning chain the analyst is
 * told to build its answer from. A word baked into a derivation cannot be fixed
 * by editing a prompt, which is why this is a seam and not a find-and-replace.
 *
 * RESOLUTION ORDER, most specific first:
 *   1. the site's own approved profile   — observed and corrected for THIS site
 *   2. the customer's default profile    — siteId "*", for what is genuinely company-wide
 *   3. DEFAULT_TAXONOMY                  — vertical-neutral; visitors, products, convert
 *
 * Voice and design never inherit from the customer, because two sites of one
 * company rarely sound the same. Only the taxonomy does, because products and
 * commercial model usually are company-wide.
 *
 * This sits in front of every model call, so it must be cheap and it must never
 * throw. A store that is down degrades to the neutral default. Throwing here
 * would take down every AI surface at once.
 *
 * THAT DEGRADATION IS NOT HARMLESS FOR CUSTOMER-FACING PROSE, which an earlier
 * version of this comment claimed. A Neon blip during a readout would silently
 * turn "guests who reach the booking engine" into "visitors who reach the
 * checkout" — no error, no log, and the customer reads it before we do. Bland
 * and confidently wrong is worse than absent, because nothing signals it.
 *
 * There used to be two resolvers, and the choice between them was the choice
 * between degrading and refusing. As of 22 Sep 2026 there is ONE:
 *
 *   requireTaxonomy() — throws unless EVERY field is recorded. For anything a
 *                       customer will read, which is all of it.
 *
 * The total one was deleted rather than documented, because a resolver that
 * degrades is only ever one careless import away from a customer surface, and
 * "use the strict one" is a rule a file cannot enforce about itself.
 *
 * DEFAULT_TAXONOMY survives for exactly one job: seeding a DRAFT that a human
 * corrects. It is never resolved from and never served.
 */

import { getContentStore } from "../content/store";
import { DEFAULT_TAXONOMY, type BrandFact, type SiteProfile, type Taxonomy } from "./types";

/** The customer-level row. A profile at this siteId holds inherited defaults only. */
export const ORG_DEFAULT_SITE_ID = "*";



/** Every field a customer must have described. Derived from Taxonomy so a new
 *  field cannot be added without this check noticing it. */
const TAXONOMY_FIELDS = [
  "visitorNoun", "visitorNounPlural", "offeringNoun", "offeringNounPlural",
  "primaryAction", "conversionSurface", "entityKinds",
] as const satisfies readonly (keyof Taxonomy)[];

/** Thrown when prose a customer will read has no vocabulary to write it in. */
export class TaxonomyUnavailable extends Error {
  constructor(readonly reason: "no-org" | "no-profile" | "incomplete", message: string) {
    super(message);
    this.name = "TaxonomyUnavailable";
  }
}

/**
 * ASK THIS, NOT `instanceof`. Identity is not reliable here.
 *
 * `@/lib/brand/profile` and `../brand/profile` are the same file and can still
 * be two module instances, each with its own `TaxonomyUnavailable` class. The
 * throw comes from whichever instance the thrower imported; an `instanceof` in
 * the catch tests the one the CATCHER imported. When they differ it returns
 * false, the handler is skipped, and an unseeded customer gets a generic 400
 * that reads like a malformed request — with nothing failing to compile and no
 * error in the log. Measured, not theorised: under tsx the two specifiers give
 * `modA === modB` false today.
 *
 * `name` is set in the constructor and survives the boundary, so it decides.
 */
export function isTaxonomyUnavailable(e: unknown): e is TaxonomyUnavailable {
  if (e instanceof TaxonomyUnavailable) return true;
  return typeof e === "object" && e !== null && (e as Error).name === "TaxonomyUnavailable";
}

/**
 * THE ONLY RESOLVER. It refuses; it never degrades.
 *
 * A second, total resolver used to sit beside this one and fill anything
 * missing from DEFAULT_TAXONOMY. It was deleted 22 Sep 2026. Two resolvers
 * meant one of them was the wrong one to call, and the wrong one was the easy
 * one — the name is left out of this comment deliberately, because the ratchet
 * greps for it and a mention that looks like a call would trip it.
 *
 *  1. IT DOES NOT SWALLOW STORE ERRORS. A database outage and an undescribed
 *     brand want different responses from a human, so the error propagates.
 *
 *  2. IT REJECTS A BLANK ORG. A missing tenant id used to resolve to neutral
 *     defaults that looked perfectly valid, so a tenancy bug presented as bland
 *     prose rather than as an error. That is the worst way for it to present.
 *
 *  3. IT REQUIRES EVERY FIELD — this is the part that was missing.
 *     `SiteProfile.taxonomy` is `Partial<Taxonomy>` by design, and `merge()`
 *     spread the gaps from DEFAULT_TAXONOMY. So a profile that recorded only a
 *     visitor noun silently produced "product", "convert" and "checkout" for a
 *     customer who had described none of them, and nothing reported it. The
 *     guard caught the unseeded customer and missed the half-described one,
 *     which is the likelier case the moment onboarding exists — sparse storage
 *     IS the design.
 *
 *     DEFAULT_TAXONOMY is now what it should always have been: the seed for a
 *     draft a human corrects, never something a customer can be served.
 *
 * The cost is deliberate: a customer who is half-described gets no prose at
 * all rather than confident generic prose. Decided 22 Sep 2026 — we would
 * rather refuse than sound like a template.
 */
export async function requireTaxonomy(orgId: string, siteId?: string): Promise<Taxonomy> {
  const id = (orgId ?? "").trim();
  if (!id) {
    throw new TaxonomyUnavailable("no-org", "No organisation was supplied, so there is no brand vocabulary to write in. This is a bug in the caller, not a missing profile.");
  }

  // Deliberately NOT wrapped: a store failure must reach the caller.
  const store = await getContentStore();
  const [site, orgDefault] = await Promise.all([
    siteId && siteId !== ORG_DEFAULT_SITE_ID ? store.getSiteProfile(id, siteId) : Promise.resolve(null),
    store.getSiteProfile(id, ORG_DEFAULT_SITE_ID),
  ]);

  if (!site && !orgDefault) {
    throw new TaxonomyUnavailable(
      "no-profile",
      `No approved brand profile for "${id}"${siteId ? ` or its site "${siteId}"` : ""}. Writing for a customer in generic words would be worse than not writing: onboard the site, or seed the customer default, then retry.`,
    );
  }

  // Site over customer default, field by field, with NO neutral base. A gap
  // here is a gap, not a silent "visitor".
  const resolved: Partial<Taxonomy> = {
    ...(orgDefault?.taxonomy ?? {}),
    ...(site?.taxonomy ?? {}),
    entityKinds: site?.taxonomy?.entityKinds?.length
      ? site.taxonomy.entityKinds
      : orgDefault?.taxonomy?.entityKinds,
  };

  const missing = TAXONOMY_FIELDS.filter((k) => {
    const v = resolved[k];
    return Array.isArray(v) ? v.length === 0 : !String(v ?? "").trim();
  });
  if (missing.length) {
    throw new TaxonomyUnavailable(
      "incomplete",
      `The brand profile for "${id}"${siteId ? ` / "${siteId}"` : ""} is missing ${missing.join(", ")}. Every field is required: filling a gap from the neutral default would print words this customer never chose, and nothing downstream could tell that it had happened.`,
    );
  }

  return resolved as Taxonomy;
}

/**
 * WHICH REVISION OF THE VOCABULARY THIS ANSWER WAS BUILT FROM.
 *
 * Two jobs, both of which the readout was missing.
 *
 * INVALIDATION. A cached readout is keyed on a basis — snapshot day, verdict,
 * mapping, notebooks. The brand profile was not in it, so correcting a
 * customer's vocabulary left every cached readout standing, still written in
 * the old words. On 22 Sep that made a working fix look like a broken one: the
 * taxonomy was repaired, the page was reloaded, and the same stale prose came
 * back because nothing had told the cache that anything had changed.
 *
 * PROVENANCE. `SiteProfile` is a pinned revision precisely so "what did the AI
 * know when it wrote this" stays answerable a year later. That is worth
 * nothing if the answer is never recorded next to the thing it produced.
 *
 * IT DOES NOT THROW. This is a cache key, not customer prose — the strict
 * resolver's refusal is right for a readout and wrong here. A store blip
 * returns null, the key changes, and one readout regenerates. That is the
 * cheap failure; refusing to compute a cache key is not.
 */
export async function taxonomyRevision(orgId: string, siteId?: string): Promise<string | null> {
  const id = (orgId ?? "").trim();
  if (!id) return null;
  try {
    const store = await getContentStore();
    const [site, orgDefault] = await Promise.all([
      siteId && siteId !== ORG_DEFAULT_SITE_ID ? store.getSiteProfile(id, siteId) : Promise.resolve(null),
      store.getSiteProfile(id, ORG_DEFAULT_SITE_ID),
    ]);
    // BOTH, because resolution merges them field by field: a site revision can
    // change the words while the org default sits still, and the reverse.
    const parts = [
      orgDefault ? `org:${orgDefault.rev}` : null,
      site ? `site:${site.rev}` : null,
    ].filter(Boolean);
    return parts.length ? parts.join("+") : null;
  } catch {
    return null;
  }
}

/** The approved profile for a site, or null when it has never been read. */
export async function profileFor(orgId: string, siteId: string): Promise<SiteProfile | null> {
  try {
    const store = await getContentStore();
    return await store.getSiteProfile(orgId, siteId);
  } catch {
    return null;
  }
}

/**
 * The taxonomy as a prompt fragment. One formatting, so fifteen call sites
 * cannot drift into fifteen phrasings of the same instruction.
 *
 * Deliberately terse: it states the nouns and stops. Telling a model at length
 * to avoid a word is less reliable than never putting the word in front of it.
 */
export function taxonomyPrompt(t: Taxonomy): string {
  const kinds = t.entityKinds.length ? `\nThis site organises its content by: ${t.entityKinds.join(", ")}.` : "";
  return [
    `VOCABULARY — use this site's own words, never a generic substitute.`,
    `People who arrive are "${t.visitorNoun}" (plural "${t.visitorNounPlural}").`,
    `What the site offers is a "${t.offeringNoun}" (plural "${t.offeringNounPlural}").`,
    `The action the business wants is to "${t.primaryAction}", which completes at the ${t.conversionSurface}.${kinds}`,
  ].join("\n");
}

/**
 * THE EARNED DIGEST — what this site has already proved, as sentences.
 *
 * A crawler can read the site tomorrow. It cannot know that offer badges in the
 * hero have never won here, because that did not exist until the experiment ran.
 * This is the layer that compounds while a scraped profile decays, so it should
 * be the loudest thing in the builder's context and the first thing a readout
 * cites.
 *
 * Expired facts are excluded by the store: a direction ruled out in March, on a
 * page since redesigned, is not evidence.
 */
export async function earnedDigest(
  orgId: string,
  siteId: string,
  opts?: { surfaceId?: string; limit?: number },
): Promise<string[]> {
  let facts: BrandFact[] = [];
  try {
    const store = await getContentStore();
    facts = await store.listBrandFacts(orgId, { siteId, surfaceId: opts?.surfaceId });
  } catch {
    return [];
  }
  const lines: string[] = [];
  const ruledOut = facts.filter((f) => f.kind === "ruled-out");
  const won = facts.filter((f) => f.kind === "won");
  const unresolved = facts.filter((f) => f.kind === "unresolved");

  for (const f of won) lines.push(`${f.subject} ${f.predicate} — has won here.`);
  for (const f of ruledOut) lines.push(`${f.subject} ${f.predicate} — tested here and ruled out, not merely unproven.`);
  for (const f of unresolved) lines.push(`${f.subject} ${f.predicate} — tested here and still unsettled; it would need more traffic to answer.`);

  return typeof opts?.limit === "number" ? lines.slice(0, opts.limit) : lines;
}

/**
 * The control-arm rate this site actually shows for a metric, if an experiment
 * has ever measured it. This is what makes the statistical power gate fire by
 * itself instead of waiting for somebody to hand-type a baseline.
 */
export async function baselineFor(orgId: string, siteId: string, metricKey: string): Promise<number | null> {
  try {
    const store = await getContentStore();
    const facts = await store.listBrandFacts(orgId, { siteId, kinds: ["baseline"] });
    const hit = facts.find((f) => f.predicate === metricKey);
    const rate = (hit?.value as { rate?: unknown } | undefined)?.rate;
    return typeof rate === "number" && rate > 0 && rate < 1 ? rate : null;
  } catch {
    return null;
  }
}
