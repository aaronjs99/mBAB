import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

let server;
let GET;
let isSearchResponse;
const originalFetch = globalThis.fetch;
const originalUrl = process.env.MBAB_LEGACY_SEARCH_URL;
const rows = [
  ...Array.from({ length: 12 }, (_, index) => ({ Book: "Genesis", Chapter: 1, Versecount: index + 1, verse: "Love and mercy" })),
  ...Array.from({ length: 23 }, (_, index) => ({ Book: "John", Chapter: 3, Versecount: index + 1, verse: [{ text: "God is " }, { highlight: "love" }] })),
  ...Array.from({ length: 9 }, (_, index) => ({ Book: "Acts", Chapter: 2, Versecount: index + 1, verse: "Love one another" })),
];
const counts = [{ bookId: 0, count: 12 }, { bookId: 42, count: 23 }, { bookId: 43, count: 9 }];

before(async () => {
  process.env.MBAB_LEGACY_SEARCH_URL = "https://corpus.test/search/";
  server = await createServer({
    configFile: false, cacheDir: "node_modules/.vite-overview-tests",
    resolve: { alias: { "@": fileURLToPath(new URL("../", import.meta.url)) } },
    server: { middlewareMode: true, hmr: false, ws: false },
  });
  ({ GET } = await server.ssrLoadModule("/app/api/search/route.ts"));
  ({ isSearchResponse } = await server.ssrLoadModule("/app/search/search-response.ts"));
});
after(async () => {
  globalThis.fetch = originalFetch;
  if (originalUrl === undefined) delete process.env.MBAB_LEGACY_SEARCH_URL;
  else process.env.MBAB_LEGACY_SEARCH_URL = originalUrl;
  await server.close();
});

function request(page = 1, books = "0,42,43") {
  return GET(new Request(`https://mbab.test/api/search?q=love&books=${books}&page=${page}`));
}

test("book counts describe every match, not just the current result page", async () => {
  globalThis.fetch = async () => Response.json({ results: rows });
  for (const page of [1, 2, 3]) {
    const response = await request(page);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.total, 44);
    assert.equal(payload.page, page);
    assert.equal(payload.results.length, page === 3 ? 4 : 20);
    assert.deepEqual(payload.bookCounts, counts);
    assert.equal(isSearchResponse(payload), true);
  }
});

test("an empty search has an empty book overview", async () => {
  globalThis.fetch = async () => Response.json({ results: [] });
  const payload = await (await request()).json();
  assert.equal(payload.total, 0);
  assert.deepEqual(payload.bookCounts, []);
});

test("source errors and malformed rows never become an empty or misleading overview", async () => {
  for (const payload of [
    {}, null, { error: "Unavailable" }, { results: "not an array" },
    { results: [{ ...rows[0], Book: "Unknown" }] },
    { results: [{ ...rows[0], Chapter: 0 }] },
    { results: [{ ...rows[0], Chapter: true }] },
    { results: [{ ...rows[0], Versecount: [1] }] },
    { results: [{ ...rows[0], verse: "" }] },
    { results: [{ ...rows[0], verse: [{ highlight: 42 }] }] },
    { results: [rows[0], rows[0]] },
  ]) {
    globalThis.fetch = async () => Response.json(payload);
    const response = await request();
    assert.equal(response.status, 503, JSON.stringify(payload));
    assert.equal(response.headers.get("Cache-Control"), "no-store");
  }
});

test("results outside the requested book scope are rejected", async () => {
  globalThis.fetch = async () => Response.json({ results: [rows[0]] });
  assert.equal((await request(1, "42")).status, 503);
});

test("overview validation rejects incorrect totals, duplicate books and false page coverage", async () => {
  const response = {
    results: [{ ref: "John 3:16", book: "John", chapter: 3, verse: 16, text: "God is love", version: "KJV" }],
    total: 44, page: 1, pageSize: 20, totalPages: 3, expression: "love", selectedBookCount: 3, source: "Test corpus",
    bookCounts: counts,
  };
  assert.equal(isSearchResponse(response), true);
  for (const bookCounts of [
    null, [], [{ bookId: 42, count: 43 }], [{ bookId: 42, count: 0 }],
    [{ bookId: 42, count: 22 }, { bookId: 42, count: 22 }],
    [{ bookId: 66, count: 44 }], [{ bookId: 0, count: 44 }],
    [{ bookId: 42, count: "44" }],
  ]) assert.equal(isSearchResponse({ ...response, bookCounts }), false, JSON.stringify(bookCounts));
  const cached = { ...response };
  delete cached.bookCounts;
  assert.equal(isSearchResponse(cached), true, "Older cached responses can still render without an overview");
});
