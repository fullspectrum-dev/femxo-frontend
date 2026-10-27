"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, LogIn, ShoppingBag, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";

const TRIGGER =
  "inline-flex h-10 items-center justify-center gap-1.5 rounded-xl text-sm font-semibold text-foreground transition-colors hover:bg-secondary/70 max-[479px]:size-10 min-[480px]:px-3 sm:px-3.5";

/**
 * "Sign in" for screens too narrow to show both ways in as separate links: one
 * button that opens a small menu with the customer sign-in (the storefront, its
 * own site) and the staff and partner one. It is always in the header bar, so
 * no screen size has to open the phone menu just to find it. Without a
 * storefront address there is only one way in, so it is just that link.
 */
export function SignInMenu({ customerUrl, className }: { customerUrl: string | null; className?: string }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (!customerUrl) {
    return (
      <Link href="/login" className={cn(TRIGGER, className)}>
        <LogIn size={18} aria-hidden="true" />
        <span className="max-sm:sr-only">Sign in</span>
      </Link>
    );
  }

  const item =
    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-foreground transition-colors hover:bg-secondary/70 focus-visible:bg-secondary/70";

  return (
    <div ref={root} className={cn("relative", className)}>
      <button
        ref={trigger}
        type="button"
        className={TRIGGER}
        aria-expanded={open}
        aria-controls={menuId}
        aria-haspopup="true"
        onClick={() => setOpen((value) => !value)}
      >
        <LogIn size={18} aria-hidden="true" />
        {/* Always there for screen readers; shown in the bar once the screen can spare the room. */}
        <span className="max-[479px]:sr-only">Sign in</span>
        <ChevronDown size={16} aria-hidden="true" className={cn("transition-transform motion-reduce:transition-none max-[479px]:hidden", open && "rotate-180")} />
      </button>

      {open ? (
        <div
          id={menuId}
          className="absolute right-0 top-full z-50 mt-2 w-64 max-w-[calc(100vw-2rem)] rounded-2xl border border-border/60 bg-background p-1.5 text-foreground shadow-xl"
        >
          {/* The storefront is its own site, so this is a plain link, not a client-side navigation. */}
          <a href={customerUrl} className={item} onClick={() => setOpen(false)}>
            <ShoppingBag size={18} aria-hidden="true" className="shrink-0 text-gold" />
            <span className="grid min-w-0">
              <span className="font-semibold">Customer sign in</span>
              <span className="text-xs text-muted-foreground">Shop, track orders, Prime</span>
            </span>
          </a>
          <Link href="/login" className={item} onClick={() => setOpen(false)}>
            <UserRound size={18} aria-hidden="true" className="shrink-0 text-muted-foreground" />
            <span className="grid min-w-0">
              <span className="font-semibold">Staff sign in</span>
              <span className="text-xs text-muted-foreground">Admins, dealers and partners</span>
            </span>
          </Link>
        </div>
      ) : null}
    </div>
  );
}
