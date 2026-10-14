import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createServer } from "vite";

let server;
let createAssetCorpusSource;
let handleSearchRequest;
let handleChapterRequest;

function corpus(version = "KJV") {
  return { schema: 1, version, rows: [
    ...Array.from({ length: 12 }, (_, index) => [0, 1, index + 1, `${index === 0 ? "Love mercy" : "love and mercy"} ${version}`]),
    [0, 2, 1, `beloved loving love2 _love ${version}`],
    ...Array.from({ length: 23 }, (_, index) => [42, 3, index + 1, `love or grace ${version}`]),
    ...Array.from({ length: 9 }, (_, index) => [43, 2, index + 1, `Love one another ${version}`]),
  ] };
}

const counts = [{ bookId: 0, count: 12 }, { bookId: 42, count: 23 }, { bookId: 43, count: 9 }];

before(async () => {
  server = await createServer({
    configFile: false, cacheDir: "node_modules/.vite-asset-corpus-tests",
    server: { middlewareMode: true, hmr: false, ws: false },
  });
  ({ createAssetCorpusSource } = await server.ssrLoadModule("/app/search/asset-corpus-source.ts"));
  ({ handleSearchRequest } = await server.ssrLoadModule("/app/search/search-handler.ts"));
  ({ handleChapterRequest } = await server.ssrLoadModule("/app/search/chapter-handler.ts"));
});
after(async () => { await server?.close(); });

function searchRequest(values = {}, signal) {
  const params = new URLSearchParams({ q: "love", version: "KJV", books: "0,42,43", ...values });
  return new Request(`https://mbab.test/api/search?${params}`, { signal });
}

function chapterRequest(values = {}, signal) {
  const params = new URLSearchParams({ book: "John", chapter: "3", version: "KJV", ...values });
  return new Request(`https://mbab.test/api/chapter?${params}`, { signal });
}

function sourceFor(fetchAsset = request => {
  const version = new URL(request.url).pathname.split("/").at(-1).replace(".json", "");
  return Response.json(corpus(version));
}) {
  return createAssetCorpusSource({ fetch: async request => fetchAsset(request) });
}

test("asset-backed keyword counts cover all matches before canonical pagination", async () => {
  const source = sourceFor();
  for (const page of [1, 2, 3]) {
    const response = await handleSearchRequest(searchRequest({ page: String(page) }), source);
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.total, 44);
    assert.equal(result.page, page);
    assert.equal(result.totalPages, 3);
    assert.equal(result.results.length, page === 3 ? 4 : 20);
    assert.deepEqual(result.bookCounts, counts);
    assert.equal(result.results[0].ref, ["Genesis 1:1", "John 3:9", "Acts 2:6"][page - 1]);
    assert.equal(result.results.every(verse => verse.version === "KJV"), true);
  }
});

test("public search settings retain scope, case, whole words, groups, and literal operator words", async () => {
  const source = sourceFor();
  for (const [settings, total, expectedCounts] of [
    [{ q: "love", books: "0", case: "true" }, 11, [{ bookId: 0, count: 11 }]],
    [{ q: "Love", books: "0", case: "true" }, 1, [{ bookId: 0, count: 1 }]],
    [{ q: "love AND mercy", mode: "advanced" }, 12, [{ bookId: 0, count: 12 }]],
    [{ q: "love+(and,or)", mode: "advanced" }, 34, [{ bookId: 0, count: 11 }, { bookId: 42, count: 23 }]],
    [{ q: "or", mode: "advanced" }, 23, [{ bookId: 42, count: 23 }]],
  ]) {
    const response = await handleSearchRequest(searchRequest(settings), source);
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.total, total);
    assert.deepEqual(result.bookCounts, expectedCounts);
  }
});

test("asset-backed references and complete chapters retain book, verse, and edition identities", async () => {
  const source = sourceFor();
  const reference = await handleSearchRequest(searchRequest({ q: "John 3:16-18", books: "42", version: "WEB" }), source);
  assert.equal(reference.status, 200);
  const result = await reference.json();
  assert.equal(result.total, 3);
  assert.deepEqual(result.bookCounts, [{ bookId: 42, count: 3 }]);
  assert.deepEqual(result.results, [16, 17, 18].map(verse => ({
    ref: `John 3:${verse}`, book: "John", chapter: 3, verse, text: "love or grace WEB", version: "WEB",
  })));
  const chapter = await handleChapterRequest(chapterRequest({ book: " john ", version: "web" }), source);
  assert.equal(chapter.status, 200);
  assert.deepEqual(await chapter.json(), {
    book: "John", chapter: 3, version: "WEB",
    verses: Array.from({ length: 23 }, (_, index) => ({ verse: index + 1, text: "love or grace WEB" })),
  });
});

