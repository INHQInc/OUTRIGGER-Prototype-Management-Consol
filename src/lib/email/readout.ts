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
 *
 * ── HOW THIS EARNS AN EXECUTIVE'S SECOND ─────────────────────────────────────
 *
 * FOUR LAYERS, EACH READABLE ON ITS OWN, EACH SHORTER THAN THE LAST ONE DOWN.
 * A reader can stop after any of them and not be misled:
 *   1. the VERDICT BAND — the outcome, in colour, from across the room;
 *   2. THE SHORT VERSION — did it work, the decision step, the biggest gain,
 *      what it cost, and what happens next, as five labelled answers;
 *   3. THE DECISION METRIC — one number, larger than anything else;
 *   4. the story, then the full table.
 *
 * THE VERDICT COLOURS THE WHOLE EMAIL — green confirmed, red refuted or
 * breached, amber underpowered, slate too-early. Someone who gets this weekly
 * reads the outcome before a single word.
 *
 * THE HERO IS THE DECISION METRIC, never the biggest mover. Leading with the
 * largest number would launder a browse-stage win into a business result, the
 * specific lie this product exists to prevent.
 *
 * THE SUMMARY IS COMPUTED, NOT WRITTEN BY A MODEL. "Did it work?" is answered
 * from the verdict, and the biggest gain and the cost are the largest movers
 * the data actually has — picked by magnitude, not nominated by the analyst.
 * The summary therefore cannot disagree with the table beneath it.
 *
 * "WHAT HAPPENS NEXT" IS THE SAME DERIVATION THE CONSOLE SHOWS. It comes from
 * verdict.nextStep(), shared with the page, so the email cannot promise a
 * different action — or a different number of days — than the screen does.
 *
 * COLOUR MEANS VALENCE, NEVER DECORATION. Green = moved the way the team wanted
 * (which is DOWN for a metric declared that way). Red = moved against them.
 * Slate = not yet beyond luck. Sections are told apart by position and label,
 * so hue stays free to mean exactly one thing.
 *
 * ALL METRICS USES THE CONSOLE'S OWN ROW SHAPE: the change first and large,
 * then the metric with its role, both rates, the event counts and the base, and
 * underneath it the analyst's observation of that metric. An earlier version
 * was a spreadsheet with a bar chart; this carries the same numbers and adds
 * the sentence that says what they mean, which is the part a reader keeps.
 */
import type { ExperimentResults, MetricMap, MetricRole } from "../prototypes/results";
import { roleOf, optiPrimaryKeyOf } from "../prototypes/results";
import type { StatsReport } from "../prototypes/stats";
import type { VerdictRecord } from "../prototypes/verdict";
import { nextStep } from "../prototypes/verdict";
import type { Reading } from "../prototypes/notebook";
import { shortNotice, provenanceLine } from "../brand";

const F = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

const INK = "#101820";
const BODY = "#2B3742";
const MUTED = "#6B7A88";
const FAINT = "#95A2AE";
const RULE = "#E1E7EC";
const TINT = "#F6F8FA";
/** Tables want the full width; prose does not — a 110-character measure is
 *  harder to read, not easier. Paragraphs keep their own cap inside the wider shell. */
const PROSE = "max-width:680px;";

/** VALENCE ALWAYS CARRIES HUE. Direction is a fact whether or not the interval
 *  has closed, so an unsettled number is a lighter green or red — never grey.
 *  Grey-for-unsettled was the first attempt and it drained the colour out of
 *  every readout, because "not settled yet" is the ordinary state of a running
 *  experiment. Confidence is carried instead by an explicit NOT SETTLED tag and
 *  by bar saturation, which say so in words rather than by absence. */
const WIN = "#0B7A4B", WIN_SOFT = "#2E9C6B", WIN_PALE = "#B7E0CB";
const LOSS = "#B3261E", LOSS_SOFT = "#D1544B", LOSS_PALE = "#F2C4C0";
const WAIT = "#7A8894", WAIT_PALE = "#D8DEE4";
const AMBER_INK = "#7A5B00", AMBER_BG = "#FDF3DC", AMBER_RULE = "#E4C86B";

/** The verdict owns the loudest colour in the document, and nothing else uses it. */
/** Reads as the VALUE of "Status:" — a complete answer with a subject, not a
 *  shouted fragment. "CAN'T TELL AT THIS TRAFFIC" alone left the reader asking
 *  "can't tell what?"; a label in front of it is what makes it a sentence. */
