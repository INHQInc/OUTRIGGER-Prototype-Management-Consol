/**
 * SITE CONTEXT — what the builder agent knows about a SITE, and where each
 * piece of it came from. The customer is a container: a name, its sites, its
 * people and its connections. Nothing is characterized at the customer level,
 * because a crawl is of a site and a hotel group's properties do not share a
 * voice.
 *
 * Three kinds of knowledge, never one blob (docs/architecture/CONTEXT-INGESTION.md):
 *
 *   OBSERVED       fact, re-derivable        the crawl: fonts, colours, pages, CTAs
 *   CHARACTERIZED  inference, needs a human  prose drafted from the observed; the interview corrects it
 *   EARNED         measured, immutable       a digest of this site's own recorded decisions
 *
 * Only the middle one becomes a skill. The observed layer is data the agent reads;
 * the earned layer is a query rendered as sentences.
 *
 * WHAT IS REAL AND WHAT IS NOT in the observed fixture. The fonts, the custom
 * properties and who owns them, the palette names, the top colours by use, the
 * button labels, the headlines, the stylesheet list and the media counts were
 * derived from the prep.outrigger.com HOME PAGE and its five stylesheets on
 * 10 Sep 2026 with `deriveDesignTokens()` plus a stylesheet pass. (A first run
 * resolved main.css against www., which the WAF blocks for Node, and reported
 * zero brand variables — the corrected pass against prep. found 1,398.) The
 * page map (412 found, 38 read, the kinds chosen) and the component list are
 * what a bounded crawl WOULD produce and are illustrative — the crawl itself
 * has not been built (CONTEXT-INGESTION.md, "Missing · 1"). The most useful
 * real findings are the awkward ones: the primary button's style belongs to
 * the booking-widget vendor's stylesheet, not the brand's; Bootstrap's own
 * blue is used almost as often as the brand's; and three type families are
 * loaded with nothing to say which is for headlines. Each became a question,
 * because a crawl can see them and cannot decide them.
 *
 * The read fixture is outrigger.com's. In the mock, reading any other site
 * shows the same receipt under that site's name — there is one real crawl,
 * not three.
 */

export type SectionKey = "business" | "guests" | "market" | "voice" | "design";

export const SECTION_LABEL: Record<SectionKey, string> = {
  business: "What this site sells",
  guests: "Who it serves",
  market: "Market & competitors",
  voice: "Voice & tone",
  design: "Design language",
};

/* ── Observed ─────────────────────────────────────────────────────── */

export interface ObservedFont { family: string; faces: string[]; declarations: number; loaded: "self-hosted" | "google" }
export interface ObservedColour { hex: string; uses: number; origin: "brand" | "framework" | "widget"; name?: string }

