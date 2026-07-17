import Link from "next/link";
import type { ReactNode } from "react";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <header className="h-16 shrink-0 border-b border-border px-8 flex items-center justify-between gap-4">
      <div>
        <h1 className="text-[15px] font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="text-[12px] text-muted-2 mt-0.5">{subtitle}</p>}
      </div>
      {actions}
    </header>
  );
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "ok" | "warn" | "danger" | "accent" }) {
  const tones: Record<string, string> = {
    neutral: "bg-surface-2 text-muted border-border",
    ok: "bg-[color-mix(in_srgb,var(--ok)_14%,transparent)] text-ok border-[color-mix(in_srgb,var(--ok)_30%,transparent)]",
    warn: "bg-[color-mix(in_srgb,var(--warn)_14%,transparent)] text-warn border-[color-mix(in_srgb,var(--warn)_30%,transparent)]",
    danger: "bg-[color-mix(in_srgb,var(--danger)_14%,transparent)] text-danger border-[color-mix(in_srgb,var(--danger)_30%,transparent)]",
    accent: "bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] text-accent border-[color-mix(in_srgb,var(--accent)_30%,transparent)]",
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="border border-dashed border-border rounded-xl py-16 text-center">
      <p className="text-[13px] text-muted">{title}</p>
      {hint && <p className="text-[12px] text-muted-2 mt-1">{hint}</p>}
    </div>
  );
}

export function TimeAgo({ iso }: { iso: string | null }) {
  if (!iso) return <span className="text-muted-2">never</span>;
  const d = new Date(iso);
  const label = d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  return <span title={iso}>{label}</span>;
}

export function LinkButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="text-[12px] text-accent hover:text-accent-hover font-medium">
      {children}
    </Link>
  );
}

export function bytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
