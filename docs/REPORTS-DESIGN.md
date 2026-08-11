# Reports — email as a first-class object

*Designed 2026-08-11. Status: **design agreed, nothing built.** Supersedes the
per-prototype `ReportSettings` blob in `src/lib/prototypes/report.ts`.*

**Why this exists.** Email is configured per prototype, from inside the
prototype, as one JSON flag at `report:<key>` holding a flat recipient list and
one optional weekly day. There is no address book, no way to name a group, and
no way for one send to cover more than one experiment. The owner asked for
schedules and groups that live outside the prototype.

**Verified before designing:** `curl -i https://outrigger-prototype-management-cons.vercel.app/api/cron/reports`
returns 401 carrying `x-robots-tag: noindex, nofollow` — a header only
`src/middleware.ts:52` sets. The edge rejects the cron before either handler
runs. **Scheduled readouts have never fired in production.** Phase 0 below is
that fix and it is worth shipping on its own.

---

# Reports — one buildable design

**Before anything else, the blocker that makes every version of this dead on arrival.** `src/middleware.ts:22` — `PUBLIC_PATHS` does not contain `/api/cron`, and the only Bearer bypass is `/api/prototypes*` + `Bearer opmc_`. A Vercel cron carries `Authorization: Bearer $CRON_SECRET` and no session cookie, so the edge 401s `/api/cron/reports` before the route runs. Scheduled readouts almost certainly do not fire in production today. Add `/api/cron` and `/api/r/u` (unsubscribe) to `PUBLIC_PATHS`; both routes do their own secret/HMAC check. Verify with `curl -H "Authorization: Bearer …"` against prod before building anything else — if it 200s, the diagnosis is wrong and the sweep has another problem.

---

## 1. THE IDEA

You stop attaching email to an experiment and start owning **Reports**. A Report is a named thing with an audience, a coverage rule, and a day — experiments flow through it. One report covering one experiment renders today's email byte-for-byte; one covering several renders a digest, so nothing in anyone's inbox changes on deploy day.

## 2. THE OBJECTS

Flags, not tables. The design promises **next send** and **last run** — both single fields on the record. History is already answered by `audit_event` (org-scoped, indexed `(org_id, at desc)`, surfaced at `/settings/activity`). No `ContentStore` method is added, so `store-fs.ts` and `store-neon.ts` cannot drift. The object model maps 1:1 onto a `report` table keyed `(org_id, next_run_date)` when the sweep outgrows reading every blob — a storage swap, not a redesign.

**Report** — `report:v2:<orgId>:<reportId>`, `src/lib/reports/types.ts`
```ts
interface Report {
  id: string; orgId: string;          // orgId ON THE RECORD; the guard reads this, never the key
  name: string;                        // IS the subject line, verbatim, forever
  enabled: boolean;
  scope: { mode: "selected"; keys: string[] } | { mode: "all-live"; siteKey?: string };
  audience: { mode: "group"; groupId: string } | { mode: "list"; people: Person[] };
  cadence: { kind: "weekly"; day: 0|1|2|3|4|5|6 } | { kind: "manual" };
  run?: {                              // WRITTEN ONLY BY THE SWEEP — the idempotence ledger
    periodKey: string;                 // "2026-W33"  ← ISO week, not date
    state: "claimed" | "sent" | "failed";
    at: string; late?: boolean;
    deliveredTo?: string[];
    failures?: { to: string; error: string }[];   // PARTIAL ≠ FAILED. Separate field.
    error?: string;                                // whole-run failure only
    entries?: { key: string; name: string;
                state: "ok" | "frozen" | "unavailable" | "skipped"; reason?: string }[];
  };
  lastManual?: { at: string; by: string; to: string[] };   // never touches run
  createdAt: string; createdBy: string; updatedAt: string;
}
interface Person { email: string; name?: string;
  state: "receiving" | "unsubscribed" | "undeliverable";
  unsubscribedAt?: string; lastDeliveredAt?: string; }
```
**RecipientGroup** — `group:v1:<orgId>:<groupId>`: `{ id, orgId, name, people: Person[], … }`. Live **reference**, not snapshot — edit once, every report follows, which is what was asked. `run.deliveredTo` is the evidence; the group is the intent. `name` seeded from `store.listMembers(orgId)`; anything not a member renders "external", computed, never asked.

**Index** — `reports:index:<orgId>` → `{ reports: string[]; groups: string[] }`. One extra read per org; the store exposes no prefix scan (`store.ts:33-42`).

