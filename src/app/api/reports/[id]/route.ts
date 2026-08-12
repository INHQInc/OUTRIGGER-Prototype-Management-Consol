import { NextRequest, NextResponse } from "next/server";
import { getActiveOrgId } from "@/lib/active-org";
import { currentUser } from "@/lib/auth/current";
import { audit } from "@/lib/audit";
import { guardReport, foreignScopeKeys } from "@/lib/reports/guard";
import { mutateReport, deleteReport, audienceOf, receiving } from "@/lib/reports/store";
import { resolveScope, runReport } from "@/lib/reports/run";
import { nextSend } from "@/lib/reports/cadence";
import { validRecipients, mailUnavailableReason, fromAddress } from "@/lib/email/send";
import { SWEEP_HOUR_UTC } from "@/lib/prototypes/report";
import type { Person, Report } from "@/lib/reports/types";

export const maxDuration = 120;

/**
 * ONE REPORT — read, edit, send now, delete.
 *
 * Session only; `sendNow` puts mail in front of real people.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const g = await guardReport(await getActiveOrgId(), id);
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });

  const people = await audienceOf(g.report);
  const covered = await resolveScope(g.report);
  return NextResponse.json({
    report: g.report,
    people,
    // THE RESOLVED SET, ALWAYS — an `all-live` scope is only honest if you can
    // see what it currently means without saving and waiting for Thursday.
    covered: covered.map((p) => ({ key: p.key, name: p.name, bound: Boolean(p.experiment?.experimentId) })),
    nextSendAt: nextSend(g.report, new Date())?.toISOString() ?? null,
    mailUnavailable: mailUnavailableReason(),
    mailFrom: fromAddress() || null,
    sweepHourUtc: SWEEP_HOUR_UTC,
  });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const g = await guardReport(await getActiveOrgId(), id);
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });

  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    enabled?: boolean;
    scope?: Report["scope"];
    people?: unknown;
    cadence?: Report["cadence"];
    sendNow?: boolean;
    to?: unknown;
    remove?: boolean;
  };
  const user = await currentUser();
  const actor = user?.name ?? user?.sub ?? "user";

  try {
    if (body.remove) {
      await deleteReport(g.orgId, id);
      await audit(g.orgId, actor, "report.deleted", g.report.name, id);
      return NextResponse.json({ ok: true });
    }

    if (body.sendNow) {
      const out = await runReport({ report: g.report, baseUrl: req.nextUrl.origin, to: validRecipients(body.to) });
      // A MANUAL SEND NEVER TOUCHES `run`. Mailing one colleague a copy must
      // not make the sweep think this week's scheduled send already happened.
      await mutateReport(g.orgId, id, (cur) => ({
        ...cur,
        lastManual: { at: new Date().toISOString(), by: actor, to: out.accepted },
      }));
      await audit(g.orgId, actor, "report.sent-manually", g.report.name, `${out.accepted.length} recipient(s)`);
      return NextResponse.json({
        sent: out.accepted.length,
        to: out.accepted,
        ...(out.failures.length ? { warning: `${out.failures.length} didn't go out — ${out.failures.map((f) => `${f.to}: ${f.error}`).join("; ")}` } : {}),
      });
    }

    // ── edits ──
    const patch: Partial<Report> = {};
    if (typeof body.name === "string") {
      const name = body.name.trim();
      if (!name) throw new Error("The name is the subject line — it can't be empty.");
      patch.name = name;
    }
    if (body.scope) {
      if (body.scope.mode === "selected") {
        const foreign = await foreignScopeKeys(g.orgId, body.scope.keys);
        if (foreign.length) throw new Error(`Not this customer's experiments: ${foreign.join(", ")}`);
        // PHASE 1 IS ONE EXPERIMENT PER REPORT. Refused here rather than
        // silently sending the first, because a scope that covers four and
        // mails one is a lie the reader cannot see. The digest is Phase 2.
        if (body.scope.keys.length > 1) throw new Error("One experiment per report for now — the multi-experiment digest is coming next.");
        patch.scope = { mode: "selected", keys: body.scope.keys };
      } else {
        throw new Error("Covering every live experiment needs the digest email, which is coming next.");
      }
    }
    if (body.people !== undefined) {
      const emails = validRecipients(body.people);
      const existing = await audienceOf(g.report);
      // KEEP STATE ACROSS AN EDIT. Re-typing an unsubscribed address must not
      // quietly resubscribe someone who asked to stop.
      const byEmail = new Map(existing.map((p) => [p.email.toLowerCase(), p]));
      const people: Person[] = emails.map((email) => byEmail.get(email.toLowerCase()) ?? { email, state: "receiving" as const });
      patch.audience = { mode: "list", people };
    }
    if (body.cadence) {
      patch.cadence = body.cadence.kind === "weekly"
        ? { kind: "weekly", day: Math.min(6, Math.max(0, Math.round(Number(body.cadence.day ?? 1)))) as 0 | 1 | 2 | 3 | 4 | 5 | 6 }
        : { kind: "manual" };
    }
    if (typeof body.enabled === "boolean") patch.enabled = body.enabled;

    const next = await mutateReport(g.orgId, id, (cur) => {
      const merged: Report = { ...cur, ...patch, updatedAt: new Date().toISOString() };
      if (merged.enabled) {
        const people = merged.audience.mode === "list" ? merged.audience.people : [];
        if (merged.audience.mode === "list" && receiving(people).length === 0) {
          throw new Error("Add someone who can receive it before switching the schedule on.");
        }
        if (merged.cadence.kind !== "weekly") throw new Error("Pick a day before switching the schedule on.");
        if (merged.scope.mode === "selected" && !merged.scope.keys.length) {
          throw new Error("Pick an experiment before switching the schedule on.");
        }
      }
      return merged;
    });
    if (!next) throw new Error("That didn't save — reload and try again.");
    await audit(g.orgId, actor, "report.updated", next.name, Object.keys(patch).join(", "));
    return NextResponse.json({ report: next, nextSendAt: nextSend(next, new Date())?.toISOString() ?? null });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
