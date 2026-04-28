// tailwind-design-system skill: CVA-based button with Tailwind v4 tokens
// frontend-ui-engineering skill: focus-visible, keyboard accessible
// impeccable skill: ease-out-quart motion, no bounce/elastic
// React 19: ref is a regular prop, no forwardRef needed

import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  // Base: inline-flex, keyboard accessible, ease-out-quart transitions
  "inline-flex items-center justify-center font-medium rounded cursor-pointer select-none " +
  "transition-all duration-150 " +
  "disabled:opacity-40 disabled:cursor-not-allowed " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--bg-page)]",
  {
    variants: {
      variant: {
        // Primary — white-on-dark, strong CTA
        primary:
          "bg-[var(--fg-primary)] text-black hover:bg-white " +
          "border border-transparent shadow-[var(--shadow-sm)]",
        // Ghost — text only, subtle hover surface
        ghost:
          "bg-transparent text-[var(--fg-secondary)] " +
          "hover:text-[var(--fg-primary)] hover:bg-[var(--bg-elevated)]",
        // Outline — bordered, no fill
        outline:
          "border border-[var(--border-hover)] text-[var(--fg-primary)] " +
          "hover:border-[var(--border-focus)] hover:bg-[var(--bg-elevated)] bg-transparent",
        // Danger — for destructive actions
        danger:
          "bg-[var(--status-error-bg)] text-[var(--status-error)] " +
          "border border-[var(--status-error)] border-opacity-30 " +
          "hover:bg-[var(--status-error)] hover:text-white",
        // Success — confirmation actions
        success:
          "bg-[var(--status-success-bg)] text-[var(--status-success)] " +
          "border border-[var(--accent-border)] " +
          "hover:bg-[var(--accent-muted)]",
      },
      size: {
        xs: "text-[10px] px-2 h-6 gap-1",
        sm: "text-xs px-3 h-8 gap-1.5",
        md: "text-sm px-4 h-10 gap-2",
        lg: "text-sm px-5 h-11 gap-2",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "sm",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  icon?: React.ReactNode;
  loading?: boolean;
  ref?: React.Ref<HTMLButtonElement>;
}

export function Button({
  children,
  variant,
  size,
  className,
  icon,
  loading,
  disabled,
  ref,
  ...props
}: ButtonProps) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    >
      {loading ? (
        <span
          className="w-3 h-3 border border-current border-t-transparent rounded-full animate-[spin_0.8s_linear_infinite]"
          aria-hidden="true"
        />
      ) : icon ? (
        <span className="shrink-0" aria-hidden="true">{icon}</span>
      ) : null}
      {children}
    </button>
  );
}
