import type { SearchMode } from "./types";

// Explicit word families keep expansion predictable. Do not infer theology or
// match arbitrary prefixes (e.g. wise must not match otherwise or unwise).
const WORD_FAMILIES = [
  ["wisdom", "wise", "wiser", "wisest", "wisely"],
  ["mercy", "mercies", "merciful", "mercifully"],
  ["pray", "prays", "prayed", "prayeth", "praying", "prayer", "prayers"],
  ["forgive", "forgives", "forgave", "forgiven", "forgiving", "forgiveness", "forgiveth"],
] as const;

export function relatedWords(query: string, mode: SearchMode, caseSensitive: boolean): string[] {
  // Explicit queries retain exactly the meaning the reader selected.
  if (mode === "advanced" || caseSensitive || !/^[a-z]+$/i.test(query)) return [];
  const word = query.toLowerCase();
  return WORD_FAMILIES.find(family => (family as readonly string[]).includes(word))
    ?.filter(term => term !== word) ?? [];
}
