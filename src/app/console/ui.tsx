"use client";

/** Shared console primitives. One card grammar, one header grammar, one table
 *  grammar — every feature screen is built from these, so adding a surface can
 *  never invent a second visual language. */

import { cn } from "@/lib/ui/cn";
import { STAGES, STATUS, type Experiment, type Stage } from "@/lib/console/fake";

export function PageHeader({ title, count, actions }: { title: string; count?: string; actions?: React.ReactNode }) {
  return (
    <header className="h-14 shrink-0 border-b border-border bg-surface flex items-center px-6 gap-3">
      <h1 className="text-[15px] font-semibold">{title}</h1>
      {count && <span className="text-[13px] text-muted-2">{count}</span>}
      {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
    </header>
  );
}

export const Toolbar = ({ children }: { children: React.ReactNode }) => (
  <div className="px-6 py-3 border-b border-border bg-surface flex items-center gap-2 flex-wrap">{children}</div>
);

export function Chip({ on, onClick, children }: { on?: boolean; onClick?: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={cn("h-8 px-3 rounded-lg text-[13px] font-medium border transition-colors",
        on ? "bg-foreground text-background border-foreground" : "bg-surface border-border text-muted hover:text-foreground hover:border-border-strong")}>
      {children}
    </button>
  );
}

export const Badge = ({ s }: { s: Experiment["status"] }) => {
  const t = STATUS[s];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-[3px] text-[11.5px] font-semibold whitespace-nowrap", t.bg, t.fg)}>
      <span className={cn("w-1.5 h-1.5 rounded-full", t.dot)} />{t.label}
    </span>
  );
};

/** Any state worth a colour, without pretending to be an experiment status. */
export function Pill({ tone, children }: { tone: "ok" | "warn" | "danger" | "muted" | "accent"; children: React.ReactNode }) {
  const map = {
    ok: "bg-ok/10 text-ok", warn: "bg-warn/10 text-warn", danger: "bg-danger/10 text-danger",
    muted: "bg-surface-2 text-muted", accent: "bg-accent/10 text-accent",
  } as const;
  return <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-[3px] text-[11.5px] font-semibold whitespace-nowrap", map[tone])}>{children}</span>;
}

export function StageRail({ stage }: { stage: Stage }) {
  const at = STAGES.indexOf(stage);
  return (
    <div className="flex items-center gap-1.5">
      {STAGES.map((s, i) => (
        <div key={s} className="flex items-center gap-1.5">
          <div className="flex items-center gap-1.5">
            <span className={cn("w-1.5 h-1.5 rounded-full", i < at ? "bg-ok" : i === at ? "bg-accent" : "bg-border-strong")} />
            <span className={cn("text-[12.5px]", i === at ? "font-semibold text-foreground" : i < at ? "text-muted" : "text-muted-2")}>{s}</span>
          </div>
          {i < STAGES.length - 1 && <span className="w-4 h-px bg-border" />}
        </div>
      ))}
    </div>
  );
}

export const Section = ({ title, action, children, className }: { title?: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) => (
  <section className={cn("rounded-xl border border-border bg-surface", className)}>
    {title && (
      <div className="px-5 py-3 border-b border-border flex items-center gap-3">
        <h2 className="text-[13.5px] font-semibold">{title}</h2>
        {action && <div className="ml-auto">{action}</div>}
      </div>
    )}
    {children}
  </section>
);

export const Meta = ({ k, v, mono }: { k: string; v: React.ReactNode; mono?: boolean }) => (
  <div className="flex items-baseline gap-3 py-2 border-b border-border last:border-0">
    <span className="text-[12.5px] text-muted-2 w-[104px] shrink-0">{k}</span>
    <span className={cn("text-[13px] min-w-0", mono && "font-mono text-[12px]")}>{v}</span>
  </div>
);

export const Th = ({ children, first }: { children: React.ReactNode; first?: boolean }) => (
  <th className={cn("text-left text-[11.5px] font-semibold tracking-[0.03em] text-muted-2 px-4 py-2.5 border-b border-border whitespace-nowrap", first && "pl-6")}>
    {String(children).toUpperCase()}
  </th>
);

export const Empty = ({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) => (
  <div className="flex-1 grid place-items-center p-10">
    <div className="text-center max-w-sm">
      <h2 className="text-[16px] font-semibold mb-1.5">{title}</h2>
      <p className="text-[14px] text-muted leading-relaxed mb-5">{body}</p>
      {action}
    </div>
  </div>
);
