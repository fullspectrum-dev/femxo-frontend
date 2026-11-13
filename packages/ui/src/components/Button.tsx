import { Loader2 } from "lucide-react";
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "../cn";

export type ButtonVariant = "primary" | "gold" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const BASE =
  "inline-flex cursor-pointer touch-manipulation select-none items-center justify-center gap-2 whitespace-nowrap rounded-control font-display font-semibold transition-[transform,background-color,border-color,color,filter] duration-150 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100 motion-reduce:transition-none motion-reduce:active:scale-100";

// Flat, block colour: the press is a quick scale, not a shadow.
const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-primary text-on-primary hover:bg-primary-hover",
  gold: "bg-gold text-on-gold hover:brightness-95",
  secondary: "border-2 border-line bg-surface text-ink hover:border-primary hover:text-primary",
  ghost: "text-ink hover:bg-surface-sunken active:scale-100",
  danger: "bg-danger text-white hover:brightness-95",
};

// md and lg meet the 44px touch target.
const SIZES: Record<ButtonSize, string> = {
  sm: "h-9 px-3 text-sm",
  md: "h-11 px-5 text-[15px]",
  lg: "h-13 px-6 text-base",
};

/** The classes of a button, for links that should look like one. */
export function buttonClasses({
  variant = "primary",
  size = "md",
  block = false,
  className,
}: { variant?: ButtonVariant; size?: ButtonSize; block?: boolean; className?: string } = {}) {
  return cn(BASE, VARIANTS[variant], SIZES[size], block && "w-full", className);
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  /** Shows a spinner, keeps the label, and blocks a second press (no double orders). */
  busy?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant, size, block, busy = false, disabled, className, type = "button", children, ...props },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={buttonClasses({ variant, size, block, className })}
      {...props}
    >
      {busy ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : null}
      {children}
    </button>
  );
});

export interface IconButtonProps extends Omit<ButtonProps, "children"> {
  /** Names the button for screen readers and on hover, since it shows only an icon. */
  label: string;
  icon: ReactNode;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, icon, variant = "ghost", size = "md", className, ...props },
  ref
) {
  const square = size === "sm" ? "w-9 px-0" : size === "lg" ? "w-13 px-0" : "w-11 px-0";
  return (
    <Button ref={ref} variant={variant} size={size} aria-label={label} title={label} className={cn(square, className)} {...props}>
      {icon}
    </Button>
  );
});
