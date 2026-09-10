"use client";

/**
 * WATERLINE — a working mock, on fake data.
 *
 * Three altitudes of ONE object, never three pages:
 *   ↑  the record above the card you are acting on (the card stays pinned)
 *   ·  the desk — one turn at a time
 *   ↓  the programme — the peripheral view, as a gesture rather than a rail
 *
 * Rendered as a fixed overlay so it escapes the Beta 1 app chrome. Delete this
 * route when the direction is settled or abandoned.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Button } from "@/components/ui/button";
import { CUSTOMER, ME, PROGRAMME, deckFor, type Entry, type Experiment } from "@/lib/waterline/fake";

type Altitude = "record" | "desk" | "programme" | "search";

const Seal = ({ children }: { children: React.ReactNode }) => (
  <div className="font-mono text-[11px] text-muted-2 mt-3">{children}</div>
);

/** Frozen things are receipts. Mutable things are just typed text. */
function LedgerEntry({ e }: { e: Entry }) {
  const boxed = e.sealed || e.freeze;
  return (
    <div className="flex gap-5 py-3">
      <div className="w-[150px] shrink-0 text-right">
        <div className="text-[12.5px] text-muted-2">{e.at}</div>
        <div className="text-[12.5px] text-muted">{e.who} · {e.role}</div>
      </div>
      <div className="flex-1 min-w-0 border-l border-border pl-5">
        <div className={boxed ? `rounded-lg bg-surface px-4 py-3.5 ${e.freeze ? "border-[1.5px] border-border-strong" : "border border-border"}` : ""}>
          {e.freeze && (
            <div className="flex items-center gap-1.5 mb-2 text-[11px] font-semibold tracking-[0.06em] text-muted-2">
              <LockIcon /> FROZEN AT OPEN
            </div>
          )}
          <div className="text-[14px] leading-relaxed text-muted [&_b]:text-foreground [&_b]:font-semibold"
            dangerouslySetInnerHTML={{ __html: e.body }} />
          {e.diff && (
            <div className="text-[14px] mt-1.5">
              <span className="text-muted-2">{e.diff.label}: </span>
              <span className="text-danger line-through">{e.diff.from}</span>
              <span className="text-ok ml-2">{e.diff.to}</span>
            </div>
          )}
          {e.seal && <Seal>{e.seal}</Seal>}
        </div>
      </div>
    </div>
  );
}

const LockIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
    <rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </svg>
);

/** The card. The frozen hypothesis is INSIDE it, above the buttons — the whole point. */
function TurnCard({ x, compact, onAct }: { x: Experiment; compact?: boolean; onAct: () => void }) {
  const t = x.turn!;
  if (compact) {
    return (
      <div className="w-[720px] rounded-xl border border-border bg-surface px-5 py-4 flex items-center gap-4 shadow-[0_-2px_14px_rgba(20,20,19,0.05)]">
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-semibold tracking-[0.09em] text-muted-2 mb-0.5">YOUR TURN — {t.role.toUpperCase()}</div>
          <div className="text-[15px] font-semibold truncate">{x.title}</div>
        </div>
        {t.actions.map((a) => (
          <Button key={a.label} variant={a.primary ? "default" : "outline"} onClick={onAct}>{a.label}</Button>
        ))}
      </div>
    );
  }
  return (
    <div className="w-[720px] rounded-xl border border-border bg-surface px-[30px] py-7">
      <div className="text-[13px] text-muted mb-1.5">{x.property} · {x.path}</div>
      <h1 className="text-[24px] font-semibold tracking-[-0.02em] mb-2">{x.title}</h1>
      <p className="text-[15px] text-muted leading-snug mb-5">{t.because}</p>

      {t.hypothesis && (
        <div className="rounded-lg border border-border px-[19px] py-4 mb-5">
          <div className="flex items-center gap-1.5 mb-2.5 text-[11px] font-semibold tracking-[0.06em] text-muted-2">
            <LockIcon /> WHAT WE SAID, BEFORE ANY NUMBERS EXISTED
          </div>
          <div className="text-[15px] leading-relaxed">{t.hypothesis}</div>
          {t.frozenAt && <Seal>{t.frozenAt}</Seal>}
        </div>
      )}

      {t.numbers && (
        <>
          <div className="flex gap-9 mb-2">
            {t.numbers.map((n) => (
              <div key={n.label}>
                <div className={`text-[20px] font-semibold tracking-[-0.02em] ${n.tone === "ok" ? "text-ok" : n.tone === "danger" ? "text-danger" : ""}`}>{n.value}</div>
                <div className="text-[12px] text-muted mt-0.5">{n.label}</div>
              </div>
            ))}
          </div>
          <div className="text-[12px] text-muted-2 mb-6">results frozen when this card was created</div>
        </>
      )}

      <div className="flex gap-3 mb-3.5">
        {t.actions.map((a) => (
          <Button key={a.label} size="lg" variant={a.primary ? "default" : "outline"} className="flex-1" onClick={onAct}>{a.label}</Button>
        ))}
      </div>
      <button onClick={onAct} className="w-full text-center text-[13px] text-muted-2 hover:text-foreground">I can’t decide yet</button>
    </div>
  );
}

