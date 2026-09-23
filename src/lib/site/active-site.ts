/**
 * The site selected in the sidebar (cookie `opmc_site`), mirroring the
 * customer switcher (`opmc_org`, lib/active-org.ts).
 *
 * UI SCOPING ONLY: which prototypes and environments a page lists, and which
 * site a new one is created in. NEVER use it for anything keyed to an existing
 * prototype — its site is on its record (`resolvePrototypeSite`), and token and
 * agent calls carry no cookie. Reading the cookie there would flip branch sync
 * hashes and re-provision agents in a loop (docs/HANDOFF.md, "Traps").
 *
 * Exactly one site is always selected when the customer has any: the cookie's
 * site if it belongs to the active customer, otherwise its first site. A
 * cookie left over from another customer therefore falls back, which is also
 * how "switching customer resets the site" works.
 */
import { cache } from "react";
import { cookies } from "next/headers";
import { listSites } from "./sites";
import type { Site } from "./types";

export const SITE_COOKIE = "opmc_site";

/** Memoised per request: the layout and the page both ask. */
export const getActiveSite = cache(async (orgId: string | null): Promise<{ site: Site | null; sites: Site[] }> => {
  if (!orgId) return { site: null, sites: [] };
  const sites = await listSites(orgId);
  if (!sites.length) return { site: null, sites };
  const val = (await cookies()).get(SITE_COOKIE)?.value;
  return { site: sites.find((s) => s.id === val) ?? sites[0], sites };
});
