import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createServer } from "vite";

let server, handleSearchRequest, createAssetCorpusSource, isSearchResponse, expressionFor;
before(async () => {
  server = await createServer({ configFile: false, cacheDir: "node_modules/.vite-related-tests",
    server: { middlewareMode: true, hmr: false, ws: false } });
  ({ handleSearchRequest } = await server.ssrLoadModule("/app/search/search-handler.ts"));
  ({ createAssetCorpusSource } = await server.ssrLoadModule("/app/search/asset-corpus-source.ts"));
  ({ isSearchResponse } = await server.ssrLoadModule("/app/search/search-response.ts"));
  ({ expressionFor } = await server.ssrLoadModule("/app/search/query.ts"));
});
after(async () => { await server.close(); });

const rows = [
  ...Array.from({ length: 21 }, (_, index) => [19, 1, index + 1, index === 20 ? "Wisdom for the wise" : "Seek wisdom"]),
  [19, 2, 1, "A wise son"], [19, 2, 2, "Hear and be wiser"],
  [19, 2, 3, "The wisest of men"], [19, 2, 4, "Walk wisely"],
  [19, 2, 5, "Otherwise unwise"], [42, 1, 1, "The wise hear"],
];
function source(corpusRows = rows) {
  return createAssetCorpusSource({ fetch: async request => Response.json({ schema: 1,
    version: new URL(request.url).pathname.match(/([A-Z]+)\.json$/)[1], rows: corpusRows }) });
}
function request(settings = {}) {
  return new Request(`https://mbab.test/api/search?${new URLSearchParams({ q: "wisdom", books: "19", ...settings })}`);
}

test("dictionary property names cannot interrupt exact search results", async () => {
  const corpus = source([[19, 1, 1, "A constructor is a builder"], [19, 1, 2, "A prototype remains"]]);
  for (const word of ["constructor", "prototype", "toString"]) {
    const response = await handleSearchRequest(request({ q: word }), corpus);
    assert.equal(response.status, 200, word);
    const body = await response.json();
    assert.equal(body.total, word === "toString" ? 0 : 1, word);
    assert.equal(isSearchResponse(body), true, word);
  }
});

test("word endings alone cannot invent unrelated roots", async () => {
  const corpus = source([[19, 1, 1, "A random witness"], [19, 1, 2, "He ran with wit and witty words"],
    [19, 1, 3, "Seek wisdom and be wise"], [19, 1, 4, "Holy and early"], [19, 1, 5, "Ho, lend an ear"]]);
  for (const word of ["random", "witness", "ran", "wit"]) {
    const response = await handleSearchRequest(request({ q: word }), corpus);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.total, 1);
    const unrelated = ["random", "ran"].includes(word) ? /^(?:random|ran)$/
      : word === "witness" ? /^(?:wit|witty)$/ : /^witness$/;
    assert.ok(!(body.relatedSuggestions ?? []).some(item => item.query !== word && unrelated.test(item.query)), word);
  }
  const wisdom = await (await handleSearchRequest(request(), corpus)).json();
  assert.ok(wisdom.relatedSuggestions.some(item => item.query === "wise"));
  for (const [word, unrelated] of [["holy", "ho"], ["early", "ear"]]) {
    const body = await (await handleSearchRequest(request({ q: word }), corpus)).json();
    assert.equal(body.total, 1);
    assert.ok(!(body.relatedSuggestions ?? []).some(item => item.query === unrelated), word);
  }
});

function suggestions(body) {
  assert.ok(Array.isArray(body.relatedSuggestions) && body.relatedSuggestions.length > 0, "Offer a useful full-query suggestion");
  assert.ok(body.relatedSuggestions.length <= 6);
  assert.equal(new Set(body.relatedSuggestions.map(item => `${item.mode}:${item.query}`)).size, body.relatedSuggestions.length);
  for (const item of body.relatedSuggestions) {
    assert.ok(typeof item.label === "string" && item.label.trim());
    assert.ok(typeof item.query === "string" && item.query.trim());
    assert.ok(["all", "any", "advanced"].includes(item.mode));
  }
  return body.relatedSuggestions;
}

