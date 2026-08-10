import { NextRequest, NextResponse } from "next/server";
import { guardPrototypeAccess } from "@/lib/prototypes/guard";
import { getReportSettings, mutateReportSettings } from "@/lib/prototypes/report";
import { validRecipients, mailUnavailableReason, activeProvider, fromAddress } from "@/lib/email/send";
import { sendReadoutEmail } from "@/lib/email/report-run";
import { currentUser } from "@/lib/auth/current";
import { audit } from "@/lib/audit";

export const maxDuration = 60;

/**
 * WHO GETS THE READOUT.
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
  // The sending identity is shown, not assumed. Which address a leadership
  // digest arrives from is a thing people notice, and the operator should be
  // able to read it off the screen rather than off a Vercel env page.
  return NextResponse.json({
    settings: await getReportSettings(g.proto.key),
    mailUnavailable: mailUnavailableReason(),
    mailProvider: activeProvider(),
    mailFrom: fromAddress() || null,
  });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    key?: string;
    recipients?: unknown;
    schedule?: { enabled?: boolean; day?: number; hour?: number };
    sendNow?: boolean;
    to?: unknown;
  };
  const g = await guardPrototypeAccess(body.key ?? null, req.headers.get("authorization"), { tokenAllowed: false });
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  const user = await currentUser();
  const actor = user?.name ?? user?.sub ?? "user";

  try {
    if (body.recipients !== undefined) {
      const recipients = validRecipients(body.recipients);
      const rejected = (Array.isArray(body.recipients) ? body.recipients.length : 0) - recipients.length;
      const settings = await mutateReportSettings(g.proto.key, (cur) => ({ ...cur, recipients }));
      await audit(g.orgId, actor, "results.report-recipients", g.proto.name, recipients.join(", ").slice(0, 300));
      // Say when something was dropped. A silently discarded address is a
      // person who never receives the report and nobody notices for months.
      return NextResponse.json({ settings, ...(rejected > 0 ? { warning: `${rejected} address${rejected === 1 ? "" : "es"} didn't look like an email and ${rejected === 1 ? "was" : "were"} left out.` } : {}) });
    }

    if (body.schedule) {
      const day = Math.min(6, Math.max(0, Math.round(Number(body.schedule.day ?? 1))));
      const hour = Math.min(23, Math.max(0, Math.round(Number(body.schedule.hour ?? 13))));
      const enabled = Boolean(body.schedule.enabled);
      const settings = await mutateReportSettings(g.proto.key, (cur) => {
        if (enabled && !cur.recipients.length) throw new Error("Add at least one recipient before switching the weekly send on.");
        return { ...cur, schedule: { enabled, day, hour } };
      });
      await audit(g.orgId, actor, enabled ? "results.report-scheduled" : "results.report-unscheduled", g.proto.name, `day ${day} · ${hour}:00 UTC`);
      return NextResponse.json({ settings });
    }

    if (body.sendNow) {
      const origin = req.nextUrl.origin;
      const out = await sendReadoutEmail({ orgId: g.orgId, proto: g.proto, to: validRecipients(body.to), baseUrl: origin });
      await audit(g.orgId, actor, "results.report-sent", g.proto.name, `${out.sent} recipient(s): ${out.to.join(", ")}`.slice(0, 300));
      return NextResponse.json({ sent: out.sent, to: out.to, settings: await getReportSettings(g.proto.key) });
    }

    return NextResponse.json({ error: "Nothing to do." }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
