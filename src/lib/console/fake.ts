/** Fake programme for the console mock. Shaped like the real model. */

export type Stage = "Brief" | "Build" | "Review" | "Run" | "Decision";
export const STAGES: Stage[] = ["Brief", "Build", "Review", "Run", "Decision"];

export type StatusKey = "drafting" | "building" | "review" | "running" | "decide" | "shipped" | "archived";

export const STATUS: Record<StatusKey, { label: string; fg: string; bg: string; dot: string }> = {
  drafting: { label: "Drafting",  fg: "text-muted",  bg: "bg-surface-2",   dot: "bg-muted-2" },
  building: { label: "Building",  fg: "text-accent", bg: "bg-accent/10",   dot: "bg-accent" },
  review:   { label: "In review", fg: "text-warn",   bg: "bg-warn/10",     dot: "bg-warn" },
  running:  { label: "Running",   fg: "text-ok",     bg: "bg-ok/10",       dot: "bg-ok" },
  decide:   { label: "Decide",    fg: "text-danger", bg: "bg-danger/10",   dot: "bg-danger" },
  shipped:  { label: "Shipped",   fg: "text-muted",  bg: "bg-surface-2",   dot: "bg-ok" },
  archived: { label: "Archived",  fg: "text-muted-2",bg: "bg-surface-2",   dot: "bg-border-strong" },
};

export interface HistoryRow { at: string; who: string; role: string; what: string; sealed?: string }

export interface Experiment {
  id: string;
  name: string;
  site: string;
  path: string;
  env: string;
  status: StatusKey;
  stage: Stage;
  owner: string;
  metric: string;
  result?: { value: string; tone: "ok" | "danger" | "flat"; detail: string };
  updated: string;
  /** The one thing to do next, and who may do it. */
  action?: { title: string; body: string; role: string; primary: string; secondary?: string };
  hypothesis: string;
  frozen?: string;
  guardrails: string[];
  build?: string;
  history: HistoryRow[];
}

export const SITES = ["outrigger.com", "outriggerkona.com", "waikikibeachcomber.com"];
export const ME = { name: "Bryan Hopkins", initials: "BH", role: "Approver" };