function assertLiteralPreview(body, corpusRows, exactWord, books, version) {
  assert.ok(body.related, "Offer distinct literal related verse matches");
  const pattern = new RegExp(`\\b(?:${body.related.terms.join("|")})\\b`, "i");
  const exact = new RegExp(`\\b${exactWord}\\b`, "i");
  const expected = corpusRows.filter(([book, , , text]) => books.includes(book) && pattern.test(text) && !exact.test(text));
  assert.equal(body.related.total, expected.length);
  assert.deepEqual(body.related.results.map(item => item.ref), expected.slice(0, 3).map(([book, chapter, verse]) => `${book === 19 ? "Proverbs" : book === 39 ? "Matthew" : "John"} ${chapter}:${verse}`));
  assert.ok(body.related.results.every(item => item.version === version && pattern.test(item.text) && !exact.test(item.text)));
}

const nameRows = [
  ...Array.from({ length: 21 }, (_, index) => [39, 1, index + 1,
    index === 0 || index === 20 ? "Jesus Christ" : "Jesus spoke"]),
  [39, 2, 1, "Christ is named"], [39, 2, 2, "Messiah is named"], [39, 2, 3, "Messias is named"],
  [39, 2, 4, "Antichrist, Christendom, and messianic"],
  [42, 1, 1, "Christ was mentioned"], [42, 1, 2, "Jesus was mentioned"],
];

test("Jesus page two keeps exact whole-Bible results and excludes every exact verse from literal suggestions", async () => {
  const response = await handleSearchRequest(new Request("https://mbab.test/api/search?q=Jesus&page=2"), source(nameRows));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.total, 22);
  assert.equal(body.page, 2);
  assert.equal(body.pageSize, 20);
  assert.equal(body.totalPages, 2);
  assert.equal(body.selectedBookCount, 66);
  assert.equal(body.expression, "Jesus");
  assert.deepEqual(body.results.map(item => item.ref), ["Matthew 1:21", "John 1:2"]);
  assert.deepEqual(body.bookCounts, [{ bookId: 39, count: 21 }, { bookId: 42, count: 1 }]);
  assert.ok(suggestions(body).some(item => item.query.toLowerCase() === "christ"));
  assertLiteralPreview(body, nameRows, "Jesus", [39, 42], "KJV");
  assert.ok(!body.related.terms.some(term => ["antichrist", "christendom", "messianic"].includes(term)));
  assert.equal(isSearchResponse(body), true);
});

test("Jesus suggestions preserve the submitted edition and book scope", async () => {
  for (const version of ["KJV", "WEB"]) {
    const jesus = await (await handleSearchRequest(request({ q: "jEsUs", books: "39", version, page: "2" }), source(nameRows))).json();
    assert.equal(jesus.total, 21);
    assert.ok(suggestions(jesus).some(item => item.query.toLowerCase() === "christ"));
    assertLiteralPreview(jesus, nameRows, "Jesus", [39], version);
    assert.ok(jesus.related.results.every(item => item.book === "Matthew" && item.version === version));
    assert.equal(isSearchResponse(jesus), true);
  }
});

test("Christ offers Jesus and the literal title searches within the submitted edition and scope", async () => {
  for (const version of ["KJV", "WEB"]) {
    const christ = await (await handleSearchRequest(request({ q: "Christ", mode: "any", books: "42", version }), source(nameRows))).json();
    assert.equal(christ.total, 1);
    assert.ok(christ.related, "Christ should offer the explicitly selected related terms");
    assert.equal(christ.related.total, 1);
    assert.ok(suggestions(christ).some(item => item.query.toLowerCase() === "jesus"));
    assert.deepEqual(christ.related.results, [
      { ref: "John 1:2", book: "John", chapter: 1, verse: 2, text: "Jesus was mentioned", version },
    ]);
    assert.equal(isSearchResponse(christ), true);
  }
});

