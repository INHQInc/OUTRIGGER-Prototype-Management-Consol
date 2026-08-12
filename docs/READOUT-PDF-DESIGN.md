# PDF delivery and the html / pdf / both toggle

*Designed 2026-08-12. Status: **design agreed, nothing built.***

**The ask:** a per-report toggle for HTML only, PDF only or both — and the PDF
must perfectly mimic the HTML.

**Verified before designing, not recalled:**

| | |
|---|---|
| `@sparticuz/chromium@149.0.0` | 69,678,316 B = **66.4 MB** (`npm view … dist.unpackedSize`) |
| `puppeteer-core@25.6.0` | 5,824,383 B = **5.6 MB** |
| Vercel serverless ceiling | **250 MB uncompressed** — a bundled Chromium fits |
| Today's deps | no puppeteer, playwright, chromium or PDF package in `package.json` |
| Attachments | `sendEmail()` has **no** attachment support on any of the three providers |

**A live defect found on the way, independent of the PDF.** The email's only
call to action — "Open the full readout →" (`readout.ts:358`) — points at
`/prototypes/<key>?tab=analytics` (`run.ts:150`). That path is not in
`PUBLIC_PATHS` (`middleware.ts:32`), so every recipient who is not a console
user is redirected to `/login`. The CTA has been dead in every readout sent.
Phase 0 below fixes it and ships on its own.

---

# PDF/HTML/Both readout delivery — one plan

Verified against the tree before writing. Corrections to the grounding, up front:

- `src/app/api/reports/[id]/route.ts:13` **already declares `maxDuration = 120`**. Design 1's "add 60" is a regression — dropped.
- There are **three** `runReport` importers, not two: `src/app/api/cron/reports/route.ts:6` (300s), `src/app/api/reports/[id]/route.ts:7` (120s), and `src/app/api/prototypes/report/route.ts:9` (**60s**, `sendNow` at :99). The 60s one is the tightest budget in the system and no design accounted for it.
- Confirmed: no puppeteer / playwright / chromium / PDF dep in `package.json`; `node_modules/@sparticuz` absent; `next.config.ts` is `{}` (7 lines).
- Confirmed: `claimRun` (`store.ts:115-128`) writes `state:"claimed"` before a byte leaves, and `cadence.ts:47-50` treats claimed as not-due. Anything that kills the process between claim and settle costs that report its ISO week.

---

## 1. THE ENGINE

**In-process headless Chromium. `puppeteer-core@25.6.0` + `@sparticuz/chromium@149.0.0`, both pinned exact (no caret — a Chromium bump is a visual change, not a patch).**

Two judges picked the hosted renderer (Browserless). Overruled, and here is the resolution:

- **Tenant data.** The POST body would be the whole readout — metric names, rates, the hypothesis, the verdict, the analyst's written notes — for every tenant, crossing to a third party. This is a multi-tenant platform (constraint 5). That needs a signed DPA and a subprocessor entry before the first real client's numbers leave, which is a contract negotiation, not a build task. The in-process engine has no such conversation.
- **The vendor's fidelity story does not hold.** Browserless's `/pdf` REST endpoint has no `document.fonts.ready` hook — only `waitForTimeout`. The pinned data-URI font is the *entire* answer to the 400/600/700/800 weight collapse, and a data-URI `@font-face` is still decoded asynchronously; `load` is not sufficient. And you cannot pin their Chrome, so layout drift arrives with no deploy, no PR, no review — while you *are* pinning the font. That is incoherent.
- **Money is not the argument either way.** ~87 renders/month puts us in Browserless's free tier; the $300/yr Prototyping plan buys an SLA, not throughput. $0 in-process.

**What we take from the hosted design is its failure machinery** (§5), which is the only place it genuinely beat the in-process designs.

### Numbers

| | |
|---|---|
| Function ceiling | **250 MB uncompressed**, AWS-enforced, *not* plan-specific |
| `@sparticuz/chromium@149.0.0` | 69,678,316 B = **66.4 MB**, stays brotli-compressed in the bundle (`bin/chromium.br` 61.8 MB, `swiftshader.tar.br` 3.4 MB, `al2023.tar.br` 1.0 MB, `fonts.tar.br` 179 KB) |
| `puppeteer-core@25.6.0` | 5,824,383 B = **5.6 MB** |
| Added | **72.0 MB** (playwright-core would be 79.2 MB for identical CDP output) |
| Traced Next 16 fn today | realistically 50-80 MB (`next/dist/server` 16 MB, `@anthropic-ai/sdk` 10 MB, `react-dom` 7.1 MB) |
| Total | **~122-152 MB / 250 MB.** Fits, ~100 MB headroom. It is nonetheless the largest thing in the deployment, carried by all three `runReport` routes. |
| `/tmp` on first render per cold instance | ~**194 MB** (chromium.br → 190.6 MB, al2023 → 3.0 MB, fonts → 450 KB). Swiftshader's 14.5 MB is skipped by `chromium.setGraphicsMode = false` — no canvas, no WebGL, no raster in this document. Lambda `/tmp` is 512 MB. |
| Hobby runtime | **2 GB / 1 vCPU**, and on Hobby the default *is* the maximum — `memory` in vercel.json cannot raise it. @sparticuz asks ≥512 MB, recommends 1600. Clears. |
| Duration | Hobby **300s default and maximum**, even with fluid compute. `cron/reports/route.ts:10` already sets 300 with a 240s internal deadline at `:49`. Nothing to buy. |
| Cron | Hobby: **once per day**, ±59 min. A more frequent expression fails at deploy. So "own cron for PDFs" and "retry in an hour" are genuinely unavailable. |
| Sweep arithmetic | one launch per invocation (~5-10s) + ~1-3s per render. 5 PDF reports ≈ 18s; 10 ≈ 28s; 20 ≈ 48s — against 240s. Scales in renders, not launches. |

