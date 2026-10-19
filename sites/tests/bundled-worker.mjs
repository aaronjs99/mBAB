import assert from "node:assert/strict";
import { after, test } from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { createBuiltWorker } from "./built-worker.mjs";

const corpusRoot = new URL("../public/corpus/", import.meta.url);
const realCorpus = existsSync(new URL("manifest.json", corpusRoot));
const textFixtures = JSON.parse(readFileSync(new URL("../../contracts/verse-text-fixtures.json", import.meta.url), "utf8"));
const worker = createBuiltWorker({ assets: async request => {
  const match = new URL(request.url).pathname.match(/^\/corpus\/([A-Z]+)\.json$/);
  if (!match) return new Response("Missing", { status: 404 });
  if (realCorpus) return new Response(readFileSync(new URL(`${match[1]}.json`, corpusRoot)), { headers: { "Content-Type": "application/json" } });
  const notes = match[1] === "WEB" ? textFixtures.filter(item => item.version === "WEB" && item.bookId === 39)
    .map(item => [item.bookId, item.chapter, item.verse, item.raw]) : [];
  return Response.json({ schema: 1, version: match[1], rows: [...notes,
    [19, 1, 1, "Wisdom for the wise"], [19, 1, 2, "A wise son"],
    [42, 3, 16, "For God so loved the world"], [42, 3, 17, "God sent his Son"]] });
} });
after(() => worker.dispose());

test("the published Worker finds wisdom first and offers distinct wise verses in the same scope", async () => {
  const response = await worker.dispatchFetch("https://mbab.test/api/search?q=wisdom&version=KJV&books=19");
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.ok(body.total > 0);
  assert.ok(body.results.every(item => /\bwisdom\b/i.test(item.text)));
  assert.ok(body.related.total > 0);
  assert.ok(body.related.results.every(item => item.book === "Proverbs" && item.version === "KJV"
    && /\b(wise|wiser|wisest|wisely)\b/i.test(item.text) && !/\bwisdom\b/i.test(item.text)));
});

test("the built site searches and reads its own text with external networking disabled", async () => {
  const response = await worker.dispatchFetch(`https://mbab.test/api/search?q=${realCorpus ? "love" : "loved"}&version=KJV`);
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.ok(data.total > 0);
  assert.equal(data.bookCounts.reduce((sum, book) => sum + book.count, 0), data.total);
  const chapter = await worker.dispatchFetch("https://mbab.test/api/chapter?book=John&chapter=3&version=WEB");
  assert.equal(chapter.status, 200);
  const reading = await chapter.json();
  assert.match(reading.verses.find(item => item.verse === 16).text, /God.*loved/);
  if (realCorpus) assert.equal(reading.verses.length, 36);
});

test("every published edition provides real chapter text without the legacy service", async () => {
  const versions = realCorpus ? Object.keys(JSON.parse(readFileSync(new URL("manifest.json", corpusRoot)))) : ["KJV", "WEB"];
  for (const version of versions) {
    const response = await worker.dispatchFetch(`https://mbab.test/api/chapter?book=John&chapter=3&version=${version}`);
    assert.equal(response.status, 200, version);
    const chapter = await response.json();
    assert.equal(chapter.version, version);
    assert.ok(chapter.verses.some(item => item.verse === 16 && item.text.length > 20), version);
  }
});

test("published WEB results and chapter text exclude editorial notes and decode quotation marks", async () => {
  const response = await worker.dispatchFetch("https://mbab.test/api/search?q=Jesus&version=WEB&books=39");
  assert.equal(response.status, 200);
  const results = (await response.json()).results;
  assert.equal(results[0].text, textFixtures[0].expected);
  assert.equal(results[1].text, textFixtures[1].expected);
  const notes = await worker.dispatchFetch("https://mbab.test/api/search?q=Yehoshua&version=WEB&books=39");
  assert.equal((await notes.json()).total, 0);
  const chapter = await worker.dispatchFetch("https://mbab.test/api/chapter?book=Matthew&chapter=1&version=WEB");
  const reading = await chapter.json();
  assert.equal(reading.verses.find(item => item.verse === 16).text, textFixtures[1].expected);
  assert.equal(reading.verses.find(item => item.verse === 20).text, textFixtures[2].expected);
});
