/** Decode legacy quote escapes and keep WEB editorial notes out of verse text. */
export function normalizeVerseText(text: string, version: string): string {
  const decoded = text.replace(/\\+(["'])/g, "$1");
  // Braces mark notes in WEB, but contain Psalm headings in Darby.
  return version === "WEB"
    ? decoded.replace(/\{[^{}]*\}/g, "").replace(/\s+/g, " ").trim()
    : decoded;
}
