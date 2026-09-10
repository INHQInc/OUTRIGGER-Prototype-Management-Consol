/** Badge — shadcn/ui source, spoken in Prism's vocabulary (see button.tsx for the mapping).
 *  The tone variants (ok / warn / danger / muted / accent) are ours; shadcn's own
 *  default / secondary / destructive / outline are kept so demos paste in unchanged. */
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import { cn } from "@/lib/ui/cn";

const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1.5 overflow-hidden rounded-full border border-transparent px-2 py-[3px] text-[11.5px] font-semibold whitespace-nowrap transition-[color,box-shadow] focus-visible:border-accent focus-visible:ring-[3px] focus-visible:ring-accent/30 [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    variants: {
      variant: {
        default: "bg-accent text-accent-fg [a&]:hover:bg-accent/90",
        secondary: "bg-surface-2 text-foreground [a&]:hover:bg-surface-2/90",
        destructive: "bg-danger text-danger-fg [a&]:hover:bg-danger/90",
        outline: "border-border text-foreground [a&]:hover:bg-surface-2",
        ok: "bg-ok/10 text-ok",
        warn: "bg-warn/10 text-warn",
        danger: "bg-danger/10 text-danger",
        muted: "bg-surface-2 text-muted",
        accent: "bg-accent/10 text-accent",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

function Badge({
  className, variant = "default", asChild = false, ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span";
  return <Comp data-slot="badge" data-variant={variant} className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
