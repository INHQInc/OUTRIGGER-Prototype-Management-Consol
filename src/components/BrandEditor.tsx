"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SEVERITY_DOT } from "@/components/ui";
import { missingTaxonomyFields, type SiteProfile, type Taxonomy } from "@/lib/brand/types";

type Field = keyof Taxonomy;
type Stated = "voice" | "audience" | "business";

interface Status {
  ready: boolean;
  missing: Field[];
  approved: SiteProfile | null;
  draft: SiteProfile | null;
}

/** Every question is asked in the customer's terms, and says why it is asked. */
const WORDS: { keys: [Field] | [Field, Field]; ask: string; because: string; hints: [string] | [string, string] }[] = [
  {
    keys: ["visitorNoun", "visitorNounPlural"],
    ask: "What do you call the people who come to your site?",
    because: "Every button, heading and error message is written about them, so it has to be your word — customer, member, patient, student.",
    hints: ["one", "more than one"],
  },
  {
    keys: ["offeringNoun", "offeringNounPlural"],
    ask: "What do they come for?",
    because: "The thing your site offers them — a plan, a product, a course, a listing.",
    hints: ["one", "more than one"],
  },
  {
    keys: ["primaryAction"],
    ask: "What is the one thing you most want them to do?",
    because: "Every experiment is judged against it in the end. Write it as a verb: subscribe, apply, buy, sign up.",
    hints: ["a verb"],
  },
  {
    keys: ["conversionSurface"],
    ask: "Where does that happen?",
    because: "The page or step where it completes — the checkout, the sign-up form, the application.",
    hints: ["the page or step"],
  },
  {
    keys: ["entityKinds"],
    ask: "What is your site built from?",
    because: "The kinds of page or thing people browse. Separate them with commas — for example: plans, integrations, case studies.",
    hints: ["comma-separated"],
  },
];

const PROSE: { key: Stated; ask: string; because: string }[] = [
  { key: "voice", ask: "How does your brand sound?", because: "Plain or playful, formal or warm — and anything you would never say." },
  { key: "audience", ask: "Who is it for?", because: "The people your site is written for, and what they care about when they arrive." },
  { key: "business", ask: "What does the business do?", because: "In a sentence or two: what it sells, and how it earns." },
];

const LABEL: Record<Field, string> = {
  visitorNoun: "what you call them", visitorNounPlural: "what you call more than one",
  offeringNoun: "what they come for", offeringNounPlural: "the plural of that",
  primaryAction: "the one action", conversionSurface: "where it happens", entityKinds: "what the site is built from",
};

type Form = { t: Record<Field, string>; s: Record<Stated, string> };

function formFrom(p: SiteProfile | null): Form {
  const t = {} as Record<Field, string>;
  for (const k of Object.keys(LABEL) as Field[]) {
    const v = p?.taxonomy?.[k];
    t[k] = Array.isArray(v) ? v.join(", ") : (v as string | undefined) ?? "";
  }
  return {
    t,
    s: { voice: p?.sections?.voice ?? "", audience: p?.sections?.audience ?? "", business: p?.sections?.business ?? "" },
  };
}

/**
 * The customer's brand: the words and voice every prototype, readout and email
 * is written in. Step one of creating a customer, and the one place to change
 * it afterwards — the same screen, not a wizard plus a settings page.
 *
 * Answers save as a DRAFT while you type, so leaving loses nothing, and a draft
 * is never served — the builder keeps reading the approved revision until
 * Approve makes this one live.
 */
