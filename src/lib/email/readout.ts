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
 * MAGNITUDE IS DRAWN. Every metric carries a bar scaled to the biggest mover,
 * so the shape of a result — huge at the browse step, flat at the booking step
 * — lands before a number is read. Unsettled bars are a pale tint of the same
 * colour: direction visible, confidence not overstated.
 */
import type { ExperimentResults, MetricMap } from "../prototypes/results";
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

/** Valence. Solid when settled, pale when it is only a direction. */
const WIN = "#0B7A4B", WIN_PALE = "#B7E0CB";
const LOSS = "#B3261E", LOSS_PALE = "#F2C4C0";
const WAIT = "#7A8894", WAIT_PALE = "#D8DEE4";
const AMBER_INK = "#7A5B00", AMBER_BG = "#FDF3DC", AMBER_RULE = "#E4C86B";

/** The verdict owns the loudest colour in the document, and nothing else uses it. */
const VERDICT: Record<string, { label: string; bg: string; rule: string; text: string; plain: string }> = {
  confirmed:        { label: "HYPOTHESIS CONFIRMED", bg: "#E7F4EC", rule: "#0B7A4B", text: "#075437", plain: "The change did what the brief predicted. This one is ready for a ship decision." },
  refuted:          { label: "HYPOTHESIS REFUTED",   bg: "#FDECEA", rule: "#B3261E", text: "#8C1D18", plain: "The change did not do what the brief predicted." },
  guardrail_breach: { label: "GUARDRAIL BREACH",     bg: "#FDECEA", rule: "#B3261E", text: "#8C1D18", plain: "Something the team promised to protect got worse. This needs a decision now." },
  keep_running:     { label: "TOO EARLY TO CALL",    bg: "#EEF2F6", rule: "#6B7A88", text: "#3B4956", plain: "Not enough evidence yet. Leave it running." },
  underpowered:     { label: "UNDERPOWERED",         bg: "#FDF3DC", rule: "#C9A227", text: "#7A5B00", plain: "At this traffic the test cannot settle the question. The call is whether it is worth more time." },
  invalid:          { label: "DATA INVALID",         bg: "#FDECEA", rule: "#B3261E", text: "#8C1D18", plain: "The data cannot be trusted yet. Fix the setup before reading anything into it." },
  not_adjudicable:  { label: "NOT READY TO JUDGE",   bg: "#EEF2F6", rule: "#6B7A88", text: "#3B4956", plain: "There is no agreed definition of success on file for this run." },
};

const esc = (v: unknown) =>
  String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const pct = (v?: number) => (v === undefined ? "—" : `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}%`);
const rate = (v?: number) => (v === undefined ? "—" : `${(v * 100).toFixed(1)}%`);
const num = (v?: number) => (v === undefined ? "—" : v.toLocaleString());

