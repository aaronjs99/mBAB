import { BOOKS, isVersion } from "./catalog";
import { countResultsByBook } from "./search-summary";
import type { SearchResponse, SearchResult } from "./types";

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

export function isSearchResult(value: unknown): value is SearchResult {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<SearchResult>;
  return typeof item.ref === "string" && item.ref.length > 0
    && typeof item.text === "string" && item.text.trim().length > 0
    && typeof item.book === "string" && BOOKS.some((book) => book.name === item.book)
    && typeof item.version === "string" && isVersion(item.version)
    && isPositiveInteger(item.chapter) && isPositiveInteger(item.verse);
}

function validBookCounts(value: unknown, total: number, selectedBookCount: number, results: SearchResult[]): boolean {
  // Cached responses from before the overview can still display their verses.
  if (value === undefined) return true;
  if (!Array.isArray(value) || value.length > selectedBookCount) return false;
  const counts = new Map<number, number>();
  for (const item of value) {
    if (!item || typeof item !== "object" || typeof item.bookId !== "number"
      || !Number.isSafeInteger(item.bookId) || item.bookId < 0 || item.bookId >= BOOKS.length
      || !isPositiveInteger(item.count) || counts.has(item.bookId)) return false;
    counts.set(item.bookId, item.count);
  }
  return [...counts.values()].reduce((sum, count) => sum + count, 0) === total
    && countResultsByBook(results).every(item => (counts.get(item.bookId) ?? 0) >= item.count);
}

export function isSearchResponse(value: unknown): value is SearchResponse {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<SearchResponse>;
  return typeof item.total === "number" && Number.isSafeInteger(item.total) && item.total >= 0
    && isPositiveInteger(item.page) && isPositiveInteger(item.pageSize)
    && isPositiveInteger(item.totalPages) && item.page <= item.totalPages
    && isPositiveInteger(item.selectedBookCount) && item.selectedBookCount <= BOOKS.length
    && typeof item.expression === "string" && typeof item.source === "string"
    && Array.isArray(item.results) && item.results.length <= item.pageSize
    && item.results.length <= item.total && item.results.every(isSearchResult)
    && validBookCounts(item.bookCounts, item.total, item.selectedBookCount, item.results);
}
