import Link from "next/link";
import type { TokenHealth } from "@/lib/git/token-health";

/**
 * The banner that fires BEFORE a dead token breaks a build. Rendered on the
 * dashboard and the Repositories page; silent when healthy.
 */
export function TokenHealthBanner({ health }: { health: TokenHealth | null }) {
  if (!health || health.ok) return null;
  const danger = health.level === "danger";
  return (
    <div className={`rounded-xl border px-4 py-3 flex items-center justify-between gap-4 ${danger ? "border-danger/50 bg-[color-mix(in_srgb,var(--danger)_7%,transparent)]" : "border-warn/50 bg-[color-mix(in_srgb,var(--warn)_7%,transparent)]"}`}>
      <div className="min-w-0">
        <span className={`text-[12px] font-semibold ${danger ? "text-danger" : "text-warn"}`}>{danger ? "GitHub token problem" : "GitHub token expiring"}</span>
        <p className="text-[12px] text-foreground mt-0.5">{health.summary}</p>
        <p className="text-[10px] text-muted-2 mt-0.5">Checked {new Date(health.at).toLocaleString()}{health.login ? ` · ${health.login}` : ""}</p>
      </div>
      <Link href="/settings/repositories" className="text-[12px] text-accent hover:text-accent-hover font-medium shrink-0">Fix in Repositories →</Link>
    </div>
  );
}
