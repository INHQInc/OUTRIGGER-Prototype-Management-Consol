"use client";

/**
 * HANDOFF — shipping the winner, which is the point of the whole programme.
 *
 * Three things, in this order, because the order is the argument:
 *
 *  · THE STAMPED VERDICT is printed above everything else. A package that
 *    travels without its WHY becomes "some code an agent wrote", and the next
 *    engineer re-litigates a decision that was already made against a
 *    pre-registered brief. So the receipt leads.
 *  · THE CUT EXPLORER is read-only and pinned to ONE cut SHA. The explorer can
 *    only open cuts THIS prototype stamped — never an arbitrary ref. A ref like
 *    `main` would show code that never ran on outrigger.com while sitting under
 *    a verdict that says it did, and that is a forgery the UI would be helping
 *    to write.
 *  · THE INTEGRATION PACKAGE is what the agent wrote onto handoff/ on the
 *    branch: a README, a manifest, new files, and .patch diffs against files
 *    that already exist — a native CMS implementation, not the injected
 *    prototype re-labelled.
 *
 * The three not-found states are NOT one grey box. Absent means nothing was
 * written and nothing is wrong. Unreadable means our access failed and we
 * cannot speak for the file. Invalid means it is readable, looks complete, and
 * must not be handed to anyone — which is the most dangerous of the three and
 * therefore the loudest.
 *
 * Frozen facts render as a bordered mono receipt with a lock. Mutable things —
 * who owns it next, the branch, the README — are plain text. Editing a receipt
 * is not a thing you can do; editing a README is.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/ui/cn";
import { Pill, Section, Meta, Th, PageHeader, Toolbar, Chip, Empty } from "./ui";

/* ── Fixtures ──────────────────────────────────────────────────────── */

const EXPERIMENT = "Rate-calendar best-price promise";
const PAGE = "outrigger.com/hawaii/oahu/outrigger-reef-waikiki-beach-resort";
const PROPERTY = "OUTRIGGER Reef Waikiki Beach Resort";

const RUN = {
  label: "run 4",
  closed: "8 Sep 2026",
  sessions: 18412,
  lift: 2.4,
  ciLo: 0.3,
  ciHi: 4.5,
  p: 0.031,
  metric: "Reached the booking step",
  boundTo: "24138040550_book_now_button_clicks",
  brief: "revision 3 · frozen 26 Aug 2026 09:14",
  digest: "sha256:4f1c7e08a3d5…9ab2",
};

type PkgFile = {
  path: string;
  kind: "readme" | "manifest" | "new" | "patch";
  target: string;
  bytes: number;
  lines?: number;
  hunks?: number;
  added?: number;
  removed?: number;
  base?: string;
  stale?: boolean;
};

const PKG_FILES: PkgFile[] = [
  { path: "handoff/README.md", kind: "readme", target: "—", bytes: 6140, lines: 118 },
  { path: "handoff/manifest.json", kind: "manifest", target: "—", bytes: 1320, lines: 42 },
  { path: "handoff/components/RatePromise.tsx", kind: "new", target: "src/components/rate-calendar/RatePromise.tsx", bytes: 3016, lines: 86 },
  { path: "handoff/components/rate-promise.module.css", kind: "new", target: "src/components/rate-calendar/rate-promise.module.css", bytes: 1104, lines: 41 },
  { path: "handoff/content/rate-promise.en-US.json", kind: "new", target: "content/en-US/offers/rate-promise.json", bytes: 412, lines: 9 },
  { path: "handoff/patches/RateCalendar.tsx.patch", kind: "patch", target: "src/components/rate-calendar/RateCalendar.tsx", bytes: 928, hunks: 2, added: 14, removed: 2, base: "e0b7d41" },
  { path: "handoff/patches/reef-waikiki.yaml.patch", kind: "patch", target: "content/en-US/hawaii/oahu/outrigger-reef-waikiki-beach-resort.yaml", bytes: 402, hunks: 1, added: 6, removed: 0, base: "77c1a90", stale: true },
];

const README_EXCERPT = [
  "# Rate-calendar best-price promise — native implementation",
  "",
  "This is NOT the prototype's code. The prototype mounted itself onto the live",
  "page from outside; this package puts the same change inside your own rate",
  "calendar component, where it can be themed, translated and cached like",
  "everything else on the property page.",
  "",
  "It deliberately adds no new tracking. The decision metric was a Book Now",
  "click (24138040550_book_now_button_clicks). Your project has 48 events and",
  "none of them records a completed booking — that instrumentation ask is still",
  "open, and shipping this does not close it.",
];

