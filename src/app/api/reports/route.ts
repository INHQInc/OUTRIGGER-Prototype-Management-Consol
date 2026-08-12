import { NextRequest, NextResponse } from "next/server";
import { getActiveOrgId, canAccessOrg } from "@/lib/active-org";
import { currentUser } from "@/lib/auth/current";
import { audit } from "@/lib/audit";
import { listReports, putReport, audienceOf, receiving } from "@/lib/reports/store";
import { foreignScopeKeys } from "@/lib/reports/guard";
import { nextSend } from "@/lib/reports/cadence";
import { migrateReportsOnce } from "@/lib/reports/migrate";
import { mailUnavailableReason, fromAddress } from "@/lib/email/send";
import { SWEEP_HOUR_UTC } from "@/lib/prototypes/report";
import type { Report } from "@/lib/reports/types";

export const maxDuration = 60;

/**
 * REPORTS — the list, and creating one.
 *
 * Session only. These records decide who receives mail on a customer's behalf,
 * so the read-scoped API token an agent holds never reaches them.
 */
export async function GET() {
  const orgId = await getActiveOrgId();
  if (!orgId) return NextResponse.json({ error: "No customer selected." }, { status: 400 });

  // Migrate on first sight of the screen as well as at sweep time — whichever
  // happens first. Both are behind the same two-phase lock.
  const migration = await migrateReportsOnce().catch((e) => ({ ran: false, detail: (e as Error).message, created: 0, skipped: [], reconciled: false }));

  const reports = await listReports(orgId);
  const now = new Date();
  const rows = await Promise.all(reports.map(async (r) => {
    const people = await audienceOf(r);
    return {
      ...r,
      audienceCount: receiving(people).length,
      audienceTotal: people.length,
      nextSendAt: nextSend(r, now)?.toISOString() ?? null,
    };
  }));

  return NextResponse.json({
    reports: rows,
    // The sending identity is SHOWN, not assumed — which address a leadership
    // digest arrives from is a thing people notice.
    mailUnavailable: mailUnavailableReason(),
    mailFrom: fromAddress() || null,
    sweepHourUtc: SWEEP_HOUR_UTC,
    ...(migration.ran || !migration.reconciled ? { migration } : {}),
  });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Partial<Report> & { orgId?: string };
  const orgId = body.orgId ?? (await getActiveOrgId());
  if (!orgId || !(await canAccessOrg(orgId))) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const name = String(body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "Give the report a name — it becomes the subject line." }, { status: 400 });

  // Symmetric with the edit route. Accepting `all-live` here while POST
  // /api/reports/[id] refuses it would mint a record the editor cannot
  // represent and the sender would silently truncate to one experiment.
  if (body.scope?.mode === "all-live") {
    return NextResponse.json({ error: "Covering every live experiment needs the digest email, which is coming next." }, { status: 400 });
  }
  const scope: Report["scope"] = { mode: "selected", keys: [] };
  {
    const keys = Array.isArray((body.scope as { keys?: unknown })?.keys) ? ((body.scope as { keys: string[] }).keys) : [];
    const foreign = await foreignScopeKeys(orgId, keys);
    if (foreign.length) return NextResponse.json({ error: `Not this customer's experiments: ${foreign.join(", ")}` }, { status: 400 });
    scope.keys = keys;
  }

  const user = await currentUser();
  const actor = user?.name ?? user?.sub ?? "user";
  const now = new Date().toISOString();
  const report: Report = {
    id: `r-${Math.random().toString(36).slice(2, 10)}`,
    orgId,
    name,
    enabled: false, // OFF BY DEFAULT. A report that mails itself the moment it
                    // is created sends "too early to call" to someone's
                    // leadership before anyone has looked at it.
    scope,
    audience: { mode: "list", people: [] },
    cadence: { kind: "manual" },
    createdAt: now,
    createdBy: actor,
    updatedAt: now,
  };
  await putReport(report);
  await audit(orgId, actor, "report.created", report.name, report.id);
  return NextResponse.json({ report });
}
