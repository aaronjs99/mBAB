import { ALL_BOOK_IDS, DEFAULT_VERSION, isSearchMode, isVersion } from "./catalog";
import type { SearchMode, SearchResult } from "./types";

const SAVED_KEY = "mbab:saved-verses";
const THEME_KEY = "mbab:theme";

export type InitialBrowserState = {
  saved: SearchResult[];
  dark: boolean;
  query: string;
  mode: SearchMode;
  version: string;
  bookIds: number[];
};

export function readInitialBrowserState(): InitialBrowserState {
  let saved: SearchResult[] = [];
  try {
    const parsed = JSON.parse(localStorage.getItem(SAVED_KEY) ?? "[]") as unknown;
    if (Array.isArray(parsed)) saved = parsed.slice(0, 100) as SearchResult[];
  } catch {
    localStorage.removeItem(SAVED_KEY);
  }

  const preferredTheme = localStorage.getItem(THEME_KEY);
  const dark = preferredTheme === "dark"
    || (!preferredTheme && matchMedia("(prefers-color-scheme: dark)").matches);
  const params = new URLSearchParams(window.location.search);
  const modeValue = params.get("mode");
  const versionValue = params.get("version");
  const sharedBooks = params.get("books")
    ?.split(",")
    .map(Number)
    .filter((id) => Number.isInteger(id) && id >= 0 && id < ALL_BOOK_IDS.length);

  return {
    saved,
    dark,
    query: (params.get("q") ?? "").slice(0, 120),
    mode: isSearchMode(modeValue) ? modeValue : "all",
    version: isVersion(versionValue) ? versionValue : DEFAULT_VERSION,
    bookIds: sharedBooks?.length
      ? [...new Set(sharedBooks)].sort((left, right) => left - right)
      : ALL_BOOK_IDS,
  };
}

export function storeSavedVerses(items: SearchResult[]) {
  localStorage.setItem(SAVED_KEY, JSON.stringify(items));
}

export function applyTheme(dark: boolean) {
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  localStorage.setItem(THEME_KEY, dark ? "dark" : "light");
}