type Pkg =
  | { state: "ready"; branch: string; written: string; author: string }
  | { state: "absent"; why: string }
  | { state: "unreadable"; connection: string; lastRead: string; trace: string[] }
  | { state: "invalid"; manifestCut: string; written: string; checks: { label: string; ok: boolean; detail?: string }[] };

type CutFile = { path: string; name: string; depth: 0 | 1; dir?: boolean; size?: string; tag?: string; lines: string[] };

type Cut = {
  sha: string;
  run: string;
  closed: string;
  outcome: string;
  stamped?: boolean;
  tree: CutFile[];
  pkg: Pkg;
};

const CUTS: Cut[] = [
  {
    sha: "8c1d7e2",
    run: "run 4",
    closed: "closed 8 Sep 2026",
    outcome: "won · +2.4% on Reached the booking step",
    stamped: true,
    pkg: { state: "ready", branch: "handoff/rate-calendar-best-price-8c1d7e2", written: "8 Sep 2026 16:22", author: "Prism agent" },
    tree: [
      { path: "src", name: "src/", depth: 0, dir: true, lines: [] },
      {
        path: "src/inject.ts", name: "inject.ts", depth: 1, size: "0.6 KB", tag: "entry",
        lines: [
          "import { mountPromise } from \"./best-price-promise\";",
          "",
          "const PAGE = \"/hawaii/oahu/outrigger-reef-waikiki-beach-resort\";",
          "const HOST = \".rate-calendar__grid\";",
          "",
          "if (location.pathname.startsWith(PAGE)) {",
          "  mountPromise(document.querySelector(HOST));",
          "}",
        ],
      },
      {
        path: "src/best-price-promise.ts", name: "best-price-promise.ts", depth: 1, size: "1.4 KB",
        lines: [
          "import COPY from \"./copy.en-US.json\";",
          "",
          "export function mountPromise(host: Element | null) {",
          "  if (!host || host.hasAttribute(\"data-opmc\")) return; // never mount twice",
          "  host.setAttribute(\"data-opmc\", \"8c1d7e2\");",
          "",
          "  const el = document.createElement(\"aside\");",
          "  el.className = \"opmc-promise\";",
          "  el.append(headline(COPY.promise), terms(COPY.terms), cta(COPY.cta));",
          "  host.prepend(el);",
          "",
          "  bindClick(el, \"24138040550_book_now_button_clicks\");",
          "}",
        ],
      },
      {
        path: "src/price-promise.css", name: "price-promise.css", depth: 1, size: "0.9 KB",
        lines: [
          ".opmc-promise {",
          "  border: 1px solid var(--or-sand-300);",
          "  padding: 12px 16px;",
          "  margin: 0 0 12px;",
          "}",
          ".opmc-promise__cta { font: 600 14px/1.2 var(--or-sans); }",
          "",
          "@media (max-width: 767px) { .opmc-promise { padding: 10px 12px; } }",
        ],
      },
      {
        path: "src/copy.en-US.json", name: "copy.en-US.json", depth: 1, size: "0.4 KB",
        lines: [
          "{",
          "  \"promise\": \"Book direct and we'll match any lower rate you find.\",",
          "  \"terms\": \"Find it cheaper within 24 hours of booking and we'll match it,",
          "             then take 10% off that rate.\",",
          "  \"cta\": \"See rates for your dates\"",
          "}",
        ],
      },
      {
        path: "opmc.config.json", name: "opmc.config.json", depth: 0, size: "0.3 KB",
        lines: [
          "{",
          "  \"id\": \"rate-calendar-best-price\",",
          "  \"property\": \"OUTRIGGER Reef Waikiki Beach Resort\",",
          "  \"page\": \"/hawaii/oahu/outrigger-reef-waikiki-beach-resort\",",
          "  \"optimizely\": {",
          "    \"project\": \"24138040550\",",
          "    \"attached\": [\"24138040550_book_now_button_clicks\"],",
          "    \"reads\": [\"24138040550_hero_cta_click\", \"24138040550_all_offers_page\"]",
          "  }",
          "}",
        ],
      },
      { path: "dist", name: "dist/", depth: 0, dir: true, lines: [] },
      {
        path: "dist/inject.8c1d7e2.js", name: "inject.8c1d7e2.js", depth: 1, size: "2.4 KB", tag: "served to guests",
        lines: [
          "/* cut 8c1d7e2 · 2,412 bytes · this exact file is what 18,412 sessions loaded */",
          "(()=>{const P=\"/hawaii/oahu/outrigger-reef-waikiki-beach-resort\",",
          "H=\".rate-calendar__grid\";if(!location.pathname.startsWith(P))return;",
          "const h=document.querySelector(H);if(!h||h.hasAttribute(\"data-opmc\"))return;",
          "h.setAttribute(\"data-opmc\",\"8c1d7e2\");/* … */})();",
        ],
      },
    ],
  },
  {
    sha: "5b90f44",
    run: "run 3",
    closed: "closed 21 Aug 2026",
    outcome: "flat · +0.4%, interval crosses zero",
    pkg: {
      state: "absent",
      why: "Run 3 closed flat, so no verdict was ever stamped on this cut. The agent writes a package when there is something to ship and not before.",
    },
    tree: [
      { path: "src", name: "src/", depth: 0, dir: true, lines: [] },
      {
        path: "src/inject.ts", name: "inject.ts", depth: 1, size: "0.5 KB", tag: "entry",
        lines: [
          "import { mountPromise } from \"./best-price-promise\";",
          "",
          "// run 3 mounted on the calendar wrapper, above the month header —",
          "// half of mobile never scrolled far enough to see it.",
          "mountPromise(document.querySelector(\".rate-calendar\"));",
        ],
      },
      {
        path: "src/best-price-promise.ts", name: "best-price-promise.ts", depth: 1, size: "1.1 KB",
        lines: [
          "export function mountPromise(host: Element | null) {",
          "  if (!host) return;",
          "  const el = document.createElement(\"div\");",
          "  el.className = \"opmc-promise\";",
          "  el.textContent = \"Best rate guaranteed when you book direct.\";",
          "  host.prepend(el);",
          "}",
        ],
      },
      { path: "dist", name: "dist/", depth: 0, dir: true, lines: [] },
      {
        path: "dist/inject.5b90f44.js", name: "inject.5b90f44.js", depth: 1, size: "1.9 KB",
        lines: [
          "/* cut 5b90f44 · 1,884 bytes · ran 11 Aug – 21 Aug 2026 */",
          "(()=>{const h=document.querySelector(\".rate-calendar\");if(!h)return;/* … */})();",
        ],
      },
    ],
  },
  {
    sha: "a17c003",
    run: "run 2",
    closed: "stopped 4 Aug 2026",
    outcome: "stopped on a guardrail · offers-page reach fell 3.1%",
    pkg: {
      state: "unreadable",
      connection: "GitHub · INHQInc/outrigger-web-prototypes",
      lastRead: "2 Sep 2026 11:40",
      trace: [
        "GET /repos/INHQInc/outrigger-web-prototypes/contents/handoff?ref=a17c003",
        "403 { \"message\": \"Resource not accessible by integration\" }",
      ],
    },
    tree: [
      { path: "src", name: "src/", depth: 0, dir: true, lines: [] },
      {
        path: "src/inject.ts", name: "inject.ts", depth: 1, size: "0.7 KB", tag: "entry",
        lines: [
          "import { mountPromise } from \"./promise-banner\";",
          "",
          "// run 2 put the promise in a sticky bar over the offers rail.",
          "mountPromise(document.querySelector(\".offers-rail\"));",
        ],
      },
      {
        path: "src/promise-banner.ts", name: "promise-banner.ts", depth: 1, size: "1.6 KB",
        lines: [
          "export function mountPromise(host: Element | null) {",
          "  if (!host) return;",
          "  const bar = document.createElement(\"div\");",
          "  bar.className = \"opmc-promise opmc-promise--sticky\";",
          "  bar.textContent = \"We'll match any lower rate for \" +",
          "    \"OUTRIGGER Reef Waikiki Beach Resort.\";",
          "  document.body.append(bar); // covered the offers rail on 360px screens",
          "}",
        ],
      },
      { path: "dist", name: "dist/", depth: 0, dir: true, lines: [] },
      {
        path: "dist/inject.a17c003.js", name: "inject.a17c003.js", depth: 1, size: "2.1 KB",
        lines: [
          "/* cut a17c003 · 2,088 bytes · stopped after 6 days on the offers-page guardrail */",
          "(()=>{const h=document.querySelector(\".offers-rail\");if(!h)return;/* … */})();",
        ],
      },
    ],
  },
  {
    sha: "0e2ff81",
    run: "run 1",
    closed: "closed 17 Jul 2026",
    outcome: "inconclusive · underpowered at 4,910 sessions",
    pkg: {
      state: "invalid",
      manifestCut: "b41e9aa",
      written: "18 Jul 2026 09:05",
      checks: [
        { label: "handoff/README.md present", ok: true },
        { label: "handoff/manifest.json present and parses", ok: true },
        { label: "manifest stamps a cut this prototype owns", ok: false, detail: "stamps b41e9aa — that SHA is not one of this prototype's four cuts. It belongs to a different prototype in the same repo." },
        { label: "every file in the manifest exists on the branch", ok: true },
        { label: "every .patch names the base blob it applies to", ok: false, detail: "patches/RateCalendar.tsx.patch has no base line, so nothing can tell whether it still applies." },
      ],
    },
    tree: [
      { path: "src", name: "src/", depth: 0, dir: true, lines: [] },
      {
        path: "src/inject.ts", name: "inject.ts", depth: 1, size: "0.4 KB", tag: "entry",
        lines: [
          "// run 1 — copy-only test, no layout change.",
          "const el = document.querySelector(\".rate-calendar__note\");",
          "if (el) el.textContent = \"Lowest rate, guaranteed.\";",
        ],
      },
      { path: "dist", name: "dist/", depth: 0, dir: true, lines: [] },
      {
        path: "dist/inject.0e2ff81.js", name: "inject.0e2ff81.js", depth: 1, size: "0.9 KB",
        lines: [
          "/* cut 0e2ff81 · 902 bytes · ran 10 Jul – 17 Jul 2026 */",
          "(()=>{const e=document.querySelector(\".rate-calendar__note\");/* … */})();",
        ],
      },
    ],
  },
];

