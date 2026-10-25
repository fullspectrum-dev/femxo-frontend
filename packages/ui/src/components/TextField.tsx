import { forwardRef, useId } from "react";
import type { InputHTMLAttributes, ReactNode } from "react";
import { cn } from "../cn";

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "id"> {
  label: string;
  hint?: ReactNode;
  /** Shown under the field and announced; also marks the input invalid. */
  error?: string;
  /** Says "(optional)" in text, rather than starring the required ones. */
  optional?: boolean;
  /** Content inside the input's left edge, e.g. "+91". */
  leading?: ReactNode;
}

/** Label + input + hint or error, wired for screen readers. 44px tall for thumbs. */
export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, hint, error, optional, leading, className, ...props },
  ref
) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined;

  return (
    <div className={cn("grid gap-1.5", className)}>
      <label htmlFor={id} className="text-sm font-semibold text-ink">
        {label}
        {optional ? <span className="ml-1 font-normal text-ink-muted">(optional)</span> : null}
      </label>
      <div
        className={cn(
          "flex h-11 items-center rounded-control border bg-surface focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-focus",
          error ? "border-danger" : "border-line-input"
        )}
      >
        {leading ? <span className="pl-3 pr-1 text-[15px] text-ink-muted">{leading}</span> : null}
        <input
          ref={ref}
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className="h-full min-w-0 flex-1 bg-transparent px-3 text-[15px] text-ink outline-none placeholder:text-ink-muted disabled:cursor-not-allowed disabled:opacity-60"
          {...props}
        />
      </div>
      {hint ? (
        <p id={hintId} className="text-xs text-ink-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
});