export function BrandEditor({ initial, canManage }: { initial: Status; canManage: boolean }) {
  const router = useRouter();
  const [status, setStatus] = useState(initial);
  const [form, setForm] = useState<Form>(() => formFrom(initial.draft ?? initial.approved));
  const [save, setSave] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [note, setNote] = useState<{ tone: "ok" | "danger"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  // One serialized chain: saves land in order and never race each other.
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<Form | null>(null);

  function queue(f: Form) {
    pending.current = f;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, 600);
  }

  function flush(): Promise<unknown> {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    const f = pending.current;
    if (!f) return chain.current;
    pending.current = null;
    setSave("saving");
    chain.current = chain.current.then(async () => {
      const res = await fetch("/api/brand", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patch: { taxonomy: f.t, sections: f.s } }),
      }).catch(() => null);
      if (!res?.ok) { setSave("error"); return; }
      const d = await res.json();
      setStatus(d.status);
      setSave("saved");
    });
    return chain.current;
  }

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  function setWord(k: Field, v: string) {
    const next = { ...form, t: { ...form.t, [k]: v } };
    setForm(next); setNote(null); queue(next);
  }
  function setProse(k: Stated, v: string) {
    const next = { ...form, s: { ...form.s, [k]: v } };
    setForm(next); setNote(null); queue(next);
  }

  // THE SAME DEFINITION OF COMPLETE THE BUILD GATE USES — imported, never
  // re-derived, so this button cannot be enabled on a brand the gate refuses.
  const missing = missingTaxonomyFields({
    ...Object.fromEntries(Object.entries(form.t).filter(([k]) => k !== "entityKinds")),
    entityKinds: form.t.entityKinds.split(",").map((x) => x.trim()).filter(Boolean),
  } as Partial<Taxonomy>);

  async function approve() {
    if (busy || missing.length) return;
    setBusy(true); setNote(null);
    try {
      await flush();
      const res = await fetch("/api/brand", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ approve: true }) });
      const d = await res.json();
      if (!res.ok) { setNote({ tone: "danger", text: d.error ?? "Could not approve." }); return; }
      setStatus(d.status);
      // COMPUTE THE CAVEAT. A new revision is part of every branch's content
      // hash, so the person approving should hear what it sets in motion.
      setNote(d.changed
        ? { tone: "ok", text: `Approved as revision ${d.status.approved?.rev}. Every prototype for this customer will ask to re-sync, so its branch picks up the new words.` }
        : { tone: "ok", text: "Nothing changed, so no new revision — no prototype needs to re-sync." });
      router.refresh();
    } finally { setBusy(false); }
  }

  const pendingEdits = Boolean(status.draft);
  const tone = status.ready && !pendingEdits ? "good" : "attention";
  const headline = !status.approved
    ? "Not set up yet — nothing can be built for this customer until the words below are filled in and approved."
    : !status.ready
      ? `The live revision is missing ${status.missing.map((k) => LABEL[k]).join(", ")} — builds are refused until it is complete.`
      : pendingEdits
        ? `Revision ${status.approved.rev} is live. Your changes below are saved but not in use until you approve them.`
        : `Revision ${status.approved.rev} is live${status.approved.approvedBy ? `, approved by ${status.approved.approvedBy}` : ""}.`;

  const input = "w-full rounded-lg bg-background border border-border px-3 py-2 text-[15px] focus:border-accent focus:outline-none disabled:opacity-60";

  return (
    <div className="space-y-5">
      {/* THE ONE HOME for the brand's state on this screen, and its one action. */}
      <div className={`rounded-xl border overflow-hidden ${tone === "good" ? "border-border bg-surface" : "border-accent/40 bg-[color-mix(in_srgb,var(--accent)_4%,transparent)]"}`}>
        <div className="px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-start gap-2.5 min-w-0">
            <span className={`mt-[7px] w-2 h-2 rounded-full shrink-0 ${SEVERITY_DOT[tone]}`} />
            <p className="text-[14px] leading-relaxed">{headline}</p>
          </div>
          {canManage && (tone !== "good") && (
            <button onClick={approve} disabled={busy || missing.length > 0}
              title={missing.length ? `Still needed: ${missing.map((k) => LABEL[k]).join(", ")}` : undefined}
              className="h-9 px-4 rounded-lg bg-accent text-accent-fg text-[15px] font-semibold hover:bg-accent-hover disabled:opacity-40 shrink-0">
              {busy ? "Approving…" : "Approve brand"}
            </button>
          )}
        </div>
        {canManage && missing.length > 0 && tone !== "good" && (
          <div className="px-4 pb-3 -mt-1 text-[13px] text-muted-2 pl-[34px]">Still needed: {missing.map((k) => LABEL[k]).join(", ")}.</div>
        )}
        {note && <div className={`px-4 py-2.5 border-t border-border/60 text-[14px] ${note.tone === "danger" ? "text-danger" : "text-foreground/90"}`}>{note.text}</div>}
      </div>

      <section className="rounded-xl border border-border bg-surface overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-3">
          <div>
            <div className="text-[15px] font-semibold">The words you use</div>
            <div className="text-[13px] text-muted-2 mt-0.5">The agent writes every visible word in these. All of them are needed before anything is built.</div>
          </div>
          <span className="text-[13px] text-muted-2 shrink-0" aria-live="polite">
            {save === "saving" ? "Saving…" : save === "saved" ? "Saved" : save === "error" ? <span className="text-danger">Not saved — check your connection</span> : ""}
          </span>
        </div>
        <div className="divide-y divide-border/60">
          {WORDS.map((q) => (
            <div key={q.keys[0]} className="px-4 py-3.5">
              <label className="block text-[14px] font-medium">{q.ask}</label>
              <p className="text-[13px] text-muted-2 mt-0.5 max-w-[68ch]">{q.because}</p>
              <div className={`mt-2 grid gap-2 ${q.keys.length === 2 ? "sm:grid-cols-2" : ""}`}>
                {q.keys.map((k, i) => (
                  <input key={k} value={form.t[k]} disabled={!canManage} spellCheck={k !== "entityKinds" ? false : undefined}
                    onChange={(e) => setWord(k, e.target.value)} onBlur={() => flush()}
                    aria-label={LABEL[k]}
                    // A HINT, never a value. Filling the plural from the singular
                    // would write a guess into the record as if it were an answer.
                    placeholder={k === "visitorNounPlural" && form.t.visitorNoun ? `${form.t.visitorNoun}s?` : k === "offeringNounPlural" && form.t.offeringNoun ? `${form.t.offeringNoun}s?` : q.hints[i]}
                    className={input} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-border bg-surface overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <div className="text-[15px] font-semibold">How you sound</div>
          <div className="text-[13px] text-muted-2 mt-0.5 max-w-[68ch]">Leave any of these blank if you are not sure. The agent then matches the copy already on your site rather than inventing a voice — it will not guess.</div>
        </div>
        <div className="divide-y divide-border/60">
          {PROSE.map((q) => (
            <div key={q.key} className="px-4 py-3.5">
              <label className="block text-[14px] font-medium">{q.ask}</label>
              <p className="text-[13px] text-muted-2 mt-0.5 max-w-[68ch]">{q.because}</p>
              <textarea value={form.s[q.key]} disabled={!canManage} rows={3}
                onChange={(e) => setProse(q.key, e.target.value)} onBlur={() => flush()}
                aria-label={q.ask}
                className={`${input} mt-2 resize-y leading-relaxed`} />
            </div>
          ))}
        </div>
      </section>

      {!canManage && <p className="text-[13px] text-muted-2">Only an admin can change a customer&apos;s brand.</p>}
    </div>
  );
}