/* ── Small parts ───────────────────────────────────────────────────── */

const Lock = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden>
    <rect x="4" y="11" width="16" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </svg>
);

const Mono = ({ children }: { children: React.ReactNode }) => (
  <span className="font-mono text-[11px] text-muted-2 bg-surface-2 rounded px-1.5 py-0.5">{children}</span>
);

/** A frozen fact. Bordered, monospaced, locked — and never editable in place. */
function Receipt({ title, rows, tone }: { title: string; rows: [string, string][]; tone?: "danger" }) {
  return (
    <div className={cn("rounded-lg border overflow-hidden bg-surface-2/50", tone === "danger" ? "border-danger/45" : "border-border-strong")}>
      <div className={cn("flex items-center gap-1.5 px-3.5 py-2 border-b text-[10.5px] font-semibold tracking-[0.07em]",
        tone === "danger" ? "border-danger/30 text-danger" : "border-border text-muted-2")}>
        <Lock />{title}
      </div>
      <dl className="px-3.5 py-2.5 font-mono text-[12px] leading-[1.85] tabular-nums">
        {rows.map(([k, v]) => (
          <div key={k} className="flex gap-3">
            <dt className="w-[86px] shrink-0 text-muted-2">{k}</dt>
            <dd className="min-w-0 break-words">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

const Label = ({ children }: { children: React.ReactNode }) => (
  <div className="text-[10.5px] font-semibold tracking-[0.07em] text-muted-2 mb-1.5">{children}</div>
);

const Code = ({ lines, gutter }: { lines: string[]; gutter?: boolean }) => (
  <div className="overflow-x-auto font-mono text-[12px] leading-[1.75]">
    {lines.map((l, i) => (
      <div key={i} className="flex gap-4">
        {gutter && <span className="w-6 shrink-0 text-right text-muted-2 tabular-nums select-none">{i + 1}</span>}
        <span className="whitespace-pre text-muted">{l}</span>
      </div>
    ))}
  </div>
);

/* ── The surface ───────────────────────────────────────────────────── */

export function HandoffPanel() {
  const [sha, setSha] = useState(CUTS[0].sha);
  const [filePath, setFilePath] = useState<string | null>(null);
  const [refInput, setRefInput] = useState("");

  const cut = CUTS.find((c) => c.sha === sha) ?? CUTS[0];
  const stampedCut = CUTS.find((c) => c.stamped) ?? CUTS[0];
  const files = cut.tree.filter((f) => !f.dir);
  const open = files.find((f) => f.path === filePath) ?? files[0];

  const pickCut = (next: string) => { setSha(next); setFilePath(null); };

  // The ref guard. Only this prototype's own cuts resolve; everything else is
  // refused by name, so "why won't it open main" is answered before it's asked.
  const typed = refInput.trim().toLowerCase();
  const refMatch = typed.length >= 4 ? CUTS.find((c) => c.sha.startsWith(typed)) : undefined;
  const refRefused = typed.length > 0 && !refMatch;

  // Computed, therefore rendered — every one of these appears below.
  const perArm = Math.round(RUN.sessions / 2);
  const ciWidth = (RUN.ciHi - RUN.ciLo).toFixed(1);
  const newFiles = PKG_FILES.filter((f) => f.kind === "new");
  const patches = PKG_FILES.filter((f) => f.kind === "patch");
  const newLines = newFiles.reduce((n, f) => n + (f.lines ?? 0), 0);
  const hunks = patches.reduce((n, f) => n + (f.hunks ?? 0), 0);
  const added = patches.reduce((n, f) => n + (f.added ?? 0), 0);
  const removed = patches.reduce((n, f) => n + (f.removed ?? 0), 0);
  const kb = (PKG_FILES.reduce((n, f) => n + f.bytes, 0) / 1024).toFixed(1);
  const stale = patches.filter((f) => f.stale);

  return (
    <>
      <PageHeader
        title="Handoff"
        count={EXPERIMENT}
        actions={
          <>
            <Button variant="outline" size="sm">Open the readout</Button>
            <Button variant="outline" size="sm">Copy branch name</Button>
          </>
        }
      />

      <Toolbar>
        <span className="text-[10.5px] font-semibold tracking-[0.07em] text-muted-2 mr-1">CUT</span>
        {CUTS.map((c) => (
          <Chip key={c.sha} on={c.sha === cut.sha} onClick={() => pickCut(c.sha)}>
            <span className="font-mono">{c.sha}</span>
            <span className="opacity-60"> {c.run}</span>
            {c.stamped && <span className={cn("ml-1.5 text-[10.5px] font-bold tracking-wide", c.sha === cut.sha ? "opacity-80" : "text-accent")}>STAMPED</span>}
          </Chip>
        ))}
        <div className="w-px h-5 bg-border mx-1" />
        <input
          value={refInput}
          onChange={(e) => setRefInput(e.target.value)}
          placeholder="Open a ref…"
          className="h-8 px-3 rounded-lg border border-border bg-surface text-[13px] w-40 font-mono placeholder:font-sans placeholder:text-muted-2 focus:border-accent focus:outline-none"
        />
        {refMatch && (
          <div className="flex items-center gap-2">
            <span className="text-[12.5px] text-muted">resolves to <span className="font-mono text-foreground">{refMatch.sha}</span> · {refMatch.run}</span>
            <Button size="sm" variant="outline" onClick={() => { pickCut(refMatch.sha); setRefInput(""); }}>Open</Button>
          </div>
        )}
        {refRefused && (
          <span className="text-[12.5px] text-warn">
            <span className="font-mono">{refInput.trim()}</span> is not a cut of this prototype. The explorer opens these {CUTS.length} and
            nothing else — an arbitrary ref would show code that never ran on this page, under a verdict that says it did.
          </span>
        )}
      </Toolbar>

      <div className="flex-1 overflow-auto p-6 space-y-4">

        {/* ── 1. The stamped verdict, above everything ───────────────── */}
        <Section
          title="The verdict this package carries"
          action={<Pill tone="ok">Shipped {RUN.closed}</Pill>}>

          <div className="px-5 py-4 border-b border-border flex flex-wrap gap-x-10 gap-y-4">
            {[
              [`+${RUN.lift}%`, RUN.metric, "ok"],
              [`+${RUN.ciLo} to +${RUN.ciHi}`, `95% CI · ${ciWidth} points wide, all of it above zero`, ""],
              [`${RUN.p}`, "p-value", ""],
              [RUN.sessions.toLocaleString("en-US"), `sessions · ${perArm.toLocaleString("en-US")} per arm`, ""],
            ].map(([n, l, tone]) => (
              <div key={l}>
                <div className={cn("text-[20px] font-semibold tabular-nums tracking-[-0.02em]", tone === "ok" && "text-ok")}>{n}</div>
                <div className="text-[12.5px] text-muted-2 mt-0.5">{l}</div>
              </div>
            ))}
          </div>

          <div className="px-5 py-4 border-b border-border grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)]">
            <div>
              <Label>WHY THIS SHIPPED</Label>
              <p className="text-[14.5px] leading-relaxed">
                Guests on the {PROPERTY} rate calendar reached the booking step 2.4% more often when the best-price
                promise sat inside the calendar grid instead of above it. The brief said this was worth shipping at 2% or
                better, and it was frozen 13 days before the numbers existed.
              </p>
              <p className="text-[13.5px] text-muted leading-relaxed mt-3">
                What it does not say: nobody measured a booking. The decision metric is a click on Book Now, which is an
                intention. This project has 48 events and none of them records a completed booking, so the package ships
                the change and leaves that ask open rather than standing a lookalike event in for it.
              </p>
              <div className="mt-3 flex flex-wrap gap-1">
                <Mono>{RUN.boundTo}</Mono>
                <Mono>24138040550_hero_cta_click</Mono>
                <Mono>24138040550_all_offers_page</Mono>
              </div>
            </div>

            <Receipt
              title="STAMPED VERDICT · SUPERSEDABLE, NEVER EDITABLE"
              rows={[
                ["page", PAGE],
                ["brief", RUN.brief],
                ["cut", `${stampedCut.sha} · ${stampedCut.outcome}`],
                ["run", `${RUN.label} · ${RUN.closed} · ${RUN.sessions.toLocaleString("en-US")} sessions · 50/50`],
                ["result", `+${RUN.lift}% (95% CI +${RUN.ciLo} to +${RUN.ciHi}) · p ${RUN.p}`],
                ["metric", RUN.metric],
                ["bound to", RUN.boundTo],
                ["digest", RUN.digest],
              ]}
            />
          </div>

          <div className="px-5 py-2">
            <Meta k="Decided by" v="Marcus R. · Approver — not the author, and not the reviewer" />
            <Meta k="Author" v="Malia K." />
            <Meta k="Handed to" v={<span>Web platform · Kai T. <span className="text-muted-2">— reassign freely, it does not touch the verdict</span></span>} />
            <Meta k="Branch" v="handoff/rate-calendar-best-price-8c1d7e2" mono />
          </div>
        </Section>

        {/* ── 2. The cut explorer ────────────────────────────────────── */}
        <Section
          title={`What ran — cut ${cut.sha}`}
          action={
            <div className="flex items-center gap-2.5">
              <span className="text-[12.5px] text-muted-2">{cut.run} · {cut.closed}</span>
              <Pill tone="muted">Read-only</Pill>
            </div>
          }>

          {!cut.stamped && (
            <div className="px-5 py-3 border-b border-border bg-warn/5 flex items-start gap-2.5">
              <Pill tone="warn">not the stamped cut</Pill>
              <p className="text-[13px] text-muted leading-relaxed">
                {cut.outcome}. You can read it, and nothing here can be handed over — only {stampedCut.sha} carries a
                verdict. Kept because a losing cut is how the winning one gets explained.
              </p>
            </div>
          )}

          <div className="grid md:grid-cols-[minmax(0,282px)_minmax(0,1fr)]">
            <div className="md:border-r border-border py-2">
              {cut.tree.map((f) =>
                f.dir ? (
                  <div key={f.path} className="flex items-center gap-2 px-5 py-1.5 text-[13px] text-muted-2">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden>
                      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                    </svg>
                    <span className="font-mono">{f.name}</span>
                  </div>
                ) : (
                  <button
                    key={f.path}
                    onClick={() => setFilePath(f.path)}
                    className={cn("w-full flex items-center gap-2 py-1.5 text-left",
                      f.depth === 1 ? "pl-[38px] pr-4" : "pl-5 pr-4",
                      f.path === open.path ? "bg-accent/[0.07] text-accent" : "text-muted hover:bg-surface-2/70 hover:text-foreground")}>
                    <span className="font-mono text-[13px] truncate">{f.name}</span>
                    {f.tag && <span className="text-[10.5px] font-semibold tracking-[0.05em] text-muted-2 uppercase shrink-0">{f.tag}</span>}
                    <span className="ml-auto text-[11.5px] text-muted-2 tabular-nums shrink-0">{f.size}</span>
                  </button>
                ),
              )}
              <p className="px-5 pt-3 mt-2 border-t border-border text-[12px] text-muted-2 leading-relaxed">
                {files.length} files, pinned to this SHA. No branch, no HEAD, no editing — the tree is evidence for the
                verdict, so it has to be the same tomorrow.
              </p>
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2.5 px-5 py-2.5 border-b border-border bg-surface-2/40">
                <span className="font-mono text-[12.5px] truncate">{open.path}</span>
                <span className="ml-auto inline-flex items-center gap-1.5 text-[11px] font-mono text-muted-2 shrink-0">
                  <Lock />{cut.sha}
                </span>
              </div>
              <div className="px-5 py-4">
                <Code lines={open.lines} gutter />
              </div>
            </div>
          </div>
        </Section>

        {/* ── 3. The integration package ─────────────────────────────── */}
        <Section
          title="The integration package"
          action={
            <span className="text-[12.5px] text-muted-2">
              written onto <span className="font-mono">handoff/</span> · a native implementation, not the injected prototype
            </span>
          }>

          {/* READY */}
          {cut.pkg.state === "ready" && (
            <>
              <div className="px-5 py-3.5 border-b border-border flex flex-wrap items-center gap-x-6 gap-y-2">
                <Pill tone="ok">Readable · manifest matches the stamped cut</Pill>
                <span className="text-[13px] text-muted tabular-nums">
                  {PKG_FILES.length} files · {kb} KB · {newFiles.length} new ({newLines} lines) · {patches.length} patches ({hunks} hunks, +{added} −{removed})
                </span>
                {stale.length > 0 && <Pill tone="warn">{stale.length} {stale.length === 1 ? "patch needs" : "patches need"} a human</Pill>}
                <span className="ml-auto text-[12.5px] text-muted-2">
                  {cut.pkg.author} · {cut.pkg.written}
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead className="bg-surface-2/60">
                    <tr><Th first>File in the package</Th><Th>Kind</Th><Th>Where it goes in your repo</Th><Th>Change</Th></tr>
                  </thead>
                  <tbody>
                    {PKG_FILES.map((f) => (
                      <tr key={f.path} className="border-b border-border last:border-0">
                        <td className="px-4 pl-6 py-3 font-mono text-[12.5px] whitespace-nowrap">{f.path}</td>
                        <td className="px-4 py-3">
                          {f.kind === "new" && <Pill tone="accent">new file</Pill>}
                          {f.kind === "patch" && <Pill tone={f.stale ? "warn" : "muted"}>.patch</Pill>}
                          {f.kind === "readme" && <Pill tone="muted">readme</Pill>}
                          {f.kind === "manifest" && <Pill tone="muted">manifest</Pill>}
                        </td>
                        <td className="px-4 py-3 font-mono text-[12px] text-muted-2 max-w-[380px] truncate">{f.target}</td>
                        <td className="px-4 py-3 text-[13px] whitespace-nowrap">
                          {f.kind === "patch" ? (
                            <span className="tabular-nums">
                              {f.hunks} {f.hunks === 1 ? "hunk" : "hunks"} <span className="text-ok">+{f.added}</span>{" "}
                              <span className="text-danger">−{f.removed}</span>
                              <span className="text-muted-2"> · base {f.base}</span>
                              {f.stale && <span className="text-warn"> · base moved</span>}
                            </span>
                          ) : (
                            <span className="tabular-nums text-muted">{f.lines} lines</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {stale.map((f) => (
                <div key={f.path} className="px-5 py-3.5 border-b border-border bg-warn/5">
                  <div className="flex items-center gap-2.5 mb-1">
                    <Pill tone="warn">{f.hunks} of {f.hunks} {f.hunks === 1 ? "hunk" : "hunks"} will not apply</Pill>
                    <span className="font-mono text-[12.5px]">{f.path}</span>
                  </div>
                  <p className="text-[13px] text-muted leading-relaxed">
                    {f.target} changed after the cut was taken, so the patch no longer lines up against base{" "}
                    <span className="font-mono">{f.base}</span>. Prism will not re-roll the patch on its own: the file it
                    would rebase onto is not the file the experiment ran against, and pretending otherwise is how a
                    verified change becomes an unverified one.
                  </p>
                </div>
              ))}

              <div className="px-5 py-4 border-b border-border grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)]">
                <div className="min-w-0">
                  <Label>handoff/README.md — first 12 lines</Label>
                  <div className="rounded-lg border border-border bg-surface-2/40 px-4 py-3">
                    <Code lines={README_EXCERPT} />
                  </div>
                  <p className="text-[12.5px] text-muted-2 mt-2">
                    The README is yours to edit — it is a document, not a record.
                  </p>
                </div>

                <Receipt
                  title="handoff/manifest.json · CONTRACT"
                  rows={[
                    ["cut", stampedCut.sha],
                    ["brief", "revision 3"],
                    ["verdict", RUN.digest],
                    ["files", `${PKG_FILES.length} · ${kb} KB`],
                    ["written", cut.pkg.written],
                    ["by", cut.pkg.author],
                  ]}
                />
              </div>

              <div className="px-5 py-4 flex flex-wrap items-center gap-3">
                <Button disabled={!cut.stamped}>Hand it to engineering</Button>
                <Button variant="outline">Open the branch</Button>
                <span className="text-[12.5px] text-muted-2 max-w-[440px] leading-relaxed">
                  Handing it over sends the branch, the verdict receipt and the manifest as one thing. Edit any file in the
                  package and the digest stops matching the verdict — then it goes back to being code, not a decision.
                </span>
              </div>
            </>
          )}

          {/* ABSENT — nothing was written, and nothing is wrong. */}
          {cut.pkg.state === "absent" && (
            <>
              <Empty
                title={`Nothing was written to handoff/ on cut ${cut.sha}`}
                body={cut.pkg.why}
                action={<Button variant="outline" size="sm">Ask the agent to write one anyway</Button>}
              />
              <div className="px-5 py-3 border-t border-border">
                <p className="text-[12.5px] text-muted-2 leading-relaxed">
                  Absent is not an error. The branch is readable, <span className="font-mono">handoff/</span> simply does
                  not exist on it — which is what a cut that never won is supposed to look like.
                </p>
              </div>
            </>
          )}

          {/* UNREADABLE — our access failed. We do not speak for the file. */}
          {cut.pkg.state === "unreadable" && (
            <>
              <div className="px-5 py-4 border-b border-border flex items-start gap-3">
                <span className="mt-0.5"><Pill tone="danger">Cannot read it</Pill></span>
                <div className="min-w-0">
                  <p className="text-[14.5px] leading-relaxed">
                    <span className="font-mono">handoff/</span> is listed on this branch, but the bytes come back 403. This
                    is our access failing, not their file — the package may be complete and correct, and we will not claim
                    it is missing.
                  </p>
                  <p className="text-[13px] text-muted mt-2 leading-relaxed">
                    {cut.pkg.connection} · last successful read {cut.pkg.lastRead}. The GitHub App was reinstalled that
                    afternoon and came back without <span className="font-mono">contents:read</span> on this repository.
                  </p>
                </div>
              </div>
              <div className="px-5 py-4 border-b border-border">
                <Label>WHAT THE SERVER SAID</Label>
                <div className="rounded-lg border border-danger/40 bg-danger/5 px-4 py-3">
                  <Code lines={cut.pkg.trace} />
                </div>
              </div>
              <div className="px-5 py-4 flex flex-wrap items-center gap-3">
                <Button variant="outline">Reconnect GitHub</Button>
                <Button variant="ghost">Retry read</Button>
                <span className="text-[12.5px] text-muted-2">Nothing here is hidden from you on purpose. Restore the scope and this section fills in.</span>
              </div>
            </>
          )}

          {/* INVALID — readable, looks complete, must not be handed over. */}
          {cut.pkg.state === "invalid" && (
            <>
              <div className="px-5 py-4 border-b border-border bg-danger/5">
                <div className="flex items-center gap-2.5 mb-1.5">
                  <Pill tone="danger">Will not hand this over</Pill>
                  <span className="text-[12.5px] text-muted-2 tabular-nums">
                    written {cut.pkg.written} · readable · {cut.pkg.checks.filter((c) => c.ok).length} of {cut.pkg.checks.length} contract checks passed
                  </span>
                </div>
                <p className="text-[14.5px] leading-relaxed">
                  This package reads cleanly and looks finished, which is exactly why it is the dangerous one. Its manifest
                  stamps a cut this prototype does not own, so installing it would put a different prototype&rsquo;s change
                  into your repo under this experiment&rsquo;s verdict.
                </p>
              </div>

              <div className="px-5 py-4 border-b border-border grid gap-4 md:grid-cols-2">
                <Receipt
                  title="THE CUT THE VERDICT NAMES"
                  rows={[["cut", cut.sha], ["run", `${cut.run} · ${cut.closed}`], ["outcome", cut.outcome]]}
                />
                <Receipt
                  tone="danger"
                  title="THE CUT THE MANIFEST NAMES"
                  rows={[["cut", cut.pkg.manifestCut], ["run", "not a run of this prototype"], ["outcome", "unknown — different prototype, same repo"]]}
                />
              </div>

              <div className="border-b border-border">
                {cut.pkg.checks.map((c) => (
                  <div key={c.label} className="flex items-start gap-3 px-5 py-3 border-b border-border last:border-0">
                    <span className={cn("mt-[3px] w-4 h-4 rounded-full grid place-items-center shrink-0", c.ok ? "bg-ok" : "bg-danger")}>
                      {c.ok ? (
                        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.6" strokeLinecap="round" className="text-accent-fg"><path d="M20 6 9 17l-5-5" /></svg>
                      ) : (
                        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.6" strokeLinecap="round" className="text-accent-fg"><path d="M18 6 6 18M6 6l12 12" /></svg>
                      )}
                    </span>
                    <div className="min-w-0">
                      <div className={cn("text-[13.5px]", c.ok ? "text-muted" : "font-medium")}>{c.label}</div>
                      {c.detail && <p className="text-[13px] text-danger mt-1 leading-relaxed">{c.detail}</p>}
                    </div>
                  </div>
                ))}
              </div>

              <div className="px-5 py-4 flex flex-wrap items-center gap-3">
                <Button variant="danger">Reject and re-write</Button>
                <Button variant="outline">Read it anyway</Button>
                <span className="text-[12.5px] text-muted-2 max-w-[440px] leading-relaxed">
                  Reading it is fine. Handing it over is not — a package that stamps the wrong cut installs the wrong
                  change and carries a real verdict while doing it.
                </span>
              </div>
            </>
          )}
        </Section>
      </div>
    </>
  );
}
