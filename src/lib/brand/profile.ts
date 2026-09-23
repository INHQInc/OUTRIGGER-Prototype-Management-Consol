/**
 * THE ONE QUESTION EVERY PROMPT ASKS — "what does this brand call things?"
 *
 * Before this existed the answer was hardcoded in 18 places in src/lib/ai/**,
 * and one of them was inside a derivation rather than a prompt: readoutStructure()
 * wrote "guests take this step MORE" into the reasoning chain the analyst is
 * told to build its answer from. A word baked into a derivation cannot be fixed
 * by editing a prompt, which is why this is a seam and not a find-and-replace.
 *
 * TWO TIERS, split by WHO SUPPLIES THE FACT (decided 23 Sep 2026):
 *   - the CUSTOMER default, siteId "*" — what a person STATES about the brand:
 *     the vocabulary, how it sounds, who it serves, what it sells. Captured as
 *     the first step of creating a customer (`/brand`, `lib/brand/onboarding.ts`).
 *   - a SITE profile — what a read SEES and an interview SETTLES for one site:
 *     its fonts, palette, button labels. It overrides the customer field by
 *     field and inherits wherever it is silent. No site profile is written yet;
 *     every caller today resolves the customer default alone.
 *
 * There is NO third tier. `DEFAULT_TAXONOMY` is never resolved from and never
 * served; it survives only to seed a draft a human corrects.
 *
 * IT THROWS, DELIBERATELY. An earlier version of this comment said the resolver
 * must never throw and should degrade to neutral words on a store failure. That
 * was wrong for customer-facing prose: a Neon blip during a readout would turn
 * "guests who reach the booking engine" into "visitors who reach the checkout"
 * with no error and no log, and the customer reads it before we do. Bland and
 * confidently wrong is worse than absent, because nothing signals it.
 *
 * So there is ONE resolver, `requireTaxonomy()`, and it throws unless every
 * field is recorded. The total one was deleted rather than documented: a
 * resolver that degrades is one careless import away from a customer surface,
 * and "use the strict one" is a rule a file cannot enforce about itself.
 */

import { getContentStore } from "../content/store";
import { DEFAULT_TAXONOMY, TAXONOMY_FIELDS, missingTaxonomyFields, type BrandFact, type SiteProfile, type Taxonomy } from "./types";
// Re-exported: the definition lives in types.ts because the browser needs it too
// (the Brand screen enables Approve on it) and this file imports the store.
export { TAXONOMY_FIELDS, missingTaxonomyFields };

/** The customer-level row. A profile at this siteId holds inherited defaults only. */
export const ORG_DEFAULT_SITE_ID = "*";



/** Every field a customer must have described. Derived from Taxonomy so a new
 *  field cannot be added without this check noticing it. */


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
      `No approved brand profile for "${id}"${siteId ? ` or its site "${siteId}"` : ""}. Writing for a customer in generic words would be worse than not writing: describe the brand (Configuration → Brand), then retry.`,
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

  const missing = missingTaxonomyFields(resolved);
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

/**
 * THE CUSTOMER'S WORDS, AS A UNIT — the vocabulary plus who it belongs to.
 *
 * The two travel together because every surface that needs one needs the
 * other: the analyst names the reader AND writes in their nouns; a skill body
 * does both in the same paragraph. Resolving them separately is how one half
 * of a prompt ends up in one revision's words and the other half in another's.
 */
export interface Vocabulary {
  taxonomy: Taxonomy;
  /** The customer's display name, falling back to the org id — which is their
   *  own identifier, so still a resolved specific and never a generic. */
  customer: string;
}

/** Resolve both, or refuse. Throws `TaxonomyUnavailable`, exactly as
 *  `requireTaxonomy` does — this is the same gate with a name attached. */
export async function vocabularyFor(orgId: string, siteId?: string): Promise<Vocabulary> {
  const taxonomy = await requireTaxonomy(orgId, siteId);
  // AFTER the refusal, never before: a store blip on the ORG row must not
  // decide whether a customer has a vocabulary.
  const store = await getContentStore();
  const org = await store.getOrg(orgId).catch(() => null);
  return { taxonomy, customer: org?.name || orgId };
}

/**
 * The placeholders a skill body may use. One list, because it is also the
 * validation: a `{{…}}` that is not here is a typo, and the smoke suite fails
 * on one rather than letting it ship to an agent as literal braces.
 */
export const VOCAB_KEYS = [
  "customer", "visitorNoun", "visitorNounPlural", "offeringNoun",
  "offeringNounPlural", "primaryAction", "conversionSurface", "entityKinds",
] as const;
export type VocabKey = (typeof VOCAB_KEYS)[number];

const PLACEHOLDER = /\{\{\s*([A-Za-z]+)\s*\}\}/g;

/**
 * SUBSTITUTE THE CUSTOMER INTO A SKILL BODY.
 *
 * Skill bodies are the agent's own instructions, delivered to every branch and
 * used by the console's own AI. They are stored ONCE, globally, for every
 * customer — `seedBuiltins()` takes no org and the scope is "global" — so the
 * vocabulary cannot enter at seed time without per-customer skill rows. It
 * enters at DELIVERY instead, where the customer is already resolved.
 *
 * AN UNKNOWN PLACEHOLDER IS LEFT ALONE, deliberately. Dropping it would delete
 * a word from an instruction silently; leaving `{{whatever}}` in the text is
 * visible to whoever reads it. The suite catches the typo before it ships.
 */
export function resolveVocabulary(text: string, v: Vocabulary): string {
  return text.replace(PLACEHOLDER, (whole, key: string) => {
    if (key === "customer") return v.customer;
    if (key === "entityKinds") return v.taxonomy.entityKinds.join(", ");
    const value = (v.taxonomy as unknown as Record<string, unknown>)[key];
    return typeof value === "string" && value ? value : whole;
  });
}

/** Every placeholder a body uses, for validation. */
export function vocabularyKeysIn(text: string): string[] {
  return [...text.matchAll(PLACEHOLDER)].map((m) => m[1]);
}