**Mail ledger** — `reportledger:<orgId>` → `{ "YYYY-MM-DD": { "sarah@x.com": [reportId, …] } }`, pruned to 14 days. **Record, not gate** — see §5.

**Unsubscribe state** lives on the `Person` inside the group/list and is **org-wide**: the endpoint flips that address to `unsubscribed` in every group and list in the org. An exec on three reports must not click three times; the second click is the spam button.

**Guard** — `src/lib/reports/guard.ts`, `guardReport(reportId)`: load the blob, read `record.orgId`, `canAccessOrg()` (`active-org.ts:31-33`). A forged id containing another org's slug fails because the record it loads carries the true org. `assertScopeInOrg` runs `resolvePrototypeOrg()` (`prototypes/org.ts:10-19`) over every key on **write and again at send** — without the send-time check a saved report is a cross-tenant read primitive. `tokenAllowed` is hard-coded false, not a parameter: this route mails real people.

## 3. THE SCREENS

New top-level sidebar item **Reports**, in the "Work" group under Prototypes (`Sidebar.tsx:73-76`). DESIGN-PRINCIPLES §3 forbids nav that mirrors machine subsystems; a Report is a first-class object a human creates and names, the same class as a Prototype, and it spans prototypes so it cannot live inside one.

**`/reports`** — one table: Report (name + scope line) · Audience ("Leadership · 6") · Cadence · Last sent (attention dot if that run had failures) · Next send. Above it, **one computed sending line, stated once for the whole screen**: the real `fromAddress()`, the one daily window, and the viewer's local equivalent computed client-side — "Reports go out in the daily window around 13:00 UTC (06:00 your time)." No timezone field is stored. Or the honest failure: `mailUnavailableReason()` + "Lists and schedules can still be saved" — the saveable-but-not-sendable state survives verbatim.

**`/reports/[id]`** — five sections, one card grammar. Header (inline name, one status line, `Scheduled`/`Paused`/`Manual only`). Audience (group chip or people chips; unsubscribed struck through with the date, never deleted — deleting loses *why* and someone re-adds them next month; combobox seeded from `listMembers`). Coverage (radio, plus **always** the resolved set right now with current verdict labels — that is what makes `all-live` honest). Cadence (weekly + day, or manual; the computed sentence names the day and the shared window). Last run (failures on their own line, naming addresses). Footer: **Preview** (`/api/reports/[id]/preview`, exact HTML, no send) and **Send now**.

Send-now dialog computes its caveats: "This report is also scheduled to go out today," and, from the ledger, "2 of these 6 already received the Monday exec digest today."

**On the prototype page:** the modal at `ResultsPanel.tsx:1650-1748` is **deleted**. Two homes for a recipient list is the say-it-once violation this work exists to remove. Replaced by one read-only line — "In 2 reports: Monday exec digest, Outrigger weekly · Manage →" — plus **"Email this readout"**, a one-off to typed addresses that creates and schedules nothing. Cost it now, not after: that line needs the org index + every report blob. Compute it in the page's existing server load with a per-request memo of `listReportsForOrg(orgId)`; flags cannot index `scope`, and neither could a table with JSON scope.

## 4. THE DIGEST EMAIL

`readout.ts` (405 lines) splits into `readout-chrome.ts` (doctype, masthead, footer, the `@media max-width:640px` block, the `HUE` palette at `:49-63`) and `readout-body.ts` — `renderReadoutBody(model) → {html, text}`, unchanged, **no `abridged` parameter**. `renderReadoutEmail` becomes chrome + body and must produce byte-identical output: golden-file the current HTML and text for the existing fixture **before** the split, byte-diff after, non-empty diff = failed split. That file's longhand-only styling exists because Outlook renders through Word.

**One message per report per run, never N.** Six prototypes to eight people is 8 sends, not 48, inside one 300s window.

Shape A — one experiment: today's document, unchanged, plus one line naming the report. Every migrated report is this case.

