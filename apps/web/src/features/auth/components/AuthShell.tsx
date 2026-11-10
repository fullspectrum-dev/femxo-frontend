import Link from "next/link";
import { ArrowLeft, Lock } from "lucide-react";
import type { ReactNode } from "react";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { Logo } from "@/components/shared/Logo";
import { ROLES } from "@/lib/roles";
import { cn } from "@/lib/utils";

interface AuthShellProps {
  eyebrow: string;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  /** Wider card for the account overview. */
  wide?: boolean;
}

export function AuthShell({ eyebrow, title, description, children, wide }: AuthShellProps) {
  return (
    <main className="grid min-h-svh lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      {/* Brand panel: one sign-in, and the role decides what you see. */}
      <aside className="ink band-ink relative hidden overflow-hidden lg:flex lg:flex-col lg:justify-between lg:p-12 xl:p-14">
        <div aria-hidden="true" className="dot-grid absolute inset-0 opacity-50" />
        <Logo className="relative" />

        <div className="relative max-w-md">
          <p className="eyebrow">One sign-in · every role</p>
          <h2 className="mt-4 font-display text-4xl font-bold leading-[1.05] tracking-tight text-foreground xl:text-5xl">
            Your role decides <span className="text-gold">what you see.</span>
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            Everyone signs in here. Your role sets what you can do, and your territory sets
            where - from the whole state down to a single village.
          </p>

          <ol className="relative mt-8 space-y-2 pl-6">
            <span aria-hidden="true" className="dots-y is-live absolute bottom-4 left-[7px] top-4 w-0.5" />
            {ROLES.map(({ icon: Icon, name, scope }, i) => (
              <li
                key={name}
                className="relative flex items-center gap-3 rounded-xl border border-foreground/10 bg-secondary/50 px-3 py-2 opacity-0 [animation:auth-role-in_0.5s_ease-out_forwards]"
                style={{ animationDelay: `${150 + i * 90}ms` }}
              >
                <span aria-hidden="true" className="absolute -left-[22px] size-2.5 rounded-full bg-gold-400 shadow-[0_0_10px_2px_rgba(255,198,92,0.45)]" />
                <Icon size={15} aria-hidden="true" className="text-highlight" />
                <span className="text-sm font-semibold text-foreground">{name}</span>
                <span className="ml-auto text-xs text-muted-foreground">{scope}</span>
              </li>
            ))}
          </ol>
        </div>

        <p className="relative flex items-center gap-2 text-xs text-muted-foreground">
          <Lock size={13} aria-hidden="true" />
          Sessions are kept in a secure cookie and can be ended from any device.
        </p>
      </aside>

      {/* Form side */}
      <div className="relative flex min-w-0 flex-col px-4 py-5 sm:px-8 lg:px-12">
        <div className="flex items-center justify-between gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft size={16} aria-hidden="true" />
            <span className="hidden sm:inline">Back to Femxo</span>
            <span className="sm:hidden">Home</span>
          </Link>
          <Logo className="lg:hidden" />
          <ThemeToggle />
        </div>

        <div className="flex flex-1 items-center justify-center py-10">
          <section
            aria-labelledby="auth-title"
            className={cn(
              "w-full animate-in fade-in slide-in-from-bottom-2 duration-500",
              wide ? "max-w-2xl" : "max-w-md"
            )}
          >
            <p className="eyebrow">{eyebrow}</p>
            <h1 id="auth-title" className="mt-3 font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              {title}
            </h1>
            {description && <div className="mt-3 text-base leading-relaxed text-muted-foreground">{description}</div>}

            <div className="mt-8">{children}</div>
          </section>
        </div>
      </div>
    </main>
  );
}