const caps = (text: string, color = MUTED, pb = 7) =>
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
  const tone = (k?: string): { solid: string; pale: string } => {
    const lift = k ? cell(k, focusId)?.lift ?? 0 : 0;
    if (!k || lift === 0) return { solid: WAIT, pale: WAIT_PALE };
    return favourable(k) ? { solid: WIN, pale: WIN_PALE } : { solid: LOSS, pale: LOSS_PALE };
  };
  const inkFor = (k?: string) => (isSettled(k) ? tone(k).solid : WAIT);

  const shown = opts.supporting.filter((k) => metric(k));

  /** Bars are scaled to the biggest mover on show, so the set is comparable
   *  with itself and one huge metric doesn't flatten the rest. */
  const maxAbs = Math.max(0.0001, ...shown.map((k) => Math.abs(cell(k, focusId)?.lift ?? 0)));
  const BAR_W = 104;
  const bar = (k: string) => {
    const lift = cell(k, focusId)?.lift ?? 0;
    const t = tone(k);
    const fill = isSettled(k) ? t.solid : t.pale;
    const w = Math.max(3, Math.round((Math.abs(lift) / maxAbs) * BAR_W));
    const rest = Math.max(0, BAR_W - w);
    return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="table-layout:fixed;width:${BAR_W}px;">
      <tr>
        <td width="${w}" bgcolor="${fill}" style="width:${w}px;height:7px;background:${fill};font-size:0;line-height:0;border-radius:3px;">&nbsp;</td>
        <td width="${rest}" style="width:${rest}px;font-size:0;line-height:0;">&nbsp;</td>
      </tr></table>`;
  };

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
  const preheader = [
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
    return `<span style="font:800 16px/1.4 ${F};color:${inkFor(k)};">${esc(pct(cell(k, focusId)?.lift))}</span>
      <span style="font:400 14.5px/1.5 ${F};color:${BODY};">&nbsp; ${esc(m.label)}</span>
      ${isSettled(k) ? "" : `<span style="font:400 12.5px/1.5 ${F};color:${FAINT};">&nbsp; not settled</span>`}`;
  };

  const summary = `
    <tr><td style="padding:24px 28px 6px 28px;">
      ${caps("The short version", MUTED, 10)}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        ${answerRow("Did it work?", `<span style="font:800 17px/1.4 ${F};color:${answer.ink};">${esc(answer.word)}</span>`)}
        ${pm ? answerRow("The decision step", movedLine(pk)) : ""}
        ${answerRow("Biggest gain", movedLine(biggest, "Nothing moved in the team's favour"))}
        ${answerRow("What it cost", movedLine(worst, "Nothing moved against the team"))}
        ${answerRow("What happens next", `<span style="font:600 14.5px/1.5 ${F};color:${INK};">${esc(step.label)}</span>`, true)}
      </table>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:16px;">
        <tr>
          ${tile("Visitors", visitors !== undefined ? num(visitors) : "—")}
          ${tile("Running", days !== undefined ? `Day ${days}` : "—")}
          ${tile("Settled", `${nSettled} of ${nShown}`)}
          ${tile("Guardrails", guardWord, guardInk)}
        </tr>
      </table>
    </td></tr>`;

  // ── THE HERO: one number, the decision metric, bigger than anything else ──
  const hero = pm
    ? `
    <tr><td style="padding:26px 28px 24px 28px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid ${RULE};">
        <tr><td style="padding-top:24px;">
          ${caps("The decision metric — the only one that ships it")}
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

  // ── THE BRIEF: what the team committed to, before any of this ──
  const brief = pre?.hypothesis
    ? `
    <tr><td style="padding:0 28px 26px 28px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${TINT};border-radius:8px;">
        <tr>
          <td width="4" bgcolor="${frozen ? INK : "#C9A227"}" style="width:4px;background:${frozen ? INK : "#C9A227"};font-size:0;">&nbsp;</td>
          <td style="padding:16px 18px;">
            ${caps(frozen ? "What we said we believed · frozen before traffic" : "What we said we believed · never frozen", frozen ? MUTED : AMBER_INK)}
            <div style="font:400 15px/1.6 ${F};color:${BODY};">${esc(pre.hypothesis)}</div>
            ${!frozen ? `<div style="font:400 12px/1.5 ${F};color:${AMBER_INK};padding-top:9px;">Judged against the brief as it reads today. It was not locked before the traffic arrived, so this is evidence — not a pre-registered result.</div>` : ""}
          </td>
        </tr>
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
          <td width="28" style="width:28px;vertical-align:top;font:700 11px/1.6 ${F};color:#B4BFC9;">${esc(n)}</td>
          <td style="vertical-align:top;">
            ${caps(label)}
            ${m ? `<div style="padding-bottom:7px;">
              <span style="font:800 26px/1.05 ${F};color:${ink};letter-spacing:-.015em;">${esc(pct(c?.lift))}</span>
              <span style="font:400 13px/1.2 ${F};color:${MUTED};">&nbsp;&nbsp;${esc(m.label)}${isSettled(sec.measureKey) ? "" : " &middot; still inside luck"}</span>
            </div>` : ""}
            <div style="font:400 14.5px/1.62 ${F};color:${BODY};">${esc(sec.text)}</div>
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
  // Numeric columns carry their own left gutter — right-aligned headers in
  // adjacent cells run into each other without one ("VARIANTCONTROL").
  const NUMW = 64, GUT = 12;
  const th = (text: string, align: "left" | "right" = "left", w?: number, gutter = 0) =>
    `<td ${w ? `width="${w}" ` : ""}align="${align}" style="${w ? `width:${w}px;` : ""}padding:0 0 9px ${gutter}px;font:700 9.5px/1.2 ${F};letter-spacing:.1em;text-transform:uppercase;color:${FAINT};">${esc(text)}</td>`;

  const metricRows = shown.map((k, i) => {
    const m = metric(k)!;
    const f = cell(k, focusId), b = cell(k, baseId);
    const isDecision = k === stats?.primaryKey;
    const ink = inkFor(k);
    const bg = isDecision ? TINT : "#FFFFFF";
    const pad = (extra = "") => `padding:11px 0;border-top:1px solid ${RULE};background:${bg};${extra}`;
    return `
      <tr>
        <td style="${pad(`padding-left:${isDecision ? "10px" : "0"};vertical-align:middle;`)}">
          <div style="font:600 13.5px/1.35 ${F};color:${INK};">${esc(m.label)}</div>
          <div style="padding-top:4px;font:400 11.5px/1.5 ${F};color:${FAINT};">
            ${isDecision ? `<span style="font:700 8.5px/1 ${F};letter-spacing:.08em;color:#FFFFFF;background:${INK};border-radius:3px;padding:3px 5px;">DECISION</span>&nbsp;&nbsp;` : ""}
            ${f?.count !== undefined ? `${esc(num(f.count))} vs ${esc(num(b?.count))} events` : ""}
          </div>
        </td>
        <td width="${NUMW}" align="right" style="width:${NUMW}px;${pad(`padding-left:${GUT}px;vertical-align:middle;`)}">
          <span style="font:600 13px/1.2 ${F};color:${BODY};">${esc(rate(f?.rate))}</span>
        </td>
        <td width="${NUMW}" align="right" style="width:${NUMW}px;${pad(`padding-left:${GUT}px;vertical-align:middle;`)}">
          <span style="font:400 13px/1.2 ${F};color:${MUTED};">${esc(rate(b?.rate))}</span>
        </td>
        <td width="${BAR_W + GUT}" style="width:${BAR_W + GUT}px;${pad(`padding-left:${GUT}px;vertical-align:middle;`)}">${bar(k)}</td>
        <td width="66" align="right" style="width:66px;${pad(`padding-left:${GUT}px;padding-right:${isDecision ? "10px" : "0"};vertical-align:middle;`)}">
          <span style="font:800 15px/1.2 ${F};color:${ink};">${esc(pct(f?.lift))}</span>
          ${isSettled(k) ? "" : `<div style="font:400 9.5px/1.2 ${F};color:${FAINT};padding-top:3px;">not settled</div>`}
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
<table role="presentation" width="640" cellpadding="0" cellspacing="0" border="0" style="max-width:640px;width:100%;background:#FFFFFF;border-radius:12px;overflow:hidden;">

  <!-- MASTHEAD: quiet. Says which experiment, not how it went. -->
  <tr><td bgcolor="${INK}" style="background:${INK};padding:16px 28px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td style="font:700 11px/1.2 ${F};letter-spacing:.14em;text-transform:uppercase;color:#FFFFFF;">${esc(opts.prototypeName)}</td>
      <td align="right" style="font:600 10.5px/1.2 ${F};letter-spacing:.09em;text-transform:uppercase;color:#7E8FA0;">Experiment readout</td>
    </tr></table>
  </td></tr>

  <!-- THE VERDICT BAND: the loudest thing here, and the colour of the email. -->
  ${v ? `<tr><td bgcolor="${v.bg}" style="background:${v.bg};border-left:5px solid ${v.rule};padding:22px 28px 24px 23px;">
    <div style="font:800 26px/1.15 ${F};color:${v.text};letter-spacing:-.015em;">${esc(v.label)}</div>
    <div style="font:400 13.5px/1.55 ${F};color:${v.text};padding-top:7px;">${esc(v.plain)}</div>
    <div style="font:600 19px/1.42 ${F};color:${INK};padding-top:16px;">${esc(headline)}</div>
  </td></tr>` : ""}

  ${summary}
  ${hero}
  ${brief}

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
        ${caps("Every metric", MUTED, 10)}
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            ${th("Metric")}
            ${th("Variant", "right", NUMW, GUT)}
            ${th("Control", "right", NUMW, GUT)}
            ${th("", "left", BAR_W + GUT)}
            ${th("Change", "right", 66, GUT)}
          </tr>
          ${metricRows}
        </table>
        <div style="font:400 11px/1.5 ${F};color:${FAINT};padding-top:10px;">Bars are scaled to the biggest mover. Pale bars have not settled beyond luck.</div>
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
    v ? `\n${v.label}\n${v.plain}` : "",
    `\n${headline}`,
    `\nTHE SHORT VERSION`,
    `Did it work?        ${answer.word}`,
    pm ? `The decision step   ${pct(pf?.lift)} ${pm.label}${heroSettled ? "" : " (not settled)"}` : "",
    biggest ? `Biggest gain        ${pct(cell(biggest, focusId)?.lift)} ${metric(biggest)!.label}${isSettled(biggest) ? "" : " (not settled)"}` : "",
    worst ? `What it cost        ${pct(cell(worst, focusId)?.lift)} ${metric(worst)!.label}${isSettled(worst) ? "" : " (not settled)"}` : "",
    `What happens next   ${step.label}`,
    `Visitors ${visitors !== undefined ? num(visitors) : "—"} · ${days !== undefined ? `Day ${days}` : "—"} · Settled ${nSettled} of ${nShown} · Guardrails ${guardWord}`,
    pm ? `\nTHE DECISION METRIC\n${pct(pf?.lift)}  ${pm.label}\n${rate(pf?.rate)} vs ${rate(pbase?.rate)} control · ${num(pf?.count)} vs ${num(pbase?.count)} events\n${heroSettled ? "Settled beyond luck." : "Still inside luck."}` : "",
    pre?.hypothesis ? `\nWHAT WE SAID WE BELIEVED${frozen ? " (frozen before traffic)" : " (never frozen)"}\n${pre.hypothesis}` : "",
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
