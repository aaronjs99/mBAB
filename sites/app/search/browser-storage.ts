import { readSearchLocation } from "./search-location";
import { isSearchResult } from "./search-response";
import type { SearchLocation, SearchResult } from "./types";

const SAVED_KEY = "mbab:saved-verses";
const THEME_KEY = "mbab:theme";

export type InitialBrowserState = SearchLocation & {
  saved: SearchResult[];
  dark: boolean;
};

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function readInitialBrowserState(): InitialBrowserState {
  let saved: SearchResult[] = [];
  try {
    const parsed: unknown = JSON.parse(readStorage(SAVED_KEY) ?? "[]");
    if (Array.isArray(parsed)) {
      const seen = new Set<string>();
      saved = parsed.filter(isSearchResult).filter((item) => {
        const key = `${item.version}:${item.ref}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }).slice(0, 100);
    }
  } catch {
    // Leave unreadable data intact; search must still work without storage.
  }

  const preferredTheme = readStorage(THEME_KEY);
  const dark = preferredTheme === "dark"
    || (!preferredTheme && matchMedia("(prefers-color-scheme: dark)").matches);
  return {
    saved,
    dark,
    ...readSearchLocation(window.location.search),
  };
}

export function storeSavedVerses(items: SearchResult[]): boolean {
  try {
    localStorage.setItem(SAVED_KEY, JSON.stringify(items));
    return true;
  } catch {
    return false;
  }
}

export function applyTheme(dark: boolean) {
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  try {
    localStorage.setItem(THEME_KEY, dark ? "dark" : "light");
  } catch {
    // The current tab can still change theme when persistence is unavailable.
  }
}