### New files

```
src/lib/pdf/browser.ts          # one launch, one shutdown, the circuit breaker
src/lib/pdf/readout-pdf.ts      # html -> Buffer. Never throws. Own hard timeout.
src/lib/pdf/fonts/inter-var-b64.ts   # export const INTER_VAR_B64 = "..."
```

The font ships as a **TS module exporting a base64 string**, not an asset read with `fs`. A `readFileSync` is a bet on Next's file tracing; a string constant is a bet on the bundler, which cannot lose.

`next.config.ts` gains `serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core"]`. Without it the bundler tries to inline the `.br` binaries and the function either blows the ceiling or 500s hunting a path. Silent when correct, total when wrong — verify on the first deploy and never let it be "tidied".

### Launch

```ts
// src/lib/pdf/browser.ts — module-level
let browserP: Promise<Browser> | null = null;
let disabled: string | null = null;   // circuit breaker, per invocation
let strikes = 0;

const [{ default: chromium }, puppeteer] = await Promise.all([
  import("@sparticuz/chromium"),      // dynamic: an html-only sweep pays ZERO
  import("puppeteer-core"),
]);
chromium.setGraphicsMode = false;
await puppeteer.launch({
  args: [...chromium.args, "--font-render-hinting=none", "--disable-dev-shm-usage"],
  executablePath: await chromium.executablePath(),
  headless: true,
  defaultViewport: { width: 1280, height: 1600, deviceScaleFactor: 1 },
  protocolTimeout: 25_000,   // BELOW the 20s render cap's outer race + slack.
});                          // A hung CDP call must reject, not sit.
```

**The launch is hoisted above `claimRun`.** In `cron/reports/route.ts`, before the `for (const org of ...)` at `:63`, not lazily inside `runReport`. This is the single most important structural decision in the plan and no design had it: `claimRun` at `:78` writes `state:"claimed"` before `runReport` at `:82`, and `cadence.ts:49` then treats that week as done. An OOM kill or a hard 300s timeout is a **SIGKILL, not a catchable exception** — no catch, no settle, no `report.failed` audit, report stranded at `claimed` for the whole ISO week, recoverable only by a human pressing Send now. The 191 MB brotli expansion and the browser process start are the only parts of this feature that can get the runtime killed, so they happen **outside every claim window**, once, where a failure is an ordinary exception that sets `disabled` for the whole sweep.

`shutdown()` runs in a `finally` wrapping the whole double loop (`route.ts:63-107`), the `sendNow` branch at `reports/[id]/route.ts:66-80`, and the `sendNow` branch at `prototypes/report/route.ts:96-99`. A Chromium that survives a container freeze is a coin flip; we do not flip coins on a weekly executive email.

### Render

```ts
const page = await b.newPage();
try {
  await page.setRequestInterception(true);
  page.on("request", r => /^(data|about):/.test(r.url()) ? r.continue() : r.abort());
  await page.setContent(html, { waitUntil: "load", timeout: 12_000 });
  await page.evaluate(() => (document as any).fonts.ready);
  return await page.pdf({
    printBackground: true,
    format: "Letter", landscape: true, scale: 1,
    margin: { top: "0.4in", right: "0.4in", bottom: "0.5in", left: "0.4in" },
    preferCSSPageSize: false,
    displayHeaderFooter: true,
    headerTemplate: "<span></span>",
    footerTemplate: '<div style="width:100%;padding:0 0.4in;text-align:right;font-family:sans-serif;font-size:8px;color:#95A2AE;">Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>',
    timeout: 15_000,
  });
} finally { await page.close().catch(() => {}); }
```

**Geometry goes in the `pdf()` call, not in `@page`.** Two designs computed 979.2px from `@page{margin:0.4in}` + `preferCSSPageSize:true`. `preferCSSPageSize` governs **size only**; Puppeteer sends explicit margin params to CDP `printToPDF` (0 when the caller omits `margin`) and those beat the document's `@page` margin. Left that way you get ~1056px of layout with the INK masthead full-bleed to the trim, unprintable on any physical printer — and it does *not* fire the mobile query, so it fails silently and looks nearly right. `@page{size:Letter landscape}` stays in the print skin as a belt; the numbers come from the call.

**Request interception is not theatre.** The readout carries tenant-authored prose (`model.story.summaryProse`, analyst notes at `readout.ts:249`), all escaped by `esc` today — but a headless Chrome inside Vercel's network that will fetch arbitrary URLs is one careless future `<img>` from being an SSRF. The document has zero external references by construction, so aborting everything non-`data:` costs nothing.

