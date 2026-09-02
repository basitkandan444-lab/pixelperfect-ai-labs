import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-all duration-standard ease-expo-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 active:scale-[0.96] hover:scale-[1.015] active:translate-y-[1px]",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-background shadow-subtle hover:brightness-110 active:scale-[0.98]",
        destructive:
          "bg-destructive text-destructive-foreground shadow-subtle hover:bg-destructive/90",
        outline:
          "border border-border bg-transparent hover:bg-surface-low hover:text-foreground",
        secondary:
          "bg-surface-mid text-foreground shadow-subtle hover:bg-surface-high",
        ghost: "hover:bg-surface-low hover:text-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        obsidian:
          "bg-foreground text-background shadow-elevated hover:bg-foreground/90 active:scale-[0.98] border border-foreground/10",
        glass:
          "glass border-border/50 text-foreground hover:bg-surface-mid/50 hover:border-border hover:shadow-subtle active:scale-[0.98]",
      },
      size: {
        default: "h-11 px-6 py-2 rounded-md",
        sm: "h-9 px-3 rounded-sm text-xs",
        lg: "h-14 px-8 rounded-lg text-base",
        xl: "h-16 px-10 rounded-xl text-lg font-semibold",
        icon: "h-10 w-10 rounded-md",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
