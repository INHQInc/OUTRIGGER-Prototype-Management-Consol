import { NextRequest, NextResponse } from "next/server";
import { guardPrototypeAccess } from "@/lib/prototypes/guard";
import { SWEEP_HOUR_UTC } from "@/lib/prototypes/report";
import { validRecipients, mailUnavailableReason, activeProvider, fromAddress } from "@/lib/email/send";
import { currentUser } from "@/lib/auth/current";
import { audit } from "@/lib/audit";
import { getPrototypeReport, updatePrototypeReport, toLegacyShape, reportIdForPrototype } from "@/lib/reports/bridge";
import { mutateReport } from "@/lib/reports/store";
import { runReport } from "@/lib/reports/run";
import type { Person } from "@/lib/reports/types";

export const maxDuration = 60;

/**
 * WHO GETS THE READOUT — the panel inside a prototype.
 *
 * This is a WINDOW ONTO A REPORT, not its own store. It edits the record with
 * id `r-<prototypeKey>`, the same one /reports shows and the same one the
 * migration creates, because the sweep iterates Reports now: a panel still
 * writing the old `report:<key>` flag would save happily and never send.
 *
 * GET  ?key=            → recipients, schedule, last send
 * POST { key, recipients }        → replace the list
 * POST { key, schedule }          → set/clear the weekly send
 * POST { key, sendNow: true, to } → send it now
 *
 * Session-only. Mail goes to real people on the customer's behalf, so it is
 * never reachable with the read-scoped API token an agent holds.
 */
export async function GET(req: NextRequest) {
  const g = await guardPrototypeAccess(req.nextUrl.searchParams.get("key"), req.headers.get("authorization"), { tokenAllowed: false });
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  const report = await getPrototypeReport(g.orgId, g.proto.key);
  // The sending identity is shown, not assumed. Which address a leadership
  // digest arrives from is a thing people notice, and the operator should be
  // able to read it off the screen rather than off a Vercel env page.
  return NextResponse.json({
    settings: toLegacyShape(report),
    reportId: report?.id ?? reportIdForPrototype(g.proto.key),
    mailUnavailable: mailUnavailableReason(),
    mailProvider: activeProvider(),
    mailFrom: fromAddress() || null,
    sweepHourUtc: SWEEP_HOUR_UTC,
  });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    key?: string;
    recipients?: unknown;
    schedule?: { enabled?: boolean; day?: number };
    sendNow?: boolean;
    to?: unknown;
  };
  const g = await guardPrototypeAccess(body.key ?? null, req.headers.get("authorization"), { tokenAllowed: false });
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  const user = await currentUser();
  const actor = user?.name ?? user?.sub ?? "user";

  try {
    if (body.recipients !== undefined) {
      const emails = validRecipients(body.recipients);
      const rejected = (Array.isArray(body.recipients) ? body.recipients.length : 0) - emails.length;
      const next = await updatePrototypeReport(g.orgId, g.proto.key, g.proto.name, actor, (cur) => {
        // KEEP STATE ACROSS AN EDIT — re-typing an address someone unsubscribed
        // must not quietly resubscribe them.
        const prior = new Map((cur.audience.mode === "list" ? cur.audience.people : []).map((p) => [p.email.toLowerCase(), p]));
        const people: Person[] = emails.map((email) => prior.get(email.toLowerCase()) ?? { email, state: "receiving" as const });
        return { ...cur, audience: { mode: "list", people } };
      });
      await audit(g.orgId, actor, "results.report-recipients", g.proto.name, emails.join(", ").slice(0, 300));
      // Say when something was dropped. A silently discarded address is a
      // person who never receives the report and nobody notices for months.
      return NextResponse.json({
        settings: toLegacyShape(next),
        ...(rejected > 0 ? { warning: `${rejected} address${rejected === 1 ? "" : "es"} didn't look like an email and ${rejected === 1 ? "was" : "were"} left out.` } : {}),
      });
    }

    if (body.schedule) {
      // A DAY, not a time — the sweep runs once daily, so an hour would be a
      // promise the deployment cannot keep. See SWEEP_HOUR_UTC.
      const day = Math.min(6, Math.max(0, Math.round(Number(body.schedule.day ?? 1)))) as 0 | 1 | 2 | 3 | 4 | 5 | 6;
      const enabled = Boolean(body.schedule.enabled);
      const next = await updatePrototypeReport(g.orgId, g.proto.key, g.proto.name, actor, (cur) => {
        const people = cur.audience.mode === "list" ? cur.audience.people : [];
        if (enabled && !people.some((p) => p.state === "receiving")) {
          throw new Error("Add at least one recipient before switching the weekly send on.");
        }
        return { ...cur, enabled, cadence: { kind: "weekly", day } };
      });
      await audit(g.orgId, actor, enabled ? "results.report-scheduled" : "results.report-unscheduled", g.proto.name, `day ${day} · ~${SWEEP_HOUR_UTC}:00 UTC`);
      return NextResponse.json({ settings: toLegacyShape(next) });
    }

    if (body.sendNow) {
      const report = await getPrototypeReport(g.orgId, g.proto.key);
      if (!report) throw new Error("Add a recipient first.");
      const out = await runReport({ report, baseUrl: req.nextUrl.origin, to: validRecipients(body.to) });
      // A MANUAL SEND NEVER TOUCHES `run` — mailing yourself a copy must not
      // make the sweep think this week's scheduled send already happened.
      await mutateReport(g.orgId, report.id, (cur) => ({
        ...cur,
        lastManual: { at: new Date().toISOString(), by: actor, to: out.accepted },
      }));
      await audit(g.orgId, actor, "results.report-sent", g.proto.name, `${out.accepted.length} recipient(s): ${out.accepted.join(", ")}`.slice(0, 300));
      return NextResponse.json({
        sent: out.accepted.length,
        to: out.accepted,
        settings: toLegacyShape(await getPrototypeReport(g.orgId, g.proto.key)),
        ...(out.failures.length ? { warning: `${out.failures.length} didn't go out — ${out.failures.map((f) => `${f.to}: ${f.error}`).join("; ")}` } : {}),
      });
    }

    return NextResponse.json({ error: "Nothing to do." }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