export const OBSERVED = {
  domain: "outrigger.com",
  readFrom: "prep.outrigger.com",
  readAt: "10 Sep 2026 09:41",
  mapped: 412,
  budget: 40,
  read: 38,
  seconds: 41,
  chosen: [
    { kind: "Home", n: 1 },
    { kind: "Property pages", n: 14 },
    { kind: "Rooms & suites", n: 6 },
    { kind: "Offers", n: 5 },
    { kind: "Destinations", n: 5 },
    { kind: "Dining, activities, weddings", n: 4 },
    { kind: "About, DISCOVERY loyalty, contact", n: 3 },
  ],
  skipped: "374 pages skipped: press releases, legal, individual blog stories, paginated listings — one of each template is enough to learn the template.",
  stylesheets: [
    { url: "/dist/css/main.css", own: true, note: "the site's stylesheet — Bootstrap 5 with the brand layered on top" },
    { url: "/dist/css/modal-video.min.css", own: true, note: "video lightbox" },
    { url: "be.synxis.com/…/shs-widgets-best-price", own: false, note: "booking widget (vendor)" },
    { url: "be.synxis.com/…/shs-widgets-calendar", own: false, note: "rate calendar (vendor)" },
    { url: "be.synxis.com/…/shs-widgets-search-bar", own: false, note: "search bar (vendor)" },
  ],
  fonts: [
    { family: "Duplicate Sans", faces: ["Light", "Regular", "Medium", "Bold", "Black"], declarations: 142, loaded: "self-hosted" },
    { family: "Duplicate Ionic", faces: ["Light", "Regular", "Medium", "Bold", "Bold Italic", "Black"], declarations: 76, loaded: "self-hosted" },
    { family: "Montserrat", faces: ["Light", "Regular", "Medium", "Bold"], declarations: 267, loaded: "self-hosted" },
  ] as ObservedFont[],
  // Names are the site's own --clr-* variable names, not ours.
  colours: [
    { hex: "#004561", uses: 73, origin: "brand", name: "--clr-deep-turquoise" },
    { hex: "#0b2f47", uses: 31, origin: "brand", name: "--clr-turquoise" },
    { hex: "#0078cd", uses: 43, origin: "brand", name: "--clr-light-blue" },
    { hex: "#00b9ff", uses: 30, origin: "brand", name: "--clr-link-blue" },
    { hex: "#0099e6", uses: 14, origin: "brand", name: "--clr-blog-post-hover" },
    { hex: "#252525", uses: 77, origin: "brand", name: "--clr-black-rock" },
    { hex: "#aaa096", uses: 21, origin: "brand", name: "unnamed — used, never declared" },
    { hex: "#cdc3b3", uses: 13, origin: "brand", name: "--clr-light-brown1" },
    { hex: "#f1efed", uses: 18, origin: "brand", name: "--clr-sand" },
    { hex: "#300b5c", uses: 21, origin: "brand", name: "--clr-purple-gradient1" },
    { hex: "#0d6efd", uses: 38, origin: "framework", name: "Bootstrap blue" },
    { hex: "#6c757d", uses: 30, origin: "framework", name: "Bootstrap grey" },
    { hex: "#dc3545", uses: 26, origin: "framework", name: "Bootstrap red" },
    { hex: "#198754", uses: 24, origin: "framework", name: "Bootstrap green" },
    { hex: "#309ab5", uses: 9, origin: "widget", name: "calendar selection" },
    { hex: "#007b94", uses: 7, origin: "widget", name: "widget teal" },
  ] as ObservedColour[],
  /** Custom properties, by who declares them. main.css alone declares 1,398. */
  variables: {
    palette: { prefix: "--clr-*", n: 46 },
    framework: { prefix: "--bs-*", n: 355 },
    components: { prefix: "--card-* --hero-* --property-* …", n: 997 },
    widget: { prefix: "--shs-widgets-*", n: 60 },
  },
  ctas: [
    { label: "Check availability", count: 9 },
    { label: "Book Now", count: 3 },
    { label: "See all offers", count: 2 },
    { label: "Best rate guarantee", count: 2 },
    { label: "Learn more", count: 2 },
    { label: "Explore", count: 1 },
  ],
  headlines: ["Ocean views on sale", "Come be here.", "Where should you go next?"],
  meta: {
    title: "OUTRIGGER Resorts & Hotels",
    description: "Premier beachfront resorts in Hawaii, Fiji, Thailand and Mauritius. Vacation condos in Hawaii on Oahu, Maui, Kauai and the Big Island of Hawaii.",
  },
  media: { images: 56, videos: 3 },
  components: [
    "Hero with video", "Property card", "Offer card", "Rate calendar (vendor)", "Search bar (vendor)",
    "Best-price badge (vendor)", "Destination tile", "Story card", "Email sign-up", "Footer", "Sticky booking bar",
  ],
  widgetTokens: { radius: "1rem", buttonCase: "uppercase", buttonBorder: "3px solid", focus: "0 0 0 3px #309ab5" },
} as const;

/* ── Characterized ────────────────────────────────────────────────── */