**Non-Linux dev:** `browser()` checks `process.platform !== "linux"` and uses `CHROME_EXECUTABLE_PATH` if set, else returns unavailable. Exported as `pdfUnavailableReason(): string | null`, deliberately mirroring `mailUnavailableReason()` (`send.ts:81-109`) and the `NEEDS` map (`send.ts:46-50`) so the UI's explanation, the run record's reason and the operator's error cannot disagree.

---

## 2. FIDELITY

**"Perfectly mimic the html" is answered by a channel, not a second document.** `renderReadoutEmail` (`readout.ts:86-98`) gains `channel?: "email" | "print"`, default `"email"`. Called twice with identical opts, different channel. `readout-model.ts` still runs once and remains the only interpretation layer — **one derivation, one skin, one parameter.** The print branch may touch layout, typography and pagination only; never a word, never a number, never a tone. Re-authoring in pdfkit/jsPDF is refused: it would hand-reimplement the four-tier weight scale, the tracked caps, the 5px band, the role chips, the six-column grid and the amber unsettled tags — a second interpretation, which is the exact fork `docs/READOUT-MODEL.md` records eleven defects from.

Mechanically: `F` (`readout.ts:36`) stops being a module const and is chosen per call. `caps()` (`:75`) and `settledTag()` (`:81`) close over it today, so they take it as a parameter. Every other `${F}` interpolation is untouched. The print HTML carries a sentinel `<!--opmc:print-->` and `renderReadoutPdf` **refuses** html without it, so nobody renders the email channel to paper by accident.

### The print `<style>` block

Goes where `MOBILE` goes — `readout.ts:305`. That block is already discarded by Outlook-through-Word (`:283-285`), which is why the shared rules cost the email nothing.

```css
/* BOTH channels */
* { -webkit-print-color-adjust: exact; print-color-adjust: exact; }

/* PRINT channel only — MOBILE is NOT emitted */
@page { size: Letter landscape; margin: 0.4in; }   /* belt; pdf() is the braces */
@font-face { font-family:'Readout'; src:url(data:font/woff2;base64,…) format('woff2-variations');
             font-weight:100 900; font-style:normal; font-display:block; }
body { background:#FFFFFF !important; }
.shell { border-radius:0 !important; overflow:visible !important; max-width:none !important; }
.mtable { table-layout: fixed; }
thead { display: table-header-group; }
.mrow, .mrow > td { break-inside: avoid; page-break-inside: avoid; }
.band, .pcaveat, .phero, .mv { break-inside: avoid; page-break-inside: avoid; }
.mv { break-inside: avoid; }
.prose { orphans: 3; widows: 3; }
.sect { break-after: avoid; }        /* caps() section headings */
```

### Risk → measure

**1. Backgrounds and the severity band.** Two switches, both required, neither sufficient alone. `printBackground: true` in `page.pdf()` (Puppeteer defaults it **false**), and `*{print-color-adjust:exact}` in the style block for the recipient who later prints the PDF and re-enters the same trap. Everything carrying meaning here is a background: the INK masthead (`:312`), the band's paper (`:127`, `bgcolor` + style), the 5px severity rule (`:129`), the 3px movement rules (`:200`), TINT tiles (`:114`), role chips (`:244`), amber unsettled tags (`:84`), the caveat box (`:106`). Left at the default the readout prints black-on-white and severity — the one thing an exec reads — is simply gone. **Not covered:** `footerTemplate` renders in a separate document inheriting neither the page CSS nor colour-adjust. Hence grey text on nothing; it asks for no background.

**2. The mobile query — three locks, and only the first is a guarantee.**
- **Lock 1 (structural).** The print channel **does not emit** `MOBILE` (`:287-303`). The `@media only screen and (max-width:640px)` is *not in the document*. No paper size, no media emulation, no vendor flag can fire what isn't there. This is the whole argument for a channel parameter over media emulation.
- **Lock 2.** Never call `emulateMediaType("screen")`. `page.pdf()` renders under `print`, and `only screen` doesn't match print. It is the obvious thing to reach for when the goal is "look like the email", and it switches the phone skin straight back on.
- **Lock 3 (arithmetic, in case 1 and 2 are ever undone).** Letter **landscape** = 11in × 96 = 1056px, minus 2 × 0.4in (76.8px) = **979.2px** of layout at `scale:1`. Comfortably over 640, a genuine desktop rendering of the fluid `width:100%; max-width:1280px` shell (`:310`), and 13.5px prose (`:108`) prints at its true ~10.1pt.

  *Why landscape.* Portrait Letter at zero margins is 816px — over 640 but only just — and at a conventional 1in margin is **624px**, under the breakpoint, and the PDF silently ships the phone skin (`.m-desk` deleted, rows as cards, `.m-mob` on, hero 54px→44px, tiles two-up). `scale` is the other lever and it is a trap: Letter portrait at 0.6375 lays out at exactly 1280px, matching the shell — and prints 13.5px prose at 6.5pt and the 10.5px tracked caps at 5pt. Unreadable. A 1280px six-column grid is a landscape document. Somebody will ask for portrait; the answer is these numbers, and if portrait is ever genuinely required it needs a narrower print grid — a real design change to `readout.ts`, not a page-setup flag.

