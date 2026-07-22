import Link from "next/link";

/** Entry point to the new-prototype wizard (a real multi-step route, not a modal). */
export function NewPrototype() {
  return (
    <Link href="/prototypes/new" className="h-9 px-4 inline-flex items-center rounded-lg bg-accent text-accent-fg text-[13px] font-semibold hover:bg-accent-hover transition-colors">
      + New prototype
    </Link>
  );
}
