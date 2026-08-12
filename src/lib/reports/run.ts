/**
 * SENDING A REPORT.
 *
 * ONE path, used by the scheduled sweep AND by Send now. Two code paths would
 * drift, and the difference would only ever be discovered by whoever received
 * the wrong one.
 *
 * PHASE 1 COVERS ONE EXPERIMENT PER REPORT. A report whose scope resolves to
 * several sends the FIRST and records the rest as skipped, because the digest
 * renderer does not exist yet and inventing one here would fork the readout —
 * `docs/READOUT-MODEL.md` lists the eleven defects the last fork produced. The
 * UI refuses to save a multi-prototype scope for the same reason, so this is a
 * belt-and-braces floor rather than a path anyone reaches.
 */
import { renderReadoutEmail } from "../email/readout";
import { validRecipients, sendEmail } from "../email/send";
import { buildFor, resolveScope } from "./build";
import { audienceOf, receiving } from "./store";
import { readoutLinkUrl } from "./link";
import type { Report, ReportRun } from "./types";

export interface SendOutcome {
  accepted: string[];
  failures: { to: string; error: string }[];
  entries: NonNullable<ReportRun["entries"]>;
  subject: string;
}

export async function runReport(opts: {
  report: Report;
  baseUrl?: string;
  /** Overrides the audience — the "send just to me" case. Never persisted. */
  to?: string[];
}): Promise<SendOutcome> {
  const r = opts.report;
  const people = opts.to?.length ? opts.to : receiving(await audienceOf(r)).map((p) => p.email);
  const to = validRecipients(people);
  if (!to.length) throw new Error("Nobody on this report's audience is receiving — add someone first.");

  const protos = await resolveScope(r);
  if (!protos.length) throw new Error("This report covers no experiments right now.");

  const entries: NonNullable<ReportRun["entries"]> = [];
  let payload: { subject: string; html: string; text: string } | null = null;

  for (const proto of protos) {
    if (payload) {
      // See the header: the digest renderer is Phase 2.
      entries.push({ key: proto.key, name: proto.name, state: "skipped", reason: "one experiment per report until the digest ships" });
      continue;
    }
    const built = await buildFor(r.orgId, proto);
    if ("unavailable" in built) {
      entries.push({ key: proto.key, name: proto.name, state: "unavailable", reason: built.unavailable });
      continue;
    }
    entries.push({ key: proto.key, name: proto.name, state: built.frozen ? "frozen" : "ok" });
    const rendered = renderReadoutEmail({
      prototypeName: proto.name,
      prototypeKey: proto.key,
      // A SIGNED PUBLIC LINK, not the console. `/prototypes/...` is behind the
      // session gate, so the button was a redirect to a login screen for every
      // recipient who is not a console user — which is all of them. When no
      // link secret is configured this is `undefined` and the renderer omits
      // the button entirely: no affordance beats a broken one.
      url: await readoutLinkUrl(opts.baseUrl, { orgId: r.orgId, prototypeKey: proto.key }),
      results: built.results!, stats: built.stats, verdict: built.verdict, reading: built.reading,
      map: built.resolved, supporting: built.supporting, model: built.model,
    });
    // THE REPORT'S NAME IS THE SUBJECT. Stable across weeks so the series
    // threads as one conversation; the readout's own subject would churn with
    // the experiment name.
    payload = { ...rendered, subject: r.name };
  }

  if (!payload) {
    const why = entries.map((e) => `${e.name}: ${e.reason}`).join("; ");
    throw new Error(`Nothing could be read for this report — ${why || "no experiments returned results"}.`);
  }

  const out = await sendEmail({ to, subject: payload.subject, html: payload.html, text: payload.text });
  return { accepted: out.accepted, failures: out.failed, entries, subject: payload.subject };
}
