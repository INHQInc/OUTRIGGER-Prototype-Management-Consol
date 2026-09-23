/**
 * BRAND ONBOARDING — the customer tier, written by a person.
 *
 * The first thing that happens to a new customer, and until 23 Sep 2026 the
 * only writer of a brand profile was a CLI script whose allowlist held one
 * customer. Provisioning already refused to build without a profile, so the
 * refusal pointed at a remedy nobody else could use. This is that remedy.
 *
 * WHAT A PERSON STATES, not what a crawl reads. The vocabulary (seven nouns),
 * how the brand sounds, who it serves, what it sells. No crawl and no model are
 * involved: these are facts only the customer can supply. What a read SEES —
 * fonts, palette, button labels — is the site tier, and comes later.
 *
 * TWO RULES THE STORE DOES NOT ENFORCE, SO THIS FILE DOES:
 *   1. An approved revision is never rewritten. Editing makes a DRAFT at the
 *      next revision; approving promotes that draft. `updateSiteProfile` is
 *      only ever called on a draft here — the store would happily patch an
 *      approved row, and every branch built on that revision would then be
 *      carrying words the record no longer shows.
 *   2. A draft is never served. `getSiteProfile` returns the latest APPROVED
 *      row in both backends, so drafting is safe while provisioning runs.
 */
import { getContentStore } from "../content/store";
import { ORG_DEFAULT_SITE_ID, TAXONOMY_FIELDS, missingTaxonomyFields } from "./profile";
import { EMPTY_OBSERVED, type SectionKey, type SiteProfile, type Taxonomy } from "./types";

export type TaxonomyField = (typeof TAXONOMY_FIELDS)[number];

/**
 * The prose a person states at the customer tier. `design` is deliberately
 * absent — it is what a read of the SITE sees, not something to describe from
 * memory — and so is `market`, which no consumer reads.
 */
export const STATED_SECTIONS = ["voice", "audience", "business"] as const satisfies readonly SectionKey[];
export type StatedSection = (typeof STATED_SECTIONS)[number];

export interface BrandStatus {
  /**
   * Can the console build for this customer right now? The same answer
   * `requireTaxonomy(orgId)` gives, derived from the same definition of
   * complete (`missingTaxonomyFields`) over the same row — the smoke suite
   * asserts the two agree, so the checklist cannot go green on a customer the
   * build gate refuses.
   */
  ready: boolean;
  /** What the LIVE revision lacks. Empty when ready. */
  missing: TaxonomyField[];
  /** What the builder reads today. */
  approved: SiteProfile | null;
  /** Edits in progress — newer than `approved`, not yet served to anything. */
  draft: SiteProfile | null;
}

async function profilesAt(orgId: string): Promise<{ approved: SiteProfile | null; draft: SiteProfile | null; maxRev: number }> {
  const store = await getContentStore();
  const all = await store.listSiteProfiles(orgId, ORG_DEFAULT_SITE_ID); // newest first
  const approved = all.find((p) => p.status === "approved") ?? null;
  const draft = all.find((p) => p.status === "draft" && p.rev > (approved?.rev ?? 0)) ?? null;
  return { approved, draft, maxRev: all[0]?.rev ?? 0 };
}

export async function brandStatus(orgId: string): Promise<BrandStatus> {
  const { approved, draft } = await profilesAt(orgId);
  const missing = approved ? missingTaxonomyFields(approved.taxonomy) : [...TAXONOMY_FIELDS];
  return { ready: Boolean(approved) && missing.length === 0, missing, approved, draft };
}

export interface BrandPatch {
  taxonomy?: Partial<Record<TaxonomyField, string | string[]>>;
  sections?: Partial<Record<StatedSection, string>>;
}

/** Trimmed, and an empty answer is ABSENT — never an empty string that reads as an answer. */
function cleanTaxonomy(t: BrandPatch["taxonomy"]): Partial<Taxonomy> {
  const out: Partial<Taxonomy> = {};
  for (const k of TAXONOMY_FIELDS) {
    const v = t?.[k];
    if (v === undefined) continue;
    if (k === "entityKinds") {
      const list = (Array.isArray(v) ? v : String(v).split(",")).map((x) => String(x).trim()).filter(Boolean);
      out.entityKinds = [...new Set(list)];
    } else {
      (out as Record<string, string>)[k] = String(v).trim();
    }
  }
  return out;
}

