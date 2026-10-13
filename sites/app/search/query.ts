import { BOOKS } from "./catalog";
import type { LegacyPart, SearchMode } from "./types";

export type BibleReference = {
  bookId: number;
  book: string;
  chapter: number;
  startVerse?: number;
  endVerse?: number;
};

export function parseReference(query: string): BibleReference | null {
  const match = query.match(/^(.+?)\s+(\d+)(?::(\d+)(?:-(\d+))?)?$/);
  if (!match) return null;
  const book = BOOKS.find((item) => item.name.toLowerCase() === match[1].toLowerCase());
  if (!book) return null;
  const chapter = Number(match[2]);
  const startVerse = match[3] ? Number(match[3]) : undefined;
  const endVerse = match[4] ? Number(match[4]) : startVerse;
  if (
    chapter < 1
    || (startVerse !== undefined && startVerse < 1)
    || (startVerse !== undefined && endVerse !== undefined && endVerse < startVerse)
  ) {
    return null;
  }
  return { bookId: book.id, book: book.name, chapter, startVerse, endVerse };
}

export function queryTerms(input: string): string[] {
  return [
    ...new Set(
      input.match(/[A-Za-z0-9_]+/g)?.filter((word) => word.length > 1) ?? [],
    ),
  ];
}

export function validateAdvanced(input: string): string | null {
  if (!/^[A-Za-z0-9_(),+\s]+$/.test(input)) {
    return "Advanced search accepts words, parentheses, +, and commas only.";
  }
  const tokens = input.match(/[A-Za-z0-9_]+|[(),+]/g) ?? [];
  if (!tokens.length) return "Enter at least one search word.";

  let depth = 0;
  let expectsWord = true;
  for (const token of tokens) {
    if (/^[A-Za-z0-9_]+$/.test(token)) {
      if (!expectsWord) return "Add + or a comma between adjacent words.";
      expectsWord = false;
    } else if (token === "(") {
      if (!expectsWord) return "Add an operator before an opening parenthesis.";
      depth += 1;
    } else if (token === ")") {
      if (expectsWord || depth === 0) return "Check the placement of your parentheses.";
      depth -= 1;
    } else {
      if (expectsWord) return "An operator needs a word on both sides.";
      expectsWord = true;
    }
  }
  if (expectsWord) return "Finish the search with a word, not an operator.";
  if (depth !== 0) return "Close every parenthesis before searching.";
  return null;
}

export function expressionFor(
  query: string,
  mode: SearchMode,
): { expression?: string; error?: string } {
  if (parseReference(query)) {
    return { expression: query };
  }
  if (mode === "advanced") {
    const error = validateAdvanced(query);
    return error ? { error } : { expression: query.replace(/\s+/g, "") };
  }
  const terms = query.match(/[A-Za-z0-9_]+/g)?.slice(0, 12) ?? [];
  if (!terms.length) return { error: "Enter at least one search word." };
  return { expression: terms.join(mode === "all" ? "+" : ",") };
}

export function parseBookIds(value: string | null): number[] | null {
  if (value === null) return BOOKS.map((book) => book.id);
  const tokens = value.split(",").map((token) => token.trim());
  if (tokens.some((token) => !/^\d+$/.test(token))) return null;
  const ids = [...new Set(tokens.map(Number))];
  if (
    !ids.length
    || ids.some((id) => !Number.isInteger(id) || id < 0 || id >= BOOKS.length)
  ) {
    return null;
  }
  return ids.sort((left, right) => left - right);
}

export function flattenVerse(verse: LegacyPart[] | string): string {
  if (typeof verse === "string") return verse;
  return verse.map((part) => part.text ?? part.highlight ?? "").join("");
}
