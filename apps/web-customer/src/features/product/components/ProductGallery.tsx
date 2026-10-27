"use client";

import Image from "next/image";
import { useState } from "react";
import type { ProductDetail } from "@femxo/shared/contracts";
import { cn } from "@femxo/ui";

/** The big picture with a strip of thumbnails; each thumbnail is a button that names its picture. */
export function ProductGallery({ images, soldOut = false }: { images: ProductDetail["images"]; soldOut?: boolean }) {
  const [active, setActive] = useState(0);
  const current = images[active] ?? images[0]!;

  return (
    <div className="grid gap-3">
      <div className="relative aspect-square overflow-hidden rounded-card bg-surface-sunken">
        <Image
          key={current.src}
          src={current.src}
          alt={current.alt}
          fill
          loading="eager"
          fetchPriority="high"
          sizes="(min-width: 1024px) 40vw, 100vw"
          className={cn("object-cover", soldOut && "opacity-60 grayscale")}
        />
      </div>
      {images.length > 1 ? (
        <ul aria-label="Product pictures" className="flex gap-2 overflow-x-auto pb-1">
          {images.map((image, index) => (
            <li key={`${image.src}-${index}`} className="flex-none">
              <button
                type="button"
                aria-label={`Show picture ${index + 1} of ${images.length}`}
                aria-pressed={index === active}
                onClick={() => setActive(index)}
                className={cn(
                  "relative block size-16 overflow-hidden rounded-control border-2 bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
                  index === active ? "border-primary" : "border-transparent"
                )}
              >
                <Image src={image.src} alt="" fill sizes="64px" className="object-cover" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
