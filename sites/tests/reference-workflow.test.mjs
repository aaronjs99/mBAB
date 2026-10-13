import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

let server;
let fetchReferenceVerses;
let GET;
const originalFetch = globalThis.fetch;
const originalChapterUrl = process.env.MBAB_CHAPTER_URL;

before(async () => {
  process.env.MBAB_CHAPTER_URL = "https://corpus.test/chapter/";
  server = await createServer({
    configFile: false, cacheDir: "node_modules/.vite-reference-tests",
    resolve: { alias: { "@": fileURLToPath(new URL("../", import.meta.url)) } },
    server: { middlewareMode: true, hmr: false, ws: false },
  });
  ({ fetchReferenceVerses } = await server.ssrLoadModule("/app/search/reference-source.ts"));
  ({ GET } = await server.ssrLoadModule("/app/api/search/route.ts"));
});

after(async () => {
  globalThis.fetch = originalFetch;
  if (originalChapterUrl === undefined) delete process.env.MBAB_CHAPTER_URL;
  else process.env.MBAB_CHAPTER_URL = originalChapterUrl;
  await server.close();
});

test("reference lookup uses the configured chapter service before public fallbacks", async () => {
  const requested = [];
  globalThis.fetch = async input => {
    const url = new URL(input);
    requested.push(url.href);
    if (url.origin !== "https://corpus.test") throw new Error("Unexpected external source");
    return Response.json({ book: "John", chapter: 3, version: "KJV", verses: [{ verse: 16, text: "For God so loved the world" }] });
  };
  const verses = await fetchReferenceVerses({ bookId: 42, book: "John", chapter: 3, startVerse: 16, endVerse: 16 }, "KJV");
  assert.deepEqual(verses, [{ verse: 16, text: "For God so loved the world" }]);
  assert.deepEqual(requested, ["https://corpus.test/chapter/?book=John&chapter=3&version=KJV"]);
});

test("an excluded reference returns no matches without contacting any verse provider", async () => {
  let requests = 0;
  globalThis.fetch = async () => { requests += 1; throw new Error("Offline"); };
  const response = await GET(new Request("https://mbab.test/api/search?q=John%203%3A16&books=0"));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).total, 0);
  assert.equal(requests, 0);
});
