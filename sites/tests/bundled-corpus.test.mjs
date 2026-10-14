import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createServer } from "vite";
import { readFileSync } from "node:fs";

const textFixtures = JSON.parse(readFileSync(new URL("../../contracts/verse-text-fixtures.json", import.meta.url), "utf8"));

let server;
let parseBundledCorpus;
let searchBundledCorpus;
let readBundledChapter;
const payload = {
  schema: 1, version: "KJV", rows: [
    [42, 3, 18, "hope and works"],
    [0, 1, 2, "beloved loving love2 _love"],
    [42, 3, 16, "love and mercy"],
    [42, 3, 17, "love or grace"],
    [0, 1, 1, "Love mercy"],
    [65, 1, 1, "mercy works"],
  ],
};

before(async () => {
  server = await createServer({
    configFile: false, cacheDir: "node_modules/.vite-bundled-corpus-tests",
    server: { middlewareMode: true, hmr: false, ws: false },
  });
  ({ parseBundledCorpus, searchBundledCorpus, readBundledChapter } = await server.ssrLoadModule("/app/search/bundled-corpus.ts"));
});
after(async () => { await server?.close(); });

function search(expression, options = { bookIds: [0, 42, 65] }) {
  return searchBundledCorpus(parseBundledCorpus(payload, "KJV"), expression, options).map(result => result.ref);
}

test("chapter text separates WEB annotations and decodes source quotes without changing other editions", () => {
  for (const fixture of textFixtures.filter(item => item.expected)) {
    const source = { schema: 1, version: fixture.version, rows: [[fixture.bookId, fixture.chapter, fixture.verse, fixture.raw]] };
    const corpus = parseBundledCorpus(source, fixture.version);
    assert.equal(readBundledChapter(corpus, fixture.bookId, fixture.chapter)[0].text, fixture.expected);
    assert.equal(source.rows[0][3], fixture.raw);
  }
});

test("WEB manuscript-note-only entries are omissions rather than empty or fabricated verses", () => {
  const note = textFixtures.find(item => item.version === "WEB" && item.bookId === 43 && item.verse === 37);
  let corpus;
  assert.doesNotThrow(() => {
    corpus = parseBundledCorpus({ schema: 1, version: "WEB", rows: [[43, 8, 36, "They came to some water."], [43, 8, 37, note.raw]] }, "WEB");
  });
  assert.deepEqual(readBundledChapter(corpus, 43, 8).map(item => item.verse), [36]);
  assert.deepEqual(searchBundledCorpus(corpus, "Philip", { bookIds: [43] }), []);
});

test("WEB search counts and matches verse words rather than embedded footnotes", () => {
  const rows = textFixtures.filter(item => item.version === "WEB" && item.bookId === 39)
    .map(item => [item.bookId, item.chapter, item.verse, item.raw]);
  const corpus = parseBundledCorpus({ schema: 1, version: "WEB", rows }, "WEB");
  assert.deepEqual(searchBundledCorpus(corpus, "Greek,Yehoshua", { bookIds: [39] }), []);
  assert.deepEqual(searchBundledCorpus(corpus, "Jesus", { bookIds: [39] }).map(item => item.ref), ["Matthew 1:1", "Matthew 1:16"]);
});

test("bundled Boolean search uses AND precedence and explicit groups in canonical order", () => {
  assert.deepEqual(search("love,hope+works"), ["Genesis 1:1", "John 3:16", "John 3:17", "John 3:18"]);
  assert.deepEqual(search("(love,hope)+works"), ["John 3:18"]);
  assert.deepEqual(search("love+(mercy,grace)"), ["Genesis 1:1", "John 3:16", "John 3:17"]);
});

test("book scope, case sensitivity, and whole-word boundaries apply to actual corpus text", () => {
  assert.deepEqual(search("love", { bookIds: [0], caseSensitive: true }), []);
  assert.deepEqual(search("Love", { bookIds: [0], caseSensitive: true }), ["Genesis 1:1"]);
  assert.deepEqual(search("love", { bookIds: [42], caseSensitive: false }), ["John 3:16", "John 3:17"]);
  assert.deepEqual(search("mercy", { bookIds: [] }), []);
});

test("and and or remain searchable literal words", () => {
  assert.deepEqual(search("and"), ["John 3:16", "John 3:18"]);
  assert.deepEqual(search("or"), ["John 3:17"]);
  assert.deepEqual(search("love+and"), ["John 3:16"]);
  assert.deepEqual(search("(and,or)+love"), ["John 3:16", "John 3:17"]);
});

test("chapter reads preserve complete verse text, edition, and reference identities", () => {
  const corpus = parseBundledCorpus(payload, "KJV");
  assert.deepEqual(readBundledChapter(corpus, 42, 3), [
    { ref: "John 3:16", book: "John", chapter: 3, verse: 16, text: "love and mercy", version: "KJV" },
    { ref: "John 3:17", book: "John", chapter: 3, verse: 17, text: "love or grace", version: "KJV" },
    { ref: "John 3:18", book: "John", chapter: 3, verse: 18, text: "hope and works", version: "KJV" },
  ]);
  assert.deepEqual(readBundledChapter(corpus, 42, 4), []);
  assert.deepEqual(readBundledChapter(corpus, 1, 1), []);
  assert.equal(searchBundledCorpus(corpus, "mercy", { bookIds: [65] })[0].version, "KJV");
});

test("corpus normalization does not mutate source rows or caller data", () => {
  const original = structuredClone(payload);
  const corpus = parseBundledCorpus(payload, "KJV");
  assert.deepEqual(payload, original);
  assert.deepEqual(corpus.rows[0], [0, 1, 1, "Love mercy"]);
  const chapter = readBundledChapter(corpus, 42, 3);
  chapter[0].text = "Changed result";
  assert.equal(readBundledChapter(corpus, 42, 3)[0].text, "love and mercy");
});

test("malformed, mismatched, or duplicate corpora fail instead of returning fabricated results", () => {
  for (const value of [
    null, {}, { ...payload, schema: 2 }, { ...payload, version: "WEB" },
    { ...payload, rows: null }, { ...payload, rows: [] },
    ...[
      [66, 1, 1, "text"], [0, 0, 1, "text"], [0, 1, -1, "text"],
      [0, true, 1, "text"], [0, 1, [1], "text"], [0, 1, 1, " "],
      [0, 1, 1, 42], [0, 1, 1, "text", "extra"], [0, 1.5, 1, "text"],
    ].map(row => ({ ...payload, rows: [row] })),
    { ...payload, rows: [payload.rows[0], payload.rows[0]] },
  ]) assert.throws(() => parseBundledCorpus(value, "KJV"));
  assert.throws(() => parseBundledCorpus({ ...payload, version: "NIV" }, "NIV"));
});

test("invalid compiled expressions never create accidental matches", () => {
  for (const expression of ["", "love mercy", "love+", ",love", "love,,mercy", "()", "(love", "love)", "love(mercy)", "love!"]) {
    assert.throws(() => search(expression), undefined, expression);
  }
});

test("invalid book and chapter coordinates are rejected", () => {
  const corpus = parseBundledCorpus(payload, "KJV");
  for (const bookId of [-1, 66, 1.5, true]) {
    assert.throws(() => readBundledChapter(corpus, bookId, 1));
    assert.throws(() => searchBundledCorpus(corpus, "love", { bookIds: [bookId] }));
  }
  for (const chapter of [0, -1, 1.5, true]) assert.throws(() => readBundledChapter(corpus, 42, chapter));
});
