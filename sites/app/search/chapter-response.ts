import { BOOKS, isVersion } from "./catalog";

export type ChapterKey = { book: string; chapter: number; version: string };
export type ChapterVerse = { verse: number; text: string };
export type ChapterResponse = ChapterKey & { verses: ChapterVerse[] };

export function isChapterVerses(value: unknown): value is ChapterVerse[] {
  return Array.isArray(value) && value.every((verse, index) =>
    verse && typeof verse === "object"
    && Number.isSafeInteger(verse.verse) && verse.verse > 0
    && typeof verse.text === "string" && verse.text.trim().length > 0
    && (index === 0 || verse.verse > value[index - 1].verse));
}

export function isChapterResponse(value: unknown, expected: ChapterKey): value is ChapterResponse {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<ChapterResponse>;
  return item.book === expected.book && BOOKS.some(book => book.name === item.book)
    && item.chapter === expected.chapter && item.version === expected.version && isVersion(item.version)
    && isChapterVerses(item.verses) && item.verses.length > 0;
}
