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
 * throw. A store that is down degrades to the neutral default and the readout
 * says "visitors" — which is wrong-ish but harmless. Throwing here would take
 * down every AI surface at once.
 */

import { getContentStore } from "../content/store";
import { DEFAULT_TAXONOMY, type BrandFact, type SiteProfile, type Taxonomy } from "./types";

/** The customer-level row. A profile at this siteId holds inherited defaults only. */
export const ORG_DEFAULT_SITE_ID = "*";

/**
 * Resolve the taxonomy for a site. Never throws; falls back to neutral.
 * `siteId` omitted resolves the customer default alone.
 */
export async function taxonomyFor(orgId: string, siteId?: string): Promise<Taxonomy> {
  try {
    const store = await getContentStore();
    const [site, orgDefault] = await Promise.all([
      siteId && siteId !== ORG_DEFAULT_SITE_ID ? store.getSiteProfile(orgId, siteId) : Promise.resolve(null),
      store.getSiteProfile(orgId, ORG_DEFAULT_SITE_ID),
    ]);
    // Merge field by field rather than whole-object, so a site that has
    // corrected only its visitor noun still inherits the rest.
    return {
      ...DEFAULT_TAXONOMY,
      ...(orgDefault?.taxonomy ?? {}),
      ...(site?.taxonomy ?? {}),
      entityKinds: site?.taxonomy?.entityKinds?.length
        ? site.taxonomy.entityKinds
        : orgDefault?.taxonomy?.entityKinds ?? DEFAULT_TAXONOMY.entityKinds,
    };
  } catch {
    return DEFAULT_TAXONOMY;
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