export const EXPERIMENTS: Experiment[] = [
  {
    id: "reef-rate-promise", name: "Rate-calendar best-price promise",
    site: "outrigger.com", path: "/hawaii/oahu/outrigger-reef-waikiki-beach-resort",
    env: "Production", status: "decide", stage: "Decision", owner: "Malia K.",
    metric: "Completed bookings",
    result: { value: "+2.4%", tone: "ok", detail: "95% CI +0.3 to +4.5 · p 0.031 · 18,412 sessions" },
    updated: "2 hours ago",
    action: {
      title: "Record the decision", role: "Approver",
      body: "Run 4 closed on 8 September. The result is settled and nobody has recorded what we concluded.",
      primary: "It won — ship it", secondary: "It didn't win",
    },
    hypothesis: "If we promise guests we will match a lower rate found after booking, hesitation at the rate calendar drops and completed bookings rise. Success is completed bookings, not booking starts.",
    frozen: "Brief 3 · frozen 26 Aug 2026, 09:14 when Run 4 opened",
    guardrails: ["Revenue per visit", "Cancellation rate", "Page errors"],
    build: "8c1d7e2",
    history: [
      { at: "8 Sep, 06:00", who: "Prism", role: "System", what: "Run 4 closed on schedule. 18,412 sessions." },
      { at: "26 Aug, 09:14", who: "Malia K.", role: "Author", what: "Opened Run 4 at 50/50 on Production.", sealed: "Brief 3 · Build 8c1d7e2 frozen" },
      { at: "16 Aug, 16:30", who: "Prism Agent", role: "Builder", what: "Pushed a build fixing the 375px clip.", sealed: "8c1d7e2" },
      { at: "16 Aug, 08:15", who: "Dana R.", role: "Reviewer", what: "Signed off on the real page — “Copy is fine. The mobile sheet clips at 375.”" },
      { at: "15 Aug, 14:02", who: "Prism Agent", role: "Builder", what: "Pushed the first build, 214 lines.", sealed: "4f2a91c" },
      { at: "15 Aug, 11:40", who: "Malia K.", role: "Author", what: "Revised the brief — success metric changed from booking starts to completed bookings." },
      { at: "14 Aug, 09:22", who: "Malia K.", role: "Author", what: "Created the experiment." },
    ],
  },
  {
    id: "explorer-nav", name: "Destination explorer — tabs instead of a dropdown",
    site: "outrigger.com", path: "/", env: "Production", status: "running", stage: "Run",
    owner: "Bryan H.", metric: "Explorer engagement",
    result: { value: "+1.1%", tone: "flat", detail: "day 6 of 14 · too early to read" },
    updated: "1 hour ago",
    hypothesis: "Nobody opens the destination dropdown. Making destinations visible as tabs will raise engagement with the explorer.",
    frozen: "Brief 1 · frozen 4 Sep 2026, 08:00 when Run 1 opened",
    guardrails: ["Bounce rate", "Page errors"], build: "91ac3de",
    history: [
      { at: "4 Sep, 08:00", who: "Bryan H.", role: "Author", what: "Opened Run 1 at 50/50 on Production.", sealed: "Brief 1 · Build 91ac3de frozen" },
      { at: "29 Aug, 15:41", who: "Prism Agent", role: "Builder", what: "Pushed a build.", sealed: "91ac3de" },
      { at: "28 Aug, 10:05", who: "Bryan H.", role: "Author", what: "Created the experiment." },
    ],
  },
  {
    id: "kona-ribbon", name: "Kona package ribbon", site: "outriggerkona.com",
    path: "/offers/kona-package", env: "Prep", status: "review", stage: "Review",
    owner: "Kai N.", metric: "Offer clicks", updated: "yesterday",
    action: {
      title: "Changes requested", role: "Author",
      body: "Ana Kealoha sent this back — “The ribbon covers the nightly rate at 360 wide.” The build needs another pass before it can go to review again.",
      primary: "Revise the brief", secondary: "Reply to Ana",
    },
    hypothesis: "A package ribbon on the offer card will raise offer clicks without pushing the nightly rate out of view.",
    guardrails: ["Nightly rate visibility", "Page errors"], build: "7bb01f4",
    history: [
      { at: "5 Sep, 14:20", who: "Ana Kealoha", role: "Reviewer", what: "Sent back with a note — “The ribbon covers the nightly rate at 360 wide.”" },
      { at: "3 Sep, 09:30", who: "Prism Agent", role: "Builder", what: "Pushed the first build.", sealed: "7bb01f4" },
      { at: "2 Sep, 11:12", who: "Kai N.", role: "Author", what: "Created the experiment." },
    ],
  },
  {
    id: "beachcomber-hero", name: "Hero without the offer badge",
    site: "waikikibeachcomber.com", path: "/", env: "Prep", status: "review", stage: "Review",
    owner: "Bryan H.", metric: "Check availability clicks", updated: "2 days ago",
    action: {
      title: "Waiting on Ana Kealoha", role: "Reviewer",
      body: "Build b7f1c04 has been waiting for a site sign-off for 2 days.",
      primary: "Send a reminder", secondary: "Reassign",
    },
    hypothesis: "Removing the offer badge from the hero will raise Check availability clicks, because the badge competes with the booking call to action.",
    guardrails: ["Bookings", "Revenue per visit"], build: "b7f1c04",
    history: [
      { at: "6 Sep, 12:02", who: "Prism Agent", role: "Builder", what: "Pushed the first build.", sealed: "b7f1c04" },
      { at: "1 Sep, 08:44", who: "Bryan H.", role: "Author", what: "Created the experiment." },
    ],
  },
  {
    id: "offer-tiles", name: "Offer tile wording", site: "outrigger.com", path: "/offers",
    env: "Production", status: "running", stage: "Run", owner: "Kai N.", metric: "Offer clicks",
    result: { value: "0.0%", tone: "flat", detail: "day 11 of 14 · flat" }, updated: "3 hours ago",
    hypothesis: "Leading the tile with the saving rather than the package name will raise offer clicks.",
    frozen: "Brief 1 · frozen 30 Aug 2026, 07:30 when Run 1 opened",
    guardrails: ["Bookings", "Page errors"], build: "3de91fa",
    history: [
      { at: "30 Aug, 07:30", who: "Kai N.", role: "Author", what: "Opened Run 1 at 50/50 on Production.", sealed: "Brief 1 · Build 3de91fa frozen" },
      { at: "20 Aug, 09:00", who: "Kai N.", role: "Author", what: "Created the experiment." },
    ],
  },
  {
    id: "room-compare", name: "Compare rooms side by side", site: "outrigger.com",
    path: "/hawaii/oahu/outrigger-reef-waikiki-beach-resort/rooms", env: "Prep",
    status: "drafting", stage: "Brief", owner: "Dana R.", metric: "—", updated: "4 days ago",
    action: {
      title: "Two questions before this can be built", role: "Author",
      body: "The brief has no success metric and no direction. Nothing can be built until both are stated.",
      primary: "Finish the brief",
    },
    hypothesis: "Guests open three room pages in separate tabs. A comparison view should reduce that and raise bookings.",
    guardrails: [], history: [{ at: "6 Sep, 10:00", who: "Dana R.", role: "Author", what: "Created the experiment." }],
  },
  {
    id: "favourites", name: "Save a property to favourites", site: "outrigger.com",
    path: "/hawaii/oahu/outrigger-reef-waikiki-beach-resort", env: "Production",
    status: "shipped", stage: "Decision", owner: "Marcus R.", metric: "Return visits",
    result: { value: "+6.8%", tone: "ok", detail: "shipped 2 Aug 2026" }, updated: "Aug 2",
    hypothesis: "Letting guests save a property will raise return visits within 30 days.",
    frozen: "Brief 2 · frozen 8 Jul 2026, 09:00 when Run 1 opened",
    guardrails: ["Page errors"], build: "aa10c93",
    history: [
      { at: "2 Aug, 11:24", who: "Marcus R.", role: "Approver", what: "Recorded the decision: it won. Handed to the development team.", sealed: "Decision stamped · results and statistics frozen" },
      { at: "8 Jul, 09:00", who: "Marcus R.", role: "Author", what: "Opened Run 1.", sealed: "Brief 2 · Build aa10c93 frozen" },
    ],
  },
];

export const needsMe = (e: Experiment) => Boolean(e.action);
