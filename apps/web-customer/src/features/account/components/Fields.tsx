import { useId } from "react";
import type { ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

const control =
  "w-full rounded-control border bg-surface px-3 py-2 text-[15px] text-ink outline-none placeholder:text-ink-muted focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus disabled:opacity-60";

function Frame({ id, label, error, children }: { id: string; label: string; error?: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-ink">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** A multi-line field, labelled and wired for screen readers like TextField. */
export function TextArea({ label, error, ...props }: { label: string; error?: string } & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "id">) {
  const id = useId();
  return (
    <Frame id={id} label={label} error={error}>
      <textarea id={id} rows={4} aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-error` : undefined} className={`${control} ${error ? "border-danger" : "border-line-input"}`} {...props} />
    </Frame>
  );
}

/** A labelled dropdown. */
export function Select({ label, error, children, ...props }: { label: string; error?: string; children: ReactNode } & Omit<SelectHTMLAttributes<HTMLSelectElement>, "id">) {
  const id = useId();
  return (
    <Frame id={id} label={label} error={error}>
      <select id={id} aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-error` : undefined} className={`${control} h-11 ${error ? "border-danger" : "border-line-input"}`} {...props}>
        {children}
      </select>
    </Frame>
  );
}
