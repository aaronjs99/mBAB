export type SearchMode = "all" | "any" | "advanced";

export type BibleBook = {
  id: number;
  name: string;
  abbreviation: string;
  testament: "Old Testament" | "New Testament";
  section: string;
};

export type BibleVersion = {
  id: string;
  label: string;
  short: string;
  infoUrl: string;
};

export type SearchExample = {
  query: string;
  mode: SearchMode;
  label: string;
};

export type SearchResult = {
  ref: string;
  book: string;
  chapter: number;
  verse: number;
  text: string;
  version: string;
};

export type SearchResponse = {
  results: SearchResult[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  expression: string;
  selectedBookCount: number;
  source: string;
};

export type LegacyPart = { text?: string; highlight?: string };

export type LegacyRow = {
  Book: string;
  Chapter: number;
  Versecount: number;
  verse: LegacyPart[] | string;
};
