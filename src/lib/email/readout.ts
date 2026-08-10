/**
 * THE READOUT AS AN EMAIL.
 *
 * Not a screenshot and not an attachment: an executive opens this on a phone,
 * and anything that needs downloading before it can be read mostly doesn't get
 * read. Tables and inline styles throughout — email clients have no grid, no
 * flexbox, and Outlook has no `<style>` block worth relying on.
 *
 * It renders from the SAME resolved data the page renders from: the analyst
 * names a metric key, the code resolves the live value. A number is never
 * copied out of the model's prose, here or anywhere.
 */
import type { ExperimentResults, MetricMap } from "../prototypes/results";
import type { StatsReport } from "../prototypes/stats";
import type { VerdictRecord } from "../prototypes/verdict";
import type { Reading } from "../prototypes/notebook";
import { shortNotice, provenanceLine } from "../brand";

const VERDICT_WORD: Record<string, { label: string; color: string }> = {
  confirmed: { label: "HYPOTHESIS CONFIRMED", color: "#157347" },
  refuted: { label: "HYPOTHESIS REFUTED", color: "#b02a37" },
  guardrail_breach: { label: "GUARDRAIL BREACH", color: "#b02a37" },
  keep_running: { label: "TOO EARLY — KEEP RUNNING", color: "#5c6771" },
  underpowered: { label: "UNDERPOWERED", color: "#997404" },
  invalid: { label: "DATA INVALID", color: "#b02a37" },
  not_adjudicable: { label: "NOT READY TO JUDGE", color: "#5c6771" },
};

const esc = (v: unknown) =>
  String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const pct = (v?: number) => (v === undefined ? "—" : `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}%`);
const rate = (v?: number) => (v === undefined ? "—" : `${(v * 100).toFixed(1)}%`);