**3. Fonts — pin, don't discover.** `@sparticuz/chromium@149.0.0`'s `bin/fonts.tar.br` contains exactly three faces: Open Sans Regular, Bold, Italic. Not one of `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial` (`:36`) resolves in that container; everything falls to generic sans-serif → Open Sans. This file styles at **400/600/700/800** and Open Sans ships **400 and 700 only**, so 600/700/800 all match Bold: the 54px hero (`:172`), the 20px metric change (`:240`), the 14.5px metric name (`:247`) and the tracked headings (`:221`) collapse to one weight. This document carries its hierarchy almost entirely in weight — three of four tiers merge. Same class of failure the file's own header warns about at `:20-23`, arriving by a different door.

  **Fix:** the print channel emits Inter v4 **variable** (SIL OFL 1.1) as a `data:` URI `@font-face`, `font-weight:100 900`, `F` becomes `"'Readout',Helvetica,Arial,sans-serif"`. Subset with `pyftsubset --unicodes=U+0020-007E,U+00A0-00FF,U+2013,U+2014,U+2018-201D,U+00B7,U+2192,U+2026 --flavor=woff2`. **U+00B7** (`&middot;` and the literal `·` at `:180`, `:235`), **U+2192** (`&rarr;` at `:358`) and **U+2014** (the `—` control fallback at `:257`, `:260`) named explicitly — a missing glyph is a tofu box in the middle of the decision metric's supporting line. ~25-35 KB subset → ~35-47 KB base64. **Print channel only** — inlining that into every email is a Gmail-clipping (102 KB) and spam-score problem, and the email's native stack is correct on a real device. `await document.fonts.ready` before `pdf()` is mandatory: `load` does not reliably cover an `@font-face` even from a `data:` URI, and a PDF rendered before the face resolves is a PDF in the fallback, which is the exact failure the pin exists to prevent.

**4. The grid overrun — and it is NOT a font problem.** `COL = {chg:88, role:96, rate:74, ev:104}` = 436px plus 12px right-padding on three cells = **472px committed** before the metric name gets anything (`:219`, `:239-260`). `width` on a `<td>` is a **hint, not a cap**, so `-1,284.0%` at 20px/800 grows the change cell and every column after it shifts. Two designs diagnosed this and then offered the font pin as the fix — nine glyphs at 20px/800 exceed 88px in Inter as readily as in Open Sans. **The fix is `table-layout:fixed` plus a `<colgroup>`** on the metrics table (`:342`), which makes the declared widths binding and wraps the value in place. Landscape's extra room also lets the print skin widen `COL.chg` 88 → 104. Without this the PDF's grid does not align with the desktop email's grid, which is the literal ask.

**5. Page breaks through the metrics table — three failures, none expressible in an inline style.** This is the concrete argument for a print skin.
- `.mrow{break-inside:avoid}` — otherwise a row splits and the `border-top:1px solid RULE` (`:226`) prints at the foot of page 1 with its numbers on page 2.
- `<tr class="m-head">` (`:343`) is promoted to a real `<thead>`, with `metricRows` in `<tbody>` — **emitted in BOTH channels.** Chrome repeats only a `thead`. `.m-head{display:none}` (`:293`) still matches the `<tr>` inside a `<thead>`, and `<thead>` is inert-to-harmless in Outlook-through-Word, so this is one markup with no divergence — it *reduces* the drift surface. Without it page 2 arrives as bare unlabelled columns, and the rescue — the self-labelling `.m-mob` line (`:248`) — is `display:none` outside the mobile query. That is precisely the "1.2% 1.0% 111 vs 92 is three unattributed numbers" failure the mobile card was invented to prevent (`:279-281`), reappearing in print.
- `.band{break-inside:avoid}` on the severity table (`:127-140`). Split it and Chrome re-applies `border-radius:8px 0 0 8px` (`:129`) at each fragment's top edge: a notched bar and paper painting as two disconnected blocks.
- Plus `break-inside:avoid` on the hero (`:165`) and each movement (`:198`), `break-after:avoid` on `caps()` headings, and `orphans:3;widows:3` on prose. Long analyst prose **can still break mid-paragraph** — that is correct for prose and deliberately not suppressed; suppressing it would push whole blocks and leave half-empty sheets.

**6. The card shell does not paginate — decided, not discovered.** `:310` is `max-width:1280px; background:#FFFFFF; border-radius:12px; overflow:hidden` on a `#E8ECF0` field (`:306`, `:308`). In an inbox that is one continuous scroll. Paginate it and page 1 ends in a hard square cut with grey bleeding to the sheet edge, page 2 opens on another, and `overflow:hidden` re-clips per fragment. **The print skin drops the radius, the `overflow:hidden`, the 14px gutter and the grey field**; body goes `#FFFFFF` and the 0.4in page margin becomes the document's white margin. The grey exists to separate the card from mail-client chrome; a sheet of paper is already the field, and a full-bleed grey wash on every page is worse than either. **This is the one place "perfectly mimic" is knowingly not honoured. Tell the owner explicitly — it is a decision, not an oversight.**

