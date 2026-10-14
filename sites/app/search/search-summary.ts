import { BOOKS } from "./catalog";
import type { BookMatchCount, SearchResult } from "./types";

const bookIds = new Map(BOOKS.map(book => [book.name, book.id]));

export function countResultsByBook(results: readonly SearchResult[]): BookMatchCount[] {
  const counts = new Map<number, number>();
  for (const result of results) {
    const bookId = bookIds.get(result.book);
    if (bookId === undefined) throw new Error("Search returned an unknown Bible book.");
    counts.set(bookId, (counts.get(bookId) ?? 0) + 1);
  }
  return [...counts].sort(([left], [right]) => left - right).map(([bookId, count]) => ({ bookId, count }));
}
