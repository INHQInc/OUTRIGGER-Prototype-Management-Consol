/**
 * Site = one website a customer runs experiments on: Customer → Site → Environment.
 * Decided by Bryan on 23 Sep 2026 (docs/HANDOFF.md → "IN FLIGHT — SITE").
 *
 * Everything about a website lives on its site: its words, voice, look and
 * experiments. The customer is only a container (users, connectors) — there is
 * no brand layer and nothing inherits. Every prototype belongs to exactly one
 * site, and its site comes from ITS RECORD, never from the sidebar cookie
 * (token and agent calls carry no cookie).
 *
 * NEW NAMES ONLY. The legacy `siteKey` (lib/sites.ts, `SiteConfig`) is a
 * different, load-bearing thing: the asset partition for brief attachments, the
 * old loader key, and `deleteSite(siteKey)`'s eight-table cascade. The Neon
 * table name `site` is taken by it, hence `org_site`.
 */

import type { SiteIndustry } from "./industries";

/** The broad kind of business, and the catalogue of them (./industries.ts). */
export type { SiteIndustry } from "./industries";
export { SITE_INDUSTRIES } from "./industries";

/**
 * Where the site's code lives. Optional at setup, REQUIRED TO BUILD a prototype
 * (Bryan, 23 Sep). Read only, always: Prism never writes to a customer's source.
 */
export type SiteSource =
  /** An entry in the customer's repo registry (org_repo), by id. */
  | { kind: "repository"; repoId: string }
  /** A folder on the operator's machine. The console in a browser cannot open
   *  it — only the build agent can — so it counts once the agent confirms it
   *  can read it. */
  | { kind: "local-folder"; path: string };

export interface Site {
  /**
   * `${orgId}--${slug}`. The double dash cannot appear inside an org id or a
   * slug (both collapse runs of non-alphanumerics to one "-"), so ids are unique
   * across customers by construction. Never "*" — that is the brand profile's
   * org-default sentinel (`ORG_DEFAULT_SITE_ID`).
   */
  id: string;
  orgId: string;
  /** Shown in the sidebar: "Hawaii Vacation Condos". */
  name: string;
  /** The site's address as an origin: "https://hawaiivacationcondos.outrigger.com". */
  url: string;
  industry?: SiteIndustry;
  source?: SiteSource;
  /**
   * "setup" until its setup flow is approved (the sidebar marks it);
   * "ready" after. A customer's starting site — made from the environments and
   * prototypes it already had — starts "ready".
   */
  status: "setup" | "ready";
  createdAt: string;
  updatedAt: string;
}
