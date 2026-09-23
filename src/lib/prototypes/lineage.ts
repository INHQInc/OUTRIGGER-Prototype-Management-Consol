/**
 * WHAT ELSE IS IN PLAY — the sibling arms of this test, and the round before it.
 *
 * Both are recorded and neither reached the branch. The agent was handed one
 * brief and one page and built as though nothing else existed:
 *
 * SIBLINGS. `PrototypeArm` makes several prototypes arms of ONE experiment
 * (`types.ts`). An agent that cannot see its siblings can build a variation
 * that duplicates one, contradicts one, or targets the same element — and the
 * experiment splits its traffic across arms that are not actually different.
 *
 * THE ROUND BEFORE. `parentKey` is set at promote and its own comment says a
 * test is rarely a one-off — it is "a round in a line of enquiry, and without
 * this the console holds a pile of results instead of a thread". The thread was
 * held entirely by the console. The builder started every round from zero, so
 * round two could rebuild the thing round one measured and ruled out.
 *
 * Best-effort throughout: lineage is context, and a store blip on it must never
 * block a build. A missing parent is silence, not an error.
 */
import { getContentStore } from "../content/store";
import { getVerdict } from "./verdict";
import type { PrototypeRecord } from "./types";

export interface SiblingArm {
  key: string;
  name: string;
  /** What that arm is building — one line, so the agent can tell them apart. */
  change?: string;
  stage: string;
}

export interface PriorRound {
  key: string;
  name: string;
  /** stamped / draft — a draft verdict re-derives and is not yet a finding. */
  state: string;
  verdict: string;
  headline: string;
  /** What that round proved, as sentences. */
  discoveries: string[];
}

export interface Lineage {
  groupName?: string;
  arms: SiblingArm[];
  prior?: PriorRound;
}

export async function lineageFor(proto: PrototypeRecord): Promise<Lineage> {
  const out: Lineage = { arms: [] };
  const arm = proto.arm;
  const parentKey = proto.parentKey;
  if (!arm?.groupId && !parentKey) return out;

  try {
    const store = await getContentStore();

    if (arm?.groupId) {
      out.groupName = arm.groupName;
      const all = await store.listPrototypes();
      out.arms = all
        .filter((p) => p.key !== proto.key && p.arm?.groupId === arm.groupId)
        .map((p) => ({ key: p.key, name: p.name, change: p.brief?.change?.trim() || undefined, stage: p.status }))
        .sort((a, b) => a.key.localeCompare(b.key));
    }

    if (parentKey) {
      const parent = await store.getPrototype(parentKey);
      const verdict = await getVerdict(parentKey).catch(() => null);
      if (parent) {
        out.prior = {
          key: parent.key,
          name: parent.name,
          state: verdict?.state ?? "none",
          verdict: verdict?.verdict ?? "not stamped",
          headline: verdict?.headline ?? "",
          // The NOTE, not the label: the label names the metric, the note says
          // what was learned. A list of metric names is not a finding.
          discoveries: (verdict?.discoveries ?? []).map((d) => d.note).filter(Boolean).slice(0, 6),
        };
      }
    }
  } catch { /* context, never a blocker */ }
  return out;
}

/** The lineage as the section a builder reads, or "" when there is none. */
export function renderLineageMd(l: Lineage): string {
  const parts: string[] = [];
  if (l.arms.length) {
    parts.push(
      `## The other arms of this test${l.groupName ? ` — ${l.groupName}` : ""}`,
      `This prototype is ONE arm. The others below are being built separately and`,
      `the experiment splits its traffic between all of them, so two arms that do`,
      `the same thing waste the run. Build what this brief asks for and nothing`,
      `that belongs to a sibling.`,
      ``,
      ...l.arms.map((a) => `- \`${a.key}\` — **${a.name}** (${a.stage})${a.change ? `: ${a.change.split("\n")[0].slice(0, 160)}` : ""}`),
      ``,
    );
  }
  if (l.prior) {
    const p = l.prior;
    parts.push(
      `## The round before this one`,
      `This experiment was promoted from \`${p.key}\` — **${p.name}**. A test is a round`,
      `in a line of enquiry, not a one-off, so what that round settled is already`,
      `known and does not need re-testing.`,
      ``,
      `**Verdict:** ${p.verdict}${p.state === "draft" ? " _(draft — it re-derives while the run is open, so treat it as provisional)_" : ""}`,
      p.headline ? `\n> ${p.headline}` : "",
      p.discoveries.length ? `\n**What it found:**\n${p.discoveries.map((d) => `- ${d}`).join("\n")}` : "",
      ``,
    );
  }
  return parts.filter((x) => x !== undefined).join("\n");
}