export interface Section {
  key: SectionKey;
  /** Prism's draft, written from the observed. */
  body: string;
  /** Honest confidence in the draft, 0–100. The interview moves it; a human edit settles it. */
  confidence: number;
  /** Where the draft came from. */
  from: string[];
  /** Prism naming its own weakest guess. */
  unsure?: string;
}

export const DRAFT_SECTIONS: Section[] = [
  {
    key: "business",
    confidence: 62,
    from: ["38 pages", "the page titles and descriptions", "the DISCOVERY loyalty pages"],
    body: "outrigger.com sells stays at a beachfront resort operator's properties — Hawaii first (Oʻahu, Maui, Kauaʻi, the Big Island), then Fiji, Thailand and Mauritius — with a second, quieter business in Hawaiian vacation condos on the same site. It sells stays, not rooms: place before price, the beach before the building. A loyalty programme, DISCOVERY, runs across the properties and has its own rate tier.",
    unsure: "Whether the vacation condos share this site's voice, or are a separate business that happens to share its header. The pages don't say.",
  },
  {
    key: "guests",
    confidence: 40,
    from: ["the photography", "the offers pages", "the loyalty pages"],
    body: "Leisure travellers planning a beach holiday weeks or months out — the pages assume time, not urgency. Families, couples and returning members are addressed in equal measure; nothing on the site favours one. Most traffic is presumed to be US mainland, from the currency, the phone numbers and the destination framing.",
    unsure: "Which guest matters most. The site speaks to everyone equally, which usually means somebody has an answer that isn't written down.",
  },
  {
    key: "market",
    confidence: 22,
    from: ["the 'Best rate guarantee' promise", "the direct-booking incentives"],
    body: "The site is built to win the direct booking: a best-rate guarantee, member-only rates and a 'why book direct' argument are on every property page. That posture implies the real competitor is the online travel agent, not another hotel — but no page names one, because nobody's does.",
    unsure: "Everything. Competitors cannot be read off a website. This section is a guess until somebody says who they lose bookings to.",
  },
  {
    key: "voice",
    confidence: 70,
    from: ["headlines and body copy on 38 pages", "the 'Come be here.' line"],
    body: "Warm, unhurried and second-person — 'come be here', not 'book your escape'. Speaks about places before prices and about the water before the rooms. Guests are 'guests'. Hawaiian place names keep their diacriticals (Waikīkī, Kaʻanapali). Sale language exists ('Ocean views on sale') but scarcity language does not: no countdowns, no 'only 2 rooms left', nothing that rushes.",
    unsure: "Whether the absence of urgency copy is a rule or an accident. It reads like a rule.",
  },
  {
    key: "design",
    confidence: 68,
    from: ["main.css", "the three vendor stylesheets", "56 images and 3 videos on the home page alone"],
    body: "Photography-led: full-bleed imagery and video carry the page, and the type stays out of the way. Three families are loaded — Duplicate Sans, Duplicate Ionic and Montserrat — with Montserrat Light doing most of the work. The stylesheet names its own palette: a deep turquoise (#004561) and a light blue (#0078cd) on white and a warm sand (#f1efed), with coral and seafoam for accents. Corners are soft (1rem on the booking widget). The most common action on the page is 'Check availability', set in uppercase with a heavy 3px border — but that button belongs to the booking-widget vendor, not the site's own stylesheet.",
    unsure: "Which family is the headline face — counts can't tell roles. And whether Bootstrap's own blue (#0d6efd, used 38 times) is ever meant to be visible, or is a leak.",
  },
];

/* ── The interview ────────────────────────────────────────────────── */

export interface Option {
  id: string;
  label: string;
  /** What choosing this does — said before the click, never after. */
  hint: string;
  delta: Partial<Record<SectionKey, number>>;
  tone: "ok" | "warn";
  /** A sentence the answer adds to a section. Appended, never silently replacing. */
  adds?: Partial<Record<SectionKey, string>>;
  /** An answer can reveal that Prism knows LESS than it thought. */
  opens?: Partial<Record<SectionKey, string>>;
}