export default function Waterline() {
  const [alt, setAlt] = useState<Altitude>("desk");
  const [i, setI] = useState(0);
  const [done, setDone] = useState<string[]>([]);
  const reduce = useReducedMotion();
  const searchRef = useRef<HTMLInputElement>(null);

  const deck = deckFor(ME.role).concat(PROGRAMME.filter((e) => e.turn && e.turn.role !== ME.role && false));
  const mine = deck.filter((e) => !done.includes(e.id));
  const current = mine[Math.min(i, Math.max(0, mine.length - 1))];

  const act = useCallback(() => {
    if (!current) return;
    setDone((d) => [...d, current.id]);
    setI(0);
    setAlt("desk");
  }, [current]);

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (alt === "search") { if (ev.key === "Escape") setAlt("desk"); return; }
      if (ev.key === "/") { ev.preventDefault(); setAlt("search"); setTimeout(() => searchRef.current?.focus(), 60); return; }
      if (ev.key === "ArrowUp") { ev.preventDefault(); if (current) setAlt("record"); }
      if (ev.key === "ArrowDown") { ev.preventDefault(); setAlt(alt === "record" ? "desk" : "programme"); }
      if (ev.key === "Escape") setAlt("desk");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [alt, current]);

  const fade = reduce ? {} : { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.24, ease: [0.22, 1, 0.36, 1] as const } };

  return (
    <div data-alt={alt} className="fixed inset-0 z-50 bg-background overflow-hidden flex flex-col">
      {/* the only permanent chrome in the product */}
      <header className="flex items-center justify-between px-7 py-5 shrink-0">
        <div className="flex items-center gap-2.5 text-[13px]">
          <span className="font-semibold">Prism</span><span className="text-border-strong">|</span>
          <span className="text-muted">{CUSTOMER}</span>
        </div>
        <div className="flex items-center gap-3.5">
          <span className="text-[13px] text-muted-2">{mine.length} waiting</span>
          <div className="w-7 h-7 rounded-full bg-border-strong grid place-items-center text-[11px] font-semibold text-muted">{ME.initials}</div>
        </div>
      </header>

      {/* No AnimatePresence. With one keyed child it still deadlocked — the old
          altitude never finished exiting, so the new one never mounted while
          `alt` had already changed. A mock is the wrong place to fight a
          library: React swaps on the key, and the arriving view animates in.
          Nothing needs to animate OUT for this gesture to read. */}
      <motion.main key={alt} {...fade} className="flex-1 flex flex-col overflow-hidden">
          {alt === "desk" && (
            <div className="flex-1 flex flex-col items-center pt-[70px] px-10">
              {current ? (
                <div className="w-[720px]">
                  <div className="text-[11px] font-semibold tracking-[0.09em] text-muted-2 mb-3">YOUR TURN — {current.turn!.role.toUpperCase()}</div>
                  <TurnCard x={current} onAct={act} />
                  <button onClick={() => setAlt("record")} className="mx-auto mt-6 flex items-center gap-2 text-[12.5px] text-muted-2 hover:text-foreground">
                    <span aria-hidden>↑</span> Press ↑ to read how this experiment got here
                  </button>
                </div>
              ) : (
                <div className="w-[560px] text-center pt-16">
                  <h1 className="text-[24px] font-semibold tracking-[-0.02em] mb-3">Nothing is waiting on you.</h1>
                  <p className="text-[15px] text-muted leading-snug mb-7">Two runs are live and neither needs a decision yet. Dana has three builds to review.</p>
                  <Button variant="outline" onClick={() => setAlt("programme")}>See the whole programme ↓</Button>
                </div>
              )}
            </div>
          )}

          {alt === "record" && current && (
            <>
              <div className="flex-1 overflow-y-auto flex justify-center px-10">
                <div className="w-[820px] pb-6">
                  <div className="text-center text-[11px] font-semibold tracking-[0.09em] text-muted-2 mb-1">↑ HOW THIS GOT HERE</div>
                  <div className="text-center text-[12.5px] text-muted-2 mb-4">{current.property} · open since {current.entries[0]?.at}</div>
                  {current.entries.map((e, n) => <LedgerEntry key={n} e={e} />)}
                </div>
              </div>
              {/* the live edge — the same card, still actionable, never a modal */}
              <div className="shrink-0 border-t border-border px-10 pt-4 pb-6 flex justify-center">
                <TurnCard x={current} compact onAct={act} />
              </div>
            </>
          )}

          {alt === "programme" && (
            <div className="flex-1 overflow-y-auto flex justify-center px-10">
              <div className="w-[820px]">
                <div className="text-[11px] font-semibold tracking-[0.09em] text-muted-2 mb-4">↓ THE WHOLE PROGRAMME — {PROGRAMME.length} EXPERIMENTS</div>
                {PROGRAMME.map((x) => (
                  <div key={x.id} className="flex items-center gap-4 py-3.5 border-b border-border">
                    <div className="flex-1 min-w-0">
                      <div className="text-[14.5px] font-medium truncate">{x.title}</div>
                      <div className="text-[12.5px] text-muted-2 mt-0.5">{x.property} · {x.path}</div>
                    </div>
                    <div className="text-[13px] text-muted shrink-0">{x.status}</div>
                    {x.turn?.role === ME.role && !done.includes(x.id) && (
                      <span className="text-[11.5px] font-semibold text-accent bg-accent/10 px-2 py-0.5 rounded-full shrink-0">YOURS</span>
                    )}
                  </div>
                ))}
                <p className="text-[13px] text-muted-2 mt-6">Esc, or ↑, to go back to your turn.</p>
              </div>
            </div>
          )}

          {alt === "search" && (
            <div className="flex-1 flex justify-center px-10 pt-14">
              <div className="w-[720px]">
                <div className="flex items-center gap-3 border-b-2 border-accent pb-3">
                  <span className="font-mono text-[14px] text-muted-2">/</span>
                  <input ref={searchRef} defaultValue="what is running" spellCheck={false}
                    className="flex-1 text-[21px] bg-transparent outline-none placeholder:text-muted-2" />
                </div>
                <div className="text-[12.5px] text-muted-2 mt-2 mb-5">a name · a person · a date · a build SHA · or a question</div>
                {[
                  ["Two runs are live.", "Destination explorer nav is on day 6 of 14 and tracking +1.1%. Offer tile wording is on day 11 of 14, flat."],
                  ["One run closed and is unstamped.", "Rate-calendar best-price promise, closed Tuesday — that one is on your desk now."],
                  ["Three builds are waiting on Dana R.", "The longest has waited 2 days."],
                ].map(([a, b]) => (
                  <div key={a} className="py-3.5 border-b border-border">
                    <div className="text-[15px] leading-snug"><b className="font-semibold">{a}</b> <span className="text-muted">{b}</span></div>
                  </div>
                ))}
                <p className="text-[13px] text-muted-2 mt-6">Esc to go back.</p>
              </div>
            </div>
          )}
      </motion.main>

      <footer className="shrink-0 px-7 py-3 text-[12px] text-muted-2 flex gap-5 justify-center">
        <span>↑ the record</span><span>↓ the programme</span><span>/ search</span><span>Esc back</span>
      </footer>
    </div>
  );
}
