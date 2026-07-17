/**
 * A Feature is an overlay: namespaced files + injection points that transform
 * a captured page. The SAME feature drives three outputs:
 *   - Deploy (clone + overlay on our Vercel)
 *   - Experiment (Optimizely variation on the live site)
 *   - Handoff (block-convention code for their devs)
 *
 * Stored as files under features/<key>/:
 *   feature.json   — this manifest
 *   overlay.css    — styles (optional)
 *   overlay.js     — behavior (optional)
 *   fragments/*.html — HTML snippets referenced by html injections (optional)
 */

export type InjectionMode = "before" | "after" | "prepend" | "append" | "replace";

export interface Injection {
  /** html: insert a fragment relative to a selector. css/js: attach a file. */
  type: "html" | "css" | "js";
  /** For html: fragment filename under fragments/. */
  fragment?: string;
  /** For css/js: filename in the feature dir (defaults overlay.css / overlay.js). */
  file?: string;
  /** For html: CSS selector of the anchor element on the page. */
  selector?: string;
  /** For html: where relative to the anchor. */
  mode?: InjectionMode;
}

export interface FeatureTarget {
  siteKey: string;
  slug: string;
  /** Pinned page version, or "latest". */
  version: string;
}

export type FeatureStatus = "draft" | "demo-ready" | "experimenting" | "handed-off";

export interface FeatureManifest {
  key: string;
  name: string;
  description?: string;
  status: FeatureStatus;
  /** Which captured pages this overlays (for deploy/preview). */
  targets: FeatureTarget[];
  /** Ordered injection points. */
  injections: Injection[];
  /** Live URLs the Optimizely experiment should run on (activation targeting). */
  liveUrls?: string[];
  createdAt: string;
  updatedAt: string;
}
