import Link from "next/link";
import type { StepSeverity } from "@/lib/prototypes/severity";
import { SEVERITY_DOT } from "./ui";

/**
 * THE TAB ROW — one implementation, every surface.
 *
 * There were two: an underlined row with status dots in the prototype
 * workspace, and a segmented pill pair on the Prototypes index. Same gesture,
 * two grammars, and a reader has to learn which is which before they can use
 * either (user: "you're using different tab styles on this page vs the
 * experiment — we need them all to be the same").
 *
 * THE UNDERLINE WON, and not by preference. The pill is a two-item control: it
 * needs a border box, it cannot carry a status dot without looking like a
 * badge, and at seven items with dots the box becomes a wall. The underline
 * scales from two to seven, has an obvious active state at any width, and
 * leaves room for the dot that `derivePipeline` puts on every stage. A grammar
 * that only works at one size is not a grammar.
 *
 * ONE CARD GRAMMAR PER ROOM has a sibling now: one tab grammar per app.
 */
export interface TabItem {
  id: string;
  label: string;
  href: string;
  /** The stage's derived state. Absent for a view switch, which has none. */
  severity?: StepSeverity | null;
  /** A count worth interrupting for — open recommendations, say. */
  badge?: number;
  /** Pushed to the far right, away from the sequence: configuration, not a
   *  step. Never more than one. */
  trailing?: boolean;
}

export function TabRow({ items, active, className = "" }: { items: TabItem[]; active: string; className?: string }) {
  const lead = items.filter((i) => !i.trailing);
  const trail = items.filter((i) => i.trailing);

  const render = (item: TabItem) => {
    const on = item.id === active;
    return (
      <Link
        key={item.id}
        href={item.href}
        aria-current={on ? "page" : undefined}
        className={`shrink-0 flex items-center gap-2 px-3.5 py-2.5 text-[14px] border-b-2 transition-colors ${
          on
            ? "border-accent text-foreground font-semibold"
            : `border-transparent hover:text-foreground ${item.trailing ? "text-muted-2" : "text-muted"} font-medium`
        }`}
      >
        {item.severity !== undefined && (
          // Rendered even when null, so labels stay on one baseline whether or
          // not a stage currently has anything to say.
          <span className={`w-2 h-2 rounded-full shrink-0 ${item.severity ? SEVERITY_DOT[item.severity] : "bg-transparent"}`} />
        )}
        <span className="whitespace-nowrap">{item.label}</span>
        {item.badge ? (
          <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded-full text-warn bg-[color-mix(in_srgb,var(--warn)_12%,transparent)]">
            {item.badge}
          </span>
        ) : null}
      </Link>
    );
  };

  return (
    // THE RULE UNDER THE TABS IS THE SURFACE'S, NOT THIS COMPONENT'S. The row
    // is inset by its container's padding; a rule drawn here would stop short
    // of both edges and read as unfinished. So the caller puts `border-b` on
    // the element that spans the full width, and `-mb-px` drops this row onto
    // it so the active tab's accent covers the grey.
    //
    // Scrolls rather than wraps: a nav that breaks onto a second line is the
    // clutter the stage model exists to remove.
    <nav className={`flex items-end gap-1 overflow-x-auto -mb-px ${className}`}>
      {lead.map(render)}
      {trail.length > 0 && <span className="ml-auto flex items-end">{trail.map(render)}</span>}
    </nav>
  );
}
