import { VERSIONS, bookMask } from "@/app/search/catalog";
import { expressionFor, flattenVerse, parseBookIds, parseReference } from "@/app/search/query";
import { fetchReferenceVerses } from "@/app/search/reference-source";
import type { LegacyRow, SearchMode, SearchResult } from "@/app/search/types";

export const runtime = "edge";

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
  };
}

export async function GET(request: Request) {
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

  const built = expressionFor(query, mode);
  if (built.error || !built.expression) return json({ error: built.error }, 400);

  const reference = parseReference(query);
  if (reference) {
    if (!selectedBooks.includes(reference.bookId)) {
      return json(paginatedResponse([], page, pageSize, built.expression, selectedBooks.length), 200, true);
    }
    try {
      const verses = await fetchReferenceVerses(reference, version, request.signal);
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
      return json(
        { error: "The verse index is taking longer than expected. Please try again in a moment." },
        503,
      );
    }
  }

  const legacyUrl = new URL(LEGACY_SEARCH_URL);
  legacyUrl.searchParams.set("search", built.expression);
  legacyUrl.searchParams.set("keyword", built.expression);
  legacyUrl.searchParams.set("version", version);
  legacyUrl.searchParams.set("case", caseSensitive ? "True" : "False");
  legacyUrl.searchParams.set("books", bookMask(selectedBooks));

  try {
    const response = await fetch(legacyUrl, {
      headers: { Accept: "application/json", "User-Agent": "mBAB-Sites/1.0" },
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(12_000)]),
    });
    if (!response.ok) throw new Error(`Search source returned ${response.status}`);

    const payload = (await response.json()) as { results?: LegacyRow[] };
    const allResults = (payload.results ?? []).map((row) => ({
      ref: `${row.Book} ${row.Chapter}:${row.Versecount}`,
      book: row.Book,
      chapter: Number(row.Chapter),
      verse: Number(row.Versecount),
      text: flattenVerse(row.verse),
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
    return json(
      { error: "The verse index is taking longer than expected. Please try again in a moment." },
      503,
    );
  }
}