test("missing matches and chapters remain distinct from unavailable corpus assets", async () => {
  const source = sourceFor();
  const empty = await handleSearchRequest(searchRequest({ q: "nevermatches" }), source);
  assert.equal(empty.status, 200);
  const result = await empty.json();
  assert.equal(result.total, 0);
  assert.deepEqual(result.results, []);
  assert.deepEqual(result.bookCounts, []);
  const chapter = await handleChapterRequest(chapterRequest({ chapter: "99" }), source);
  assert.equal(chapter.status, 404);
  assert.equal(chapter.headers.get("Cache-Control"), "no-store");
  const reference = await handleSearchRequest(searchRequest({ q: "John 99:1", books: "42" }), source);
  assert.equal(reference.status, 200);
  assert.equal((await reference.json()).total, 0);
  const excluded = await handleSearchRequest(searchRequest({ q: "John 3:16", books: "0" }), sourceFor(() => {
    assert.fail("An excluded reference must not read any corpus asset");
  }));
  assert.equal(excluded.status, 200);
  assert.deepEqual((await excluded.json()).bookCounts, []);
});

test("malformed and missing assets return uncached 503 errors and allow a successful retry", async () => {
  const invalidAssets = [
    () => new Response("Not found", { status: 404 }),
    () => new Response("Not JSON", { headers: { "Content-Type": "application/json" } }),
    () => Response.json(null),
    () => Response.json(corpus("WEB")),
    () => Response.json({ ...corpus(), schema: 2 }),
    () => Response.json({ ...corpus(), rows: [] }),
    () => Response.json({ ...corpus(), rows: [[42, true, 16, "Text"]] }),
    () => Response.json({ ...corpus(), rows: [corpus().rows[0], corpus().rows[0]] }),
  ];
  for (const badAsset of invalidAssets) {
    for (const [handler, request] of [[handleSearchRequest, searchRequest], [handleChapterRequest, chapterRequest]]) {
      let attempts = 0;
      const source = sourceFor(() => ++attempts === 1 ? badAsset() : Response.json(corpus()));
      const failed = await handler(request(), source);
      assert.equal(failed.status, 503);
      assert.equal(failed.headers.get("Cache-Control"), "no-store");
      const failure = await failed.json();
      assert.equal(typeof failure.error, "string");
      assert.equal(failure.results, undefined);
      const retried = await handler(request(), source);
      assert.equal(retried.status, 200);
      assert.equal(attempts, 2);
    }
  }
});

test("cancellation propagates from keyword, reference, and chapter requests without poisoning retry", async () => {
  for (const [handler, request] of [
    [handleSearchRequest, searchRequest],
    [handleSearchRequest, (values, signal) => searchRequest({ q: "John 3:16", ...values }, signal)],
    [handleChapterRequest, chapterRequest],
  ]) {
    let release;
    const waiting = new Promise(resolve => { release = resolve; });
    const source = sourceFor(async () => { await waiting; return Response.json(corpus()); });
    const controller = new AbortController();
    const pending = handler(request({}, controller.signal), source);
    const canceled = assert.rejects(pending, { name: "AbortError" });
    controller.abort();
    release();
    await canceled;
    assert.equal((await handler(request(), source)).status, 200);
  }
});

test("already canceled requests fail before reading corpus assets", async () => {
  const controller = new AbortController();
  controller.abort();
  for (const [handler, request] of [[handleSearchRequest, searchRequest], [handleChapterRequest, chapterRequest]]) {
    let reads = 0;
    const source = sourceFor(() => { reads++; return Response.json(corpus()); });
    await assert.rejects(handler(request({}, controller.signal), source), { name: "AbortError" });
    assert.equal(reads, 0, "An already canceled request must not read an asset");
  }
});

test("overlapping edition changes never put an earlier corpus under a newer edition label", async () => {
  let release;
  const waiting = new Promise(resolve => { release = resolve; });
  const source = sourceFor(async request => {
    const path = new URL(request.url).pathname;
    if (path.endsWith("/KJV.json")) await waiting;
    return Response.json(corpus(path.endsWith("/WEB.json") ? "WEB" : "KJV"));
  });
  const older = handleSearchRequest(searchRequest(), source);
  const newer = await handleChapterRequest(chapterRequest({ version: "WEB" }), source);
  assert.equal(newer.status, 200);
  const webChapter = await newer.json();
  assert.equal(webChapter.version, "WEB");
  assert.equal(webChapter.verses[0].text, "love or grace WEB");
  release();
  const kjvResult = await (await older).json();
  assert.equal(kjvResult.results[0].version, "KJV");
  assert.equal(kjvResult.results[0].text, "Love mercy KJV");
  const webResult = await (await handleSearchRequest(searchRequest({ version: "WEB" }), source)).json();
  assert.equal(webResult.results[0].version, "WEB");
  assert.equal(webResult.results[0].text, "Love mercy WEB");
});
