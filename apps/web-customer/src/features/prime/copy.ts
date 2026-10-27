/** Copies text to the clipboard; false when the browser won't let us (the caller then shows the text to copy by hand). */
export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
