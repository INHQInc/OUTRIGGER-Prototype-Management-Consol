/**
 * Button — shadcn/ui source, SPOKEN IN PRISM'S VOCABULARY.
 *
 * shadcn ships its own palette, and two of its token names mean the opposite
 * of ours: its `--muted` is a background where ours is body text (766 uses),
 * and its `--accent` is a faint hover wash where ours is the one brand blue
 * (430 uses). Letting `shadcn init` write the palette would have quietly
 * restyled about twelve hundred call sites. So the component is adapted on the
 * way in — which is the point of a library you copy rather than install.
 *
 *   shadcn            here
 *   bg-primary        bg-accent            the brand blue
 *   text-primary-fg   text-accent-fg
 *   hover:bg-accent   hover:bg-surface-2   the faint wash
 *   border-input      border-border
 *   ring-ring         ring-accent
 *   bg-destructive    bg-danger
 */
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "@/lib/ui/cn";

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-xl text-[14px] font-semibold whitespace-nowrap transition-[background-color,color,border-color,opacity] outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-accent text-accent-fg hover:bg-accent-hover",
        outline: "border border-border bg-surface hover:border-border-strong",
        ghost: "text-muted hover:text-foreground hover:bg-surface-2",
        danger: "bg-danger text-white hover:opacity-90",
        link: "text-accent underline-offset-4 hover:underline",
      },
      size: {
        default: "h-11 px-5",
        lg: "h-12 px-6 text-[15px]",
        sm: "h-9 px-3.5 text-[13px]",
        icon: "size-11",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

function Button({
  className, variant, size, asChild = false, ...props
}: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return <Comp data-slot="button" className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}

export { Button, buttonVariants };
