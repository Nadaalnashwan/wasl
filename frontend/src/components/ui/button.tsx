import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";
import { Gear } from "@/components/sketch/illustrations";

const buttonVariants = cva(
  "sketch-btn inline-flex items-center justify-center gap-2 font-hand whitespace-nowrap select-none [&_svg]:size-[1.1em] [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-brand text-brand-ink",
        secondary: "bg-sky text-ink",
        outline: "bg-paper text-ink",
        ghost: "!border-transparent !shadow-none bg-transparent text-ink hover:bg-paper-3",
        danger: "bg-bad-fill text-ink",
        success: "bg-ok-fill text-ink",
      },
      size: {
        sm: "h-9 px-3 text-base",
        md: "h-11 px-5 text-lg",
        lg: "h-13 px-7 text-xl",
        icon: "size-10 p-0 text-lg",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading = false, children, disabled, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    if (asChild) {
      return (
        <Comp className={cn(buttonVariants({ variant, size }), className)} ref={ref} {...props}>
          {children}
        </Comp>
      );
    }
    return (
      <button
        className={cn(buttonVariants({ variant, size }), className)}
        ref={ref}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading && <Gear className="gear-spin size-5" />}
        {children}
      </button>
    );
  },
);
Button.displayName = "Button";
export { buttonVariants };
