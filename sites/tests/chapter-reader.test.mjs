import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

let server;
let GET;
const originalFetch = globalThis.fetch;
const originalChapterUrl = process.env.MBAB_CHAPTER_URL;
const chapterUrl = "https://mbab.test/api/chapter?book=John&chapter=3&version=KJV";
const verses = [{ verse: 16, text: "For God so loved the world" }];

before(async () => {
  process.env.MBAB_CHAPTER_URL = "https://corpus.test/chapter/";
  server = await createServer({
    configFile: false, cacheDir: "node_modules/.vite-chapter-tests",
    resolve: { alias: { "@": fileURLToPath(new URL("../", import.meta.url)) } },
    server: { middlewareMode: true, hmr: false, ws: false },
  });
  ({ GET } = await server.ssrLoadModule("/app/api/chapter/route.ts"));
});
after(async () => {
  globalThis.fetch = originalFetch;
  if (originalChapterUrl === undefined) delete process.env.MBAB_CHAPTER_URL;
  else process.env.MBAB_CHAPTER_URL = originalChapterUrl;
  await server.close();
});

test("chapter requests validate catalog, edition, and integer coordinates before fetching", async () => {
  let requests = 0;
  globalThis.fetch = async () => { requests += 1; throw new Error("Unexpected request"); };
  for (const params of ["", "book=Unknown&chapter=3", "book=John&chapter=0", "book=John&chapter=3.5", "book=John&chapter=3junk", "book=John&chapter=9007199254740992", "book=John&chapter=3&version=NIV"]) {
    const response = await GET(new Request(`https://mbab.test/api/chapter?${params}`));
    assert.equal(response.status, 400, params);
  }
  assert.equal(requests, 0);
});

test("chapter reading uses the configured real-corpus interface", async () => {
  const requested = [];
  globalThis.fetch = async input => {
    requested.push(String(input));
    return Response.json({ book: "John", chapter: 3, version: "KJV", verses });
  };
  const response = await GET(new Request(chapterUrl));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { book: "John", chapter: 3, version: "KJV", verses });
  assert.deepEqual(requested, ["https://corpus.test/chapter/?book=John&chapter=3&version=KJV"]);
});

test("empty chapters are explicit and source failures never become empty success", async () => {
  globalThis.fetch = async () => Response.json({ verses: [] });
  assert.equal((await GET(new Request(chapterUrl))).status, 404);
  globalThis.fetch = async () => { throw new Error("Offline"); };
  const unavailable = await GET(new Request(chapterUrl));
  assert.equal(unavailable.status, 503);
  assert.match((await unavailable.json()).error, /unavailable/i);
  assert.equal(unavailable.headers.get("Cache-Control"), "no-store");
});

test("malformed or mismatched source data is rejected before reaching the reader", async () => {
  for (const payload of [
    { verses: [{ verse: 16, text: 42 }] },
    { verses: [...verses, ...verses] },
    { book: "Genesis", chapter: 3, version: "KJV", verses },
    { book: "John", chapter: 3, version: "WEB", verses },
  ]) {
    globalThis.fetch = async input => {
      if (new URL(input).origin === "https://corpus.test") return Response.json(payload);
      throw new Error("Fallback unavailable");
    };
    assert.equal((await GET(new Request(chapterUrl))).status, 503);
  }
});

test("cancellation stops provider fallback requests", async () => {
  let requests = 0;
  const controller = new AbortController();
  globalThis.fetch = async () => { requests += 1; controller.abort(); throw controller.signal.reason; };
  await assert.rejects(GET(new Request(chapterUrl, { signal: controller.signal })), { name: "AbortError" });
  assert.equal(requests, 1);
});

test("a malformed fallback response is unavailable, not a missing chapter", async () => {
  for (const payload of [{}, { chapter: {} }, { chapter: { content: [{ type: "verse", number: "bad", content: "Invalid coordinate" }] } }]) {
    globalThis.fetch = async input => {
      if (new URL(input).hostname === "bible.helloao.org") return Response.json(payload);
      throw new Error("Primary source unavailable");
    };
    assert.equal((await GET(new Request(chapterUrl))).status, 503);
  }
});