export interface Question {
  id: string;
  round: 1 | 2 | 3;
  section: SectionKey;
  short: string;
  ask: string;
  /** Why the crawl could not settle this — the reason a person is being asked. */
  because: string;
  options?: Option[];
  /** Free-text questions: the only source is the person. */
  free?: { placeholder: string; suggestions: string[]; delta: number; adds: (answer: string) => string };
}

export const QUESTIONS: Question[] = [
  {
    id: "scope", round: 1, section: "business", short: "one voice or two",
    ask: "The home page sells two things: beachfront resorts in Hawaii, Fiji, Thailand and Mauritius — and vacation condos in Hawaii. One site with one voice, or two businesses that should read differently?",
    because: "The pages share a header and a stylesheet, so the crawl can't tell a sub-brand from a page template.",
    options: [
      { id: "one", label: "One site, one voice", hint: "Everything Prism drafted applies to every page.", tone: "ok", delta: { business: 14, voice: 6 },
        adds: { business: "The vacation condos are the same business and speak in the same voice." } },
      { id: "two", label: "Resorts and condos should read differently", hint: "Understanding falls: the agent now needs to know which pages are which.", tone: "warn", delta: { business: 6, voice: -8 },
        opens: { voice: "Two voices on one site. Prism has one draft. Which pages are condos has to be marked before a condo page is ever built against." } },
      { id: "resorts", label: "Only the resorts are in scope for testing", hint: "Condo pages are left alone. Nothing about them is needed.", tone: "ok", delta: { business: 16, voice: 4 },
        adds: { business: "Vacation condos are out of scope for experiments; nothing is built on their pages." } },
    ],
  },
  {
    id: "cta", round: 1, section: "design", short: "the primary action",
    ask: "Nine buttons on the home page say “Check availability” and three say “Book Now”. Which is the primary action the agent should reuse when it needs one?",
    because: "Counts say which is more common, not which is correct. The three “Book Now” buttons might be the newer standard or the older leftover.",
    options: [
      { id: "check", label: "Check availability", hint: "The agent reuses this label and this button style.", tone: "ok", delta: { design: 10 },
        adds: { design: "The primary action is “Check availability”; “Book Now” is legacy and is not reused." } },
      { id: "book", label: "Book Now", hint: "The agent reuses this label — the nine others are the ones to retire.", tone: "ok", delta: { design: 10 },
        adds: { design: "The primary action is “Book Now”; “Check availability” is being retired and is not reused." } },
      { id: "depends", label: "Depends where it sits", hint: "Understanding rises less: the agent will ask each time.", tone: "warn", delta: { design: 3 },
        opens: { design: "No single primary action. Every brief that adds a button has to say which one." } },
    ],
  },
  {
    id: "guest", round: 1, section: "guests", short: "the guest you want more of",
    ask: "Who is the guest you most want more of on this site?",
    because: "The pages speak to families, couples and returning members in equal measure, so the site itself doesn't say. Only you do.",
    free: {
      placeholder: "Direct bookers who would otherwise go through Expedia…",
      suggestions: ["Direct bookers who'd otherwise use an OTA", "Returning DISCOVERY members", "First-time Hawaii visitors from the US mainland"],
      delta: 34,
      adds: (a) => `The guest this site most wants more of, in your words: “${a}”. Experiments are aimed here first.`,
    },
  },
  {
    id: "type", round: 2, section: "design", short: "which face is for headlines",
    ask: "Three type families are loaded — Duplicate Sans, Duplicate Ionic and Montserrat — and Montserrat Light is the one the stylesheet uses most. Which one is the headline face?",
    because: "A stylesheet says how often a face is used, not what it is for. The agent will set a headline in the wrong family if nobody says.",
    options: [
      { id: "ionic", label: "Duplicate Ionic for headlines, Montserrat for everything else", hint: "Duplicate Sans becomes the accent face.", tone: "ok", delta: { design: 9 },
        adds: { design: "Headlines are set in Duplicate Ionic; body and interface copy in Montserrat; Duplicate Sans is used for accents only." } },
      { id: "sans", label: "Duplicate Sans for headlines, Montserrat for everything else", hint: "Duplicate Ionic becomes the accent face.", tone: "ok", delta: { design: 9 },
        adds: { design: "Headlines are set in Duplicate Sans; body and interface copy in Montserrat; Duplicate Ionic is used for accents only." } },
      { id: "dunno", label: "I don't know — ask the design team", hint: "Recorded as unknown. The agent will ask before setting a headline.", tone: "warn", delta: { design: 0 },
        opens: { design: "Headline face unknown. The agent must match the nearest existing headline on the page rather than choose a family." } },
    ],
  },
  {
    id: "competitors", round: 2, section: "market", short: "who you lose bookings to",
    ask: "Who does this site lose bookings to?",
    because: "No page names a competitor — nobody's does. This is the one section a crawl can't write.",
    free: {
      placeholder: "Expedia and Booking.com for the same room; Marriott and Hilton in Waikiki…",
      suggestions: ["Expedia and Booking.com, for our own rooms", "Marriott and Hilton in Waikīkī", "Airbnb, for the condos"],
      delta: 52,
      adds: (a) => `Bookings are lost to: ${a}. The direct-booking argument on every page is aimed at exactly this.`,
    },
  },
  {
    id: "urgency", round: 3, section: "voice", short: "urgency copy",
    ask: "The home page's only urgency copy is “Ocean views on sale”. No countdowns, no “only 2 left”. Is that a rule the agent must keep, or an accident?",
    because: "Absence is not a rule until somebody says it is. Urgency is also the first thing an experiment-writing agent reaches for.",
    options: [
      { id: "rule", label: "A rule — never manufacture urgency", hint: "The agent may not add countdowns, scarcity or pressure copy. Sales are fine.", tone: "ok", delta: { voice: 14 },
        adds: { voice: "Rule: never manufacture urgency. No countdowns, no room counts, no “ends soon”. A genuine sale may be named as a sale." } },
      { id: "sale", label: "Sale language is fine; scarcity is not", hint: "Same as the rule, said more precisely.", tone: "ok", delta: { voice: 14 },
        adds: { voice: "Rule: sale language is allowed; scarcity language is not — no room counts, no countdowns." } },
      { id: "anything", label: "Anything goes", hint: "Understanding rises less: this widens what the agent may write, and reviewers will see more of it.", tone: "warn", delta: { voice: 5 },
        adds: { voice: "Urgency copy is permitted; the reviewer decides case by case." } },
    ],
  },
  {
    id: "bootstrap", round: 3, section: "design", short: "the framework blue",
    ask: "Bootstrap's own blue (#0d6efd) appears 38 times in the stylesheet beside the brand blue (#0078cd). Should it ever show on the page?",
    because: "The crawl can see both blues; it can't see which one a designer meant. Getting this wrong makes a variation look one framework-version off.",
    options: [
      { id: "never", label: "Never — that's a leak from the framework", hint: "The agent uses #0078cd and treats #0d6efd as a defect to avoid.", tone: "ok", delta: { design: 7 },
        adds: { design: "Bootstrap's default blue (#0d6efd) is a framework leak and is never used; the brand blue is #0078cd." } },
      { id: "forms", label: "It's fine in forms and focus rings", hint: "The agent may use it where Bootstrap already does.", tone: "ok", delta: { design: 5 },
        adds: { design: "Bootstrap's blue (#0d6efd) is acceptable on form controls and focus rings only." } },
    ],
  },
];

