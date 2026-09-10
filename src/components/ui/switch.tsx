"use client";

/** Switch — shadcn/ui source, spoken in Prism's vocabulary (see button.tsx for the mapping).
 *  `tone="ok"` is ours: a switch that means "a rule is in force" reads green, not brand-blue. */
import * as React from "react";
import { Switch as SwitchPrimitive } from "radix-ui";
import { cn } from "@/lib/ui/cn";

function Switch({
  className, size = "default", tone = "accent", ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root> & { size?: "sm" | "default"; tone?: "accent" | "ok" }) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      className={cn(
        "peer group/switch inline-flex shrink-0 items-center rounded-full border border-transparent shadow-xs transition-all outline-none focus-visible:border-accent focus-visible:ring-[3px] focus-visible:ring-accent/30 disabled:cursor-not-allowed disabled:opacity-50 data-[size=default]:h-[1.15rem] data-[size=default]:w-8 data-[size=sm]:h-3.5 data-[size=sm]:w-6 data-[state=unchecked]:bg-border-strong",
        tone === "ok" ? "data-[state=checked]:bg-ok" : "data-[state=checked]:bg-accent",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "pointer-events-none block rounded-full ring-0 transition-transform group-data-[size=default]/switch:size-4 group-data-[size=sm]/switch:size-3 data-[state=checked]:translate-x-[calc(100%-2px)] data-[state=unchecked]:translate-x-0",
          tone === "ok" ? "data-[state=checked]:bg-ok-fg" : "data-[state=checked]:bg-accent-fg", "data-[state=unchecked]:bg-surface",
        )}
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
