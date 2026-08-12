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
import { getReport, putReport, mutateReport, listReports } from "./store";
import type { Report } from "./types";

/** The stable id linking a prototype to its report.
 *
 *  NOT TRUNCATED. It used to `.slice(0, 60)`, which keeps only the first 58
 *  characters of the key — and prototype slugs are capped at 60 with a
 *  uniqueness suffix on the END, so two experiments whose names agree for long
 *  enough collapsed onto one report id and silently shared an audience. */
export const reportIdForPrototype = (prototypeKey: string) => `r-${prototypeKey}`;

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

/**
 * The report this prototype's panel edits.
 *
 * BY SCOPE FIRST, id second. Resolving by id alone meant a report created from
 * the /reports screen — which mints a random id — was invisible here, so the
 * panel would create a SECOND report covering the same experiment and the same
 * audience would receive two copies of it. The id is only the convention the
 * migration and this file use when creating one.
 */
export async function getPrototypeReport(orgId: string, prototypeKey: string): Promise<Report | null> {
  const byId = await getReport(orgId, reportIdForPrototype(prototypeKey));
  if (byId) return byId;
  const all = await listReports(orgId);
  return all.find((r) => r.scope.mode === "selected" && r.scope.keys.length === 1 && r.scope.keys[0] === prototypeKey) ?? null;
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
  const existing = await getPrototypeReport(orgId, prototypeKey);
  const id = existing?.id ?? reportIdForPrototype(prototypeKey);
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
