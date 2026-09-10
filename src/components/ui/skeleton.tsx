/** Skeleton — shadcn/ui source, spoken in Prism's vocabulary (see button.tsx for the mapping). */
import { cn } from "@/lib/ui/cn";

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="skeleton" className={cn("animate-pulse rounded-md bg-surface-2", className)} {...props} />;
}

export { Skeleton };
