/** Key shared by every Femxo app, so the choice follows the shopper between them. */
export const THEME_STORAGE_KEY = "femxo-theme";

/** Inline in <head> so the right palette is on screen before first paint (no light flash). */
export const themeInitScript = `(function(){var d=document.documentElement,m=window.matchMedia("(prefers-color-scheme: dark)").matches,s=null;try{s=localStorage.getItem("${THEME_STORAGE_KEY}")}catch(e){}var dark=s?s==="dark":m;d.classList.toggle("dark",dark);d.style.colorScheme=dark?"dark":"light"})()`;
