"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef } from "react";
import type { ReactNode } from "react";
import { cn } from "../cn";
import { IconButton } from "./Button";

/**
 * Opens a native <dialog> as a modal while `open` is true. The browser
 * provides the focus trap, Esc, the inert page behind and focus returning
 * to the opener; React state stays the single source of truth.
 */
function useModalDialog(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDialogElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
    // Next keeps a page mounted but hidden after navigating away (Activity),
    // and a hidden page runs no effects. A dialog closing just as its page
    // hides would stay modal and make the visible page inert, so close it
    // here; cleanups do run on hide.
    return () => {
      if (dialog.open) dialog.close();
    };
  }, [open]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    // Esc fires "cancel": let React decide, so state and screen never disagree.
    const onCancel = (event: Event) => {
      event.preventDefault();
      onCloseRef.current();
    };
    dialog.addEventListener("cancel", onCancel);
    return () => dialog.removeEventListener("cancel", onCancel);
  }, []);

  return ref;
}

interface OverlayProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  closeLabel?: string;
  className?: string;
}

function OverlayFrame({
  variant,
  open,
  onClose,
  title,
  description,
  children,
  footer,
  closeLabel = "Close",
  className,
}: OverlayProps & { variant: "dialog" | "sheet" }) {
  const ref = useModalDialog(open, onClose);
  const titleId = useId();
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className={cn(
        "border border-line bg-surface p-0 text-ink shadow-raised backdrop:bg-black/50 open:flex open:flex-col",
        variant === "dialog"
          ? "m-auto max-h-[calc(100dvh-2rem)] w-[min(32rem,calc(100vw-2rem))] rounded-card"
          : // Bottom sheet on phones, a drawer from the right from tablet up.
            "m-0 mt-auto max-h-[85dvh] w-full max-w-none rounded-t-card md:ml-auto md:mt-0 md:h-dvh md:max-h-dvh md:w-[min(26rem,100vw)] md:rounded-none md:rounded-l-card",
        className
      )}
      onClick={(event) => {
        // A click on the backdrop lands on the <dialog> element itself.
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {open ? (
        <>
          <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
            <div className="min-w-0">
              <h2 id={titleId} className="font-display text-lg font-semibold">
                {title}
              </h2>
              {description ? <p className="mt-1 text-sm text-ink-muted">{description}</p> : null}
            </div>
            <IconButton label={closeLabel} size="sm" icon={<X size={18} aria-hidden="true" />} onClick={onClose} className="-mr-2" />
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer ? <footer className="flex flex-wrap justify-end gap-3 border-t border-line px-5 py-4">{footer}</footer> : null}
        </>
      ) : null}
    </dialog>
  );
}

/** Centred modal: confirmations and short forms. */
export function Dialog(props: OverlayProps) {
  return <OverlayFrame variant="dialog" {...props} />;
}

/** Bottom sheet on phones, side drawer on larger screens: filters, categories, cart preview. */
export function Sheet(props: OverlayProps) {
  return <OverlayFrame variant="sheet" {...props} />;
}