const VERDICT: Record<string, { label: string; term: string; bg: string; rule: string; text: string }> = {
  confirmed:        { label: "It worked",                        term: "Confirmed",        bg: "#E7F4EC", rule: "#0B7A4B", text: "#075437" },
  refuted:          { label: "It didn't work",                   term: "Refuted",          bg: "#FDECEA", rule: "#B3261E", text: "#8C1D18" },
  guardrail_breach: { label: "Stop and look — a guardrail broke", term: "Guardrail breach", bg: "#FDECEA", rule: "#B3261E", text: "#8C1D18" },
  keep_running:     { label: "Too early to call",                term: "Keep running",     bg: "#EEF2F6", rule: "#6B7A88", text: "#3B4956" },
  underpowered:     { label: "Not enough traffic to tell yet",   term: "Underpowered",     bg: "#FDF3DC", rule: "#C9A227", text: "#7A5B00" },
  invalid:          { label: "The data can't be trusted yet",    term: "Invalid",          bg: "#FDECEA", rule: "#B3261E", text: "#8C1D18" },
  not_adjudicable:  { label: "No agreed definition of success",  term: "Not adjudicable",  bg: "#EEF2F6", rule: "#6B7A88", text: "#3B4956" },
};

const esc = (v: unknown) =>
  String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const pct = (v?: number) => (v === undefined ? "—" : `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}%`);
const rate = (v?: number) => (v === undefined ? "—" : `${(v * 100).toFixed(1)}%`);
const num = (v?: number) => (v === undefined ? "—" : v.toLocaleString());

