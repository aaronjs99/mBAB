import { BOOKS, VERSIONS, bookMask, type SearchMode } from "@/app/search-config";

export const runtime = "edge";

const LEGACY_SEARCH_URL = "https://aaronjs.pythonanywhere.com/ajax/search/";
const MAX_QUERY_LENGTH = 120;
const MAX_PAGE_SIZE = 30;

type LegacyPart = { text?: string; highlight?: string };
type LegacyRow = {
  Book: string;
  Chapter: number;
  Versecount: number;
  verse: LegacyPart[] | string;
};

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

function words(input: string): string[] {
  return input.match(/[A-Za-z0-9_]+/g)?.slice(0, 12) ?? [];
}

function validateAdvanced(input: string): string | null {
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

function expressionFor(query: string, mode: SearchMode): { expression?: string; error?: string } {
  if (mode === "advanced") {
    const error = validateAdvanced(query);
    return error ? { error } : { expression: query.replace(/\s+/g, "") };
  }

  const tokens = words(query);
  if (!tokens.length) return { error: "Enter at least one search word." };
  return { expression: tokens.join(mode === "all" ? "+" : ",") };
}

function parseBooks(value: string | null): number[] | null {
  if (!value) return BOOKS.map((book) => book.id);
  const ids = [...new Set(value.split(",").map(Number))];
  if (!ids.length || ids.some((id) => !Number.isInteger(id) || id < 0 || id > 65)) return null;
  return ids.sort((a, b) => a - b);
}

function flattenVerse(verse: LegacyPart[] | string): string {
  if (typeof verse === "string") return verse;
  return verse.map((part) => part.text ?? part.highlight ?? "").join("");
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = (url.searchParams.get("q") ?? "").trim();
  const mode = (url.searchParams.get("mode") ?? "all") as SearchMode;
  const version = (url.searchParams.get("version") ?? "KJV").toUpperCase();
  const selectedBooks = parseBooks(url.searchParams.get("books"));
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

  const legacyUrl = new URL(LEGACY_SEARCH_URL);
  legacyUrl.searchParams.set("search", built.expression);
  legacyUrl.searchParams.set("keyword", built.expression);
  legacyUrl.searchParams.set("version", version);
  legacyUrl.searchParams.set("case", caseSensitive ? "True" : "False");
  legacyUrl.searchParams.set("books", bookMask(selectedBooks));

  try {
    const response = await fetch(legacyUrl, {
      headers: { Accept: "application/json", "User-Agent": "mBAB-Sites/1.0" },
      signal: AbortSignal.timeout(12_000),
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
    const total = allResults.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * pageSize;

    return json(
      {
        results: allResults.slice(start, start + pageSize),
        total,
        page: safePage,
        pageSize,
        totalPages,
        expression: built.expression,
        selectedBookCount: selectedBooks.length,
        source: "mBAB open-text corpus",
      },
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
