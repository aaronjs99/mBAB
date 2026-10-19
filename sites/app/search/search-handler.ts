import { VERSIONS, bookMask } from "./catalog";
import { expressionFor, parseBookIds, parseReference, type BibleReference } from "./query";
import { readLegacyResults } from "./legacy-response";
import { countResultsByBook } from "./search-summary";
import { fetchReferenceVerses } from "./reference-source";
import { relatedWords } from "./related-words";
import { normalizeVerseText } from "./verse-text";
import type { ChapterVerse } from "./chapter-response";
import type { SearchMode, SearchResponse, SearchResult } from "./types";

export type CorpusSource = {
  search(expression: string, version: string, books: readonly number[], caseSensitive: boolean, signal: AbortSignal): Promise<SearchResult[]>;
  chapter(reference: BibleReference, version: string, signal: AbortSignal): Promise<ChapterVerse[]>;
};

const LEGACY_SEARCH_URL = process.env.MBAB_LEGACY_SEARCH_URL
  ?? "https://aaronjs.pythonanywhere.com/ajax/search/";
const MAX_QUERY_LENGTH = 120;
const MAX_PAGE_SIZE = 30;

function json(body: unknown, status = 200, cache = false) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": cache
        ? "public, max-age=60, s-maxage=300, stale-while-revalidate=600"
        : "no-store",
      "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function paginatedResponse(
  allResults: SearchResult[],
  page: number,
  pageSize: number,
  expression: string,
  selectedBookCount: number,
) {
  const total = allResults.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;
  return {
    results: allResults.slice(start, start + pageSize),
    total,
    page: safePage,
    pageSize,
    totalPages,
    expression,
    selectedBookCount,
    source: "mBAB open-text corpus",
    bookCounts: countResultsByBook(allResults),
  };
}

export async function handleSearchRequest(request: Request, source?: CorpusSource) {
  const url = new URL(request.url);
  const query = (url.searchParams.get("q") ?? "").trim();
  const mode = (url.searchParams.get("mode") ?? "all") as SearchMode;
  const version = (url.searchParams.get("version") ?? "KJV").toUpperCase();
  const selectedBooks = parseBookIds(url.searchParams.get("books"));
  const caseSensitive = url.searchParams.get("case") === "true";
  const page = Math.max(1, Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(10, Number.parseInt(url.searchParams.get("pageSize") ?? "20", 10) || 20),
  );

  if (query.length < 2) return json({ error: "Enter at least two characters." }, 400);
  if (query.length > MAX_QUERY_LENGTH) return json({ error: `Keep searches under ${MAX_QUERY_LENGTH} characters.` }, 400);
  if (!(["all", "any", "advanced"] as string[]).includes(mode)) return json({ error: "Unknown search mode." }, 400);
  if (!VERSIONS.some((item) => item.id === version)) return json({ error: "That edition is not available here." }, 400);
  if (!selectedBooks) return json({ error: "Choose one or more valid books." }, 400);
  const books = selectedBooks;

  const built = expressionFor(query, mode);
  if (built.error || !built.expression) return json({ error: built.error }, 400);

  const reference = parseReference(query);
  if (reference) {
    if (!selectedBooks.includes(reference.bookId)) {
      return json(paginatedResponse([], page, pageSize, built.expression, selectedBooks.length), 200, true);
    }
    try {
      const verses = await (source ? source.chapter(reference, version, request.signal) : fetchReferenceVerses(reference, version, request.signal));
      const allResults = verses
        .filter((item) => reference.startVerse === undefined
          || (item.verse >= reference.startVerse
            && item.verse <= (reference.endVerse ?? reference.startVerse)))
        .map((item) => ({
          ref: `${reference.book} ${reference.chapter}:${item.verse}`,
          book: reference.book,
          chapter: reference.chapter,
          verse: Number(item.verse),
          text: item.text,
          version,
        }));
      return json(
        paginatedResponse(
          allResults,
          page,
          pageSize,
          built.expression,
          selectedBooks.length,
        ),
        200,
        true,
      );
    } catch {
      request.signal.throwIfAborted();
      return json(
        { error: "The verse index is taking longer than expected. Please try again in a moment." },
        503,
      );
    }
  }

  async function search(expression: string) {
    if (source) return source.search(expression, version, books, caseSensitive, request.signal);
    const legacyUrl = new URL(LEGACY_SEARCH_URL);
    legacyUrl.searchParams.set("search", expression);
    legacyUrl.searchParams.set("keyword", expression);
    legacyUrl.searchParams.set("version", version);
    legacyUrl.searchParams.set("case", caseSensitive ? "True" : "False");
    legacyUrl.searchParams.set("books", bookMask(books));
    const response = await fetch(legacyUrl, {
      headers: { Accept: "application/json", "User-Agent": "mBAB-Sites/1.0" },
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(12_000)]),
    });
    if (!response.ok) throw new Error(`Search source returned ${response.status}`);
    return readLegacyResults(await response.json(), version, books);
  }

  try {
    const allResults = await search(built.expression);
    const terms = relatedWords(query, mode, caseSensitive);
    let related: SearchResponse["related"];
    if (terms.length) {
      try {
        const exactRefs = new Set(allResults.map(result => result.ref));
        const matchesRelated = new RegExp(`\\b(?:${terms.join("|")})\\b`, "i");
        const relatedResults = (await search(terms.join(",")))
          .map(result => ({ ...result, text: normalizeVerseText(result.text, version) }))
          .filter(result => !exactRefs.has(result.ref) && matchesRelated.test(result.text));
        if (relatedResults.length) related = { terms, total: relatedResults.length, results: relatedResults.slice(0, 3) };
      } catch {
        // A secondary lookup must never discard the reader's exact matches.
        request.signal.throwIfAborted();
      }
    }
    const response = paginatedResponse(allResults, page, pageSize, built.expression, books.length);
    return json(related ? { ...response, related } : response, 200, true);
  } catch {
    request.signal.throwIfAborted();
    return json(
      { error: source ? `Search is unavailable for ${version}. Please try again.` : "The verse index is taking longer than expected. Please try again in a moment." },
      503,
    );
  }
}
