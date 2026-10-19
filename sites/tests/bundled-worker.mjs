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
    ...Array.from({ length: 21 }, (_, index) => [40, 1, index + 1, index === 0 ? "Jesus Christ" : "Jesus spoke"]),
    [40, 2, 1, "Christ is named"], [40, 2, 2, "Messiah is named"], [40, 2, 3, "Messias is named"],
    [40, 2, 4, "Antichrist, Christendom, and messianic"],
    [19, 3, 1, "Fear and peace remain"], [19, 3, 2, "Dread and peace remain"],
    [19, 3, 3, "Peaceful hope"], [19, 3, 4, "Hope and trust remain"],
    [19, 3, 5, "Expectation and confidence"], [19, 3, 6, "Trusting and harmony"],
    [19, 3, 7, "Happy are the meek"],
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
  const relatedWord = new RegExp(`\\b(?:${body.related.terms.join("|")})\\b`, "i");
  assert.ok(body.related.results.every(item => item.book === "Proverbs" && item.version === "KJV"
    && relatedWord.test(item.text) && !/\bwisdom\b/i.test(item.text)));
  assert.ok(body.relatedSuggestions.some(item => item.query.toLowerCase() === "wise"));
});

test("the published Worker preserves Jesus page two and offers distinct literal related matches", async () => {
  const response = await worker.dispatchFetch("https://mbab.test/api/search?q=Jesus&version=KJV&page=2");
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.total, realCorpus ? 942 : 21);
  assert.equal(body.page, 2);
  assert.equal(body.pageSize, 20);
  assert.equal(body.totalPages, realCorpus ? 48 : 2);
  assert.equal(body.selectedBookCount, 66);
  assert.equal(body.expression, "Jesus");
  assert.equal(body.results[0].ref, realCorpus ? "Matthew 8:7" : "Mark 1:21");
  assert.ok(body.results.every(item => item.version === "KJV" && /\bjesus\b/i.test(item.text)));
  assert.ok(body.relatedSuggestions.some(item => item.query.toLowerCase() === "christ"));
  assert.ok(body.related.total > 0);
  assert.equal(body.related.results.length, Math.min(3, body.related.total));
  const relatedWord = new RegExp(`\\b(?:${body.related.terms.join("|")})\\b`, "i");
  assert.ok(body.related.results.every(item => item.version === "KJV"
    && relatedWord.test(item.text) && !/\bjesus\b/i.test(item.text)));
  assert.equal(body.bookCounts.reduce((sum, book) => sum + book.count, 0), body.total);
});

test("the published Worker suggests complete queries for common words without the legacy service", async () => {
  for (const q of ["fear", "peace", "hope", "trust"]) {
    const response = await worker.dispatchFetch(`https://mbab.test/api/search?${new URLSearchParams({ q, version: "KJV", books: "19" })}`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.ok(body.total > 0, q);
    assert.equal(body.expression, q);
    assert.ok(body.relatedSuggestions?.length > 0 && body.relatedSuggestions.length <= 6, q);
    assert.equal(new Set(body.relatedSuggestions.map(item => item.query)).size, body.relatedSuggestions.length);
    for (const suggestion of body.relatedSuggestions) {
      assert.equal(suggestion.mode, "all");
      const result = await worker.dispatchFetch(`https://mbab.test/api/search?${new URLSearchParams({ q: suggestion.query, mode: suggestion.mode, version: "KJV", books: "19" })}`);
      assert.equal(result.status, 200);
      const suggested = await result.json();
      assert.ok(suggested.total > 0, JSON.stringify(suggestion));
      assert.ok(suggested.results.every(item => item.version === "KJV" && item.book === "Proverbs"));
    }
  }
});

test("the published Worker retains Any mode and the other operand when suggesting a multiword query", async () => {
  const response = await worker.dispatchFetch("https://mbab.test/api/search?q=fear%20peace&mode=any&version=KJV&books=19");
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.expression, "fear,peace");
  assert.equal(body.related, undefined);
  assert.ok(body.relatedSuggestions?.length > 0 && body.relatedSuggestions.length <= 6);
  for (const item of body.relatedSuggestions) {
    assert.equal(item.mode, "any");
    const words = item.query.match(/[A-Za-z0-9_]+/g);
    assert.equal(words.length, 2);
    assert.equal(words.filter((word, index) => word !== ["fear", "peace"][index]).length, 1);
    const result = await worker.dispatchFetch(`https://mbab.test/api/search?${new URLSearchParams({ q: item.query, mode: item.mode, version: "KJV", books: "19" })}`);
    assert.equal(result.status, 200);
    const suggested = await result.json();
    assert.ok(suggested.total > 0);
    assert.match(suggested.expression, /^[a-z]+,[a-z]+$/i);
  }
});

test("the published Worker can relate happiness to happy without changing the empty exact result", async () => {
  const response = await worker.dispatchFetch("https://mbab.test/api/search?q=happiness&version=KJV&books=19");
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.total, 0);
  assert.equal(body.expression, "happiness");
  assert.equal(body.results.length, 0);
  assert.ok(body.relatedSuggestions?.some(item => item.query.toLowerCase() === "happy"));
  assert.ok(body.related.total > 0);
  assert.ok(body.related.results.every(item => item.book === "Proverbs" && item.version === "KJV" && /\bhappy\b/i.test(item.text)));
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