/** The comparable content of a revision — what a person actually stated. */
function content(p: Pick<SiteProfile, "taxonomy" | "sections"> | null): string {
  if (!p) return "";
  const t: Record<string, unknown> = {};
  for (const k of TAXONOMY_FIELDS) t[k] = p.taxonomy?.[k] ?? null;
  const s: Record<string, string | null> = {};
  for (const k of STATED_SECTIONS) s[k] = p.sections?.[k]?.trim() || null;
  return JSON.stringify({ t, s });
}

/**
 * Save what the person has typed so far. Durable from the first answer, so
 * leaving the screen loses nothing — and never served, so a half-written brand
 * cannot reach a branch.
 */
export async function saveBrandDraft(orgId: string, patch: BrandPatch, by: string): Promise<BrandStatus> {
  const store = await getContentStore();
  let { approved, draft, maxRev } = await profilesAt(orgId);

  if (!draft) {
    const now = new Date().toISOString();
    const rev = maxRev + 1;
    // Seeded from what is LIVE, so editing one word starts from the other six
    // rather than from nothing.
    draft = {
      id: `${orgId}-${ORG_DEFAULT_SITE_ID}-r${rev}`,
      orgId, siteId: ORG_DEFAULT_SITE_ID, rev, status: "draft",
      taxonomy: { ...(approved?.taxonomy ?? {}) },
      sections: { ...(approved?.sections ?? {}) },
      observed: { ...EMPTY_OBSERVED },
      sources: { urls: [], derivedAt: now, crawler: `stated by ${by}` },
      corrections: [],
      createdAt: now,
    };
    await store.addSiteProfile(draft);
  }

  const taxonomy: Partial<Taxonomy> = { ...draft.taxonomy, ...cleanTaxonomy(patch.taxonomy) };
  for (const k of TAXONOMY_FIELDS) {
    const v = taxonomy[k];
    if (Array.isArray(v) ? v.length === 0 : v !== undefined && !String(v).trim()) delete taxonomy[k];
  }
  const sections = { ...draft.sections };
  for (const k of STATED_SECTIONS) {
    if (patch.sections?.[k] === undefined) continue;
    const v = patch.sections[k]!.trim();
    // BLANK MEANS UNKNOWN. A section nobody could describe stays absent, and
    // the branch then carries an instruction to match the page rather than
    // invent a register — which is the honest version of "I don't know".
    if (v) sections[k] = v; else delete sections[k];
  }
  await store.updateSiteProfile(draft.id, { taxonomy, sections });
  return brandStatus(orgId);
}

export type ApproveResult =
  | { ok: true; status: BrandStatus; changed: boolean }
  | { ok: false; error: string; missing: TaxonomyField[] };

/**
 * Make the draft the live revision.
 *
 * Refuses while any vocabulary field is missing, naming each one — the same
 * definition the build gate uses, so an approved brand is always a buildable
 * one.
 *
 * AN UNCHANGED DRAFT DOES NOT BECOME A REVISION. The brand revision is part of
 * every branch's content hash, so a new revision tells every prototype for this
 * customer to re-sync. Approving without changing a word must not do that.
 */
export async function approveBrand(orgId: string, by: string): Promise<ApproveResult> {
  const store = await getContentStore();
  const { approved, draft } = await profilesAt(orgId);

  if (!draft) {
    const status = await brandStatus(orgId);
    return status.ready
      ? { ok: true, status, changed: false }
      : { ok: false, error: "There is nothing to approve yet — answer the questions first.", missing: status.missing };
  }

  const missing = missingTaxonomyFields(draft.taxonomy);
  if (missing.length) {
    return { ok: false, error: `Still needed before this can be used: ${missing.join(", ")}.`, missing };
  }

  if (approved && content(approved) === content(draft)) {
    await store.updateSiteProfile(draft.id, { status: "superseded" });
    return { ok: true, status: await brandStatus(orgId), changed: false };
  }

  // NEW FIRST, THEN RETIRE THE OLD. The other order leaves a moment with no
  // approved row, and every build and readout in that window refuses.
  await store.updateSiteProfile(draft.id, { status: "approved", approvedAt: new Date().toISOString(), approvedBy: by });
  if (approved) await store.updateSiteProfile(approved.id, { status: "superseded" });

  return { ok: true, status: await brandStatus(orgId), changed: true };
}
