"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { armColor } from "@/lib/prototypes/board-model";
import type { PrototypeArm } from "@/lib/prototypes/types";

type Sibling = { key: string; name: string; metric: string; experimentId: string | null };

/**
 * A/B/n MEMBERSHIP — several prototypes as arms of ONE experiment.
 *
 * It sits BEFORE the binding in this room because that is the order the work
 * happens in: arms are built, reviewed and certified for weeks before anyone
 * creates the Optimizely experiment. The group is the declaration; the binding
 * realises it later.
 *
 * The panel's real job is catching the two ways a group can be a lie:
 *   · arms judged on DIFFERENT metrics are not one test, they are N tests
 *   · arms bound to DIFFERENT experiments are not one test either
 * Both are shown against the siblings rather than asserted, because the whole
 * point of grouping is that you can see the set at once.
 */
export function ArmPanel({ prototypeKey, prototypeName, initialArm, metric }: {
  prototypeKey: string;
  prototypeName: string;
  initialArm: PrototypeArm | null;
  metric: string;
}) {
  const router = useRouter();
  const [arm, setArm] = useState<PrototypeArm | null>(initialArm);
  const [siblings, setSiblings] = useState<Sibling[] | null>(null);
  const [groupId, setGroupId] = useState(initialArm?.groupId ?? "");
  const [groupName, setGroupName] = useState(initialArm?.groupName ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!arm?.groupId) { setSiblings(null); return; }
    let live = true;
    fetch("/api/prototypes").then((r) => r.json()).then((j) => {
      if (!live) return;
      const all = (j.prototypes ?? []) as { key: string; name: string; arm?: PrototypeArm; metrics?: { primary?: string }; experiment?: { experimentId?: string } }[];
      setSiblings(all.filter((p) => p.arm?.groupId === arm.groupId).map((p) => ({
        key: p.key, name: p.name, metric: p.metrics?.primary ?? "", experimentId: p.experiment?.experimentId ?? null,
      })));
    }).catch(() => null);
    return () => { live = false; };
  }, [arm?.groupId]);

  async function save(next: string | null) {
    setBusy(true); setErr(null);
    const r = await fetch("/api/prototypes/arm", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: prototypeKey, groupId: next, groupName: next ? (groupName.trim() || undefined) : undefined }),
    }).catch(() => null);
    const j = await r?.json().catch(() => ({}));
    if (!r?.ok) { setErr(j?.error ?? "Couldn't save that."); setBusy(false); return; }
    setArm(j.arm ?? null);
    setBusy(false);
    router.refresh();
  }

  const field = "rounded-lg bg-background border border-border px-3 py-2 text-[13px] text-foreground placeholder:text-muted-2 focus:border-accent focus:outline-none";
  const colour = arm ? armColor(arm.groupId) : undefined;

  // The two ways a group lies, computed from the siblings rather than trusted.
  const metricsDisagree = siblings ? new Set(siblings.map((s) => s.metric.trim()).filter(Boolean)).size > 1 : false;
  const boundIds = siblings ? new Set(siblings.map((s) => s.experimentId).filter(Boolean)) : new Set();
  const experimentsDisagree = boundIds.size > 1;

  if (!arm) {
    return (
      <div className="space-y-2">
        <div className="text-[13px] text-muted-2">
          Not part of an A/B/n test. Give several prototypes the same group id and they run as arms of one experiment — judged together, on one metric, with one winner.
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input value={groupId} onChange={(e) => { setGroupId(e.target.value); setErr(null); }} spellCheck={false}
            placeholder="group id — e.g. kbr-property-overview" className={`${field} flex-1 min-w-[16rem]`} />
          <input value={groupName} onChange={(e) => setGroupName(e.target.value)} spellCheck={false}
            placeholder="Test name (optional)" className={`${field} flex-1 min-w-[12rem]`} />
          <button onClick={() => save(groupId.trim() || null)} disabled={busy || !groupId.trim()}
            className="h-9 px-4 rounded-lg bg-accent text-accent-fg text-[13px] font-semibold hover:bg-accent-hover disabled:opacity-40 shrink-0">
            {busy ? "Joining…" : "Join a test"}
          </button>
        </div>
        {err && <div className="text-[12.5px] text-danger">{err}</div>}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: colour }} />
        <span className="text-[14px] font-semibold" style={{ color: colour }}>{arm.groupName ?? arm.groupId}</span>
        <span className="text-[12.5px] text-muted-2 font-mono">{arm.groupId}</span>
        <button onClick={() => save(null)} disabled={busy}
          className="ml-auto text-[13px] text-muted-2 hover:text-danger disabled:opacity-40 shrink-0">
          {busy ? "Leaving…" : "Leave the test"}
        </button>
      </div>

      {siblings === null ? (
        <div className="text-[13px] text-muted-2">Reading the other arms…</div>
      ) : siblings.length < 2 ? (
        <div className="text-[13px] text-warn">
          Only this prototype carries that group id, so it is not a test yet. Give the same id to the other arms.
        </div>
      ) : (
        <div className="space-y-1">
          {siblings.map((s, i) => (
            <div key={s.key} className="flex items-center gap-2 rounded-lg border border-border bg-surface-2/30 px-2.5 py-1.5">
              <span className="text-[12px] text-muted-2 tabular-nums shrink-0">arm {i + 1}</span>
              {s.key === prototypeKey
                ? <span className="text-[13px] font-semibold truncate min-w-0 flex-1">{prototypeName} <span className="text-muted-2 font-normal">— this one</span></span>
                : <Link href={`/prototypes/${s.key}`} className="text-[13px] text-accent hover:text-accent-hover truncate min-w-0 flex-1">{s.name}</Link>}
              <span className="text-[12px] text-muted-2 shrink-0">{s.experimentId ? `bound ${s.experimentId}` : "not bound"}</span>
            </div>
          ))}
        </div>
      )}

      {metricsDisagree && (
        <div className="text-[12.5px] text-danger">
          These arms are judged on different primary metrics. That is not one test — it is {siblings?.length} tests sharing a name. Give them one decision metric before binding.
        </div>
      )}
      {experimentsDisagree && (
        <div className="text-[12.5px] text-danger">
          These arms are bound to different Optimizely experiments ({[...boundIds].join(", ")}). An A/B/n test is one experiment with one control — rebind them to the same one.
        </div>
      )}
      {!metricsDisagree && !experimentsDisagree && siblings && siblings.length >= 2 && (
        <div className="text-[12.5px] text-muted-2">
          One experiment, {siblings.length} arms, one decision metric. Traffic splits {siblings.length + 1} ways including the control, so this needs roughly {siblings.length + 1}× the visitors a two-arm test would.
        </div>
      )}
      {err && <div className="text-[12.5px] text-danger">{err}</div>}
    </div>
  );
}
