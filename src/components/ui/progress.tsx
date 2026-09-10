"use client";

/** Progress — shadcn/ui source, spoken in Prism's vocabulary (see button.tsx for the mapping).
 *  `tone` is ours: a meter that can fall needs to say so in colour, not only in number. */
import * as React from "react";
import { Progress as ProgressPrimitive } from "radix-ui";
import { cn } from "@/lib/ui/cn";

const TONE = { accent: "bg-accent", ok: "bg-ok", warn: "bg-warn", danger: "bg-danger", muted: "bg-border-strong" } as const;

function Progress({
  className, value, tone = "accent", ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root> & { tone?: keyof typeof TONE }) {
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      className={cn("relative h-2 w-full overflow-hidden rounded-full bg-surface-2", className)}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className={cn("h-full w-full flex-1 transition-transform duration-500", TONE[tone])}
        style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
      />
    </ProgressPrimitive.Root>
  );
}

export { Progress };
