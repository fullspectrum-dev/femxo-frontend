"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Banner } from "@femxo/shared/contracts";
import { t } from "@/i18n";

const AUTOPLAY_MS = 4500;

/** One slide plus the gap after it. */
const slideWidth = (track: HTMLElement) => ((track.firstElementChild as HTMLElement | null)?.offsetWidth ?? track.clientWidth) + 12;

/** The current offers as a swipeable carousel: snaps per slide, auto-advances, and pauses while hovered, focused or touched. */
export function BannerRow({ banners }: { banners: readonly Banner[] }) {
  const track = useRef<HTMLUListElement>(null);
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  const goTo = useCallback(
    (index: number) => {
      const el = track.current;
      if (!el || banners.length === 0) return;
      const next = (index + banners.length) % banners.length;
      // Slide width, not track width: on desktop two slides share the row.
      el.scrollTo({ left: next * slideWidth(el), behavior: "smooth" });
    },
    [banners.length],
  );

  const onScroll = () => {
    const el = track.current;
    if (el && slideWidth(el) > 0) setActive(Math.round(el.scrollLeft / slideWidth(el)));
  };

  useEffect(() => {
    if (paused || banners.length < 2) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const timer = setInterval(() => goTo(active + 1), AUTOPLAY_MS);
    return () => clearInterval(timer);
  }, [active, paused, banners.length, goTo]);

  // No offers yet: no empty strip at the top of the page.
  if (banners.length === 0) return null;

  return (
    <section
      aria-label={t("banners.label")}
      aria-roledescription="carousel"
      className="group/carousel relative mx-auto w-full max-w-7xl px-4 pt-4"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onTouchStart={() => setPaused(true)}
      onTouchEnd={() => setPaused(false)}
    >
      <ul ref={track} onScroll={onScroll} className="flex snap-x snap-mandatory gap-3 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {banners.map((banner, index) => (
          <li key={banner.id} aria-roledescription="slide" aria-label={t("banners.slide", { n: index + 1, total: banners.length })} className="w-full flex-none snap-start md:w-[calc(50%-6px)]">
            <Link href={banner.href} className="relative block aspect-[3/1] overflow-hidden rounded-card focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus">
              <Image
                src={banner.image}
                alt={`${banner.title}. ${banner.subtitle}`}
                fill
                sizes="(min-width: 768px) 50vw, 100vw"
                loading={index === 0 ? "eager" : undefined}
                fetchPriority={index === 0 ? "high" : undefined}
                className="object-cover"
              />
            </Link>
          </li>
        ))}
      </ul>

      {banners.length > 1 && (
        // Two banners fit side by side on desktop, so the controls are for phones (or for three and more).
        <div className={banners.length <= 2 ? "md:hidden" : undefined}>
          <button type="button" aria-label={t("banners.prev")} onClick={() => goTo(active - 1)} className="absolute left-6 top-1/2 hidden size-9 -translate-y-1/2 items-center justify-center rounded-full bg-surface/90 text-ink shadow-md opacity-0 transition-opacity focus-visible:opacity-100 group-hover/carousel:opacity-100 md:flex">
            <ChevronLeft size={20} aria-hidden="true" />
          </button>
          <button type="button" aria-label={t("banners.next")} onClick={() => goTo(active + 1)} className="absolute right-6 top-1/2 hidden size-9 -translate-y-1/2 items-center justify-center rounded-full bg-surface/90 text-ink shadow-md opacity-0 transition-opacity focus-visible:opacity-100 group-hover/carousel:opacity-100 md:flex">
            <ChevronRight size={20} aria-hidden="true" />
          </button>
          <div className="absolute inset-x-0 bottom-3 flex justify-center gap-1.5">
            {banners.map((banner, index) => (
              <button
                key={banner.id}
                type="button"
                aria-label={t("banners.goTo", { n: index + 1 })}
                aria-current={index === active}
                onClick={() => goTo(index)}
                className={`h-1.5 rounded-full shadow-sm transition-all ${index === active ? "w-5 bg-primary" : "w-1.5 bg-surface/80"}`}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