export const ROUNDS = 3;

/** Enough to build with — and the ceiling of what asking can reach. The rest is earned. */
export const BUILD_THRESHOLD = 80;

export const BANDS = [
  { min: 90, label: "Ready", tone: "ok" as const },
  { min: BUILD_THRESHOLD, label: "Enough to build with", tone: "accent" as const },
  { min: 55, label: "Taking shape", tone: "warn" as const },
  { min: 0, label: "Getting oriented", tone: "muted" as const },
];

export const bandFor = (n: number) => BANDS.find((b) => n >= b.min) ?? BANDS[BANDS.length - 1];

/* ── Per-site state: answers, revisions, what has been earned ─────── */

export type Answer = { option?: string; text?: string; skipped?: boolean };
export type Answers = Record<string, Answer>;

export interface Revision { r: number; when: string; who: string; what: string; pinnedBy: number }
export interface Earned { claim: string; range: string; decisions: string[] }

export interface SiteContext {
  /** The interview as it stands. A site with unanswered rounds is "not finished". */
  answers: Answers;
  /** Whether every section has been checked by a person. */
  approved: boolean;
  /** A note a person handed Prism, kept as provenance on the voice section. */
  voiceNote?: string;
  revisions: Revision[];
  earned: Earned[];
}

/** Keyed by site id (see SITE_ROWS in fake.ts). A site with no entry has never been read. */
export const SITE_CONTEXT: Record<string, SiteContext> = {
  outrigger: {
    answers: {
      scope: { option: "one" }, cta: { option: "check" }, guest: { text: "Direct bookers who would otherwise book the same room through Expedia" },
      type: { option: "ionic" }, competitors: { text: "Expedia and Booking.com for our own rooms; Marriott and Hilton in Waikīkī" },
      urgency: { option: "rule" }, bootstrap: { option: "never" },
    },
    approved: true,
    voiceNote: "we never say luxury",
    revisions: [
      { r: 1, when: "12 Mar 2026", who: "Bryan Hopkins · Prism", what: "Read at onboarding. 38 pages, 7 questions answered.", pinnedBy: 2 },
      { r: 2, when: "14 Mar 2026", who: "Dana Reyes", what: "Corrected Voice & tone — “we never say luxury”.", pinnedBy: 3 },
      { r: 3, when: "3 Sep 2026", who: "Malia K. · Prism", what: "Re-read after the new header shipped. Design language updated; nothing else moved.", pinnedBy: 2 },
    ],
    earned: [
      { claim: "Removing a call to action that competes with the primary booking action has won 2 of 3 attempts.", range: "+2.4% to +4.1%", decisions: ["Rate-calendar best-price promise", "Room compare"] },
      { claim: "Offer badges in the hero have never won.", range: "3 runs, none confirmed", decisions: ["Header best-price badge", "Hero offer ribbon", "Kaanapali urgency banner"] },
      { claim: "Guests on mobile do not scroll past the third property tile.", range: "seen in 5 of 5 runs", decisions: ["Destination reorder", "Property card compare"] },
    ],
  },
  kona: {
    // Read, first round answered, then whoever was doing it got pulled away.
    answers: { scope: { option: "one" }, cta: { option: "check" }, guest: { skipped: true } },
    approved: false,
    revisions: [
      { r: 1, when: "8 Sep 2026", who: "Malia K. · Prism", what: "Read at onboarding. Interview stopped after round 1 — nothing approved yet.", pinnedBy: 0 },
    ],
    earned: [],
  },
};

export interface OutputFile { name: string; layer: "observed" | "characterized" | "earned"; detail: string }

export const OUTPUT_FILES: OutputFile[] = [
  { name: "context.md", layer: "characterized", detail: "the five sections, as approved — the only one of these that is a skill" },
  { name: "design-tokens.md", layer: "observed", detail: "15 font faces · 10 brand colours · 60 widget variables · the z-index ladder" },
  { name: "pages.json", layer: "observed", detail: "38 pages · 11 repeated components · selectors for each" },
  { name: "evidence.md", layer: "earned", detail: "empty until the first decision is recorded — then it never stops growing" },
];