**7. The CTA becomes a dead control.** `:357-359` renders "Open the full readout →" as a solid `#101820` button. Chrome emits a real link annotation so it isn't broken — it is wrong-register, and on paper it is a black rectangle telling you to click. The print channel renders `caps("Full readout")` over the **URL as text**, still wrapped in an `<a href>` so the annotation survives on screen.

  **And the URL is currently a dead end for every recipient.** Verified: `src/middleware.ts:31` `PUBLIC_PATHS` is `["/login","/api/auth/admin-login","/api/auth/verify","/loader","/api/loader","/api/git/webhook","/api/prototypes/sync-status","/api/cron"]` — no `/prototypes`. `run.ts:150` points the CTA at `${baseUrl}/prototypes/<key>?tab=analytics`. A recipient is a bare address (`Person` is `{email,name,state}`), so every exec who has ever clicked that button landed on `/login` and could not get in. **That is a live defect in every readout sent so far, and it is independent of this feature** — see §6, Phase 0.

**8. The preheader** (`:307`) is an inbox device (`display:none`); the print channel omits it outright rather than shipping a hidden node.

**Honestly not mimicked:** the recipient's own client. The email renders in SF Pro on a Mac, Segoe UI in Outlook, Roboto on Android; the document has as many renderings as it has clients. A PDF has one width and one face. "Mimic the html" can only mean *the desktop rendering, at one chosen width, in one chosen face* — and pinning is what makes it reproducible at all. Line-wrap points in metric names will differ from Apple Mail; `table-layout:fixed` stops that from breaking the grid.

---

## 3. THE TOGGLE

`src/lib/reports/types.ts`, on `Report` after `cadence` (`:80`):

```ts
/** WHAT LANDS IN THE INBOX. Optional, read as `?? "html"`, so every stored
 *  record keeps today's exact behaviour with no migration. */
format?: "html" | "pdf" | "both";
```

Reports are JSON blobs behind `getFlag`/`setFlag`, so an absent field is simply absent. `migrate.ts` is untouched.

| value | what goes out |
|---|---|
| `"html"` **(default)** | Byte-identical to today. No browser, no `/tmp`, no dynamic import, no cold-start second. This must stay free. |
| `"both"` | The email HTML exactly as today (email channel, mobile query intact — it still reads on a phone) **plus** the print-channel PDF attached. Two renderings of one derivation, each correct for its medium. |
| `"pdf"` | The attachment **plus a body**, because an empty body is a spam signal and reads as a bug. The body is **not new prose**: it is the existing `text` part (`readout.ts:373-402`) — already a complete readout — as the `text/plain` alternative *and*, escaped into `white-space:pre-wrap` under the INK masthead, as the HTML part. The only authored sentence is one line naming the attachment, defined once in `readout.ts` beside the other strings. Nothing is invented, nothing is said twice differently, and a recipient whose gateway strips attachments still has the whole readout. |

`"pdf"` is the value most likely to disappoint — someone picks it expecting a tidy covering note and gets the plain-text readout. That is the honest choice, and it must be *shown* before they save (below), not just described afterwards.

**Filename:** `readout-<slug(prototypeKey)>-<model.runtime.asOfDate>.pdf`, falling back to the ISO week when `asOfDate` is absent or `"—"` (degrade, never invent). Capped 80 chars, `contentType: "application/pdf"`.

### UI — `src/components/ReportDetail.tsx`

A **Format** card between "When" (`:165-192`) and "Last run" (`:194`), same grammar as every other zone: `<div className={CARD}>`, `<div className={ZH}>Format</div>`, and a select shaped exactly like the cadence select at `:169-175`, posting through the existing `post()` at `:57`.

```tsx
onChange={(e) => void post({ format: e.target.value }, "format")}
<option value="html">HTML email</option>
<option value="both">HTML email + PDF attachment</option>
<option value="pdf">PDF attachment only</option>
```

The caveat underneath is **computed**, in the same `text-[12.5px] text-muted-2` voice as the cadence caveat at `:187-190` — never a tooltip, never a question:

- `html` — "Nothing is attached. The message is the readout."
- `both` — "The PDF is the desktop layout on US Letter landscape. Everyone gets both."
- `pdf` — "The message body still carries the plain-text readout, so it survives a gateway that strips attachments."

When `pdfUnavailableReason()` is non-null that sentence replaces all three and the two PDF options are **disabled** — the identical discipline as `mailUnavailable` at `:106`. `pdfUnavailable` is added to the GET payload at `reports/[id]/route.ts:27-37`, beside `mailUnavailable` at `:34`.

It goes in its own card rather than the header: the header already owns "what the subject is, and who it's from" (`:96-100`). Format is a different fact.

**Send-now inherits the report's format.** No second control — a second control is how the two drift and how somebody mails the board a cover note with no attachment.

### API — `src/app/api/reports/[id]/route.ts`

Body type at `:45-54` gains `format?: Report["format"]`. Validated beside the cadence clamp at `:116-120`:

```ts
if (body.format === "html" || body.format === "pdf" || body.format === "both") patch.format = body.format;
```

Anything else is ignored, not defaulted. The audit line at `:138` picks it up from `Object.keys(patch)` for free. **Nothing is added to the `enabled` preconditions at `:125-134`** — a report with `format:"pdf"` and no renderer must still be schedulable, because it degrades to a working email rather than to nothing. The disabled option with its inline reason is what stops that being a silent lie.

**`maxDuration` on the three entry points:**
- `cron/reports/route.ts:10` — 300, unchanged.
- `reports/[id]/route.ts:13` — **already 120. Leave it.**
- `prototypes/report/route.ts:12` — **60, must be raised to 120.** Its `sendNow` at `:96-99` calls the same `runReport`. Cold brotli expansion + launch + render + up to 50 per-recipient provider round-trips does not fit 60s. If for any reason it cannot be raised, that route's `sendNow` must pass an explicit `format:"html"` override — but raising it is correct, because the two Send-now paths otherwise behave differently for the same report.

---

## 4. THE PLUMBING

**One seam change.** `sendEmail` opts at `src/lib/email/send.ts:144-152`:

```ts
attachments?: { filename: string; content: Buffer; contentType: string }[];
```

Threaded through the `sendOne` call at `:189` into the `msg` parameter type at `:206-210`. Everything below hangs off that. An absent array spreads to nothing on all three providers, so `html` mode is untouched.

**GMAIL / nodemailer — easiest.** Field `attachments`. No encoding by you: nodemailer takes `content` as a Buffer and builds the `multipart/mixed` body and base64 transfer-encoding itself. After `text: msg.text,` at `:218`:

```ts
...(msg.attachments?.length ? { attachments: msg.attachments.map(a => ({ filename: a.filename, content: a.content, contentType: a.contentType })) } : {}),
```

Ceiling: 25 MB **after** base64 (×1.37) ≈ 18 MB of real bytes.

**RESEND — easy, one trap.** Field `attachments`, `{ filename, content, content_type }`. Over raw HTTP JSON `content` **must be a base64 STRING**. A Buffer is only accepted by Resend's Node SDK, which serialises it for you; this file hand-rolls `JSON.stringify` at `:277` and a Buffer there becomes `{"type":"Buffer","data":[…]}` and is rejected or corrupted. After `text: msg.text,` at `:282`:

```ts
...(msg.attachments?.length ? { attachments: msg.attachments.map(a => ({ filename: a.filename, content: a.content.toString("base64"), content_type: a.contentType })) } : {}),
```

Ceiling: 40 MB total.

**MAILGUN — the awkward one. Three coupled edits, and one is a deletion.** Field is `attachment`, **singular**, repeated per file, and it must be a multipart **file part**: Mailgun's HTTP API only takes attachments as `multipart/form-data`, and `send.ts` posts `application/x-www-form-urlencoded` today.

1. `:236` — `new URLSearchParams()` → `new FormData()`. The six `form.set(...)` lines at `:237-242` survive verbatim, `h:Reply-To` included (FormData has `set`).
2. `:248` — **DELETE** `"Content-Type": "application/x-www-form-urlencoded"`. **This is the trap.** `fetch` only writes `multipart/form-data; boundary=…` when Content-Type is left unset. Leave the line with a FormData body and undici sends the declared type with no boundary, Mailgun returns a bare 400, and none of the 401/404/403 branches at `:254-264` explain it — the operator-facing error this file works hardest on goes mute.
3. `:250` — `body: form.toString()` → `body: form`. `.toString()` on FormData yields the literal `"[object FormData]"` and Mailgun accepts a message with no fields.

Then per file, after `:242`:

```ts
form.append("attachment", new Blob([new Uint8Array(a.content)], { type: a.contentType }), a.filename);
```

(`new File([...], a.filename, {type})` also works on Node 20+; the `Uint8Array` wrap avoids a TS complaint about `Buffer` as a `BlobPart`.) Ceiling: 25 MB total.

### Where the PDF is generated

**`src/lib/reports/run.ts`, once per report**, after `payload` is assembled at `:157` and before `sendEmail` at `:165`. **Never inside `sendOne`.** `validRecipients` caps at 50 (`send.ts:131`) and `sendEmail` loops per recipient (`send.ts:187`), so an in-loop render is up to 50 Chromium renders of one document. Rendered here, the existing loop reuses the same Buffer with no change to it.

The loop at `run.ts:135-158` must keep `built` and `proto` alongside `payload`, since the print channel needs the same opts as `:147-153`.

```ts
const format = r.format ?? "html";
let pdf: Attachment | null = null;
let pdfDropped: string | null = null;
if (format !== "html") {
  const printed = renderReadoutEmail({ ...sameOptsAsLine147, url: publicLink, channel: "print" });
  const out = await renderReadoutPdf(printed.html, { budgetMs: opts.budgetMs });  // NEVER THROWS
  if (out.ok) pdf = { filename: pdfName(proto, built.model), content: out.buffer, contentType: "application/pdf" };
  else pdfDropped = out.why;
}
const coverOnly = format === "pdf" && pdf;           // NOTE THE GUARD — see §5
const out = await sendEmail({
  to, subject: payload.subject,
  html: coverOnly ? payload.textAsHtml : payload.html,
  text: payload.text,
  ...(pdf ? { attachments: [pdf] } : {}),
});
```

