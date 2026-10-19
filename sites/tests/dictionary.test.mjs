import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { readFile } from "node:fs/promises";
import { createServer } from "vite";

let server, dictionary;
const nativeFetch = globalThis.fetch;
let requests;
before(async () => {
  server = await createServer({ configFile: false, cacheDir: "node_modules/.vite-dictionary-tests", server: { middlewareMode: true, hmr: false, ws: false } });
  dictionary = await server.ssrLoadModule("/app/search/dictionary.ts");
});
after(async () => { globalThis.fetch = nativeFetch; await server?.close(); });
beforeEach(() => {
  requests = [];
  dictionary.clearDictionaryCache();
  globalThis.fetch = async (url, options) => {
    options.signal.throwIfAborted();
    const path = new URL(url, "https://mbab.test").pathname;
    requests.push(path);
    return new Response(await readFile(new URL(`../public${path}`, import.meta.url)));
  };
});

test("real dictionary gives all wisdom senses, usage examples and grammatical categories", async () => {
  const entry = await dictionary.lookupDictionary(" Wisdom ", new AbortController().signal);
  assert.equal(entry.word, "wisdom");
  assert.equal(entry.senses.length, 5);
  assert.ok(entry.senses.every(sense => sense.pos === "noun" && sense.definition));
  assert.ok(entry.senses.some(sense => /judgment|judgement|knowledge/.test(sense.definition)));
  assert.deepEqual(requests, ["/dictionary/manifest.json", "/dictionary/w.json"]);
  const love = await dictionary.lookupDictionary("love", new AbortController().signal);
  assert.ok(love.senses.some(sense => sense.examples.length));
});

test("phrases, punctuation, irregular forms and archaic Bible verb endings work without a provider", async () => {
  const lookup = word => dictionary.lookupDictionary(word, new AbortController().signal);
  assert.equal((await lookup("Holy Spirit")).senses.length, 1);
  assert.equal((await lookup("god’s will")).word, "god's will");
  const went = await lookup("went");
  assert.equal(went.word, "go");
  assert.ok(went.senses.some(sense => sense.pos === "verb"));
  assert.equal((await lookup("loveth")).word, "love");
  for (const [form, base] of [["hath", "have"], ["doth", "do"], ["saith", "say"], ["runneth", "run"], ["sinneth", "sin"], ["sitteth", "sit"], ["runnest", "run"]]) {
    const entry = await lookup(form);
    assert.equal(entry.word, base, `${form} resolves to ${base}`);
    assert.ok(entry.senses.every(sense => sense.pos === "verb"), `${form} retains verb senses only`);
  }
  assert.equal((await lookup("blesseth")).word, "bless");
  assert.equal((await lookup("pearreth")).senses.length, 0);
  assert.equal((await lookup("runnestnever")).senses.length, 0);
  assert.equal((await lookup("saw")).word, "saw");
  assert.ok((await lookup("on/off switch")).senses.length);
  assert.ok((await lookup("1")).senses.length);
  const does = await lookup("does");
  assert.ok([does.word, ...does.alternatives].includes("do"));
  assert.ok([does.word, ...does.alternatives].includes("doe"));
  assert.ok((await lookup("sang")).alternatives.includes("sing"));
  assert.ok(requests.every(path => path.startsWith("/dictionary/")));
});

test("unknown words stay empty with only genuine dictionary spelling suggestions", async () => {
  const result = await dictionary.lookupDictionary("wisdm", new AbortController().signal);
  assert.equal(result.senses.length, 0);
  assert.ok(result.suggestions.includes("wisdom"));
  assert.equal((await dictionary.lookupDictionary("mbabneverword", new AbortController().signal)).senses.length, 0);
});

test("asset corruption fails safely, is not cached, and a valid retry succeeds", async () => {
  const valid = globalThis.fetch;
  const cacheModes = [];
  globalThis.fetch = async (url, options) => {
    if (url.startsWith("/dictionary/w.json")) {
      cacheModes.push(options.cache);
      if (options.cache !== "reload") return new Response('{"schema":1}');
    }
    return valid(url, options);
  };
  await assert.rejects(dictionary.lookupDictionary("wisdom", new AbortController().signal), /dictionary/i);
  assert.equal((await dictionary.lookupDictionary("wisdom", new AbortController().signal)).senses.length, 5);
  assert.deepEqual(cacheModes, ["force-cache", "reload"]);
  await dictionary.lookupDictionary("wisdom", new AbortController().signal);
  assert.equal(cacheModes.length, 2);
});

test("cancelling a download cannot poison a replacement dictionary lookup", async () => {
  const valid = globalThis.fetch;
  let first = true;
  globalThis.fetch = (url, options) => {
    if (!first) return valid(url, options);
    first = false;
    return new Promise((_resolve, reject) => options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true }));
  };
  const previous = new AbortController();
  const rejected = assert.rejects(dictionary.lookupDictionary("wisdom", previous.signal), /abort/i);
  previous.abort();
  assert.equal((await dictionary.lookupDictionary("wisdom", new AbortController().signal)).senses.length, 5);
  await rejected;
});
