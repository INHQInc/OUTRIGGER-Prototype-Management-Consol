/** Textarea — shadcn/ui source, spoken in Prism's vocabulary (see button.tsx for the mapping). */
import * as React from "react";
import { cn } from "@/lib/ui/cn";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-20 w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-[14px] leading-relaxed shadow-xs transition-[color,box-shadow,border-color] outline-none placeholder:text-muted-2 focus-visible:border-accent focus-visible:ring-[3px] focus-visible:ring-accent/30 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-danger aria-invalid:ring-danger/20",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