test("related previews do not rewrite explicit searches", async () => {
  for (const settings of [{ q: "Jesus", mode: "advanced" }, { q: "Jesus", case: "true" },
    { q: "Jesus Christ" }, { q: "Jesus,Christ", mode: "advanced" }]) {
    const body = await (await handleSearchRequest(request({ books: "39", ...settings }), source(nameRows))).json();
    assert.equal(body.related, undefined, JSON.stringify(settings));
  }
});

test("wisdom keeps exact counts and pagination while related forms exclude every exact match", async () => {
  for (const page of [1, 2]) {
    const response = await handleSearchRequest(request({ page: String(page), version: "WEB" }), source());
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.total, 21);
    assert.equal(body.totalPages, 2);
    assert.deepEqual(body.bookCounts, [{ bookId: 19, count: 21 }]);
    assert.equal(body.results.length, page === 1 ? 20 : 1);
    assert.ok(suggestions(body).some(item => item.query.toLowerCase() === "wise"));
    assertLiteralPreview(body, rows, "wisdom", [19], "WEB");
    assert.ok(body.related.results.every(item => !/\b(?:otherwise|unwise)\b/i.test(item.text)));
    assert.equal(isSearchResponse(body), true);
  }
});

test("whole-Bible default, zero exact matches, and reciprocal word families remain useful", async () => {
  const all = await (await handleSearchRequest(new Request("https://mbab.test/api/search?q=wisdom"), source())).json();
  assert.equal(all.selectedBookCount, 66);
  assertLiteralPreview(all, rows, "wisdom", [19, 42], "KJV");
  const empty = await (await handleSearchRequest(request({ q: "wisdom", books: "42" }), source())).json();
  assert.equal(empty.total, 0);
  assert.equal(empty.related.total, 1);
  assert.equal(empty.related.results[0].ref, "John 1:1");
  assert.ok(suggestions(empty).some(item => item.query.toLowerCase() === "wise"));
  const reciprocal = await (await handleSearchRequest(request({ q: "wise" }), source())).json();
  assert.ok(suggestions(reciprocal).some(item => item.query.toLowerCase() === "wisdom"));
  assertLiteralPreview(reciprocal, rows, "wise", [19], "KJV");
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
  assert.deepEqual(body.relatedSuggestions ?? [], []);
});

test("word forms stay literal and WEB footnotes cannot create related matches", async () => {
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
  assert.deepEqual(notes.relatedSuggestions ?? [], []);
});

const generalRows = [
  [19, 3, 1, "Fear and peace remain"], [19, 3, 2, "Dread and peace remain"],
  [19, 3, 3, "Terror is near"], [19, 3, 4, "Fearful minds seek peace"],
  [19, 3, 5, "Peaceful words"], [19, 3, 6, "Harmony is sweet"],
  [19, 3, 7, "Hope and trust endure"], [19, 3, 8, "Expectation and trust endure"],
  [19, 3, 9, "Confidence endures"], [19, 3, 10, "Reliance endures"],
  [19, 3, 11, "They prayed"], [19, 3, 12, "They pray"],
  [19, 3, 13, "A child"], [19, 3, 14, "Children listen"],
  [19, 3, 15, "Fear wisdom"], [19, 3, 16, "Dread wisdom"],
  [19, 3, 17, "Dread and wisdom"], [19, 3, 18, "Dread or wisdom"],
  [19, 3, 19, "dread in lowercase"], [19, 3, 20, "Happy are the meek"],
  [19, 3, 21, "They believe"], [19, 3, 22, "Hoping"],
  [19, 3, 23, "Trusting"], [19, 3, 24, "Fears"],
  [42, 3, 1, "Fear is near"], [42, 3, 2, "Terror wisdom"],
];

