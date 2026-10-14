import { ALL_BOOK_IDS, DEFAULT_VERSION, isSearchMode, isVersion } from "./catalog";
import { parseBookIds } from "./query";
import type { SearchLocation, SearchSettings } from "./types";

export const DEFAULT_SEARCH: SearchLocation = {
  query: "", mode: "all", version: DEFAULT_VERSION,
  bookIds: ALL_BOOK_IDS, caseSensitive: false, page: 1,
};

export function readSearchLocation(search: string): SearchLocation {
  const params = new URLSearchParams(search);
  const mode = params.get("mode");
  const version = params.get("version");
  const page = Number(params.get("page") ?? 1);
  return {
    query: (params.get("q") ?? "").slice(0, 120).trim(),
    mode: isSearchMode(mode) ? mode : "all",
    version: isVersion(version) ? version : DEFAULT_VERSION,
    bookIds: parseBookIds(params.get("books")) ?? [],
    caseSensitive: params.get("case") === "true",
    page: Number.isSafeInteger(page) && page > 0 ? page : 1,
  };
}

export function searchParamsFor(settings: SearchLocation): URLSearchParams {
  return new URLSearchParams({
    q: settings.query.trim(),
    mode: settings.mode,
    version: settings.version,
    books: settings.bookIds.join(","),
    case: String(settings.caseSensitive),
    page: String(settings.page),
  });
}

export function sameSearchSettings(left: SearchSettings, right: SearchSettings): boolean {
  return left.query.trim() === right.query.trim()
    && left.mode === right.mode
    && left.version === right.version
    && left.caseSensitive === right.caseSensitive
    && left.bookIds.length === right.bookIds.length
    && left.bookIds.every((id, index) => id === right.bookIds[index]);
}
