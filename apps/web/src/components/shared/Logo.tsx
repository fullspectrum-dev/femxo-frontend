import Link from "next/link";
import Image from "next/image";
import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
  priority?: boolean;
}

/**
 * The Femxo mark with its wordmark. Both mark colours are rendered and CSS
 * picks one (.logo-mark-light / .logo-mark-dark), so it suits light, dark and
 * .ink surfaces without any client code.
 */
export function Logo({ className, priority }: LogoProps) {
  return (
    <Link
      href="/"
      className={cn("inline-flex shrink-0 items-center gap-2.5", className)}
      aria-label="Femxo Consultancy Services home"
    >
      <span className="relative h-10 w-7 shrink-0">
        <Image
          src="/images/femxo-mark.png"
          alt=""
          width={390}
          height={570}
          priority={priority}
          className="logo-mark-light h-10 w-auto"
        />
        <Image
          src="/images/femxo-mark-white.png"
          alt=""
          width={390}
          height={570}
          priority={priority}
          className="logo-mark-dark h-10 w-auto"
        />
      </span>
      <span className="flex flex-col leading-none">
        <span className="font-display text-xl font-bold tracking-tight text-foreground">
          Femxo
        </span>
        <span className="mt-1 text-[8px] font-semibold uppercase tracking-[0.08em] text-muted-foreground min-[360px]:text-[9px] min-[360px]:tracking-[0.18em]">
          Consultancy Services
        </span>
      </span>
    </Link>
  );
}