async function assertExecutableSuggestions(body, corpus, { mode = "all", version = "WEB", books = [19], caseSensitive = false } = {}) {
  for (const item of suggestions(body)) {
    assert.equal(item.mode, mode, "A suggestion must preserve the selected search mode");
    const compiled = expressionFor(item.query, item.mode);
    assert.equal(compiled.error, undefined, `Compile ${JSON.stringify(item)}`);
    assert.ok(compiled.expression);
    const hits = await corpus.search(compiled.expression, version, books, caseSensitive, new AbortController().signal);
    assert.ok(hits.length > 0, `Verify the complete suggested query ${JSON.stringify(item)}`);
    assert.ok(hits.every(hit => hit.version === version && (books.length !== 1 || hit.book === (books[0] === 19 ? "Proverbs" : "John"))));
  }
}

test("common uncurated searches offer corpus-verified words without external networking", async () => {
  const corpus = source(generalRows);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("External networking is disabled"); };
  try {
    for (const [q, targets, exactTotal] of [
      ["fear", ["dread", "terror", "fearful", "fears"], 2],
      ["peace", ["peaceful", "harmony"], 3],
      ["hope", ["expectation", "trust", "hoping"], 1],
      ["trust", ["confidence", "reliance", "believe", "trusting"], 2],
    ]) {
      const response = await handleSearchRequest(request({ q, version: "WEB" }), corpus);
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.total, exactTotal, q);
      assert.equal(body.expression, q);
      assert.ok(suggestions(body).some(item => targets.includes(item.query.toLowerCase())), q);
      await assertExecutableSuggestions(body, corpus);
      assert.equal(isSearchResponse(body), true);
    }
  } finally { globalThis.fetch = originalFetch; }
});

test("regular and irregular inflections use attested corpus words", async () => {
  const corpus = source(generalRows);
  for (const [q, target] of [["prayed", "pray"], ["children", "child"]]) {
    const body = await (await handleSearchRequest(request({ q, version: "WEB" }), corpus)).json();
    assert.equal(body.total, 1);
    assert.ok(suggestions(body).some(item => item.query.toLowerCase() === target), q);
    await assertExecutableSuggestions(body, corpus);
  }
});

test("a dictionary source word absent from the Bible can suggest an attested derivative", async () => {
  const corpus = source(generalRows);
  const body = await (await handleSearchRequest(request({ q: "happiness", version: "WEB" }), corpus)).json();
  assert.equal(body.total, 0);
  assert.equal(body.expression, "happiness");
  assert.ok(suggestions(body).some(item => item.query.toLowerCase() === "happy"));
  assert.equal(body.related.total, 1);
  assert.equal(body.related.results[0].ref, "Proverbs 3:20");
  assert.equal(body.related.results[0].text, "Happy are the meek");
  await assertExecutableSuggestions(body, corpus);
  assert.equal(isSearchResponse(body), true);
});

test("wisdom does not acquire slang from a secondary sense of a derived root", async () => {
  const corpus = source([[19, 3, 1, "Wisdom"], [19, 3, 2, "A wise heart"],
    [19, 3, 3, "Fresh water"], [19, 3, 4, "An impudent face"]]);
  for (const q of ["wisdom", "wise"]) {
    const body = await (await handleSearchRequest(request({ q, version: "WEB" }), corpus)).json();
    assert.equal(body.total, 1);
    assert.ok(suggestions(body).some(item => item.query === (q === "wisdom" ? "wise" : "wisdom")));
    assert.ok(body.relatedSuggestions.every(item => !/\b(?:fresh|impudent)\b/i.test(item.query)), `${q}: ${JSON.stringify(body.relatedSuggestions)}`);
    assert.ok(body.related.terms.every(term => !/^(?:fresh|impudent)$/i.test(term)));
    assert.ok(body.related.results.every(item => !/\b(?:fresh|impudent)\b/i.test(item.text)));
  }
});