Shape B — the digest, in order:
1. **Masthead** — `EXPERIMENT READOUT · MON 17 AUG · 6 EXPERIMENTS`, H1 = `report.name`.
2. **The board** — one row per experiment: the 5px severity rule (`BAND[severity].rule`), name, `verdict.label`, `decision.headline.text`, `runtime.dayLabel`. Six rows fit a phone. **The board is the digest** for the reader who reads nothing else. Every cell is a `ReadoutModel` field.
3. **Full bodies, capped at three** — `renderReadoutBody(model)` unmodified, for the worst three by `verdict.severity`. Four full readouts is a document nobody scrolls.
4. **Compact blocks** for the rest — name, verdict chip, decision number, `model.headlineFloor` (always present, always true), deep link to `?tab=analytics`.
5. **The covered set, stated** — every experiment excluded and why. "2 archived, not reported." "Sunset banner: couldn't read Optimizely today, showing nothing rather than guessing (last good reading 8 Aug)."
6. **Footer** — `shortNotice()` + `provenanceLine()` from `src/lib/brand.ts`, why-you-got-this, one-click unsubscribe.

Order by `verdict.severity` (bad → caution → good → neutral), then decision magnitude. A guardrail breach must never be row six. Ordering is meaning-adjacent, so `orderReadouts()` lives in `readout-model.ts`, not the renderer.

**Subject = `report.name`, verbatim.** Not a count: `readout-model.ts:804-809` already records why a churning subject is wrong, and a stable subject keeps the weekly series threading. The tally goes in the **preheader**, built by `buildDigestPreheader(models)` in `readout-model.ts` — the derivation layer, so the digest is not a second interpretation. `docs/READOUT-MODEL.md` records the eleven defects the last fork produced.

**Unsubscribe ships with it, not after.** `List-Unsubscribe: <mailto:…>, <https://…/api/r/u?t=…>` + `List-Unsubscribe-Post: List-Unsubscribe=One-Click`. Stateless HMAC of `orgId|email` over `REPORT_UNSUB_SECRET` (fallback `CRON_SECRET`); note in `SECURITY-ROTATION-RUNBOOK.md` that rotation breaks previously-mailed links. Per-recipient sending is what makes a per-recipient token trivial. Recurring mail to a saved list from a verified domain is where Gmail/Yahoo bulk-sender rules bite.

Extend `docs/dev/preview-email.mts` → `preview-digest.mts`. A six-section digest is unreviewable otherwise.

## 5. THE SWEEP

