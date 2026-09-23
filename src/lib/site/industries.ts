/**
 * THE INDUSTRY CATALOGUE — every broad kind of business a site can be, with the
 * label and hint site setup shows.
 *
 * This file names industries on purpose: it is the list a person picks from,
 * not one customer's words. vocabulary-smoke exempts it BY NAME, and only it,
 * for that reason. The industry picks which questions setup asks; it never
 * supplies an answer, and anything written to a customer or a model still
 * resolves its words from the site's profile.
 */
export type SiteIndustry = "hospitality" | "retail" | "software" | "services" | "nonprofit" | "media" | "other";

export interface IndustryOption {
  id: SiteIndustry;
  label: string;
  hint: string;
}

/** In the order setup lists them. Labels are the plain words a marketer would use. */
export const SITE_INDUSTRY_OPTIONS: readonly IndustryOption[] = [
  { id: "hospitality", label: "Hospitality", hint: "Hotels, vacation rentals, cruises, tours" },
  { id: "retail", label: "Retail", hint: "Online and in-store shopping" },
  { id: "software", label: "Software & subscriptions", hint: "Apps, plans, free trials" },
  { id: "services", label: "Services & lead generation", hint: "Quotes, appointments, inquiries" },
  { id: "nonprofit", label: "Non-profit", hint: "Donations, volunteering, membership" },
  { id: "media", label: "Media & publishing", hint: "Articles, newsletters, subscriptions" },
  { id: "other", label: "Other", hint: "We'll ask general questions only." },
];

export const SITE_INDUSTRIES: readonly SiteIndustry[] = SITE_INDUSTRY_OPTIONS.map((o) => o.id);