test("All, Any, and grouped advanced suggestions replace one operand and retain the full query", async () => {
  const corpus = source(generalRows);
  for (const [q, mode, originalExpression, exactTotal] of [
    ["fear peace", "all", "fear+peace", 1], ["fear peace", "any", "fear,peace", 4],
    ["(fear+peace),hope", "advanced", "(fear+peace),hope", 2],
    ["(fear)OR(peace)", "advanced", "(fear),(peace)", 4],
  ]) {
    const body = await (await handleSearchRequest(request({ q, mode, version: "WEB" }), corpus)).json();
    assert.equal(body.expression, originalExpression);
    assert.equal(body.total, exactTotal);
    assert.equal(body.related, undefined, "Only simple insensitive queries have an automatic preview");
    const originalWords = originalExpression.match(/[A-Za-z0-9_]+/g);
    for (const item of suggestions(body)) {
      assert.equal(item.mode, mode);
      const compiled = expressionFor(item.query, item.mode);
      assert.equal(compiled.error, undefined);
      assert.equal(compiled.expression.replace(/[A-Za-z0-9_]+/g, "#"), originalExpression.replace(/[A-Za-z0-9_]+/g, "#"));
      const changedWords = compiled.expression.match(/[A-Za-z0-9_]+/g);
      assert.equal(changedWords.length, originalWords.length);
      assert.equal(changedWords.filter((word, index) => word !== originalWords[index]).length, 1);
    }
    await assertExecutableSuggestions(body, corpus, { mode });
  }
});

test("literal and and or operands survive related advanced-query suggestions", async () => {
  const corpus = source(generalRows);
  for (const [q, exactTotal] of [["fear+and", 1], ["fear,or", 3], ["(and+fear),or", 2]]) {
    const body = await (await handleSearchRequest(request({ q, mode: "advanced", version: "WEB" }), corpus)).json();
    assert.equal(body.expression, q);
    assert.equal(body.total, exactTotal);
    for (const item of suggestions(body)) {
      const compiled = expressionFor(item.query, item.mode);
      assert.equal(compiled.error, undefined);
      assert.equal(compiled.expression.replace(/[A-Za-z0-9_]+/g, "#"), q.replace(/[A-Za-z0-9_]+/g, "#"));
      const originalWords = q.match(/[A-Za-z0-9_]+/g);
      const changedWords = compiled.expression.match(/[A-Za-z0-9_]+/g);
      assert.equal(changedWords.length, originalWords.length);
      assert.ok(changedWords.every((word, index) => originalWords[index] === "fear" || word === originalWords[index]));
      assert.notEqual(changedWords[originalWords.indexOf("fear")], "fear");
    }
    await assertExecutableSuggestions(body, corpus, { mode: "advanced" });
  }
});

test("case-sensitive searches retain exact case and offer only executable literal-case suggestions", async () => {
  const corpus = source(generalRows);
  const calls = [];
  const body = await (await handleSearchRequest(request({ q: "Fear", case: "true", version: "WEB" }), {
    ...corpus, search: (...args) => { calls.push(args); return corpus.search(...args); },
  })).json();
  assert.equal(body.total, 2);
  assert.equal(body.expression, "Fear");
  assert.ok(body.results.every(item => /\bFear\b/.test(item.text)));
  assert.ok(calls.every(([, version, books, matchCase]) => version === "WEB" && String(books) === "19" && matchCase === true));
  assert.equal(body.related, undefined);
  await assertExecutableSuggestions(body, corpus, { caseSensitive: true });
  assert.equal(isSearchResponse(body), true);
});

test("a word present elsewhere is not offered when its complete replacement query has no matches", async () => {
  const body = await (await handleSearchRequest(request({ q: "fear qzxv", version: "WEB" }), source(generalRows))).json();
  assert.equal(body.total, 0);
  assert.deepEqual(body.relatedSuggestions ?? [], []);
  assert.equal(body.related, undefined);
});

test("edition and book vocabulary cannot offer an out-of-scope word or a word appearing only in WEB notes", async () => {
  const corpus = source([[19, 3, 1, "Fear {dread terror}"], [42, 3, 1, "Dread and terror"]]);
  const body = await (await handleSearchRequest(request({ q: "fear", books: "19", version: "WEB" }), corpus)).json();
  assert.equal(body.total, 1);
  assert.equal(body.results[0].text, "Fear");
  assert.deepEqual(body.relatedSuggestions ?? [], []);
  assert.equal(body.related, undefined);
});