`GET /api/cron/reports`, `maxDuration = 300`, `vercel.json` unchanged (two crons is Hobby's ceiling; this adds none).

0. **Fail closed.** `if (!process.env.CRON_SECRET) return 503`. Today `route.ts:22` is `if (secret && …)` — unset secret leaves an open GET that triggers real sends. Idempotence capping the damage is a side effect, not a guard.
1. `mailConfigured()` false → `{ skipped }`, touch nothing.
2. Migrate once, behind the two-phase lock (§6).
3. `deadline = start + 240_000`. `periodKey = isoWeek(now)`.
4. Per org, in rotation by longest-waited, read the index then each report blob:
   - **Due?** `enabled` ∧ `cadence.day === now.getUTCDay()` ∧ `run?.periodKey !== periodKey` ∧ audience has ≥1 `receiving` person. Grace: if yesterday was the day and no run exists for this period, fire with `late: true`. A **claimed** run whose `periodKey` is strictly in the past counts as missing (an invocation that died between claim and settle); the current period's claim never re-drives.
   - **Claim.** CAS the blob from its exact raw string to the same object with `run = { periodKey, state: "claimed", at }`. **Lose the CAS → skip entirely.** Claimed before a byte leaves.
   - **Resolve scope** through `resolvePrototypeOrg()`, not `proto.orgId` (`route.ts:44` today hard-fails legacy records the UI guard silently heals — schedulable, then never sends). Drop shipped/archived from `all-live`; record them as `entries[].state="skipped"` with a reason. Explained silence: "why isn't this in my digest" must be answerable from the record.
   - **Build.** `buildReadoutFor(orgId, proto) → { model } | { unavailable: reason }`, extracted from the inline recipe at `report-run.ts:38-97`, **never throws**, 20s per entry. It stops throwing on an unreadable fetch (`report-run.ts:45`) and passes `results: null` to `buildReadoutModel`, which already falls back to `verdict.frozenResults` (`readout-model.ts:432-433`) and emits the `frozen-snapshot` notice (`:696-699`). The reading stays **cached** — a job that can trigger an Opus call per prototype at 13:00 costs real money, and a digest multiplies it by twelve.
   - **Render**, **resolve audience** (minus `unsubscribed`/`undeliverable`, through `validRecipients`), **send** — `sendEmail()` untouched.
   - **Settle.** CAS 3× (dueness already false, so a lost settle re-reads and re-applies): `state = accepted.length ? "sent" : "failed"`, `deliveredTo`, `failures`, `entries`. Append each accepted address to `reportledger:<orgId>`. `audit(orgId, "system", "report.sent", reportId, "…")`.
   - **Budget:** `if (Date.now() > deadline) break` before each report. A deferred report was never claimed and fires tomorrow with `late: true`; audit `report.deferred` and surface it.
5. Return `{ ran, byOrg: { [orgId]: { sent, failed, deferred } } }`.

**The guarantee.** The key is `(reportId, isoWeek)` — not `(reportId, date)`. Move a weekly report from Monday to Thursday on a Wednesday and a date key sends twice in one week; the week key does not. Not prototype-keyed, so two reports covering the same experiment no longer suppress each other. Manual sends write `lastManual` and never touch `run` — with groups, mailing one colleague must not cancel Monday's leadership digest.

**Judge disagreement, resolved against the graft.** Two judges wanted the person-day ledger as a *gate* — Sarah in two Monday reports gets one email. Rejected as a gate: that silently withholds a report someone was deliberately added to, which is the lost-recipient failure nobody reports, and it drops content rather than merging it (Design 2 could gate only because it unioned first, which costs the stable subject and the report-as-object). The ledger is kept as a **record**, and it earns its keep three times: the report editor computes overlap at author time ("3 people here also get Monday exec digest — they'll receive both"), the Send-now dialog computes the same caveat, and after the fact "was Sarah mailed today, by what" is answerable. Compute the caveat, never ask; visible duplication beats invisible suppression.

**One prototype fails →** the other five are unaffected, and it is never omitted: live → frozen snapshot (with its notice) → a stated absence naming the reason, with a neutral board row. All entries unavailable → the digest still sends saying so; silence is indistinguishable from "nothing happened," and a dead token would otherwise go unnoticed for a month.

**Ceiling.** 6 orgs × 3 reports × 5 experiments = 90 Optimizely calls + ~144 provider round-trips ≈ 70s. It breaks near 200 round-trips/day. The fix then is Design 2's fan-out — `/api/cron/reports` enqueues, `/api/reports/[id]/run` executes one report under the cron secret — which changes no object above. **Build it the first time the response reports a `deferred` org, not before**, and budget its two unstated prerequisites: the middleware exemption, and an `x-vercel-protection-bypass` header on the self-fetch (Deployment Protection intercepts a function's call to its own origin and returns Vercel's challenge, which `CRON_SECRET` does not answer).

**On Pro.** Per-minute crons make the hour real: three coordinated edits — `vercel.json`, `SWEEP_HOUR_UTC` (`report.ts:29`, the only place the hour is written), and an hour test restored to the due check. The cadence union gains `hour` **then**, not now. A schedule set for any hour after a once-daily sweep would silently never send.

## 6. MIGRATION

Faithful, not tidy: **one report per prototype that had settings**. The contract is that next Tuesday's mail is identical to last Tuesday's, and because a one-experiment report renders `renderReadoutEmail` unchanged, that contract is literally kept. No merge action ships — with three prototypes there is nothing to merge, and a bulk merge silently converts N emails into one digest.

Runs at sweep start **and** on first load of `/reports`, behind a **two-phase** lock — `compareAndSetFlag("reports:migrating:v2", null, iso)` to enter, `reports:migrated:v2` written only after reconciliation passes. A single create-only lock taken at the start contradicts re-entrancy: a crash mid-run strands the remainder behind a lock nothing releases.

Per prototype with settings (`getReportSettings(key)`, skip if no recipients and no schedule):
- `orgId = await resolvePrototypeOrg(proto)`; unresolvable → **do not create**, log it, leave the legacy flag. A report with no org is a report with no guard.
- `name` = the prototype name. `scope = { mode: "selected", keys: [key] }`.
- `audience = { mode: "list", people }` — every address copied **verbatim, before validation**, `state: "receiving"`, `name` from `listMembers`. Invalid entries are kept and flagged on the card. A dropped address is a person who stops receiving and never complains (`report.ts:56-57`).
- `cadence` = `schedule ? { weekly, day } : { manual }`; `enabled = schedule?.enabled ?? false`.
- **Carry the stamp:** `run = { periodKey: isoWeek(lastSentAt), state: "sent", at: lastSentAt, deliveredTo: lastSentTo ?? [] }`. Deploy at 12:59 on a Monday that already sent and the 13:00 sweep sees the period claimed and skips. The week key also closes an existing hole where changing `schedule.day` mid-week sent twice — put that in the release note so it isn't mistaken for a missed send.
- **`lastError` is split, not copied.** `/^\d+ of \d+ didn't go out/` → `run.failures`, `state: "sent"`. Anything else → `run.error`, `state: "failed"`. Fixed in the data, not the display.

**Reconciliation, then commit.** Count distinct addresses in (across every `report:<key>`) vs out (across every created record), per org. Mismatch → **abort before writing `reports:migrated:v2`**, leave the legacy path running, surface it. A counted check, not a code review.

Rename `report:<key>` → `report:legacy:<key>`; nothing reads it. Not deleted — one release of recoverability (the store has no `deleteFlag`; that is named debt).

**In the same deploy, the old path is removed:** `scheduleDue()`, the flat `listPrototypes()` loop in `cron/reports/route.ts`, the modal. Two live senders is the double-send. Audit `report.migrated` per created record.

**Standing rule:** nobody receives a new kind of mail because they upgraded. Any capability beyond what the legacy blob held is opt-in.

## 7. PHASING

**Phase 0 — half a day, ship alone, today.** Middleware `PUBLIC_PATHS`; fail-closed `CRON_SECRET`; `resolvePrototypeOrg()` in the sweep; split partial-success from failure (`report-run.ts:126` → separate field, `ResultsPanel.tsx:1733` stops rendering a 4-of-5 send as red); fix the BCC lie at `ResultsPanel.tsx:1664` (`send.ts:161-195` sends one message per recipient); `validRecipientsDetailed() → { accepted, dropped }` with the cap raised 50 → 200 and `validRecipients()` kept as a wrapper; rewrite the "hourly sweep" docblock at `route.ts:10-16` and `docs/HANDOFF.md:181`. One fix per commit. This alone may restore scheduled reports.

**Phase 1 — one sitting (a day).** `src/lib/reports/{types,store,guard,cadence}.ts`; `buildReadoutFor()` extracted; `/reports` list + `/reports/[id]` with weekly/manual, list audience, `selected` scope; new sweep; migration with reconciliation; modal deleted, read-only line in. Every report is single-experiment, so **no renderer change ships in Phase 1** — full value from the ask (multiple schedules, multiple prototypes named, email outside the prototype) with zero email risk.

**Phase 2 — a week, and honestly a week.** The renderer split with golden-file discipline, `readout-body.ts`, the digest container, board + three full + compact, `orderReadouts` and `buildDigestPreheader` in the model, `preview-digest.mts`, and `/api/reports/[id]/preview`. This is the largest single item in the design; do not let it ride along with Phase 1.

**Phase 3 — two days.** Groups as reusable records, the `Person` directory with unsubscribe state, `List-Unsubscribe` + `/api/r/u`, `all-live` scope with its live resolved-set preview, the overlap caveat from the ledger.

**Phase 4 — when, not if.** The dispatcher/worker fan-out, on the first `deferred`.

## 8. WHAT THIS DELIBERATELY DOES NOT DO

- **No hour, no timezone field.** One send window a day, stated once, with the viewer's local equivalent computed client-side. Offering "9am Tuesday" over a Hobby cron promises what the deployment cannot keep.
- **No biweekly, no monthly-nth.** The anchor-date and nth-weekday arithmetic interacts with the grace rule in the subtlest way in the design, and a monthly report has one firing day — a two-day outage skips a month with no recovery. Weekly or manual.
- **No send history beyond the current run.** `audit_event` answers "did it go out" for as long as anyone asks. A `report_delivery` table arrives if and when history is actually promised.
- **No retry of a failed run.** A provider that reports failure on a partial success turns a retry into the double-send nobody forgives. A human clicks Send now.
- **No signals, no alerting, no "the day the guardrail broke."** Real, and a different product; on a daily cron it is 24 hours late anyway.
- **No per-org sender.** Every tenant's mail arrives from one `fromAddress()`. This design makes that more visible, so it is stated on the Reports screen. Per-org sending domains are a DNS and verification project.
- **No bounce webhooks.** `undeliverable` is inferred from synchronous send failures only; a soft bounce an hour later is invisible.
- **No merge action, no saved-query scope beyond `all-live`, no unsubscribe console furniture beyond "struck through with an undo."**

**Two soft spots, named.** The byte-for-byte contract is only as strong as the golden-file discipline against a 405-line renderer tuned for Outlook-through-Word. And a claim that dies before settle costs that report its week — recovery only kicks in the following period, because the alternative is re-driving a run that may already have mailed.