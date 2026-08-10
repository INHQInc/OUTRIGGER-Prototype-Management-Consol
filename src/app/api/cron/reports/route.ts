import { NextRequest, NextResponse } from "next/server";
import { getContentStore } from "@/lib/content/store";
import { getReportSettings, scheduleDue, mutateReportSettings } from "@/lib/prototypes/report";
import { sendReadoutEmail } from "@/lib/email/report-run";
import { mailConfigured } from "@/lib/email/send";

export const maxDuration = 300;

/**
 * HOURLY SWEEP (vercel.json) for scheduled readouts.
 *
 * Hourly rather than daily so a schedule can name an hour, and `scheduleDue`
 * carries the idempotence: right weekday, at or past the hour, and not already
 * sent today. The job can run sixty times in a day and the report leaves once —
 * which matters, because the failure everyone remembers is the tool that mailed
 * their leadership the same report twice.
 *
 * One prototype's failure never stops the sweep: a broken Optimizely binding on
 * one experiment must not silently cancel everyone else's Monday report.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!mailConfigured()) {
    return NextResponse.json({ skipped: "mail is not configured on this deployment" });
  }

  const now = new Date();
  const store = await getContentStore();
  const protos = await store.listPrototypes();
  const sent: string[] = [];
  const failed: Record<string, string> = {};
  const origin = req.nextUrl.origin;

  for (const proto of protos) {
    let due = false;
    try {
      due = scheduleDue(await getReportSettings(proto.key), now);
    } catch { due = false; }
    if (!due) continue;

    if (!proto.orgId) {
      failed[proto.key] = "no organisation on the prototype record";
      continue;
    }
    try {
      const out = await sendReadoutEmail({ orgId: proto.orgId, proto, baseUrl: origin });
      sent.push(`${proto.key} → ${out.sent}`);
    } catch (e) {
      const msg = (e as Error).message.slice(0, 200);
      failed[proto.key] = msg;
      // Recorded on the prototype as well, so the person who owns the report
      // sees it in the app rather than in a log they will never open.
      await mutateReportSettings(proto.key, (cur) => ({ ...cur, lastError: msg })).catch(() => {});
    }
  }

  return NextResponse.json({ ran: now.toISOString(), sent, failed });
}
