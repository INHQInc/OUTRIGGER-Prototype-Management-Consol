/**
 * THE CUSTOMER, DELIVERED TO THE BRANCH.
 *
 * `provision.ts` imported nothing from `../brand` until this existed. The whole
 * context model — taxonomy, characterized prose, earned facts — reached exactly
 * one consumer, the readout. So the surface that writes prose ABOUT the page
 * refused to run without the customer's vocabulary, while the surface that
 * writes words ONTO the customer's live page got none of it and guessed.
 *
 * This is the seam, not the capture. It moves what the console ALREADY knows
 * onto the branch; onboarding still has to start asking for vertical, voice,
 * audience and standing guardrails (docs/plans/BUILDER-CONTEXT.md §1A).
 *
 * IT REFUSES. `requireTaxonomy` throws rather than serving neutral words, and
 * provisioning inherits that on purpose: a branch provisioned without the
 * customer's vocabulary produces copy in a template's voice, on a real site,
 * under the customer's name. Decided 22 Sep 2026 — seed the customer, then
 * build. The alternative is a generic fallback, which is the one thing this
 * whole line of work exists to remove.
 */
import { requireTaxonomy, taxonomyPrompt, taxonomyRevision, profileFor, ORG_DEFAULT_SITE_ID } from "../brand/profile";
import { SECTION_LABEL, type SectionKey, type Taxonomy } from "../brand/types";
import { getOrg } from "../orgs";

export interface CustomerContext {
  orgId: string;
  /** Display name, for the file a human opens. */
  name: string;
  /** Which revision of the profile this was resolved from — `org:2+site:5`. */
  profileRev: string | null;
  taxonomy: Taxonomy;
  /** Only the sections a human has actually approved. Gaps stay gaps. */
  sections: Partial<Record<SectionKey, string>>;
}

/**
 * What a section that nobody has written yet must tell the builder.
 *
 * Silence would be read as freedom, and a model with freedom and no voice
 * description writes generic marketing copy — the exact failure. So an
 * uncharacterized section still carries an instruction; it just points at the
 * evidence on the page instead of inventing a register.
 */
const GAP: Partial<Record<SectionKey, string>> = {
  voice: "Not characterized yet. Match the register of the copy already on the target page — the snapshot under `.opmc/targets/` is the evidence. Do not invent a new voice, and do not reach for generic marketing phrasing.",
  audience: "Not characterized yet. The brief's audience line is the only statement of who this is for; do not assume past it.",
  business: "Not characterized yet. Describe nothing about the business that the target page does not already say.",
  market: "Not characterized yet. Do not name or imply competitors.",
  design: "Not characterized yet. `.opmc/targets/<slug>/design-tokens.md` is the authority — defer to the tokens actually on the page.",
};

/** The sections worth putting in front of a builder, in the order they matter. */
const DELIVERED: SectionKey[] = ["voice", "audience", "business", "design"];

/**
 * Resolve the customer for a branch. Throws `TaxonomyUnavailable` when the
 * vocabulary is missing or half-described — see the file header.
 */
export async function customerContextFor(orgId: string): Promise<CustomerContext> {
  const taxonomy = await requireTaxonomy(orgId);
  const [org, profile] = await Promise.all([
    getOrg(orgId).catch(() => null),
    profileFor(orgId, ORG_DEFAULT_SITE_ID),
  ]);
  const sections: Partial<Record<SectionKey, string>> = {};
  for (const k of DELIVERED) {
    const v = profile?.sections?.[k]?.trim();
    if (v) sections[k] = v;
  }
  return {
    orgId,
    name: org?.name || orgId,
    profileRev: await taxonomyRevision(orgId),
    taxonomy,
    sections,
  };
}

/**
 * THE ONE DERIVATION of "which revision of the customer is this branch built
 * from". It is a build input, so it belongs in `contentHashOf` — correcting a
 * customer's vocabulary has to stale every branch written in the old words.
 *
 * Every caller of `contentHashOf` must resolve it the SAME way or the console's
 * "Re-sync" warning becomes permanently un-clearable: two surfaces computing
 * two hashes for one branch never agree. That is why this is a function and
 * not three inline calls, and why the parameter is required rather than
 * optional — an omitted argument is exactly how the surfaces drift apart.
 *
 * It never throws. A store blip returns null, the hash changes, one prototype
 * re-syncs. Refusing to compute a cache key is the expensive failure.
 */
export async function brandBasis(orgId: string): Promise<string | null> {
  return taxonomyRevision(orgId);
}

/** The customer file the builder reads, resolved — never a template. */
export function renderCustomerMd(c: CustomerContext, provisionedAt: string): string {
  // Filtered HERE, not at the end: a trailing `.filter(Boolean)` over the whole
  // document eats the empty strings that are its blank lines, and markdown’s
  // lazy continuation then swallows the opening paragraph into the blockquote
  // above it. The brief renderer has that shape and gets away with it because
  // every line after it is a heading.
  const body = DELIVERED
    .map((k) => {
      const text = c.sections[k] ?? GAP[k];
      return text ? `## ${SECTION_LABEL[k]}\n${text}\n` : "";
    })
    .filter(Boolean);
  return [
    `<!-- OPMC-PROVISIONED · do NOT hand-edit · this is the customer as the console knows them · edit the brand profile in the console and Re-sync -->`,
    `# ${c.name}`,
    ``,
    `> Customer \`${c.orgId}\` · brand profile ${c.profileRev ? `\`${c.profileRev}\`` : "_unversioned_"} · provisioned ${provisionedAt}`,
    ``,
    // This sentence uses the customer's OWN noun, and that is not decoration:
    // a file whose job is to stop generic words reaching the page cannot open
    // by calling their people "visitors". The smoke suite asserts it.
    `Every word one of this customer’s ${c.taxonomy.visitorNounPlural} will read — copy, labels,`,
    `alt text, empty and error states — is written in these words. Nothing here is a`,
    `default: it is resolved from the console’s brand profile at provision time. If a`,
    `word below looks wrong, the profile is wrong — correcting it there corrects it`,
    `everywhere, including in prototypes already built.`,
    ``,
    `## Vocabulary`,
    taxonomyPrompt(c.taxonomy),
    ``,
    ...body,
  ].join("\n");
}