`runReport` opts gain `budgetMs?: number`. Cron passes `deadline - Date.now() - 30_000` from `route.ts:49`; both Send-now paths pass `45_000`.

`SendOutcome` (`run.ts:111-116`) and `ReportRun` (`types.ts:47-67`) each gain:

```ts
pdf?: { state: "attached" | "dropped"; bytes?: number; ms?: number; why?: string };
```

Per-report, not per-entry — the attachment is a property of the message, and `entries` is one line per experiment.

**Egress, worth knowing and not worth changing:** per-recipient sending is deliberate (`send.ts:161-172`) and the BCC reasoning still holds, so a 400 KB PDF to 50 people is 20 MB of provider upload per report per week.

---

## 5. FAILURE

**The rule: a failed render degrades that report to HTML-only and records why. It never fails the report, never retries the render, never blocks the sweep.** `renderReadoutPdf` returns `{ok:true, buffer, ms}` or `{ok:false, why}` and **never throws** — the same posture as `buildFor` (`run.ts:45-109`), which already refuses to let one unreadable experiment cost the whole report.

**What counts as a failure:** launch throws; non-Linux with no `CHROME_EXECUTABLE_PATH`; `setContent` > 12s; `page.pdf` > 15s; outer race > 20s; the pre-flight budget check says there is not enough clock; empty Buffer.

**Four tail defences, because the danger is the tail and not the mean:**

1. **Pre-flight skip, no work at all.** `budgetMs = Math.min(20_000, deadline - Date.now() - 30_000)`. If `budgetMs <= 0`, return `{ok:false, why:"no time left in today's sweep"}` without touching the browser.
2. **Hard timeouts at both levels, plus force-close.** `timeout` on `setContent` and on `pdf()`, an outer `Promise.race`, and `protocolTimeout: 25_000` on the launch. An outer race does **not** unwind a hung CDP call — on timeout the page is force-closed in the `finally`, and a leaked page is a leaked renderer process in a 2 GB sandbox.
3. **Invocation-level circuit breaker.** Two consecutive failures (timeout or launch) set `disabled` and every remaining report skips the render instantly with `why: "PDF rendering was failing during this sweep"`. Without it, ten reports × 20s = 200s of a 240s budget and everything behind falls to `deferred` (`route.ts:65-70`) — a bad PDF day would cost reports their week that had nothing to do with PDFs. With it, a total failure costs the sweep ~40s. Per-invocation, not persisted: tomorrow starts clean.
4. **The launch is outside the claim window** (§1). This is the one that matters most, because an OOM SIGKILL is not catchable and the claim at `store.ts:115-128` is what costs a report its week.

**Per format, when generation fails:**

- **`html`** — nothing can fail. No dynamic import, no browser, no new failure mode.
- **`both`** — the email goes exactly as today, minus the attachment. `run.pdf = {state:"dropped", why}`. The reader loses only the printable copy.
- **`pdf`** — **the one an implementation gets wrong.** Note the `coverOnly = format === "pdf" && pdf` guard above: with no attachment the body **upgrades to the full HTML readout**, not the plain-text cover. A message saying "the readout is attached" with nothing attached is a pointer at a hole. The stored `format` is untouched; only this send degrades.

**Where a human sees it:**

- `ReportRun.pdf`, written by the settle at `cron/reports/route.ts:83-94` beside `entries` — the same argument the `entries` comment makes at `types.ts:64-66`: answerable from the record, not from a log.
- The **Last run** card (`ReportDetail.tsx:194+`) computes the sentence, never shows a raw code: *"The PDF didn't render this week — the renderer timed out after 20s. The readout went out in the message instead. Send now will retry it."*
- The audit detail at `route.ts:96` gains `· pdf dropped` — one fact, one home, appended to the existing `report.sent` event rather than minting a separate one. It lands in the org-scoped `/settings/activity` feed either way.
- **Send-now** (`reports/[id]/route.ts:75-79`) adds it to the same `warning` channel it already uses for partial delivery, so a human pressing the button is told immediately rather than discovering it in the inbox. Send-now is the recovery path: Hobby's one-cron-per-day means there is no same-day retry, so once the cause is fixed a human re-sends and `lastManual` records it without touching `run` (`:68-73`) — Monday's idempotence is untouched.

**One thing to fix while in here, because every tail argument above depends on it:** `route.ts:68` increments a `deferred` counter that exists only in a cron response body **nobody reads** — Vercel does not surface a Hobby cron's response. Add `await audit(report.orgId, "system", "report.deferred", report.name, "the sweep ran out of time")` inside that branch. Otherwise the exact failure all this machinery exists to prevent is the one failure with no operator-visible trace, and the first signal is an executive asking where the email went.

**Third-party outage:** there is none. Nothing is fetched, nothing is posted, no key is presented. The only external dependency on the delivery path remains the mail provider, exactly as today.

---

## 6. PHASING

