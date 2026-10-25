import Image from "next/image";
import Link from "next/link";
import type { Banner } from "@femxo/shared/contracts";

/** The current offers: one large card, with the others scrolling beside it on small screens. */
export function BannerRow({ banners }: { banners: readonly Banner[] }) {
  return (
    <section aria-label="Offers" className="mx-auto w-full max-w-7xl px-4 pt-4">
      <ul className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0">
        {banners.map((banner, index) => (
          <li key={banner.id} className="w-[85%] flex-none snap-start md:w-auto">
            <Link
              href={banner.href}
              className="relative block aspect-[3/1] overflow-hidden rounded-card border border-line md:aspect-[5/2] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              <Image src={banner.image} alt="" fill sizes="(min-width: 768px) 33vw, 85vw" priority={index === 0} className="object-cover" />
              <span className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-ink/70 via-ink/10 to-transparent p-4 text-on-primary">
                <span className="font-display text-lg font-bold md:text-xl">{banner.title}</span>
                <span className="text-sm opacity-95">{banner.subtitle}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
