import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

let server;
let browserState;
let query;
let HighlightedText;
const savedVerse = {
  ref: "John 3:16", book: "John", chapter: 3, verse: 16,
  text: "For God so loved the world", version: "KJV",
};

before(async () => {
  server = await createServer({
    configFile: false, cacheDir: "node_modules/.vite-tests",
    resolve: { alias: { "@": fileURLToPath(new URL("../", import.meta.url)) } },
    server: { middlewareMode: true, hmr: false, ws: false },
  });
  browserState = await server.ssrLoadModule("/app/search/browser-storage.ts");
  query = await server.ssrLoadModule("/app/search/query.ts");
  ({ HighlightedText } = await server.ssrLoadModule("/app/components/search/HighlightedText.tsx"));
  globalThis.matchMedia = () => ({ matches: false });
  globalThis.document = { documentElement: { dataset: {} } };
});

after(async () => {
  await server.close();
  for (const key of ["localStorage", "window", "matchMedia", "document"]) delete globalThis[key];
});

function withBrowser(search, items = {}) {
  globalThis.window = { location: { search } };
  const storage = new Map(Object.entries(items));
  globalThis.localStorage = {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: key => storage.delete(key),
  };
}

test("shared links restore every setting needed to reproduce a search", () => {
  withBrowser("?q=love&mode=any&version=WEB&books=43,42,42&case=true&page=2");
  const state = browserState.readInitialBrowserState();
  assert.equal(state.query, "love");
  assert.equal(state.mode, "any");
  assert.equal(state.version, "WEB");
  assert.deepEqual(state.bookIds, [42, 43]);
  assert.equal(state.caseSensitive, true);
  assert.equal(state.page, 2);
});

test("malformed page numbers fall back to the first page", () => {
  for (const page of ["-1", "2.5", "2garbage", "Infinity", "9007199254740992"]) {
    withBrowser(`?q=love&page=${page}`);
    assert.equal(browserState.readInitialBrowserState().page, 1);
  }
});

test("explicitly empty or invalid book scopes never silently widen the search", () => {
  for (const books of ["", "42,", "42,nope", "66", "-1", "4e1"]) {
    withBrowser(`?q=love&books=${books}`);
    assert.deepEqual(browserState.readInitialBrowserState().bookIds, []);
    assert.equal(query.parseBookIds(books), null);
  }
  assert.equal(query.parseBookIds(null).length, 66);
});

test("blocked storage still allows shared-search restoration and theme changes", () => {
  withBrowser("?q=grace&case=true");
  for (const key of ["getItem", "setItem", "removeItem"]) {
    globalThis.localStorage[key] = () => { throw new Error("Storage blocked"); };
  }
  assert.doesNotThrow(() => browserState.readInitialBrowserState());
  assert.equal(browserState.readInitialBrowserState().query, "grace");
  assert.doesNotThrow(() => browserState.applyTheme(true));
  assert.equal(document.documentElement.dataset.theme, "dark");
  assert.equal(browserState.storeSavedVerses([savedVerse]), false);
});

test("saved verses ignore corrupt records and duplicates while preserving valid text", () => {
  withBrowser("", {
    "mbab:saved-verses": JSON.stringify([null, {}, { ...savedVerse, text: 12 }, savedVerse, savedVerse]),
  });
  assert.deepEqual(browserState.readInitialBrowserState().saved, [savedVerse]);
  assert.equal(browserState.storeSavedVerses([savedVerse]), true);
  assert.deepEqual(JSON.parse(localStorage.getItem("mbab:saved-verses")), [savedVerse]);
});

test("case-sensitive highlighting marks only matching whole words", () => {
  const html = renderToStaticMarkup(createElement(HighlightedText, {
    text: "Love loved love beloved", query: "love", caseSensitive: true,
  }));
  assert.equal(html, "Love loved <mark>love</mark> beloved");
});

test("reference lookups do not highlight incidental book names or verse numbers", () => {
  const html = renderToStaticMarkup(createElement(HighlightedText, {
    text: "John spoke 3 times.", query: "John 3:16", caseSensitive: false,
  }));
  assert.equal(html, "John spoke 3 times.");
});
