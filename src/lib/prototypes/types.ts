/**
 * Prototype metadata — the store-backed record (Neon hosted / FS local).
 * This is the canonical brief/hypothesis/lifecycle schema an experiment
 * program needs. Overlay CODE (fragment/css/js) is authored/deployed
 * separately via the feature repo; this record is the source of truth for
 * everything about the prototype except its code.
 */

/**
 * Lifecycle stage — where the prototype is on its journey (see
 * docs/LIFECYCLE-ARCHITECTURE.md). The `status` field holds this. Advances
 * draft → review → live → shipped, or ends archived.
 */
export type PrototypeStage = "draft" | "review" | "live" | "shipped" | "archived";
export const PROTOTYPE_STAGES: PrototypeStage[] = ["draft", "review", "live", "shipped", "archived"];

/** Old status values → lifecycle stages (records predating the rename). */
const LEGACY_STAGE: Record<string, PrototypeStage> = {
  draft: "draft",
  "demo-ready": "review",
  experimenting: "live",
  "handed-off": "shipped",
};

export function normalizeStage(value: string | undefined): PrototypeStage {
  if (!value) return "draft";
  if ((PROTOTYPE_STAGES as string[]).includes(value)) return value as PrototypeStage;
  return LEGACY_STAGE[value] ?? "draft";
}

export const STAGE_LABEL: Record<PrototypeStage, string> = {
  draft: "Draft",
  review: "In review",
  live: "Live",
  shipped: "Shipped",
  archived: "Archived",
};
export const STAGE_TONE: Record<PrototypeStage, "neutral" | "ok" | "warn" | "danger" | "accent"> = {
  draft: "neutral",
  review: "accent",
  live: "warn",
  shipped: "ok",
  archived: "neutral",
};

export type TargetSource = "clone" | "live";

/** Persisted result of a per-page injection verification (Pages tab). */
export interface TargetInjection {
  /** present/confirmed = passing; wrong-env/absent/unreachable = not. */
  state: "present" | "wrong-env" | "absent" | "unreachable" | "confirmed";
  at: string;            // when it was checked/confirmed (ISO)
  by?: string;           // who ran it (user, "claude (api)", …)
  foundEnvLabel?: string; // for wrong-env
}

export interface PrototypeTarget {
  /** Page URL / path on the site the prototype targets. */
  url: string;
  /** clone = build against our snapshot; live = run on the real page. */
  source: TargetSource;
  /** Last injection verification for this page (persisted). */
  injection?: TargetInjection;
}

/** A page "injects" (passing) when its loader is proven present or human-confirmed. */
export function injectionPasses(t: PrototypeTarget): boolean {
  return t.injection?.state === "present" || t.injection?.state === "confirmed";
}

/** Structured brief — not a free-text blob. What Claude reads to build. */
/** A supporting link on the brief — Figma, a design file, a screenshot, a page. */
export type BriefReferenceKind = "figma" | "image" | "design" | "doc" | "link";
export interface BriefReference {
  url: string;
  label?: string;
  kind: BriefReferenceKind;
}

/**
 * Normalize what a person actually pastes into a full URL, or null if it can't
 * be one. Accepts bare domains and paths ("figma.com/file/…", "www.foo.com",
 * "example.co.uk/x"), infers https://, and keeps existing http(s) links. Rejects
 * plain words, other schemes (javascript:, data:, mailto:), and hosts with no
 * dot (except localhost).
 */
