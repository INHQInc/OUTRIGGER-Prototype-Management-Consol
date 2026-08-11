/**
 * THE READOUT AS AN EMAIL — a SKIN over the shared readout model.
 *
 * This file used to answer interpretive questions itself: was it settled, which
 * way is a win, what colour is that, what does the verdict mean in words. The
 * page answered the same questions separately and the two drifted — see
 * docs/READOUT-MODEL.md for the eleven defects that produced.
 *
 * It now renders `ReadoutModel` and computes nothing about meaning. What is
 * left here is genuinely email's own problem:
 *
 *   - PALETTE. The model emits `tone` and `confidence` as tokens; the mapping
 *     to hex lives here because email has no CSS variables and no dark mode.
 *     This skin TINTS unsettled numbers rather than greying them: unsettled is
 *     the ordinary state of a running experiment, and grey drained the colour
 *     out of every readout. The page holds the opposite position ("chroma is
 *     earned") and both are legitimate — which is exactly why the model refuses
 *     to decide it and emits the two facts instead.
 *   - TABLES AND INLINE STYLES. No flexbox, no grid, no classes.
 *   - NEVER THE `font:` SHORTHAND. Outlook renders through Word, which discards
 *     it — and takes every font-size and font-weight with it while
 *     letter-spacing and text-transform survive, so the document arrives with
 *     its type hierarchy exactly inverted. Longhand only.
 *
 * Reading order is deliberate and each layer is readable alone: what is being
 * tested → how it is going → what we found → the decision metric → the story →
 * every metric.
 */
import type { ExperimentResults, MetricMap } from "../prototypes/results";
import type { StatsReport } from "../prototypes/stats";
import type { VerdictRecord } from "../prototypes/verdict";
import type { Reading } from "../prototypes/notebook";
import type { ReadoutModel, MetricView, Tone, Severity } from "../prototypes/readout-model";
import { shortNotice, provenanceLine } from "../brand";

const F = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

const INK = "#101820";
const BODY = "#2B3742";
const MUTED = "#6B7A88";
const FAINT = "#95A2AE";
const RULE = "#E1E7EC";
const TINT = "#F6F8FA";
const PROSE = "max-width:900px;";

/** Tone → hue, at two strengths. Solid once the claim is earned, softer while
 *  it is only a direction. Confidence is said in WORDS beside it, never by
 *  draining the colour away. */
const HUE: Record<Tone, { solid: string; soft: string }> = {
  win: { solid: "#0B7A4B", soft: "#2E9C6B" },
  loss: { solid: "#B3261E", soft: "#D1544B" },
  caution: { solid: "#8A6212", soft: "#A67C1A" },
  neutral: { solid: "#7A8894", soft: "#7A8894" },
};
const AMBER_INK = "#7A5B00", AMBER_BG = "#FDF3DC", AMBER_RULE = "#E4C86B";

/** Severity → the band's paper, rule and ink. */
const BAND: Record<Severity, { bg: string; rule: string; text: string }> = {
  good: { bg: "#E7F4EC", rule: "#0B7A4B", text: "#075437" },
  bad: { bg: "#FDECEA", rule: "#B3261E", text: "#8C1D18" },
  caution: { bg: "#FDF3DC", rule: "#C9A227", text: "#7A5B00" },
  neutral: { bg: "#EEF2F6", rule: "#6B7A88", text: "#3B4956" },
};

const ROLE_CHIP: Record<string, { fg: string; bg: string }> = {
  Decision: { fg: "#FFFFFF", bg: INK },
  Supporting: { fg: "#185FA5", bg: "#E6F1FB" },
  Guardrail: { fg: AMBER_INK, bg: AMBER_BG },
  Exploratory: { fg: "#5F5E5A", bg: "#F1EFE8" },
};

const esc = (v: unknown) =>
  String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const caps = (text: string, color = "#5A6B7A", pb = 7) =>
  `<div style="font-family:${F};font-size:10.5px;line-height:1.2;font-weight:700;letter-spacing:.11em;text-transform:uppercase;color:${color};padding-bottom:${pb}px;">${esc(text)}</div>`;

