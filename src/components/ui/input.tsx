/** Input — shadcn/ui source, spoken in Prism's vocabulary (see button.tsx for the mapping). */
import * as React from "react";
import { cn } from "@/lib/ui/cn";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-11 w-full min-w-0 rounded-xl border border-border bg-surface px-3.5 py-1 text-[14px] shadow-xs transition-[color,box-shadow,border-color] outline-none selection:bg-accent selection:text-accent-fg file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-2 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "focus-visible:border-accent focus-visible:ring-[3px] focus-visible:ring-accent/30",
        "aria-invalid:border-danger aria-invalid:ring-danger/20",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