export function normalizeReferenceUrl(raw: string): string | null {
  let s = (raw ?? "").trim();
  if (!s || /\s/.test(s)) return null;
  const scheme = s.match(/^([a-z][a-z0-9+.-]*):\/\//i);
  if (scheme) {
    if (!/^https?$/i.test(scheme[1])) return null; // no javascript:/data:/ftp:/etc.
  } else if (/^[a-z][a-z0-9+.-]*:/i.test(s)) {
    return null; // scheme-like but not // (mailto:, tel:) — not a browsable link
  } else {
    s = `https://${s}`;
  }
  try {
    const u = new URL(s);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (!u.hostname.includes(".") && u.hostname !== "localhost") return null;
    return u.toString();
  } catch { return null; }
}

/** Classify a reference URL so the UI (and the building agent) can treat it right. */
export function referenceKind(url: string): BriefReferenceKind {
  const u = url.toLowerCase();
  if (/figma\.com|figma\.site/.test(u)) return "figma";
  if (/\.(png|jpe?g|gif|webp|svg|avif)(\?|#|$)/.test(u) || /(cloudinary|imgur|githubusercontent|screenshot)/.test(u)) return "image";
  if (/dribbble\.com|behance\.net|\.sketch(\?|#|$)|\.fig(\?|#|$)|\.xd(\?|#|$)|zeplin\.io|invisionapp/.test(u)) return "design";
  if (/docs\.google\.com|\.pdf(\?|#|$)|notion\.so|\.key(\?|#|$)|dropbox\.com|drive\.google/.test(u)) return "doc";
  return "link";
}

export interface PrototypeBrief {
  problem: string;       // problem / opportunity
  change: string;        // what it changes
  doneLooksLike: string; // definition of done (acceptance criteria, in words)
  where?: string;        // where on the page the change goes (anchor / selector hint)
  constraints?: string;  // guardrails / do-not-touch
  reference?: string;    // legacy free-text reference (superseded by references[])
  references?: BriefReference[]; // supporting links: Figma, design files, screenshots, pages
}

/** Canonical A/B hypothesis: "We believe [change] for [audience] will cause [outcome] because [rationale]." */
export interface PrototypeHypothesis {
  change: string;
  audience: string;
  outcome: string;
  rationale: string;
}

export interface PrototypeMetrics {
  primary: string;       // the metric you decide on
  guardrails: string[];  // what must not regress
}

/**
 * An immutable build of a prototype, pinned to a git SHA. This is the unit that
 * gets PROMOTED across environments unchanged — "build once, promote immutably"
 * (docs/LIFECYCLE-ARCHITECTURE.md). Append-only: versions are never edited, only
 * cut and superseded.
 */
export interface ArtifactVersion {
  id: string;
  prototypeKey: string;
  siteKey: string;        // denormalized for cascade on site delete
  version: number;        // monotonic per prototype (1, 2, 3, …)
  gitSha: string;         // the immutable pin
  gitRef?: string;        // branch/tag it was cut from
  /** Compiled overlay variation JS captured at cut time — the immutable code
   *  this version ships. Absent on legacy versions / when no overlay authored. */
  variationJs?: string;
  notes?: string;
  createdAt: string;
  createdBy?: string;
  /** QA-gate report from cut time (see lib/certify). Absent on legacy versions. */
  certification?: import("../certify/certify").CertificationReport;
}

/** Binding to the Optimizely experiment this prototype ships into.
 *  Set once from the Ship panel; the API push targets exactly this variation. */
export interface PrototypeExperimentBinding {
  experimentId: string;
  experimentName?: string;
  variationId: string;
  variationName?: string;
  boundAt: string;
  boundBy?: string;
}

/** Where this prototype's code lives — picked from the brand's repo registry. */
export interface PrototypeRepoRef {
  fullName: string;      // owner/repo
  branch: string;        // defaults to prototype/<key>
  artifactPath?: string; // defaults to the registry entry's artifactPath
}

export interface PrototypeRecord {
  key: string;
  /** Owning customer. Legacy records may lack it — resolve via prototypes/org.ts. */
  orgId?: string;
  /** Legacy: pre-refactor site linkage (kept for old records + cascades). */
  siteKey: string;
  name: string;
  /** Code location (brand registry pick). Absent on legacy records → site-binding fallback. */
  repo?: PrototypeRepoRef;
  /** The Optimizely experiment/variation this prototype ships into (API push target). */
  experiment?: PrototypeExperimentBinding;
  /** Lifecycle stage (see PrototypeStage). Normalize on read with normalizeStage(). */
  status: PrototypeStage;
  targets: PrototypeTarget[];
  brief: PrototypeBrief;
  hypothesis: PrototypeHypothesis;
  metrics: PrototypeMetrics;
  owner?: string;
  ticketUrl?: string;
  priority?: number;     // ICE/PIE-style 1–100
  createdAt: string;
  updatedAt: string;
}