/** A metric's ink: its hue, at the strength its confidence has earned. */
const inkOf = (m: MetricView) => (m.confidence === "settled" ? HUE[m.tone].solid : HUE[m.tone].soft);

const settledTag = (m: MetricView, ml = 8) =>
  m.confidence === "settled"
    ? ""
    : `<span style="display:inline-block;margin-left:${ml}px;font-family:${F};font-size:8.5px;line-height:1;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${AMBER_INK};background:${AMBER_BG};border:1px solid ${AMBER_RULE};border-radius:3px;padding:3px 5px;vertical-align:middle;">${esc(m.settledWord)}</span>`;

export function renderReadoutEmail(opts: {
  prototypeName: string;
  prototypeKey: string;
  url?: string;
  results: ExperimentResults;
  stats: StatsReport | null;
  verdict: VerdictRecord | null;
  reading: Reading | null;
  map: MetricMap | null;
  supporting: string[];
  /** THE INTERPRETATION. Everything below reads this and derives nothing. */
  model: ReadoutModel;
}): { subject: string; html: string; text: string } {
  const { model } = opts;
  const v = model.verdict;
  const band = BAND[v?.severity ?? "neutral"];
  const decision = model.decision;
  const rows = model.supporting.length ? model.supporting : model.all;

  const caveat = v?.directionCaveat
    ? `<div style="margin-top:12px;padding:11px 13px;background:#FFFFFF;border:1px solid ${AMBER_RULE};border-radius:6px;">
        <div style="font-family:${F};font-size:9.5px;line-height:1.2;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:${AMBER_INK};padding-bottom:5px;">Read this before trusting the verdict</div>
        <div style="font-family:${F};font-size:13.5px;line-height:1.55;font-weight:400;color:${BODY};${PROSE}">${esc(v.directionCaveat)}</div>
      </div>`
    : "";

  const tile = (label: string, value: string, tone: Tone) => `
    <td class="tile" width="25%" style="width:25%;padding-right:8px;vertical-align:top;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${TINT};border-radius:8px;">
        <tr><td style="padding:13px 12px;">
          <div style="font-family:${F};font-size:9.5px;line-height:1.2;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:${FAINT};padding-bottom:6px;">${esc(label)}</div>
          <div style="font-family:${F};font-size:19px;line-height:1.15;font-weight:800;color:${tone === "neutral" ? INK : HUE[tone].solid};letter-spacing:-.01em;">${esc(value)}</div>
        </td></tr>
      </table>
    </td>`;

  // ── STATUS. The verdict reads as the VALUE of a label, because "Not enough
  //    traffic to tell yet" is a fragment until something says what it is the
  //    status OF.
  const status = v
    ? `<tr><td class="pad" style="padding:0 28px 4px 28px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${band.bg}" style="background:${band.bg};border-radius:8px;">
          <tr>
            <td width="5" bgcolor="${band.rule}" style="width:5px;background:${band.rule};font-size:0;border-radius:8px 0 0 8px;">&nbsp;</td>
            <td style="padding:18px 20px;">
              <div style="font-family:${F};font-size:10px;line-height:1.2;font-weight:700;letter-spacing:.13em;text-transform:uppercase;color:${band.text};opacity:.75;padding-bottom:7px;">Status</div>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
                <td style="vertical-align:middle;padding-right:10px;font-family:${F};font-size:22px;line-height:1.25;font-weight:800;color:${band.text};letter-spacing:-.015em;">${esc(v.label)}</td>
                <td style="vertical-align:middle;"><span style="display:inline-block;font-family:${F};font-size:8.5px;line-height:1;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:${band.text};border:1px solid ${band.rule};border-radius:3px;padding:4px 6px;">${esc(v.term)}</span></td>
              </tr></table>
              <div style="font-family:${F};font-size:14px;line-height:1.5;font-weight:600;color:${band.text};padding-top:9px;">${esc(v.nextStep.label)}</div>
              ${caveat}
            </td>
          </tr>
        </table>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:10px;">
          <tr>${model.vitals.map((t) => tile(t.label, t.value, t.tone)).join("")}</tr>
        </table>
      </td></tr>`
    : "";

  const observations =
    model.story.headline || model.story.summaryProse
      ? `<tr><td class="pad" style="padding:26px 28px 6px 28px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid ${RULE};">
            <tr><td style="padding-top:24px;">
              ${caps("Observations", MUTED, 10)}
              ${model.story.headline ? `<div style="font-family:${F};font-size:21px;line-height:1.35;font-weight:700;color:${INK};${PROSE}padding-bottom:${model.story.summaryProse ? "10" : "0"}px;">${esc(model.story.headline)}</div>` : ""}
              ${model.story.summaryProse ? `<div style="font-family:${F};font-size:16px;line-height:1.62;font-weight:400;color:${BODY};${PROSE}">${esc(model.story.summaryProse)}</div>` : ""}
            </td></tr>
          </table>
        </td></tr>`
      : "";

  // ── THE DECISION METRIC. One number, larger than anything else — and it is
  //    the decision metric even when a supporting metric moved twenty times
  //    further. Leading with the biggest number would launder a browse-stage
  //    win into a business result.
  const hero = decision
    ? `<tr><td class="pad" style="padding:26px 28px 24px 28px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid ${RULE};">
          <tr><td style="padding-top:24px;">
            ${caps("The decision metric")}
            <div style="font-family:${F};font-size:14.5px;line-height:1.35;font-weight:600;color:${BODY};padding-bottom:12px;">${esc(decision.label)}</div>
            <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
              <td style="vertical-align:bottom;padding-right:16px;">
                <div class="hero-num" style="font-family:${F};font-size:54px;line-height:.92;font-weight:800;color:${inkOf(decision)};letter-spacing:-.025em;">${esc(decision.headline.text)}</div>
              </td>
              <td style="vertical-align:bottom;">
                <span style="display:inline-block;font-family:${F};font-size:9.5px;line-height:1;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:${decision.confidence === "settled" ? inkOf(decision) : AMBER_INK};background:${decision.confidence === "settled" ? "#FFFFFF" : AMBER_BG};border:1px solid ${decision.confidence === "settled" ? inkOf(decision) : AMBER_RULE};border-radius:3px;padding:6px 8px;">${esc(decision.settledWord)}</span>
              </td>
            </tr></table>
            <div style="font-family:${F};font-size:13px;line-height:1.6;font-weight:400;color:${MUTED};padding-top:12px;">
              ${esc(decision.focusRate.text)} vs ${esc(decision.baseRate?.text ?? "—")} control
              &nbsp;&middot;&nbsp; ${esc(decision.focusCount.text)} vs ${esc(decision.baseCount.text)} events
            </div>
          </td></tr>
        </table>
      </td></tr>`
    : "";

  const movements = model.story.movements
    .map((mv) => {
      const m = mv.metric;
      const ink = m ? inkOf(m) : RULE;
      // The decision metric is already printed above at fifty-four point. A
      // movement that names it again puts the same figure on the page twice
      // and the reader counts two findings. Its prose still carries it; only
      // the duplicate number goes. (Across the four movements the MODEL has
      // already deduped — this is the separate collision with the hero.)
      const showFigure = m && m.key !== decision?.key;
      return `
      <tr><td style="padding:0 0 22px 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
          <td width="3" bgcolor="${ink}" style="width:3px;background:${ink};font-size:0;border-radius:2px;">&nbsp;</td>
          <td width="14" style="width:14px;font-size:0;">&nbsp;</td>
          <td style="vertical-align:top;">
            <div style="font-family:${F};font-size:10.5px;line-height:1.2;font-weight:700;letter-spacing:.11em;text-transform:uppercase;color:#5A6B7A;padding-bottom:7px;">
              <span style="color:#AEBAC5;">${esc(mv.ordinal)}</span>&nbsp;&nbsp;${esc(mv.label)}
            </div>
            ${showFigure && m ? `<div style="padding-bottom:7px;">
              <span style="font-family:${F};font-size:26px;line-height:1.05;font-weight:800;color:${ink};letter-spacing:-.015em;">${esc(m.headline.text)}</span>
              <span style="font-family:${F};font-size:13px;line-height:1.2;font-weight:600;color:${BODY};">&nbsp;&nbsp;${esc(m.label)}</span>${settledTag(m)}
            </div>` : ""}
            <div style="font-family:${F};font-size:14.5px;line-height:1.62;font-weight:400;color:${BODY};${PROSE}">${esc(mv.text)}</div>
          </td>
        </tr></table>
      </td></tr>`;
    })
    .join("");

  // ── ALL METRICS. Fixed columns, so every indicator lands in the same place on
  //    every row, with the analyst's observation under the metric it is about.
  const COL = { chg: 88, role: 96, rate: 74, ev: 104 };
  const hcell = (text: string, w?: number, align: "left" | "right" = "left") =>
    `<td ${w ? `width="${w}" ` : ""}align="${align}" style="${w ? `width:${w}px;` : ""}padding:0 0 8px 0;font-family:${F};font-size:9.5px;line-height:1.2;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:${FAINT};">${esc(text)}</td>`;

  const metricRows = rows
    .map((m) => {
      const chip = ROLE_CHIP[m.roleLabel] ?? ROLE_CHIP.Exploratory;
      const top = `padding:13px 0;border-top:1px solid ${RULE};vertical-align:top;`;
      const unit = m.rateUnit === "actions-per-visitor" ? " per visitor" : "";
      // The stacked card's one numbers line. It repeats what the three right-
      // hand columns say, but LABELLED — without the headings above them,
      // "1.2%  1.0%  111 vs 92" is three unattributed numbers.
      const mobileNumbers = [
        `Variant ${m.focusRate.text}${unit}`,
        m.baseRate ? `control ${m.baseRate.text}` : null,
        m.focusCount.absent ? null : `${m.focusCount.text} vs ${m.baseCount.text} events`,
      ].filter(Boolean).join(" &nbsp;·&nbsp; ");

      return `
      <tr class="mrow">
        <td class="mcell m-chg" width="${COL.chg}" style="width:${COL.chg}px;${top}padding-right:12px;">
          <span style="font-family:${F};font-size:20px;line-height:1.1;font-weight:800;color:${inkOf(m)};letter-spacing:-.015em;">${esc(m.headline.text)}</span>
          <span style="display:block;font-family:${F};font-size:9px;line-height:1.3;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${m.confidence === "settled" ? HUE.win.solid : FAINT};padding-top:4px;">${esc(m.settledWord)}</span>
        </td>
        <td class="mcell" width="${COL.role}" style="width:${COL.role}px;${top}padding-right:12px;">
          ${m.role === "exploratory" ? "" : `<span style="display:inline-block;font-family:${F};font-size:8.5px;line-height:1;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${chip.fg};background:${chip.bg};border-radius:3px;padding:4px 6px;">${esc(m.roleLabel)}</span>`}
        </td>
        <td class="mcell m-name" style="${top}padding-right:12px;">
          <div style="font-family:${F};font-size:14.5px;line-height:1.35;font-weight:600;color:${INK};padding-top:2px;">${esc(m.label)}</div>
          <div class="m-mob" style="display:none;font-family:${F};font-size:12.5px;line-height:1.5;font-weight:400;color:${MUTED};padding-top:5px;">${mobileNumbers}</div>
          ${m.note ? `<div style="font-family:${F};font-size:13.5px;line-height:1.6;font-weight:400;color:${BODY};${PROSE}padding-top:5px;">${esc(m.note)}</div>` : ""}
          ${m.misnamed ? `<div style="font-family:${F};font-size:12.5px;line-height:1.5;font-weight:400;color:${AMBER_INK};padding-top:5px;">${esc(m.misnamed.line)}</div>` : ""}
        </td>
        <td class="mcell m-desk" width="${COL.rate}" align="right" style="width:${COL.rate}px;${top}">
          <span style="font-family:${F};font-size:14px;line-height:1.2;font-weight:700;color:${INK};">${esc(m.focusRate.text)}</span>
          ${m.rateUnit === "actions-per-visitor" ? `<div style="font-family:${F};font-size:9px;line-height:1.3;font-weight:400;color:${FAINT};padding-top:3px;">per visitor</div>` : ""}
        </td>
        <td class="mcell m-desk" width="${COL.rate}" align="right" style="width:${COL.rate}px;${top}">
          <span style="font-family:${F};font-size:14px;line-height:1.2;font-weight:400;color:${MUTED};">${esc(m.baseRate?.text ?? "—")}</span>
        </td>
        <td class="mcell m-desk" width="${COL.ev}" align="right" style="width:${COL.ev}px;${top}">
          <span style="font-family:${F};font-size:12.5px;line-height:1.2;font-weight:400;color:${MUTED};">${m.focusCount.absent ? "—" : `${esc(m.focusCount.text)} vs ${esc(m.baseCount.text)}`}</span>
        </td>
      </tr>`;
    })
    .join("");

  const provenance = provenanceLine({
    experiment: model.prototypeName,
    recordId: v?.stamped ? `stamped ${opts.verdict?.stampedAt?.slice(0, 19)}` : `draft ${model.runtime.computedAt?.slice(0, 19) ?? ""}`,
    at: v?.stamped ? opts.verdict?.stampedAt : model.runtime.computedAt,
  });

  // ── PHONES. The metrics grid is six fixed columns adding up to ~436px of
  //    numbers before the metric name gets any room at all. On a 375px screen
  //    that squeezes the name column to about sixty pixels and every sentence
  //    breaks one word per line — the readout arrives unreadable on the device
  //    it is most often opened on.
  //
  //    So below 640px the row stops being a row: the cells go `display:block`
  //    and stack into a card. The three number columns are replaced by one
  //    line that names its own values, because a bare "1.2% 1.0% 111 vs 92"
  //    means nothing once the column headings are gone.
  //
  //    This lives in a <style> block, which Outlook-through-Word discards —
  //    correct, since Word is desktop and the wide grid is what we want there.
  //    Every mobile client that matters (iOS Mail, Outlook mobile, the Gmail
  //    app) honours it.
  const MOBILE = `
    @media only screen and (max-width:640px) {
      .pad { padding-left:16px !important; padding-right:16px !important; }
      .mtable, .mrow, .mcell { display:block !important; width:100% !important; }
      .mcell { padding:0 !important; text-align:left !important; border-top:0 !important; }
      .mrow { border-top:1px solid ${RULE} !important; padding:15px 0 !important; }
      .m-head { display:none !important; }
      .m-desk { display:none !important; }
      .m-mob { display:block !important; }
      .m-chg { padding-bottom:7px !important; }
      .m-name { padding-bottom:5px !important; }
      .hero-num { font-size:44px !important; }
      /* Two-up, not stacked. Four short facts down the screen is four scrolls
         for four words; at 50% each still has room for "BEYOND LUCK" over
         "2 of 5 metrics" without wrapping. */
      .tile { display:inline-block !important; width:50% !important; box-sizing:border-box !important; vertical-align:top !important; padding:0 4px 8px 0 !important; }
    }`;

  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><style>${MOBILE}</style></head>
<body style="margin:0;padding:0;background:#E8ECF0;-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(model.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#E8ECF0;padding:14px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:1280px;width:100%;background:#FFFFFF;border-radius:12px;overflow:hidden;">

  <tr><td class="pad" bgcolor="${INK}" style="background:${INK};padding:15px 28px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td style="font-family:${F};font-size:10.5px;line-height:1.2;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:#FFFFFF;">Experiment readout</td>
      <td align="right" style="font-family:${F};font-size:10.5px;line-height:1.2;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:#8DA0B2;">${esc([model.runtime.dayLabel, model.runtime.asOfDate].filter((x) => x && x !== "—").join(" · "))}</td>
    </tr></table>
  </td></tr>

  <tr><td class="pad" style="padding:26px 28px 22px 28px;">
    <div style="font-family:${F};font-size:27px;line-height:1.2;font-weight:800;color:${INK};letter-spacing:-.02em;">${esc(model.prototypeName)}</div>
    ${model.hypothesis.text ? `
      <div style="font-family:${F};font-size:10.5px;line-height:1.2;font-weight:700;letter-spacing:.11em;text-transform:uppercase;color:#5A6B7A;padding:16px 0 7px 0;">Hypothesis</div>
      <div style="font-family:${F};font-size:15.5px;line-height:1.6;font-weight:400;color:${BODY};${PROSE}">${esc(model.hypothesis.text)}</div>` : ""}
  </td></tr>

  ${status}
  ${observations}
  ${hero}

  ${movements ? `<tr><td class="pad" style="padding:0 28px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid ${RULE};">
      <tr><td style="padding-top:24px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${movements}</table>
      </td></tr>
    </table>
  </td></tr>` : ""}

  ${metricRows ? `<tr><td class="pad" style="padding:2px 28px 0 28px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid ${RULE};">
      <tr><td style="padding-top:24px;">
        ${caps("All metrics", MUTED, 10)}
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="mtable">
          <tr class="m-head">
            ${hcell("Change", COL.chg)}
            ${hcell("Role", COL.role)}
            ${hcell("Metric")}
            ${hcell("Variant", COL.rate, "right")}
            ${hcell("Control", COL.rate, "right")}
            ${hcell("Events", COL.ev, "right")}
          </tr>
          ${metricRows}
        </table>
      </td></tr>
    </table>
  </td></tr>` : ""}

  ${opts.url ? `<tr><td class="pad" style="padding:26px 28px 6px 28px;">
    <a href="${esc(opts.url)}" style="display:inline-block;background:${INK};color:#FFFFFF;text-decoration:none;font-family:${F};font-size:14px;line-height:1;font-weight:600;padding:13px 20px;border-radius:6px;">Open the full readout &rarr;</a>
  </td></tr>` : ""}

  <tr><td class="pad" style="padding:24px 28px 26px 28px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid ${RULE};">
      <tr><td style="padding-top:16px;">
        <div style="font-family:${F};font-size:10.5px;line-height:1.5;font-weight:400;color:${FAINT};">${esc(shortNotice())}</div>
        <div style="font-family:${F};font-size:10.5px;line-height:1.5;font-weight:400;color:${FAINT};">${esc(provenance)}</div>
      </td></tr>
    </table>
  </td></tr>

</table>
</td></tr></table></body></html>`;

  const text = [
    `${model.prototypeName.toUpperCase()} — EXPERIMENT READOUT`,
    model.hypothesis.text ? `\nHYPOTHESIS\n${model.hypothesis.text}` : "",
    v ? `\nSTATUS: ${v.label} (${v.term})\n${v.nextStep.label}` : "",
    v?.directionCaveat ? `\n! ${v.directionCaveat}` : "",
    `\n${model.vitals.map((t) => `${t.label} ${t.value}`).join(" · ")}`,
    model.story.headline ? `\n${model.story.headline}` : "",
    model.story.summaryProse ? `\n${model.story.summaryProse}` : "",
    decision
      ? `\nTHE DECISION METRIC\n${decision.headline.text}  ${decision.label}\n${decision.focusRate.text} vs ${decision.baseRate?.text ?? "—"} control · ${decision.focusCount.text} vs ${decision.baseCount.text} events\n${decision.settledWord}.`
      : "",
    model.story.movements.length
      ? "\n" + model.story.movements.map((mv) => {
          const m = mv.metric && mv.metric.key !== decision?.key ? mv.metric : null;
          return `${mv.ordinal} ${mv.label.toUpperCase()}${m ? `  ${m.headline.text} ${m.label}` : ""}\n${mv.text}`;
        }).join("\n\n")
      : "",
    rows.length ? "\nALL METRICS" : "",
    // The unit travels with the value here too. text/plain is exactly the kind
    // of second body where a disclosure quietly stops being made.
    ...rows.map(
      (m) =>
        `${m.headline.text.padStart(7)}  ${m.label} [${m.roleLabel}] — ${m.focusRate.text} vs ${m.baseRate?.text ?? "—"} control${m.rateUnit === "actions-per-visitor" ? " (actions per visitor)" : ""}${m.focusCount.absent ? "" : ` (${m.focusCount.text} vs ${m.baseCount.text} events)`} — ${m.settledWord}`,
    ),
    opts.url ? `\nFull readout: ${opts.url}` : "",
    `\n${shortNotice()}`,
    provenance,
  ]
    .filter((l) => l !== undefined && l !== "")
    .join("\n");

  return { subject: model.subject, html, text };
}
