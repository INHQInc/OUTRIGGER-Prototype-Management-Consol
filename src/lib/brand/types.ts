/**
 * WHAT PRISM KNOWS ABOUT A SITE — the three kinds of knowledge, kept apart.
 *
 * This is the Beta-2 context model (docs/architecture/CONTEXT-INGESTION.md)
 * landed on trunk. The correction it encodes is that a brand profile is not one
 * blob: three kinds of knowledge with different truth conditions must not share
 * a lifecycle.
 *
 *   OBSERVED       fact, re-derivable        the crawl: fonts, colours, pages, CTAs
 *   CHARACTERIZED  inference, needs a human  prose drafted from the observed
 *   EARNED         measured, immutable       what this site's own experiments proved
 *
 * Only the middle one is approved by a person, because only the middle one is a
 * guess. The observed layer is re-read rather than corrected. The earned layer
 * is a query over stamped verdicts and lives in `BrandFact`, not here, because
 * it accrues continuously while a profile is pinned at a revision.
 *
 * WHY REVISIONS. A profile derived in March and used in September is a
 * liability, and "what did the AI know when it built this" is the first
 * question a buyer asks. So a profile is IMMUTABLE once approved and re-reading
 * makes r2 — it never rewrites r1. An experiment records the revision it built
 * against, and that answer stays true forever.
 */

/**
 * THE TAXONOMY — this site's own nouns.
 *
 * Prism is vertical-neutral: it works for any website, and the profile learns a
 * vertical rather than the product assuming one. Every default here is the
 * neutral word. A hotel's profile says "guests"; a clinic's says "patients";
 * neither is in the code.
 *
 * This exists because the assumption was previously hardcoded in 18 places in
 * `src/lib/ai/**`, including inside a derivation rather than a prompt
 * (`readoutStructure()` wrote "guests take this step MORE" into the reasoning
 * chain the model is told to answer from). A word baked into a derivation
 * cannot be fixed by editing a prompt.
 */
export interface Taxonomy {
  /** The people who arrive. Neutral default: visitor / visitors. */
  visitorNoun: string;
  visitorNounPlural: string;
  /** What the site offers. Neutral default: product / products. */
  offeringNoun: string;
  offeringNounPlural: string;
  /** The verb for the action the business wants. Neutral default: convert. */
  primaryAction: string;
  /** Where that action completes, in the brand's words. Default: checkout. */
  conversionSurface: string;
  /**
   * The kinds of thing this site's content is organised by, in the site's own
   * words — "room", "property", "itinerary" for one brand; "plan", "case
   * study" for another. Drafted from the crawl, corrected by a human. Drives
   * how the builder and the analyst name what they are looking at.
   */
  entityKinds: string[];
}

/** Vertical-neutral. Never hospitality, never retail — the profile supplies the vertical. */
export const DEFAULT_TAXONOMY: Taxonomy = {
  visitorNoun: "visitor",
  visitorNounPlural: "visitors",
  offeringNoun: "product",
  offeringNounPlural: "products",
  primaryAction: "convert",
  conversionSurface: "checkout",
  entityKinds: [],
};

/**
 * The characterized sections. Deliberately NOT the Beta-2 key set, which had
 * `guests` as a section name — the hospitality assumption sitting inside the
 * thing built to remove it. `audience` is the neutral word.
 */
export type SectionKey = "business" | "audience" | "market" | "voice" | "design";

export const SECTION_LABEL: Record<SectionKey, string> = {
  business: "What it does",
  audience: "Who it serves",
  market: "Who it competes with",
  voice: "How it speaks",
  design: "How it looks",
};

/** Facts from the crawl. Re-derivable, never approved — re-read rather than corrected. */
export interface ObservedFacts {
  /** Font families actually loaded, in load order. */
  fonts: string[];
  /** CSS custom properties that belong to the brand, name → value. */
  brandVariables: Record<string, string>;
  /** Top colours by frequency of use, most used first. */
  palette: { value: string; uses: number; source?: string }[];
  /** Button and link labels seen, most frequent first — the site's own verbs. */
  ctaLabels: string[];
  /** Headlines read, for voice characterization. */
  headlines: string[];
  /** Repeated components detected, by inferred name. */
  components: string[];
  /** Pages the crawl found vs actually read. */
  pagesFound: number;
  pagesRead: number;
  /**
   * Findings the crawl could see and could not decide — these become the
   * interview questions. Keeping the awkward ones is the point: on one real
   * site every colour variable belonged to a widget vendor, not the brand.
   */
  unsettled: { finding: string; whyItMatters: string }[];
}

export const EMPTY_OBSERVED: ObservedFacts = {
  fonts: [],
  brandVariables: {},
  palette: [],
  ctaLabels: [],
  headlines: [],
  components: [],
  pagesFound: 0,
  pagesRead: 0,
  unsettled: [],
};

/** A human making the inference true. Kept verbatim — corrections are the most valuable content here. */
export interface Correction {
  at: string;
  by: string;
  section: SectionKey | "taxonomy";
  /** What the person said, in their words. Never summarised. */
  note: string;
}

/**
 * One pinned revision of what Prism understands about one site.
 * Immutable once `status` is "approved". Re-reading makes rev + 1.
 */
export interface SiteProfile {
  id: string;
  orgId: string;
  /**
   * Stable id for the site. An environment id where one exists, otherwise the
   * normalised origin. The unit of characterization is the SITE, not the
   * customer, because a crawl is of a site and two sites of one customer do
   * not share a voice. Customer-level defaults are inherited, never observed.
   */
  siteId: string;
  rev: number;
  status: "draft" | "approved" | "superseded";
  /**
   * What THIS site says about itself, sparsely. Only fields a crawl settled or
   * a human corrected are present, so a site that named only its visitors still
   * inherits its customer's product noun. Resolution fills the gaps; storing a
   * fully-populated object here would silently overwrite every inherited value
   * with a neutral default.
   */
  taxonomy: Partial<Taxonomy>;
  /** Characterized prose per section — a draft until a person accepts it. */
  sections: Partial<Record<SectionKey, string>>;
  observed: ObservedFacts;
  /** Provenance. A profile without source URLs and a date is not auditable. */
  sources: { urls: string[]; derivedAt: string; crawler: string };
  corrections: Correction[];
  createdAt: string;
  approvedAt?: string;
  approvedBy?: string;
}

/**
 * THE EARNED LAYER — one measured fact this site's own experiments produced.
 *
 * Append-only, because a measurement does not stop being true. Superseding is a
 * pointer, never an edit. This is the layer a competitor with a crawler cannot
 * copy: it did not exist until the experiment ran.
 */
export interface BrandFact {
  id: string;
  orgId: string;
  siteId: string;
  /** The region of a page this is about, where one applies. */
  surfaceId?: string;
  kind:
    | "baseline"    // the control arm's observed rate for a metric
    | "ruled-out"   // a tight interval around zero: this direction does not move it
    | "unresolved"  // a wide interval: not settled, worth retrying with more traffic
    | "won"         // a direction that moved the decision metric
    | "preference"; // a durable human instruction about this site
  subject: string;
  predicate: string;
  value: unknown;
  sourceType: "verdict" | "human" | "crawl";
  /** The prototype key or verdict id this came from — every claim traces back. */
  sourceId: string;
  observedAt: string;
  /**
   * Proven nulls decay. A direction ruled out in March on a page that has since
   * been redesigned is not evidence. Baselines decay faster than wins.
   */
  expiresAt?: string;
  supersededBy?: string;
}
