import Link from "next/link";
import { Badge } from "@/components/ui";
import { STAGE_TONE, STAGE_LABEL, normalizeStage, type PrototypeRecord } from "@/lib/prototypes/types";

/** Prototype summary card — used on the board and the site's filtered view. */
export function PrototypeCard({ p, siteLabel }: { p: PrototypeRecord; siteLabel?: string }) {
  const stage = normalizeStage(p.status);
  return (
    <Link href={`/prototypes/${p.key}`} className="rounded-xl border border-border bg-surface p-4 hover:border-border-strong transition-colors block">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[13px] font-semibold truncate">{p.name}</div>
          <div className="text-[11px] text-muted-2 mt-0.5 truncate">
            {siteLabel && <span>{siteLabel}</span>}
            {siteLabel && p.targets[0] && <span> · </span>}
            {p.targets[0] && <span className="font-mono">{p.targets[0].url}</span>}
            {p.targets.length > 1 && <span className="text-muted-2"> +{p.targets.length - 1}</span>}
          </div>
        </div>
        <Badge tone={STAGE_TONE[stage]}>{STAGE_LABEL[stage]}</Badge>
      </div>
      {p.hypothesis.outcome && (
        <p className="text-[12px] text-muted mt-2.5 leading-relaxed line-clamp-2">
          {p.hypothesis.change ? `${p.hypothesis.change} → ` : ""}{p.hypothesis.outcome}
        </p>
      )}
      <div className="flex items-center gap-3 mt-3 text-[11px] text-muted-2">
        {p.metrics.primary && <span>metric: {p.metrics.primary}</span>}
        {p.owner && <span>· {p.owner}</span>}
      </div>
    </Link>
  );
}
