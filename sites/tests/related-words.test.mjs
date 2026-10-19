import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createServer } from "vite";

let server, handleSearchRequest, createAssetCorpusSource, isSearchResponse;
before(async () => {
  server = await createServer({ configFile: false, cacheDir: "node_modules/.vite-related-tests",
    server: { middlewareMode: true, hmr: false, ws: false } });
  ({ handleSearchRequest } = await server.ssrLoadModule("/app/search/search-handler.ts"));
  ({ createAssetCorpusSource } = await server.ssrLoadModule("/app/search/asset-corpus-source.ts"));
  ({ isSearchResponse } = await server.ssrLoadModule("/app/search/search-response.ts"));
});
after(async () => { await server.close(); });

const rows = [
  ...Array.from({ length: 21 }, (_, index) => [19, 1, index + 1, index === 20 ? "Wisdom for the wise" : "Seek wisdom"]),
  [19, 2, 1, "A wise son"], [19, 2, 2, "Hear and be wiser"],
  [19, 2, 3, "The wisest of men"], [19, 2, 4, "Walk wisely"],
  [19, 2, 5, "Otherwise unwise"], [42, 1, 1, "The wise hear"],
];
function source() {
  return createAssetCorpusSource({ fetch: async request => Response.json({ schema: 1,
    version: new URL(request.url).pathname.match(/([A-Z]+)\.json$/)[1], rows }) });
}
function request(settings = {}) {
  return new Request(`https://mbab.test/api/search?${new URLSearchParams({ q: "wisdom", books: "19", ...settings })}`);
}

test("wisdom keeps exact counts and pagination while related forms exclude every exact match", async () => {
  for (const page of [1, 2]) {
    const response = await handleSearchRequest(request({ page: String(page), version: "WEB" }), source());
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.total, 21);
    assert.equal(body.totalPages, 2);
    assert.deepEqual(body.bookCounts, [{ bookId: 19, count: 21 }]);
    assert.equal(body.results.length, page === 1 ? 20 : 1);
    assert.deepEqual(body.related.terms, ["wise", "wiser", "wisest", "wisely"]);
    assert.equal(body.related.total, 4);
    assert.deepEqual(body.related.results.map(item => item.ref), ["Proverbs 2:1", "Proverbs 2:2", "Proverbs 2:3"]);
    assert.ok(body.related.results.every(item => item.version === "WEB" && !/\bwisdom\b/i.test(item.text)));
    assert.equal(isSearchResponse(body), true);
  }
});

test("whole-Bible default, zero exact matches, and reciprocal word families remain useful", async () => {
  const all = await (await handleSearchRequest(new Request("https://mbab.test/api/search?q=wisdom"), source())).json();
  assert.equal(all.selectedBookCount, 66);
  assert.equal(all.related.total, 5);
  const empty = await (await handleSearchRequest(request({ q: "wisely", books: "42" }), source())).json();
  assert.equal(empty.total, 0);
  assert.equal(empty.related.total, 1);
  assert.equal(empty.related.results[0].ref, "John 1:1");
  assert.ok(empty.related.terms.includes("wisdom"));
});

test("related forms never rewrite explicit Boolean, multiword, case-sensitive, or reference searches", async () => {
  for (const settings of [{ mode: "advanced" }, { q: "wisdom wise" }, { q: "Wisdom", case: "true" }, { q: "Proverbs 1:1" }, { q: "unlisted" }]) {
    const body = await (await handleSearchRequest(request(settings), source())).json();
    assert.equal(body.related, undefined, JSON.stringify(settings));
  }
});

test("a failed related lookup preserves usable exact results", async () => {
  const corpus = source();
  const body = await (await handleSearchRequest(request(), { ...corpus, search: (...args) => {
    if (args[0] !== "wisdom") throw new Error("Secondary search unavailable");
    return corpus.search(...args);
  } })).json();
  assert.equal(body.total, 21);
  assert.equal(body.related, undefined);
});

