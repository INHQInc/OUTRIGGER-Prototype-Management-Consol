"use client";

/**
 * THE MEASURE BUILDER — compose a measure by picking events, not by describing
 * one in a chat window.
 *
 * The whole point is that you see the arithmetic while you choose: every event
 * shows what it is worth per arm, and the preview at the bottom is computed
 * with the SAME function the readout and the verdict engine use. Nothing here
 * is interpreted — the save is a save.
 *
 * PER-VERSION MODE answers the case the plan interview kept hitting: a surface
 * that exists in only one arm can't be compared to itself, so the variation's
 * new CTA is paired with the control's equivalent action and both arms express
 * the same intent.
 */

import { useMemo, useState } from "react";
import type { ExperimentResults, CompositeMetric } from "@/lib/prototypes/results";
import { computeComposite } from "@/lib/prototypes/results";

export function MetricBuilder({ results, editing, baselineId, busy, onSave, onClose }: {
  results: ExperimentResults;
  /** Present = editing an existing custom measure. */
  editing?: CompositeMetric | null;
  baselineId?: string;
  busy: boolean;
  onSave: (draft: {
    id?: string; label: string; events: string[];
    armEvents?: { variationId: string; events: string[] }[];
    direction: "increase" | "decrease"; role: "guardrail" | "info"; definition?: string;
  }) => void;
  onClose: () => void;
}) {
  const arms = results.variations;
  const [label, setLabel] = useState(editing?.label ?? "");
  const [direction, setDirection] = useState<"increase" | "decrease">(editing?.direction === "decrease" ? "decrease" : "increase");
  const [role, setRole] = useState<"guardrail" | "info">(editing?.role === "guardrail" ? "guardrail" : "info");
  const [perArm, setPerArm] = useState(Boolean(editing?.armEvents?.length));
  const [shared, setShared] = useState<string[]>(editing?.events ?? []);
  const [byArm, setByArm] = useState<Record<string, string[]>>(() => {
    const seed: Record<string, string[]> = {};
    for (const a of arms) seed[a.variationId] = editing?.armEvents?.find((x) => x.variationId === a.variationId)?.events ?? editing?.events ?? [];
    return seed;
  });
  const [filter, setFilter] = useState("");

  const rate = (v?: number) => (v === undefined ? "—" : `${(v * 100).toFixed(1)}%`);
  const pct = (v?: number) => (v === undefined ? "—" : `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}%`);

  const rows = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return results.metrics
      .filter((m) => !q || m.name.toLowerCase().includes(q))
      .map((m) => ({
        name: m.name,
        perArm: Object.fromEntries(m.perVariation.map((r) => [r.variationId, r])),
        oneArm: m.perVariation.some((r) => r.conversions === 0) && m.perVariation.some((r) => r.conversions > 0),
      }));
  }, [results.metrics, filter]);

  const toggle = (name: string, variationId?: string) => {
    if (!variationId) {
      setShared((cur) => (cur.includes(name) ? cur.filter((x) => x !== name) : [...cur, name]));
      return;
    }
    setByArm((cur) => {
      const list = cur[variationId] ?? [];
      return { ...cur, [variationId]: list.includes(name) ? list.filter((x) => x !== name) : [...list, name] };
    });
  };

  // The preview runs the real computation, so what you see before saving is
  // exactly what the index and the verdict will read afterwards.
  const preview = useMemo(() => {
    const draft: CompositeMetric = {
      id: editing?.id ?? "preview", label: label || "New measure",
      events: perArm ? [] : shared, role: "info", direction,
      ...(perArm ? { armEvents: arms.map((a) => ({ variationId: a.variationId, events: byArm[a.variationId] ?? [] })) } : {}),
    };
    const anything = perArm ? arms.some((a) => (byArm[a.variationId] ?? []).length) : shared.length > 0;
    if (!anything) return null;
    return computeComposite(draft, results);
  }, [arms, byArm, direction, editing?.id, label, perArm, results, shared]);

  const previewFocus = preview?.find((r) => !r.isBaseline);
  const canSave = Boolean(label.trim()) && Boolean(preview?.length) && !busy;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/55 p-4 overflow-y-auto print:hidden" onClick={onClose}>
      <div className="w-full max-w-3xl my-8 rounded-xl border border-border bg-surface shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-3.5 border-b border-border flex items-center gap-3">
          <span className="text-[15px] font-bold">{editing ? "Edit measure" : "Build a measure"}</span>
          <span className="text-[11px] font-bold uppercase tracking-[0.07em] border border-accent/40 text-accent rounded px-1.5">console</span>
          <span className="ml-auto text-[12.5px] text-muted-2">Computed by the console from Optimizely events &mdash; not an Optimizely metric</span>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* name + polarity */}
          <div className="flex gap-3 flex-wrap items-end">
            <label className="flex-1 min-w-60">
              <span className="block text-[12.5px] font-bold uppercase tracking-[0.08em] text-muted-2 mb-1">Name</span>
              <input autoFocus value={label} onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. Total room booking intent"
                className="w-full h-9 px-3 rounded-lg border border-border bg-background text-[14px] focus:border-accent focus:outline-none" />
            </label>
            <label>
              <span className="block text-[12.5px] font-bold uppercase tracking-[0.08em] text-muted-2 mb-1">Good is</span>
              <select value={direction} onChange={(e) => setDirection(e.target.value as "increase" | "decrease")}
                className="h-9 px-2.5 rounded-lg border border-border bg-background text-[14px] focus:border-accent focus:outline-none">
                <option value="increase">going up</option>
                <option value="decrease">going down</option>
              </select>
            </label>
            <label>
              <span className="block text-[12.5px] font-bold uppercase tracking-[0.08em] text-muted-2 mb-1">Treat as</span>
              <select value={role} onChange={(e) => setRole(e.target.value as "guardrail" | "info")}
                className="h-9 px-2.5 rounded-lg border border-border bg-background text-[14px] focus:border-accent focus:outline-none">
                <option value="info">something to watch</option>
                <option value="guardrail">a guardrail</option>
              </select>
            </label>
          </div>

          {/* symmetric vs per-arm */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="inline-flex rounded-full border border-border bg-background p-0.5">
              {([[false, "Same events both versions"], [true, "Different events per version"]] as const).map(([v, lbl]) => (
                <button key={String(v)} onClick={() => setPerArm(v)}
                  className={`h-7 px-3 rounded-full text-[12.5px] font-semibold ${perArm === v ? "bg-surface text-foreground shadow-sm" : "text-muted-2 hover:text-foreground"}`}>
                  {lbl}
                </button>
              ))}
            </div>
            {perArm && (
              <span className="text-[12.5px] text-muted-2">
                Use this when a surface exists in only one version &mdash; pair it with the other version&apos;s equivalent action.
              </span>
            )}
          </div>

          {/* the events */}
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-[12.5px] font-bold uppercase tracking-[0.08em] text-muted-2">Events</span>
              <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter…"
                className="ml-auto h-7 px-2.5 w-48 rounded-lg border border-border bg-background text-[13px] focus:border-accent focus:outline-none" />
            </div>
            <div className="border border-border rounded-lg overflow-hidden max-h-72 overflow-y-auto">
              <table className="w-full text-[13px]">
                <thead className="sticky top-0 bg-surface-2 border-b border-border">
                  <tr className="text-[11.5px] uppercase tracking-[0.06em] text-muted-2 text-left">
                    <th className="font-semibold py-1.5 px-3">Event</th>
                    {arms.map((a) => (
                      <th key={a.variationId} className="font-semibold py-1.5 px-2 text-right max-w-32">
                        <span className="block truncate" title={a.name}>{a.name}</span>
                        {a.variationId === baselineId && <span className="font-normal normal-case">(control)</span>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {rows.map((r) => {
                    const on = perArm ? arms.some((a) => (byArm[a.variationId] ?? []).includes(r.name)) : shared.includes(r.name);
                    return (
                      <tr key={r.name} className={`border-b border-border/40 last:border-0 ${on ? "bg-accent/5" : ""}`}>
                        <td className="py-1.5 px-3">
                          {perArm ? (
                            <span className="font-medium">{r.name}</span>
                          ) : (
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input type="checkbox" checked={shared.includes(r.name)} onChange={() => toggle(r.name)} />
                              <span className="font-medium">{r.name}</span>
                            </label>
                          )}
                          {r.oneArm && <span className="ml-2 text-[10.5px] font-bold uppercase tracking-[0.06em] text-accent border border-accent/40 rounded px-1">one version only</span>}
                        </td>
                        {arms.map((a) => {
                          const cell = r.perArm[a.variationId];
                          return (
                            <td key={a.variationId} className="py-1.5 px-2 text-right">
                              {perArm ? (
                                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                                  <span className="text-muted-2">{rate(cell?.rate)}</span>
                                  <input type="checkbox" checked={(byArm[a.variationId] ?? []).includes(r.name)} onChange={() => toggle(r.name, a.variationId)} />
                                </label>
                              ) : (
                                <span className="text-muted-2">{rate(cell?.rate)}</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                  {rows.length === 0 && (
                    <tr><td colSpan={arms.length + 1} className="py-3 px-3 text-muted-2">No events match that filter.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* the arithmetic, before you save it */}
          <div className="rounded-lg border border-border bg-background/60 px-4 py-3">
            <div className="text-[12.5px] font-bold uppercase tracking-[0.08em] text-muted-2 mb-1.5">What it will read</div>
            {preview?.length ? (
              <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-[14px] tabular-nums">
                {preview.map((r) => (
                  <span key={r.variationId}>
                    <span className="font-bold">{rate(r.rate)}</span>{" "}
                    <span className="text-muted-2">{r.name}{r.isBaseline ? " (control)" : ""}</span>
                  </span>
                ))}
                {previewFocus?.lift !== undefined && (
                  <span className="font-bold">{pct(previewFocus.lift)} <span className="font-normal text-muted-2">vs control</span></span>
                )}
              </div>
            ) : (
              <p className="text-[13.5px] text-muted-2">Pick events and the numbers appear here &mdash; computed the same way the readout will compute them.</p>
            )}
            <p className="text-[12px] text-muted-2 mt-2 leading-snug">
              Summed ACTIONS, not unique guests: someone who clicks two of these counts twice, so the rate is actions per visitor and can exceed 100%.
            </p>
          </div>
        </div>

        <div className="px-5 py-3 border-t border-border flex items-center gap-2">
          <span className="text-[12.5px] text-muted-2">
            {perArm ? `${arms.filter((a) => (byArm[a.variationId] ?? []).length).length} of ${arms.length} versions have events` : `${shared.length} event${shared.length === 1 ? "" : "s"} selected`}
          </span>
          <span className="ml-auto flex gap-2">
            <button onClick={onClose} className="h-9 px-3 rounded-lg border border-border text-[13px] font-medium text-muted hover:text-foreground">Cancel</button>
            <button
              disabled={!canSave}
              onClick={() => onSave({
                id: editing?.id,
                label: label.trim(),
                events: perArm ? [] : shared,
                ...(perArm ? { armEvents: arms.map((a) => ({ variationId: a.variationId, events: byArm[a.variationId] ?? [] })).filter((a) => a.events.length) } : {}),
                direction, role,
              })}
              className="h-9 px-4 rounded-lg bg-accent text-accent-fg text-[13px] font-semibold hover:bg-accent-hover disabled:opacity-40">
              {busy ? "Saving…" : editing ? "Save changes" : "Add measure"}
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}
