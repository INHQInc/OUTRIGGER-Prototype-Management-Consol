/**
 * THE PROTOTYPE'S EMAIL PANEL, EDITING A REPORT.
 *
 * The panel inside a prototype's Results tab used to own its own storage: a
 * `report:<key>` flag with a recipient list and a weekday. The sweep now
 * iterates Reports instead, so that flag schedules nothing — leaving the panel
 * as a form that saves happily and never sends. A control that accepts input
 * and silently drops it is worse than one that isn't there.
 *
 * So the panel becomes a second WINDOW onto the same object, not a second
 * store. It reads and writes the Report whose id is `r-<prototypeKey>` — the
 * same id the migration produces, so a prototype that already had settings
 * keeps editing the record migrated from them rather than growing a twin.
 *
 * ONE SENDER, TWO ENTRY POINTS. The alternative — keeping both paths live —
 * is two schedulers over one audience, which is the double-send.
 */
import { getReport, putReport, mutateReport } from "./store";
import type { Report } from "./types";

/** The stable id linking a prototype to its report. */
export const reportIdForPrototype = (prototypeKey: string) => `r-${prototypeKey}`.slice(0, 60);

/** The shape the existing panel already renders. Kept identical so the UI does
 *  not have to change in the same step as the storage underneath it. */
export interface LegacyShape {
  recipients: string[];
  schedule?: { enabled: boolean; day: number };
  lastSentAt?: string;
  lastSentTo?: string[];
  lastError?: string;
  lastPartial?: string;
}

export function toLegacyShape(r: Report | null): LegacyShape {
  if (!r) return { recipients: [] };
  const people = r.audience.mode === "list" ? r.audience.people : [];
  return {
    recipients: people.filter((p) => p.state === "receiving").map((p) => p.email),
    ...(r.cadence.kind === "weekly" ? { schedule: { enabled: r.enabled, day: r.cadence.day } } : {}),
    ...(r.run?.at ? { lastSentAt: r.run.at } : {}),
    ...(r.run?.deliveredTo ? { lastSentTo: r.run.deliveredTo } : {}),
    ...(r.run?.error ? { lastError: r.run.error } : {}),
    ...(r.run?.failures?.length
      ? { lastPartial: `${r.run.failures.length} didn't go out — ${r.run.failures.map((f) => `${f.to}: ${f.error}`).join("; ")}` }
      : {}),
  };
}

export async function getPrototypeReport(orgId: string, prototypeKey: string): Promise<Report | null> {
  return getReport(orgId, reportIdForPrototype(prototypeKey));
}

/**
 * Edit — creating the report on first write. Created records are named for the
 * prototype and scoped to it alone, which is exactly what the panel implies.
 */
export async function updatePrototypeReport(
  orgId: string,
  prototypeKey: string,
  prototypeName: string,
  actor: string,
  patch: (cur: Report) => Report,
): Promise<Report> {
  const id = reportIdForPrototype(prototypeKey);
  const existing = await getReport(orgId, id);
  if (!existing) {
    const now = new Date().toISOString();
    const fresh: Report = {
      id, orgId,
      name: prototypeName,
      enabled: false,
      scope: { mode: "selected", keys: [prototypeKey] },
      audience: { mode: "list", people: [] },
      cadence: { kind: "manual" },
      createdAt: now, createdBy: actor, updatedAt: now,
    };
    const next = patch(fresh);
    await putReport(next);
    return next;
  }
  const next = await mutateReport(orgId, id, (cur) => ({ ...patch(cur), updatedAt: new Date().toISOString() }));
  if (!next) throw new Error("That didn't save — reload and try again.");
  return next;
}