const caps = (text: string, color = "#5A6B7A", pb = 7) =>
  `<div style="font:700 10.5px/1.2 ${F};letter-spacing:.11em;text-transform:uppercase;color:${color};padding-bottom:${pb}px;">${esc(text)}</div>`;

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

  /** Down can be the win. Never assume a rise is good. */
  const wantsDown = (k?: string) =>
    Boolean(k && opts.map?.composites.find((x) => `composite:${x.id}` === k)?.direction === "decrease");
  const isSettled = (k?: string) => {
    const c = k ? cell(k, focusId) : undefined;
    return Boolean(c?.liftCi && c.liftCi.lo * c.liftCi.hi > 0);
  };
  const favourable = (k?: string) => {
    const lift = k ? cell(k, focusId)?.lift ?? 0 : 0;
    if (lift === 0) return false;
    return wantsDown(k) ? lift < 0 : lift > 0;
  };
  const tone = (k?: string): { solid: string; soft: string; pale: string } => {
    const lift = k ? cell(k, focusId)?.lift ?? 0 : 0;
    if (!k || lift === 0) return { solid: WAIT, soft: WAIT, pale: WAIT_PALE };
    return favourable(k)
      ? { solid: WIN, soft: WIN_SOFT, pale: WIN_PALE }
      : { solid: LOSS, soft: LOSS_SOFT, pale: LOSS_PALE };
  };
  /** The hue either way; full strength only once the interval has closed. */
  const inkFor = (k?: string) => (isSettled(k) ? tone(k).solid : tone(k).soft);

  /** Says "not settled" in words, so colour never has to say it by absence. */
  const unsettledTag = (k?: string, ml = 8) =>
    isSettled(k)
      ? ""
      : `<span style="display:inline-block;margin-left:${ml}px;font:700 8.5px/1 ${F};letter-spacing:.08em;text-transform:uppercase;color:${AMBER_INK};background:${AMBER_BG};border:1px solid ${AMBER_RULE};border-radius:3px;padding:3px 5px;vertical-align:middle;">Not settled</span>`;

  const shown = opts.supporting.filter((k) => metric(k));

  /** What each metric is FOR. A table of numbers with no roles asks the reader
   *  to know which one decides the experiment and which are context. */
  const ROLE_CHIP: Record<MetricRole, { label: string; fg: string; bg: string }> = {
    decision:    { label: "Decision",    fg: "#FFFFFF", bg: INK },
    supporting:  { label: "Supporting",  fg: "#185FA5", bg: "#E6F1FB" },
    guardrail:   { label: "Guardrail",   fg: "#7A5B00", bg: AMBER_BG },
    exploratory: { label: "Exploratory", fg: "#5F5E5A", bg: "#F1EFE8" },
  };
  const roleFor = (k: string): MetricRole =>
    roleOf(k, {
      map: opts.map,
      decisionKey: stats?.primaryKey ?? null,
      optiPrimaryKey: optiPrimaryKeyOf(opts.results),
    });

  const v = verdict ? VERDICT[verdict.verdict] ?? VERDICT.not_adjudicable : null;
  const headline = reading?.headline || verdict?.headline || `${opts.prototypeName} — experiment readout`;

  const pre = verdict?.preRegistration;
  const frozen = pre && pre.anchor !== "live" && !pre.hypothesisNotFrozen;

  const pk = stats?.primaryKey;
  const pm = pk ? metric(pk) : undefined;
  const pf = pk ? cell(pk, focusId) : undefined;
  const pbase = pk ? cell(pk, baseId) : undefined;
  const heroSettled = isSettled(pk);
  const heroInk = inkFor(pk);

  // ── EVERYTHING THE SUMMARY SAYS IS COUNTED HERE, NOT WRITTEN ──────────────
  const nShown = shown.length;
  const nFav = shown.filter((k) => favourable(k)).length;
  const nSettled = shown.filter((k) => isSettled(k)).length;
  const breaches = (verdict?.guardrails ?? []).filter((g) => g.state === "breach");
  const atRisk = (verdict?.guardrails ?? []).filter((g) => g.state === "at_risk");

  const visitorsRaw =
    opts.results.totalVisitors ?? opts.results.variations.reduce((sum, a) => sum + (a.visitors || 0), 0);
  const visitors = visitorsRaw > 0 ? visitorsRaw : undefined;

  // Day count from the experiment's OWN start, measured against the moment the
  // stats were computed — never the clock, so a re-send of the same data reads
  // identically.
  const asOf = stats?.computedAt ? Date.parse(stats.computedAt) : undefined;
  const began = opts.results.startTime ? Date.parse(opts.results.startTime) : undefined;
  const days = began && asOf && asOf > began ? Math.floor((asOf - began) / 86_400_000) : undefined;

  const tile = (label: string, value: string, color = INK) => `
    <td width="25%" style="width:25%;padding-right:8px;vertical-align:top;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${TINT};border-radius:8px;">
        <tr><td style="padding:13px 12px;">
          <div style="font:700 9.5px/1.2 ${F};letter-spacing:.1em;text-transform:uppercase;color:${FAINT};padding-bottom:6px;">${esc(label)}</div>
          <div style="font:800 19px/1.15 ${F};color:${color};letter-spacing:-.01em;">${esc(value)}</div>
        </td></tr>
      </table>
    </td>`;

  const guardWord = breaches.length ? `${breaches.length} breached` : atRisk.length ? `${atRisk.length} at risk` : "All clear";
  const guardInk = breaches.length ? LOSS : atRisk.length ? AMBER_INK : WIN;

  // ── DID IT WORK. The one question, answered in one or two words. The verdict
  //    vocabulary is precise but it is OUR vocabulary; "UNDERPOWERED" is not an
  //    answer to a leader's actual question. ─────────────────────────────────
  const ANSWER: Record<string, { word: string; ink: string }> = {
    confirmed: { word: "Yes", ink: WIN },
    refuted: { word: "No", ink: LOSS },
    guardrail_breach: { word: "No — and it hurt something", ink: LOSS },
    keep_running: { word: "Too early to say", ink: WAIT },
    underpowered: { word: "Can't tell at this traffic", ink: AMBER_INK },
    invalid: { word: "The data can't be trusted yet", ink: LOSS },
    not_adjudicable: { word: "No agreed definition of success", ink: WAIT },
  };
  const answer = verdict ? ANSWER[verdict.verdict] ?? ANSWER.not_adjudicable : { word: "Waiting for data", ink: WAIT };

  // Biggest mover and worst mover, both taken from the data rather than named
  // by the analyst — the summary must not be able to disagree with the table.
  const byMagnitude = [...shown].sort(
    (a, b) => Math.abs(cell(b, focusId)?.lift ?? 0) - Math.abs(cell(a, focusId)?.lift ?? 0),
  );
  const biggest = byMagnitude.find((k) => favourable(k));
  const worst = byMagnitude.filter((k) => !favourable(k) && (cell(k, focusId)?.lift ?? 0) !== 0).pop();
  const step = nextStep(verdict, stats ?? null);

  // The inbox preview line. This is the only text most recipients will see
  // before deciding whether to open, so it carries the answer and the action —
  // not the subject repeated back at them.
  const firstSentence = reading?.executive?.split(/(?<=[.!?])\s+/)[0];
  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const asOfLabel = (() => {
    const iso = stats?.computedAt;
    if (!iso) return "";
    const d = new Date(iso);
    return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  })();

  const preheader = firstSentence ? firstSentence.slice(0, 160) : [
    answer.word,
    pm ? `decision step ${pct(pf?.lift)}${heroSettled ? "" : " (not settled)"}` : "",
    step.label,
  ].filter(Boolean).join(" · ");

  /** One row of the answer block: a label, and a value that carries its own colour. */
  const answerRow = (label: string, valueHtml: string, last = false) => `
    <tr>
      <td width="132" style="width:132px;padding:11px 14px 11px 0;${last ? "" : `border-bottom:1px solid ${RULE};`}vertical-align:top;font:700 9.5px/1.6 ${F};letter-spacing:.1em;text-transform:uppercase;color:${FAINT};">${esc(label)}</td>
      <td style="padding:11px 0;${last ? "" : `border-bottom:1px solid ${RULE};`}vertical-align:top;">${valueHtml}</td>
    </tr>`;

  const movedLine = (k?: string, fallback = "Nothing moved measurably") => {
    if (!k) return `<span style="font:400 14.5px/1.5 ${F};color:${MUTED};">${esc(fallback)}</span>`;
    const m = metric(k)!;
    return `<span style="font:800 17px/1.45 ${F};color:${inkFor(k)};">${esc(pct(cell(k, focusId)?.lift))}</span>
      <span style="font:500 14.5px/1.5 ${F};color:${BODY};">&nbsp; ${esc(m.label)}</span>${unsettledTag(k)}`;
  };

  // THE ANALYST'S EXECUTIVE SUMMARY. Two or three sentences, digit-free by
  // schema, aimed at someone who reads this and nothing else. It sits above the
  // computed rows because prose answers "so what" and a table never will.
  const execBlock = `
    <div style="font:700 21px/1.35 ${F};color:${INK};${PROSE}padding-bottom:${reading?.executive ? "10" : "0"}px;">${esc(headline)}</div>
    ${reading?.executive ? `<div style="font:400 16px/1.62 ${F};color:${BODY};${PROSE}">${esc(reading.executive)}</div>` : ""}`;

  const summary = `
    <tr><td style="padding:26px 28px 6px 28px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid ${RULE};">
        <tr><td style="padding-top:24px;">
          ${caps("Observations", MUTED, 10)}
          ${execBlock}
        </td></tr>
      </table>
    </td></tr>`;

  // ── THE HERO: one number, the decision metric, bigger than anything else ──
  const hero = pm
    ? `
    <tr><td style="padding:26px 28px 24px 28px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid ${RULE};">
        <tr><td style="padding-top:24px;">
          ${caps("The decision metric")}
          <div style="font:600 14.5px/1.35 ${F};color:${BODY};padding-bottom:12px;">${esc(pm.label)}</div>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
            <td style="vertical-align:bottom;padding-right:16px;">
              <div style="font:800 54px/.92 ${F};color:${heroInk};letter-spacing:-.025em;">${esc(pct(pf?.lift))}</div>
            </td>
            <td style="vertical-align:bottom;">
              <span style="display:inline-block;font:700 9.5px/1 ${F};letter-spacing:.09em;text-transform:uppercase;color:${heroSettled ? heroInk : AMBER_INK};background:${heroSettled ? "#FFFFFF" : AMBER_BG};border:1px solid ${heroSettled ? heroInk : AMBER_RULE};border-radius:3px;padding:6px 8px;">
                ${heroSettled ? "Settled beyond luck" : "Still inside luck"}
              </span>
            </td>
          </tr></table>
          <div style="font:400 13px/1.6 ${F};color:${MUTED};padding-top:12px;">
            ${esc(rate(pf?.rate))} vs ${esc(rate(pbase?.rate))} control
            ${pf?.count !== undefined ? `&nbsp;&middot;&nbsp; ${esc(num(pf.count))} vs ${esc(num(pbase?.count))} events` : ""}
          </div>
        </td></tr>
      </table>
    </td></tr>`
    : "";

  // ── THE FOUR MOVEMENTS ──
  const movement = (n: string, label: string, sec?: { text: string; measureKey?: string }) => {
    if (!sec?.text) return "";
    const m = sec.measureKey ? metric(sec.measureKey) : undefined;
    const c = sec.measureKey ? cell(sec.measureKey, focusId) : undefined;
    const ink = inkFor(sec.measureKey);
    return `
      <tr><td style="padding:0 0 22px 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
          <td width="3" bgcolor="${m ? ink : RULE}" style="width:3px;background:${m ? ink : RULE};font-size:0;border-radius:2px;">&nbsp;</td>
          <td width="14" style="width:14px;font-size:0;">&nbsp;</td>
          <td style="vertical-align:top;">
            <div style="font:700 10.5px/1.2 ${F};letter-spacing:.11em;text-transform:uppercase;color:#5A6B7A;padding-bottom:7px;">
              <span style="color:#AEBAC5;">${esc(n)}</span>&nbsp;&nbsp;${esc(label)}
            </div>
            ${m ? `<div style="padding-bottom:7px;">
              <span style="font:800 26px/1.05 ${F};color:${ink};letter-spacing:-.015em;">${esc(pct(c?.lift))}</span>
              <span style="font:600 13px/1.2 ${F};color:${BODY};">&nbsp;&nbsp;${esc(m.label)}</span>${unsettledTag(sec.measureKey)}
            </div>` : ""}
            <div style="font:400 14.5px/1.62 ${F};color:${BODY};${PROSE}">${esc(sec.text)}</div>
          </td>
        </tr></table>
      </td></tr>`;
  };

  const movements = reading?.read
    ? [
        movement("01", "What the change did", reading.read.effect),
        movement("02", "Where the behaviour went", reading.read.shift),
        movement("03", "What it cost", reading.read.cost),
        movement("04", "Against the prediction", reading.read.prediction),
      ].join("")
    : reading?.lede
      ? `<tr><td style="padding:0 0 22px 0;font:400 14.5px/1.65 ${F};color:${BODY};">${esc(reading.lede)}</td></tr>`
      : "";

  // ── EVERY METRIC: a real table. Columns, headers, one alignment per kind. ──
  const metricRows = shown.map((k) => {
    const m = metric(k)!;
    const f = cell(k, focusId), b = cell(k, baseId);
    const r = ROLE_CHIP[roleFor(k)];
    const note = reading?.observations?.find((o) => o.measureKey === k)?.note;
    return `
      <tr>
        <td width="96" align="left" style="width:96px;padding:14px 14px 14px 0;border-top:1px solid ${RULE};vertical-align:top;white-space:nowrap;">
          <div style="font:800 22px/1.1 ${F};color:${inkFor(k)};letter-spacing:-.015em;">${esc(pct(f?.lift))}</div>
          ${isSettled(k) ? "" : `<div style="font:700 8px/1.2 ${F};letter-spacing:.07em;text-transform:uppercase;color:${AMBER_INK};padding-top:5px;">Not settled</div>`}
        </td>
        <td style="padding:14px 0;border-top:1px solid ${RULE};vertical-align:top;">
          <div style="font:400 13px/1.6 ${F};color:${MUTED};">
            <span style="font:600 14.5px/1.5 ${F};color:${INK};">${esc(m.label)}</span>
${roleFor(k) === "exploratory" ? " " : `
            <span style="display:inline-block;margin:0 8px;font:700 8.5px/1 ${F};letter-spacing:.08em;text-transform:uppercase;color:${r.fg};background:${r.bg};border-radius:3px;padding:3px 5px;vertical-align:middle;">${esc(r.label)}</span>`}
            <span style="font:600 13px/1.6 ${F};color:${BODY};">${esc(rate(f?.rate))}</span> vs <span style="font:600 13px/1.6 ${F};color:${BODY};">${esc(rate(b?.rate))}</span> control${f?.count !== undefined ? ` &middot; ${esc(num(f.count))} vs ${esc(num(b?.count))} events` : ""}${f?.n ? ` from ${esc(num(f.n))} visitors` : ""}
          </div>
          ${note ? `<div style="font:400 14px/1.6 ${F};color:${BODY};${PROSE}padding-top:6px;">${esc(note)}</div>` : ""}
        </td>
      </tr>`;
  }).join("");

  const provenance = provenanceLine({
    experiment: opts.prototypeName,
    recordId: verdict?.state === "stamped" ? `stamped ${verdict.stampedAt?.slice(0, 19)}` : `draft ${stats?.computedAt?.slice(0, 19) ?? ""}`,
    at: verdict?.state === "stamped" ? verdict.stampedAt : stats?.computedAt,
  });

  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"></head>
