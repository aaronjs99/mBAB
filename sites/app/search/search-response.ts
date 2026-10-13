import { BOOKS, isVersion } from "./catalog";
import type { SearchResponse, SearchResult } from "./types";

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

export function isSearchResult(value: unknown): value is SearchResult {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<SearchResult>;
  return typeof item.ref === "string" && item.ref.length > 0
    && typeof item.text === "string"
    && typeof item.book === "string" && BOOKS.some((book) => book.name === item.book)
    && typeof item.version === "string" && isVersion(item.version)
    && isPositiveInteger(item.chapter) && isPositiveInteger(item.verse);
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
    && item.results.length <= item.total && item.results.every(isSearchResult);
}
