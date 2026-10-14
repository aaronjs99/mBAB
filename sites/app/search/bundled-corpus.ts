import { BOOKS, isVersion } from "./catalog";
import type { SearchResult } from "./types";
import { normalizeVerseText } from "./verse-text";

export type CorpusRow = readonly [bookId: number, chapter: number, verse: number, text: string];
export type BundledCorpus = { schema: 1; version: string; rows: CorpusRow[] };
export type CorpusSearchOptions = { bookIds: readonly number[]; caseSensitive?: boolean };

function positiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function validBookId(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value < BOOKS.length;
}

export function parseBundledCorpus(payload: unknown, expectedVersion: string): BundledCorpus {
  if (!payload || typeof payload !== "object") throw new Error("The bundled corpus is unreadable.");
  const value = payload as Record<string, unknown>;
  if (value.schema !== 1 || value.version !== expectedVersion || !isVersion(expectedVersion)
    || !Array.isArray(value.rows) || !value.rows.length) {
    throw new Error("The bundled corpus has an invalid schema, edition, or verse collection.");
  }
  const seen = new Set<string>();
  const rows: CorpusRow[] = value.rows.flatMap((row: unknown): CorpusRow[] => {
    if (!Array.isArray(row) || row.length !== 4 || !validBookId(row[0])
      || !positiveInteger(row[1]) || !positiveInteger(row[2])
      || typeof row[3] !== "string" || !row[3].trim()) {
      throw new Error("The bundled corpus contains an unreadable verse.");
    }
    const key = `${row[0]}:${row[1]}:${row[2]}`;
    if (seen.has(key)) throw new Error("The bundled corpus contains duplicate verses.");
    seen.add(key);
    const text = normalizeVerseText(row[3], expectedVersion);
    // WEB also uses note-only rows for omitted manuscript readings.
    return text.trim() ? [[row[0], row[1], row[2], text]] : [];
  });
  if (!rows.length) throw new Error("The bundled corpus contains no verse text.");
  rows.sort((left, right) => left[0] - right[0] || left[1] - right[1] || left[2] - right[2]);
  return { schema: 1, version: expectedVersion, rows };
}

type MatchesText = (text: string) => boolean;

function compileExpression(expression: string, caseSensitive: boolean): MatchesText {
  if (!/^[A-Za-z0-9_(),+\s]+$/.test(expression)) throw new Error("Invalid compiled Boolean expression.");
  const tokens = expression.match(/[A-Za-z0-9_]+|[(),+]/g) ?? [];
  let cursor = 0;

  function operand(): MatchesText {
    const token = tokens[cursor++];
    if (token === "(") {
      const group = disjunction();
      if (tokens[cursor++] !== ")") throw new Error("Unclosed Boolean expression group.");
      return group;
    }
    if (!token || !/^[A-Za-z0-9_]+$/.test(token)) throw new Error("A Boolean expression needs a search word.");
    const pattern = new RegExp(`\\b${token}\\b`, caseSensitive ? "" : "i");
    return text => pattern.test(text);
  }

  function conjunction(): MatchesText {
    let match = operand();
    while (tokens[cursor] === "+") {
      cursor++;
      const left = match;
      const right = operand();
      match = text => left(text) && right(text);
    }
    return match;
  }

  function disjunction(): MatchesText {
    let match = conjunction();
    while (tokens[cursor] === ",") {
      cursor++;
      const left = match;
      const right = conjunction();
      match = text => left(text) || right(text);
    }
    return match;
  }

  const match = disjunction();
  if (cursor !== tokens.length) throw new Error("Invalid compiled Boolean expression.");
  return match;
}

function asSearchResult(row: CorpusRow, version: string): SearchResult {
  const [bookId, chapter, verse, text] = row;
  const book = BOOKS[bookId].name;
  return { ref: `${book} ${chapter}:${verse}`, book, chapter, verse, text, version };
}

export function searchBundledCorpus(
  corpus: BundledCorpus,
  expression: string,
  options: CorpusSearchOptions,
): SearchResult[] {
  if (options.bookIds.some(bookId => !validBookId(bookId))) throw new Error("Invalid Bible book scope.");
  const selectedBooks = new Set(options.bookIds);
  const matches = compileExpression(expression, options.caseSensitive ?? false);
  return corpus.rows.filter(row => selectedBooks.has(row[0]) && matches(row[3]))
    .map(row => asSearchResult(row, corpus.version));
}

export function readBundledChapter(corpus: BundledCorpus, bookId: number, chapter: number): SearchResult[] {
  if (!validBookId(bookId) || !positiveInteger(chapter)) throw new Error("Invalid Bible chapter coordinates.");
  return corpus.rows.filter(row => row[0] === bookId && row[1] === chapter)
    .map(row => asSearchResult(row, corpus.version));
}