test("curated forms stay literal and WEB footnotes cannot create related matches", async () => {
  const rows = [[19, 1, 1, "Mercy and prayer"], [19, 1, 2, "A merciful heart"],
    [19, 1, 3, "They prayed"], [19, 1, 4, "Forgiveness"],
    [19, 1, 5, "An answer {wise wisdom}"]];
  const corpus = createAssetCorpusSource({ fetch: async () => Response.json({ schema: 1, version: "WEB", rows }) });
  for (const [q, total, relatedRef] of [["mercy", 1, "Proverbs 1:2"], ["pray", 0, "Proverbs 1:3"], ["forgive", 0, "Proverbs 1:4"]]) {
    const body = await (await handleSearchRequest(request({ q, version: "WEB" }), corpus)).json();
    assert.equal(body.total, total);
    assert.ok(body.related.results.some(item => item.ref === relatedRef));
  }
  const notes = await (await handleSearchRequest(request({ q: "Wisdom", version: "WEB" }), corpus)).json();
  assert.equal(notes.total, 0);
  assert.equal(notes.related, undefined);
});

test("canceling during a related lookup aborts the request instead of returning stale results", async () => {
  const controller = new AbortController();
  const corpus = source();
  const input = new Request(request(), { signal: controller.signal });
  await assert.rejects(handleSearchRequest(input, { ...corpus, search: (...args) => {
    if (args[0] !== "wisdom") controller.abort();
    return corpus.search(...args);
  } }), error => error.name === "AbortError");
});

test("legacy-backed preview uses the same selected books and edition and removes exact overlaps", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async input => {
    const url = new URL(input); calls.push(url);
    const texts = calls.length === 1 ? ["Wisdom for the wise"] : ["Wisdom for the wise", "A wise son"];
    return Response.json({ results: texts.map((text, index) => ({ Book: "Proverbs", Chapter: 1, Versecount: index + 1, verse: text })) });
  };
  try {
    const body = await (await handleSearchRequest(request({ version: "WEB" }))).json();
    assert.equal(body.total, 1);
    assert.equal(body.related.total, 1);
    assert.equal(body.related.results[0].ref, "Proverbs 1:2");
    assert.equal(calls.length, 2);
    assert.equal(calls[0].searchParams.get("books"), calls[1].searchParams.get("books"));
    assert.equal(calls[1].searchParams.get("version"), "WEB");
  } finally { globalThis.fetch = originalFetch; }
});

test("raw legacy annotations cannot become related verse matches", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => Response.json({ results: ++calls === 1 ? [] : [
    { Book: "Proverbs", Chapter: 1, Versecount: 1, verse: "A man {wise in a source note}" },
    { Book: "Proverbs", Chapter: 1, Versecount: 2, verse: "A wise man {editorial comment}" },
  ] });
  try {
    const body = await (await handleSearchRequest(request({ version: "WEB" }))).json();
    assert.equal(body.total, 0);
    assert.equal(body.related.total, 1);
    assert.equal(body.related.results[0].text, "A wise man");
  } finally { globalThis.fetch = originalFetch; }
});

test("client validation rejects malformed, duplicate, or overlapping related previews", async () => {
  const body = await (await handleSearchRequest(request(), source())).json();
  for (const related of [null, {}, { ...body.related, total: -1 },
    { ...body.related, terms: ["wise,unwise"] }, { ...body.related, terms: ["wise", "wise"] },
    { ...body.related, results: [...body.related.results, body.related.results[0]] },
    { ...body.related, results: [body.results[0]] },
    { ...body.related, results: [{ ...body.related.results[0], version: "WEB" }] }]) {
    assert.equal(isSearchResponse({ ...body, related }), false, JSON.stringify(related));
  }
  const oldResponse = { ...body };
  delete oldResponse.related;
  assert.equal(isSearchResponse(oldResponse), true);
});
