/*
 * The favicon and app icons, the same Femxo mark the website uses. Google's
 * result favicon needs a square PNG of 48px or more (the .ico only carries 16
 * and 32), so the PNGs come first. The `?v=` lets browsers that cached a
 * missing favicon fetch it again.
 */
const V = "?v=20261027";

export const ICONS = {
  icon: [
    { url: `/icons/icon-192.png${V}`, sizes: "192x192", type: "image/png" },
    { url: `/icons/icon-512.png${V}`, sizes: "512x512", type: "image/png" },
    { url: `/favicon.ico${V}`, sizes: "any", type: "image/x-icon" },
  ],
  apple: `/femxo-favicon.png${V}`,
};
