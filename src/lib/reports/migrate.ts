/**
 * FROM `report:<key>` TO REPORTS — once, faithfully, or not at all.
 *
 * The contract is that the next scheduled mail is identical to the last one.
 * So this is deliberately NOT tidy: one report per prototype that had settings,
 * even where merging three into a digest would look nicer. A bulk merge would
 * silently convert three emails into one, and nobody asked for that.
 *
 * TWO THINGS THIS MUST NOT DO, in order of how badly they end:
 *
 *  1. LOSE A RECIPIENT. A dropped address is a person who stops receiving and
 *     never complains. Addresses are copied VERBATIM and before validation —
 *     an entry that no longer looks like an email is carried over and flagged
 *     in the UI, never discarded.
 *  2. DOUBLE-SEND. `lastSentAt` is carried forward as an already-claimed week,
 *     so deploying at 12:59 on a day that already sent leaves the 13:00 sweep
 *     seeing the week claimed, and it skips.
 *
 * A COUNTED reconciliation runs before the migration is marked done: distinct
 * addresses in versus out, per org. A mismatch aborts and leaves the legacy
 * path running rather than committing a lossy migration.
 */
import { getContentStore } from "../content/store";
import { getReportSettings } from "../prototypes/report";
import { resolvePrototypeOrg } from "../prototypes/org";
import { isoWeek } from "./cadence";
import { putReport, getReport } from "./store";
import { reportIdForPrototype } from "./bridge";
import type { Person, Report } from "./types";

const DONE = "reports:migrated:v2";
const LOCK = "reports:migrating:v2";

export interface MigrationResult {
  ran: boolean;
  created: number;
  skipped: string[];
  reconciled: boolean;
  detail: string;
}

/** Split a legacy `lastError`. A partial send was written into the same field
 *  as a hard failure, so the two are separated here rather than carried
 *  forward conflated — fixed in the data, not in the display. */
function splitLegacyError(lastError?: string): { error?: string; failures?: { to: string; error: string }[] } {
  if (!lastError) return {};
  if (/^\d+ of \d+ didn't go out/.test(lastError)) {
    const tail = lastError.split("—")[1] ?? "";
    const failures = tail.split(";").map((s) => s.trim()).filter(Boolean).map((s) => {
      const i = s.indexOf(":");
      return i === -1 ? { to: s, error: "failed" } : { to: s.slice(0, i).trim(), error: s.slice(i + 1).trim() };
    });
    return { failures: failures.length ? failures : undefined };
  }
  return { error: lastError };
}

export async function migrateReportsOnce(): Promise<MigrationResult> {
  const store = await getContentStore();
  if (await store.getFlag(DONE)) return { ran: false, created: 0, skipped: [], reconciled: true, detail: "already migrated" };

  // TWO-PHASE. The lock is taken to enter; DONE is written only after the
  // count reconciles. A single create-only flag taken at the start would strand
  // the remainder behind a lock nothing releases if this crashes midway.
  //
  // The lock is CAS'd from whatever it currently holds — null the first time,
  // "" after a release. There is no deleteFlag, so releasing writes an empty
  // string; a create-only CAS against `null` would therefore succeed exactly
  // once and wedge every attempt after it.
  const lockRaw = await store.getFlag(LOCK);
  if (lockRaw) {
    return { ran: false, created: 0, skipped: [], reconciled: false, detail: "another migration is in flight" };
  }
  if (!(await store.compareAndSetFlag(LOCK, lockRaw, new Date().toISOString()))) {
    return { ran: false, created: 0, skipped: [], reconciled: false, detail: "another migration is in flight" };
  }

  const created: Report[] = [];
  const skipped: string[] = [];
  const inAddresses = new Map<string, Set<string>>();
  const outAddresses = new Map<string, Set<string>>();
  const add = (m: Map<string, Set<string>>, org: string, e: string) => {
    if (!m.has(org)) m.set(org, new Set());
    m.get(org)!.add(e.trim().toLowerCase());
  };

  try {
    const protos = await store.listPrototypes();
    for (const proto of protos) {
      const legacy = await getReportSettings(proto.key);
      if (!legacy.recipients.length && !legacy.schedule) continue;

      const orgId = await resolvePrototypeOrg(proto);
      if (!orgId) {
        // A report with no org is a report with no guard. Leave the legacy flag
        // in place and say so rather than creating an unguardable record.
        skipped.push(`${proto.key}: no organisation resolvable`);
        continue;
      }
      legacy.recipients.forEach((e) => add(inAddresses, orgId, e));

      const people: Person[] = legacy.recipients.map((email) => ({ email, state: "receiving" as const }));
      const { error, failures } = splitLegacyError(legacy.lastError);

      const report: Report = {
        id: reportIdForPrototype(proto.key),
        orgId,
        name: proto.name,
        enabled: legacy.schedule?.enabled ?? false,
        scope: { mode: "selected", keys: [proto.key] },
        audience: { mode: "list", people },
        cadence: legacy.schedule ? { kind: "weekly", day: (legacy.schedule.day ?? 1) as 0 | 1 | 2 | 3 | 4 | 5 | 6 } : { kind: "manual" },
        // CARRY THE STAMP. Without this, a prototype that already sent today
        // sends again the moment this deploys.
        ...(legacy.lastSentAt
          ? {
              run: {
                periodKey: isoWeek(new Date(legacy.lastSentAt)),
                state: (error ? "failed" : "sent") as "sent" | "failed",
                at: legacy.lastSentAt,
                deliveredTo: legacy.lastSentTo ?? [],
                ...(failures ? { failures } : {}),
                ...(error ? { error } : {}),
              },
            }
          : {}),
        createdAt: new Date().toISOString(),
        createdBy: "migration",
        updatedAt: new Date().toISOString(),
      };
      created.push(report);
      people.forEach((p) => add(outAddresses, orgId, p.email));
    }

    // RECONCILE BEFORE WRITING ANYTHING. A counted check, not a code review.
    for (const [org, ins] of inAddresses) {
      const outs = outAddresses.get(org) ?? new Set();
      const missing = [...ins].filter((e) => !outs.has(e));
      if (missing.length) {
        return {
          ran: false, created: 0, skipped,
          reconciled: false,
          detail: `ABORTED — ${missing.length} address(es) would have been lost in ${org}: ${missing.join(", ")}`,
        };
      }
    }

    // NEVER CLOBBER AN EXISTING RECORD. `putReport` is a bare setFlag, and this
    // function is re-entrant by design (the lock releases in `finally`, and
    // DONE is only written at the end). Two ways that bites without this check:
    // the owner edits recipients in a prototype's panel during the window
    // before the first migration runs — the panel creates `r-<key>` — and then
    // the sweep's migration rebuilds that id from the untouched legacy flag,
    // reverting their edit AND resetting `run`, which re-opens a week that has
    // already sent. The second is any thrown error between the first write and
    // DONE, which leaves a partial migration that re-runs and does the same.
    let written = 0;
    for (const r of created) {
      if (await getReport(r.orgId, r.id)) { skipped.push(`${r.id}: a report already exists for it`); continue; }
      await putReport(r);
      written++;
    }
    await store.setFlag(DONE, new Date().toISOString());
    return {
      ran: true,
      created: written,
      skipped,
      reconciled: true,
      detail: `${written} report(s) created from per-prototype settings${skipped.length ? `; ${skipped.length} left alone` : ""}`,
    };
  } finally {
    // Release the lock either way: a crash must not wedge the migration.
    await store.setFlag(LOCK, "").catch(() => {});
  }
}
