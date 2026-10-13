import assert from "node:assert/strict";
import test from "node:test";

const { default: worker } = await import(new URL("../dist/server/index.js", import.meta.url));

function request(path) {
  return worker.fetch(
    new Request(`https://mbab.test${path}`),
    { ASSETS: { fetch: async () => new Response("Missing asset", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("the production build server-renders the search page", async () => {
  const response = await request("/");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /^text\/html/);
  const html = await response.text();
  assert.match(html, /mBAB — Multi-Book Advanced Bible Search/);
  assert.match(html, /id="query"/);
  assert.match(html, /Skip to search/);
  assert.doesNotMatch(html, /vite-error-overlay|Internal Server Error/);
});

test("the built API validates searches and resolves excluded references without a network call", async () => {
  for (const path of [
    "/api/search?q=a", "/api/search?q=love&books=",
    "/api/search?q=love&mode=unknown", "/api/search?q=love&version=AMP",
  ]) {
    assert.equal((await request(path)).status, 400, path);
  }
  const response = await request("/api/search?q=John%203%3A16&books=0");
  assert.equal(response.status, 200);
  assert.equal((await response.json()).total, 0);
});

test("the built chapter reader rejects invalid coordinates and unsupported editions", async () => {
  for (const params of ["", "book=Unknown&chapter=3", "book=John&chapter=3oops", "book=John&chapter=3&version=NIV"]) {
    assert.equal((await request(`/api/chapter?${params}`)).status, 400, params);
  }
});
