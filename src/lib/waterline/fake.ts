/**
 * A fake Outrigger programme — enough reality to judge the UX by.
 *
 * Shaped like the real model on purpose: an experiment is an ordered list of
 * ENTRIES, each attributed and timestamped, some of them SEALED (a frozen brief
 * revision, a build SHA, the freeze at run-open, a stamp). Swapping this module
 * for live data should not change a single component.
 */

export type Role = "Author" | "Builder" | "Reviewer" | "Approver" | "Admin";

export interface Entry {
  at: string;
  who: string;
  role: Role | "Prism";
  /** Sealed entries are immutable facts and render as receipts, not prose. */
  sealed?: boolean;
  /** The heaviest object on the page: what a run is judged against. */
  freeze?: boolean;
  body: string;
  /** Rendered under the body in mono — revision ids, SHAs, timestamps. */
  seal?: string;
  diff?: { from: string; to: string; label: string };
}

export type TurnKind = "stamp" | "review" | "answer" | "idle" | "system";

export interface Experiment {
  id: string;
  property: string;
  path: string;
  title: string;
  /** Present when this experiment is waiting on someone. */
  turn?: {
    kind: TurnKind;
    role: Role;
    /** Why this is on your desk, in one sentence. */
    because: string;
    hypothesis?: string;
    frozenAt?: string;
    numbers?: { value: string; label: string; tone?: "ok" | "danger" }[];
    actions: { label: string; primary?: boolean }[];
  };
  status: string;
  entries: Entry[];
}

export const ME = { name: "Bryan Hopkins", initials: "BH", role: "Approver" as Role };
export const CUSTOMER = "OUTRIGGER Hotels & Resorts";

