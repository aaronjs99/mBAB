import { BOOKS } from "./catalog";
import { flattenVerse } from "./query";
import { isSearchResult } from "./search-response";
import type { LegacyPart, LegacyRow, SearchResult } from "./types";

function isVerse(value: unknown): value is LegacyPart[] | string {
  return typeof value === "string" || (Array.isArray(value) && value.every(part =>
    part && typeof part === "object"
    && ((typeof part.text === "string" && part.highlight === undefined)
      || (typeof part.highlight === "string" && part.text === undefined))));
}

function coordinate(value: unknown): number {
  return typeof value === "number" || (typeof value === "string" && /^\d+$/.test(value)) ? Number(value) : NaN;
}

export function readLegacyResults(payload: unknown, version: string, selectedBooks: readonly number[]): SearchResult[] {
  const rows = payload && typeof payload === "object" && "results" in payload ? payload.results : null;
  if (!Array.isArray(rows)) throw new Error("Search source returned an unreadable response.");
  const seen = new Set<string>();
  return rows.map((value: unknown) => {
    const row = value && typeof value === "object" ? value as Partial<LegacyRow> : {};
    const book = BOOKS.find(item => item.name === row.Book);
    if (!book || !selectedBooks.includes(book.id) || !isVerse(row.verse)) {
      throw new Error("Search source returned unreadable verses.");
    }
    const chapter = coordinate(row.Chapter);
    const verse = coordinate(row.Versecount);
    const result = {
      ref: `${book.name} ${chapter}:${verse}`, book: book.name,
      chapter, verse, text: flattenVerse(row.verse), version,
    };
    if (!isSearchResult(result) || seen.has(result.ref)) throw new Error("Search source returned unreadable verses.");
    seen.add(result.ref);
    return result;
  });
}