<body style="margin:0;padding:0;background:#E8ECF0;-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#E8ECF0;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:860px;width:100%;background:#FFFFFF;border-radius:12px;overflow:hidden;">

  <!-- 1. WHAT KIND OF DOCUMENT THIS IS, and how far into the run we are. -->
  <tr><td bgcolor="${INK}" style="background:${INK};padding:15px 28px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td style="font:700 10.5px/1.2 ${F};letter-spacing:.16em;text-transform:uppercase;color:#FFFFFF;">Experiment readout</td>
      <td align="right" style="font:600 10.5px/1.2 ${F};letter-spacing:.1em;text-transform:uppercase;color:#8DA0B2;">${esc([days !== undefined ? `Day ${days}` : "", asOfLabel].filter(Boolean).join(" · "))}</td>
    </tr></table>
  </td></tr>

  <!-- 2. WHAT IS BEING TESTED — before any result. A reader who does not know
          what the experiment is cannot use a verdict about it. -->
  <tr><td style="padding:26px 28px 22px 28px;">
    <div style="font:800 27px/1.2 ${F};color:${INK};letter-spacing:-.02em;">${esc(opts.prototypeName)}</div>
    ${pre?.hypothesis ? `
      <div style="font:700 10.5px/1.2 ${F};letter-spacing:.11em;text-transform:uppercase;color:#5A6B7A;padding:16px 0 7px 0;">Hypothesis</div>
      <div style="font:400 15.5px/1.6 ${F};color:${BODY};${PROSE}">${esc(pre.hypothesis)}</div>
      ${!frozen ? `<div style="font:400 12px/1.5 ${F};color:${AMBER_INK};padding-top:8px;">This wasn't locked before the traffic arrived, so it is evidence rather than a pre-registered result.</div>` : ""}
    ` : ""}
  </td></tr>

  <!-- 3. HOW IT IS GOING. A labelled row, because the answer needs a subject:
          "Not enough traffic to tell yet" is a fragment until something in
          front of it says what it is the status OF. -->
  ${v ? `<tr><td style="padding:0 28px 4px 28px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${v.bg}" style="background:${v.bg};border-radius:8px;">
      <tr>
        <td width="5" bgcolor="${v.rule}" style="width:5px;background:${v.rule};font-size:0;border-radius:8px 0 0 8px;">&nbsp;</td>
        <td style="padding:18px 20px;">
          <div style="font:700 10px/1.2 ${F};letter-spacing:.13em;text-transform:uppercase;color:${v.text};opacity:.75;padding-bottom:7px;">Status</div>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
            <td style="vertical-align:middle;padding-right:10px;font:800 22px/1.25 ${F};color:${v.text};letter-spacing:-.015em;">${esc(v.label)}</td>
            <td style="vertical-align:middle;"><span style="display:inline-block;font:700 8.5px/1 ${F};letter-spacing:.1em;text-transform:uppercase;color:${v.text};border:1px solid ${v.rule};border-radius:3px;padding:4px 6px;">${esc(v.term)}</span></td>
          </tr></table>
          <div style="font:600 14px/1.5 ${F};color:${v.text};padding-top:9px;">${esc(step.label)}</div>
        </td>
      </tr>
    </table>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:10px;">
      <tr>
        ${tile("Visitors", visitors !== undefined ? num(visitors) : "—")}
        ${tile("Running", days !== undefined ? `Day ${days}` : "—")}
        ${tile("Beyond luck", `${nSettled} of ${nShown} metrics`)}
        ${tile("Guardrails", guardWord, guardInk)}
      </tr>
    </table>
  </td></tr>` : ""}

  ${summary}
  ${hero}

  ${movements ? `<tr><td style="padding:0 28px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid ${RULE};">
      <tr><td style="padding-top:24px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${movements}</table>
      </td></tr>
    </table>
  </td></tr>` : ""}

  ${metricRows ? `<tr><td style="padding:2px 28px 0 28px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid ${RULE};">
      <tr><td style="padding-top:24px;">
        ${caps("All metrics", MUTED, 10)}
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${metricRows}</table>
      </td></tr>
    </table>
  </td></tr>` : ""}

  ${opts.url ? `<tr><td style="padding:26px 28px 6px 28px;">
    <a href="${esc(opts.url)}" style="display:inline-block;background:${INK};color:#FFFFFF;text-decoration:none;font:600 14px/1 ${F};padding:13px 20px;border-radius:6px;">Open the full readout &rarr;</a>
  </td></tr>` : ""}

  <tr><td style="padding:24px 28px 26px 28px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid ${RULE};">
      <tr><td style="padding-top:16px;">
        <div style="font:400 10.5px/1.5 ${F};color:${FAINT};">${esc(shortNotice())}</div>
        <div style="font:400 10.5px/1.5 ${F};color:${FAINT};">${esc(provenance)}</div>
      </td></tr>
    </table>
  </td></tr>

</table>
</td></tr></table></body></html>`;

  const text = [
    `${opts.prototypeName.toUpperCase()} — EXPERIMENT READOUT`,
    pre?.hypothesis ? `\nWHAT WE'RE TESTING\n${pre.hypothesis}${frozen ? "" : "\nNot locked before the traffic arrived — evidence, not a pre-registered result."}` : "",
    v ? `\nSTATUS: ${v.label} (${v.term})\n${step.label}` : "",
    `\n${headline}`,
    reading?.executive ? `\n${reading.executive}` : "",
    `\nTHE SHORT VERSION`,
    pm ? `The decision step   ${pct(pf?.lift)} ${pm.label}${heroSettled ? "" : " (not settled)"}` : "",
    biggest ? `Biggest gain        ${pct(cell(biggest, focusId)?.lift)} ${metric(biggest)!.label}${isSettled(biggest) ? "" : " (not settled)"}` : "",
    worst ? `What it cost        ${pct(cell(worst, focusId)?.lift)} ${metric(worst)!.label}${isSettled(worst) ? "" : " (not settled)"}` : "",
    `Visitors ${visitors !== undefined ? num(visitors) : "—"} · ${days !== undefined ? `Day ${days}` : "—"} · Settled ${nSettled} of ${nShown} · Guardrails ${guardWord}`,
    pm ? `\nTHE DECISION METRIC\n${pct(pf?.lift)}  ${pm.label}\n${rate(pf?.rate)} vs ${rate(pbase?.rate)} control · ${num(pf?.count)} vs ${num(pbase?.count)} events\n${heroSettled ? "Settled beyond luck." : "Still inside luck."}` : "",
    reading?.read
      ? "\n" + [
          reading.read.effect?.text && `01 WHAT THE CHANGE DID\n${reading.read.effect.text}`,
          reading.read.shift?.text && `02 WHERE THE BEHAVIOUR WENT\n${reading.read.shift.text}`,
          reading.read.cost?.text && `03 WHAT IT COST\n${reading.read.cost.text}`,
          reading.read.prediction?.text && `04 AGAINST THE PREDICTION\n${reading.read.prediction.text}`,
        ].filter(Boolean).join("\n\n")
      : reading?.lede ? `\n${reading.lede}` : "",
    shown.length ? "\nEVERY METRIC" : "",
    ...shown.map((k) => {
      const m = metric(k)!;
      const f = cell(k, focusId), b = cell(k, baseId);
      return `${pct(f?.lift).padStart(7)}  ${m.label}${k === stats?.primaryKey ? " [DECISION]" : ""} — ${rate(f?.rate)} vs ${rate(b?.rate)} control${f?.count !== undefined ? ` (${num(f.count)} vs ${num(b?.count)} events)` : ""}${isSettled(k) ? "" : " — not settled"}`;
    }),
    opts.url ? `\nFull readout: ${opts.url}` : "",
    `\n${shortNotice()}`,
    provenance,
  ].filter((l) => l !== undefined && l !== "").join("\n");

  const subject = `${opts.prototypeName} — ${v?.label ?? "readout"}`;
  return { subject, html, text };
}
