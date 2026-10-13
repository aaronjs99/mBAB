import { BOOKS, DEFAULT_VERSION, isVersion } from "@/app/search/catalog";
import { fetchReferenceVerses } from "@/app/search/reference-source";

export const runtime = "edge";

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": status === 200 ? "public, max-age=300, s-maxage=3600" : "no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
    },
  });
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const book = BOOKS.find(item => item.name.toLowerCase() === params.get("book")?.trim().toLowerCase());
  const chapterValue = params.get("chapter") ?? "";
  const chapter = Number(chapterValue);
  const version = (params.get("version") ?? DEFAULT_VERSION).toUpperCase();
  if (!book) return json({ error: "Choose a valid Bible book." }, 400);
  if (!/^\d+$/.test(chapterValue) || !Number.isSafeInteger(chapter) || chapter < 1) {
    return json({ error: "Chapter must be a positive whole number." }, 400);
  }
  if (!isVersion(version)) return json({ error: "That edition is not available here." }, 400);

  try {
    const verses = await fetchReferenceVerses({ bookId: book.id, book: book.name, chapter }, version, request.signal);
    if (!verses.length) return json({ error: `No chapter text was found for ${book.name} ${chapter} (${version}).` }, 404);
    return json({ book: book.name, chapter, version, verses });
  } catch {
    request.signal.throwIfAborted();
    return json({ error: `Chapter reading is unavailable for ${version}. Please try again.` }, 503);
  }
}