**Phase 0 — `/r/[token]`, and it ships independently of everything else.** The dead CTA is a verified live defect in every readout sent so far (§2.7). A public, no-session readout page: HS256 JWT via `jose ^6.2.3` (already a dependency), payload `{orgId, reportId, protoKey, asOf, exp}`, new `READOUT_LINK_SECRET`, `/r` added to `PUBLIC_PATHS` (`middleware.ts:31`), `X-Robots-Tag: noindex,nofollow`. It serves the print-channel HTML verbatim with a Save-as-PDF button calling `window.print()` — the reader's own browser is a real renderer with real fonts, at zero bundle cost. **Constraint:** `buildFor` is *not* exported from `run.ts` (only `resolveScope`, `SendOutcome`, `runReport` are), so extract it to `src/lib/reports/build.ts` first — otherwise `/r` becomes a **fourth** `runReport` importer and drags 72 MB into a public unauthenticated route. Do this refactor in Phase 0 whether or not the PDF ships.

**Phase 1 — the print channel, with no PDF anywhere.** `channel` param on `renderReadoutEmail`, the `F` refactor through `caps()`/`settledTag()`, the `<thead>`/`<tbody>` promotion in **both** channels, `print-color-adjust` in both channels, `table-layout:fixed` + `colgroup`, the print `<style>`, the CTA swap, the font module, the `<!--opmc:print-->` sentinel. Verifiable by eye through `/r/[token]` and a `scripts/readout-print.ts` that writes the HTML to disk (`tsx` is already a devDependency). **No dependency added yet.** Everything fidelity-critical is testable before a single megabyte enters the bundle.

**Phase 2 — attachments in the send seam.** The `attachments` opt and all three providers. Testable with a 1 KB text file and no renderer at all — which is the right way to find the Mailgun Content-Type trap, in isolation rather than tangled with a Chromium bring-up.

**Phase 3 — the engine.** Deps, `serverExternalPackages`, `src/lib/pdf/*`, the hoisted launch, the breaker, the budget guard, `renderReadoutPdf`. Verified against a deliberately 12+-metric report so the two-page case exists before a real audience sees it.

**Phase 4 — the toggle.** The `format` field, validation, the UI card, `pdfUnavailable` in the GET payload, `ReportRun.pdf` and the Last-run sentence, the `deferred` audit, `maxDuration = 120` on `prototypes/report/route.ts`. Default `"html"` throughout, so nothing changes for anyone until a human chooses it.

**A CI floor from Phase 3 on:** `scripts/readout-pdf.ts` renders a fixture and asserts first-page MediaBox = 792 × 612 pt (Letter landscape — readable from the PDF header without a parser dep), page count, one known background colour present, and a byte-size band. A golden-bytes comparison is too brittle to be useful. Pin `@sparticuz/chromium` exact and treat a bump as a **visual change requiring a look at a rendered readout**, not a dependency patch — a Chromium bump moves break placement and hyphenation.

---

## 7. WHAT THIS DOES NOT DO

- **It does not reproduce any recipient's client.** SF Pro on a Mac, Segoe UI in Outlook, Roboto on Android. The PDF is Inter at 979px on landscape Letter. That is the honest meaning of "perfectly mimic", and the owner should be told it rather than discovering it holding the PDF next to Apple Mail.
- **It drops the grey field and the 12px radius in print.** Deliberate — `overflow:hidden` makes the shell a monolithic fragmentation container Chrome will clip rather than paginate, and a full-bleed grey wash on every sheet is worse. The one place fidelity is knowingly traded, and it is a decision, not a bug.
- **It does not offer portrait.** The numbers forbid it (624px under the breakpoint; the `scale` escape prints prose at 6.5pt). Portrait would be a narrower print grid — a real design change.
- **It does not make html-only reports cheaper or slower.** But it does make **all three** `runReport` routes 72 MB fatter to fetch and unpack at cold start, whether or not any report asks for a PDF. The dynamic import keeps the `/tmp` expansion and process start off html-only invocations; nothing shrinks the deployment. That is the price of no vendor, paid in full.
- **It does not keep a warm browser between invocations.** 5-10s available and declined: a Chromium that survives a container freeze is a coin flip, and a hung one costs a report its week. Revisit only with real cron timings off the `ms` field at `route.ts:112`.
- **It does not suppress prose breaking across pages.** Structural units only.
- **It does not add a retry, a queue, or a second cron.** Hobby is one run per day at ±59 min and 300s is default *and* maximum with no purchasable extension. An outage in that window costs that week's attachment, full stop, until a human presses Send now.
- **It does not do multi-experiment.** `runReport` is one experiment per report until the digest ships (`run.ts:8-13`, `:136-140`), and the UI refuses a multi-prototype scope (`reports/[id]/route.ts:96`). The toggle must not imply otherwise. When the digest lands, the pagination work is already done — which is an argument for doing it properly now.
- **It does not send tenant data anywhere new.** No third party, no key, no DPA, no status page to watch. If a per-org "never render" lever is ever wanted — for a tenant contract, or just to keep an org's reports off the render path — it is a one-field addition beside `format`, read in `runReport`. Not built now; the seam is shaped so it is one line when asked for.