test("switching editions rebuilds the related vocabulary instead of reusing another edition's words", async () => {
  const corpus = createAssetCorpusSource({ fetch: async input => {
    const version = new URL(input.url).pathname.match(/([A-Z]+)\.json$/)[1];
    return Response.json({ schema: 1, version, rows: version === "KJV"
      ? [[19, 3, 1, "Fear"], [19, 3, 2, "Dread"]]
      : [[19, 3, 1, "Fear {dread}"]] });
  } });
  for (const version of ["WEB", "KJV", "WEB"]) {
    const body = await (await handleSearchRequest(request({ q: "fear", version }), corpus)).json();
    assert.equal(body.total, 1);
    assert.equal(body.results[0].version, version);
    if (version === "KJV") {
      assert.ok(suggestions(body).some(item => item.query.toLowerCase() === "dread"));
      assert.equal(body.related.results[0].version, "KJV");
    } else {
      assert.deepEqual(body.relatedSuggestions ?? [], []);
      assert.equal(body.related, undefined);
    }
  }
});

test("unknown words, standalone stopwords, and references do not fabricate related queries", async () => {
  for (const q of ["qzxv", "and", "or", "the", "Proverbs 3:1"]) {
    const body = await (await handleSearchRequest(request({ q, version: "WEB" }), source(generalRows))).json();
    assert.deepEqual(body.relatedSuggestions ?? [], [], q);
    assert.equal(body.related, undefined, q);
  }
});

test("candidate verification uses one batched secondary lookup even without source vocabulary", async () => {
  const corpus = source(generalRows);
  const calls = [];
  const body = await (await handleSearchRequest(request({ q: "fear peace", mode: "all", version: "WEB" }), {
    search: (...args) => { calls.push(args); return corpus.search(...args); }, chapter: corpus.chapter,
  })).json();
  suggestions(body);
  assert.equal(calls.length, 2, "Use one exact lookup and one combined candidate lookup");
  assert.ok(calls.every(([, version, books, matchCase]) => version === "WEB" && String(books) === "19" && matchCase === false));
  await assertExecutableSuggestions(body, corpus);
});

test("failure of the optional vocabulary lookup keeps exact results available", async () => {
  const body = await (await handleSearchRequest(request({ q: "fear", version: "WEB" }), {
    ...source(generalRows), vocabulary: async () => { throw new Error("Vocabulary unavailable"); },
  })).json();
  assert.equal(body.total, 2);
  assert.equal(body.expression, "fear");
  assert.equal(isSearchResponse(body), true);
});

test("canceling while scope vocabulary loads propagates cancellation", async () => {
  const controller = new AbortController();
  const corpus = source(generalRows);
  const input = new Request(request({ q: "fear", version: "WEB" }), { signal: controller.signal });
  await assert.rejects(handleSearchRequest(input, { ...corpus, vocabulary: async () => {
    controller.abort();
    return new Set(["fear", "dread"]);
  } }), error => error.name === "AbortError");
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
  delete oldResponse.relatedSuggestions;
  assert.equal(isSearchResponse(oldResponse), true);
});

test("client validation bounds and validates structured related-query suggestions", async () => {
  const body = await (await handleSearchRequest(request(), source())).json();
  const valid = { label: "wise", query: "wise", mode: "all" };
  assert.equal(isSearchResponse({ ...body, relatedSuggestions: [valid] }), true);
  for (const relatedSuggestions of [null, {}, [{}], [{ ...valid, label: null }], [{ ...valid, query: "" }],
    [{ ...valid, query: 12 }], [{ ...valid, mode: "unknown" }], [valid, valid],
    ["wise", "mercy", "hope", "fear", "peace", "pray", "trust"].map(query => ({ ...valid, query }))]) {
    assert.equal(isSearchResponse({ ...body, relatedSuggestions }), false, JSON.stringify(relatedSuggestions));
  }
});