export const PROGRAMME: Experiment[] = [
  {
    id: "reef-rate-promise",
    property: "OUTRIGGER Reef Waikiki Beach Resort",
    path: "/hawaii/oahu/outrigger-reef-waikiki-beach-resort",
    title: "Rate-calendar best-price promise, booking panel",
    status: "Run 4 closed Tuesday · unstamped",
    turn: {
      kind: "stamp",
      role: "Approver",
      because: "Run 4 closed Tuesday with 18,412 sessions. Nobody has stamped it.",
      hypothesis:
        "If we promise guests we will match a lower rate found after booking, hesitation at the rate calendar drops and completed bookings rise. Success = completed bookings, not booking starts.",
      frozenAt: "brief rev 3 · frozen 2026-08-26T09:14:03Z when Run 4 opened",
      numbers: [
        { value: "+2.4%", label: "completed bookings", tone: "ok" },
        { value: "+0.3 to +4.5", label: "95% confidence" },
        { value: "0.031", label: "p-value" },
      ],
      actions: [{ label: "Stamp: it won", primary: true }, { label: "Stamp: it didn't" }],
    },
    entries: [
      { at: "14 Aug 09:22", who: "Malia K.", role: "Author", body: "<b>Brief 1 written.</b> “Show a best-price promise near the rate calendar so guests stop opening a second tab to price-check.”" },
      { at: "15 Aug 11:40", who: "Malia K.", role: "Author", body: "<b>Brief 2.</b> Success metric changed after a conversation with revenue management.", diff: { label: "Success metric", from: "booking starts", to: "completed bookings" } },
      { at: "15 Aug 14:02", who: "Prism Agent", role: "Builder", sealed: true, body: "<b>Build 4f2a91c</b> — 214 lines. Pinned to Brief 2.", seal: "4f2a91c · pinned to brief rev 2" },
      { at: "16 Aug 08:15", who: "Dana R.", role: "Reviewer", body: "Approved on the real page — “Copy is fine. The mobile sheet clips at 375.”" },
      { at: "16 Aug 16:30", who: "Prism Agent", role: "Builder", sealed: true, body: "<b>Build 8c1d7e2</b> — fixes the 375 clip.", seal: "8c1d7e2 · pinned to brief rev 2" },
      { at: "26 Aug 09:14", who: "Malia K.", role: "Author", freeze: true, body: "<b>Run 4 opened.</b> Judged against Brief rev 3 and Build 8c1d7e2. Guardrails: completed bookings, revenue per visit, page errors.", seal: "frozen 2026-08-26T09:14:03Z · 50/50 on prep.outrigger.com" },
      { at: "8 Sep 06:00", who: "Prism", role: "Prism", body: "Run 4 closed on schedule. 18,412 sessions." },
    ],
  },
  {
    id: "explorer-nav",
    property: "OUTRIGGER Hotels & Resorts",
    path: "/",
    title: "Destination explorer — tabs instead of a dropdown",
    status: "Running · day 6 of 14 · +1.1%",
    entries: [
      { at: "28 Aug 10:05", who: "Bryan H.", role: "Author", body: "<b>Brief 1 written.</b> “Nobody opens the destination dropdown. Make the destinations visible.”" },
      { at: "29 Aug 15:41", who: "Prism Agent", role: "Builder", sealed: true, body: "<b>Build 91ac3de</b>", seal: "91ac3de · pinned to brief rev 1" },
      { at: "4 Sep 08:00", who: "Bryan H.", role: "Author", freeze: true, body: "<b>Run 1 opened.</b>", seal: "frozen 2026-09-04T08:00:11Z" },
    ],
  },
  {
    id: "kona-ribbon",
    property: "OUTRIGGER Kona Resort & Spa",
    path: "/hawaii/island-of-hawaii/outrigger-kona-resort-and-spa",
    title: "Kona package ribbon",
    status: "Waiting on you · Brief 3 requested",
    turn: {
      kind: "answer",
      role: "Author",
      because: "Ana Kealoha asked for a change before she will sign off.",
      hypothesis: "“The ribbon covers the nightly rate at 360 wide.”",
      actions: [{ label: "Write Brief 3", primary: true }, { label: "Reply to Ana" }],
    },
    entries: [
      { at: "2 Sep 11:12", who: "Kai N.", role: "Author", body: "<b>Brief 1 written.</b>" },
      { at: "3 Sep 09:30", who: "Prism Agent", role: "Builder", sealed: true, body: "<b>Build 7bb01f4</b>", seal: "7bb01f4 · pinned to brief rev 1" },
      { at: "5 Sep 14:20", who: "Ana Kealoha", role: "Reviewer", body: "Sent back — “The ribbon covers the nightly rate at 360 wide.”" },
    ],
  },
  {
    id: "waikiki-hero",
    property: "OUTRIGGER Waikiki Beachcomber",
    path: "/hawaii/oahu/outrigger-waikiki-beachcomber-hotel",
    title: "Hero without the offer badge",
    status: "Waiting on Ana Kealoha · 2 days",
    entries: [
      { at: "1 Sep 08:44", who: "Bryan H.", role: "Author", body: "<b>Brief 1 written.</b>" },
      { at: "6 Sep 12:02", who: "Prism Agent", role: "Builder", sealed: true, body: "<b>Build b7f1c04</b>", seal: "b7f1c04 · pinned to brief rev 1" },
    ],
  },
  {
    id: "offer-tiles",
    property: "OUTRIGGER Hotels & Resorts",
    path: "/offers",
    title: "Offer tile wording",
    status: "Running · day 11 of 14 · flat",
    entries: [
      { at: "20 Aug 09:00", who: "Kai N.", role: "Author", body: "<b>Brief 1 written.</b>" },
      { at: "30 Aug 07:30", who: "Kai N.", role: "Author", freeze: true, body: "<b>Run 1 opened.</b>", seal: "frozen 2026-08-30T07:30:00Z" },
    ],
  },
];

/** The deck: what is genuinely mine, in the order I should meet it. */
export function deckFor(role: Role) {
  return PROGRAMME.filter((e) => e.turn && e.turn.role === role);
}

/** What everyone else is holding — the honest answer to "and the rest?" */
export function elsewhere(role: Role) {
  return PROGRAMME.filter((e) => !e.turn || e.turn.role !== role);
}