export function renderReadoutEmail(opts: {
  prototypeName: string;
  prototypeKey: string;
  url?: string;
  results: ExperimentResults;
  stats: StatsReport | null;
  verdict: VerdictRecord | null;
  reading: Reading | null;
  map: MetricMap | null;
  /** The metrics to list, in the team's own order — the supporting set. */
  supporting: string[];
}): { subject: string; html: string; text: string } {
  const { stats, verdict, reading } = opts;
  const focusId = stats?.focusVariationId;
  const baseId = stats?.baselineVariationId;
  const metric = (k: string) => stats?.metrics.find((m) => m.key === k);
  const cell = (k: string, id?: string) => metric(k)?.cells.find((c) => c.variationId === id);

  const v = verdict ? VERDICT_WORD[verdict.verdict] ?? VERDICT_WORD.not_adjudicable : null;
  const headline = reading?.headline || verdict?.headline || `${opts.prototypeName} — experiment readout`;

  // THE NUMBER COMES FROM THE DATA. The section names a metric; we resolve it.
  const sectionRow = (label: string, sec?: { text: string; measureKey?: string }) => {
    if (!sec?.text) return "";
    const m = sec.measureKey ? metric(sec.measureKey) : undefined;
    const c = sec.measureKey ? cell(sec.measureKey, focusId) : undefined;
    const good = m && (opts.map?.composites.find((x) => `composite:${x.id}` === sec.measureKey)?.direction === "decrease"
      ? (c?.lift ?? 0) < 0
      : (c?.lift ?? 0) > 0);
    const settled = Boolean(c?.liftCi && c.liftCi.lo * c.liftCi.hi > 0);
    const color = !settled ? "#5c6771" : good ? "#157347" : "#b02a37";
    return `
      <tr><td style="padding:0 0 18px 0;">
        <div style="font:700 11px/1.2 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#5c6771;padding-bottom:6px;">${esc(label)}</div>
        ${m ? `<div style="padding-bottom:4px;"><span style="font:800 18px/1.2 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${color};">${esc(pct(c?.lift))}</span>
          <span style="font:400 13px/1.2 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#5c6771;">&nbsp;${esc(m.label)}${settled ? "" : " — too early"}</span></div>` : ""}
        <div style="font:400 14px/1.55 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#16202a;">${esc(sec.text)}</div>
      </td></tr>`;
  };

  const metricRows = opts.supporting.map((k) => {
    const m = metric(k);
    if (!m) return "";
    const f = cell(k, focusId), b = cell(k, baseId);
    const settled = Boolean(f?.liftCi && f.liftCi.lo * f.liftCi.hi > 0);
    const good = opts.map?.composites.find((x) => `composite:${x.id}` === k)?.direction === "decrease"
      ? (f?.lift ?? 0) < 0 : (f?.lift ?? 0) > 0;
    const color = !settled ? "#5c6771" : good ? "#157347" : "#b02a37";
    const note = reading?.observations?.find((o) => o.measureKey === k)?.note;
    return `
      <tr>
        <td style="padding:10px 10px 10px 0;border-top:1px solid #e6eaee;vertical-align:top;white-space:nowrap;">
          <span style="font:800 15px/1.2 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${color};">${esc(pct(f?.lift))}</span>
        </td>
        <td style="padding:10px 0;border-top:1px solid #e6eaee;vertical-align:top;">
          <div style="font:600 14px/1.3 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#16202a;">${esc(m.label)}${k === stats?.primaryKey ? ` <span style="font:700 9px/1 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;letter-spacing:.06em;color:#157347;border:1px solid #157347;border-radius:3px;padding:1px 4px;">DECISION</span>` : ""}</div>
          <div style="font:400 12.5px/1.5 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#5c6771;padding-top:2px;">
            ${esc(rate(f?.rate))} vs ${esc(rate(b?.rate))} control
            ${f?.count !== undefined ? ` &middot; ${f.count.toLocaleString()}${b?.count !== undefined ? ` vs ${b.count.toLocaleString()}` : ""} events${f.n ? ` from ${f.n.toLocaleString()} visitors` : ""}` : ""}
          </div>
          ${note ? `<div style="font:400 13px/1.5 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#16202a;padding-top:4px;">${esc(note)}</div>` : ""}
        </td>
      </tr>`;
  }).join("");

  const sections = reading?.read
    ? [
        sectionRow("What the change did", reading.read.effect),
        sectionRow("Where the behaviour went", reading.read.shift),
        sectionRow("What it cost", reading.read.cost),
        sectionRow("Against the prediction", reading.read.prediction),
      ].join("")
    : reading?.lede
      ? `<tr><td style="padding:0 0 18px 0;font:400 14px/1.6 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#16202a;">${esc(reading.lede)}</td></tr>`
      : "";

  const provenance = provenanceLine({
    experiment: opts.prototypeName,
    recordId: verdict?.state === "stamped" ? `stamped ${verdict.stampedAt?.slice(0, 19)}` : `draft ${stats?.computedAt?.slice(0, 19) ?? ""}`,
    at: verdict?.state === "stamped" ? verdict.stampedAt : stats?.computedAt,
  });

  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#f4f6f8;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;background:#ffffff;border:1px solid #e6eaee;border-radius:10px;">
  <tr><td style="padding:22px 24px 0 24px;">
    <div style="font:700 11px/1.2 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#5c6771;">${esc(opts.prototypeName)}</div>
    ${v ? `<div style="font:800 15px/1.3 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${v.color};padding-top:6px;">${esc(v.label)}</div>` : ""}
    <div style="font:700 22px/1.25 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#16202a;padding:8px 0 16px 0;">${esc(headline)}</div>
  </td></tr>
  <tr><td style="padding:0 24px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${sections}</table></td></tr>
  ${metricRows ? `<tr><td style="padding:4px 24px 0 24px;">
    <div style="font:700 11px/1.2 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#5c6771;padding-bottom:2px;">Metric by metric</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${metricRows}</table>
  </td></tr>` : ""}
  ${opts.url ? `<tr><td style="padding:20px 24px 4px 24px;">
    <a href="${esc(opts.url)}" style="display:inline-block;background:#16202a;color:#ffffff;text-decoration:none;font:600 14px/1 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;padding:11px 16px;border-radius:6px;">Open the full readout</a>
  </td></tr>` : ""}
  <tr><td style="padding:18px 24px 20px 24px;border-top:1px solid #e6eaee;margin-top:12px;">
    <div style="font:400 10.5px/1.45 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#8892a0;">${esc(shortNotice())}</div>
    <div style="font:400 10.5px/1.45 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#8892a0;">${esc(provenance)}</div>
  </td></tr>
</table>
</td></tr></table></body></html>`;

  const text = [
    opts.prototypeName,
    v?.label ?? "",
    "",
    headline,
    "",
    reading?.read
      ? [
          reading.read.effect?.text && `WHAT THE CHANGE DID\n${reading.read.effect.text}`,
          reading.read.shift?.text && `WHERE THE BEHAVIOUR WENT\n${reading.read.shift.text}`,
          reading.read.cost?.text && `WHAT IT COST\n${reading.read.cost.text}`,
          reading.read.prediction?.text && `AGAINST THE PREDICTION\n${reading.read.prediction.text}`,
        ].filter(Boolean).join("\n\n")
      : reading?.lede ?? "",
    "",
    ...opts.supporting.map((k) => {
      const m = metric(k);
      if (!m) return "";
      const f = cell(k, focusId), b = cell(k, baseId);
      return `${pct(f?.lift)}  ${m.label} — ${rate(f?.rate)} vs ${rate(b?.rate)} control${f?.count !== undefined ? ` (${f.count.toLocaleString()} vs ${b?.count?.toLocaleString() ?? "—"} events)` : ""}`;
    }).filter(Boolean),
    "",
    opts.url ? `Full readout: ${opts.url}` : "",
    "",
    shortNotice(),
    provenance,
  ].filter((l) => l !== undefined).join("\n");

  const subject = `${opts.prototypeName} — ${v?.label ?? "readout"}`;
  return { subject, html, text };
}
