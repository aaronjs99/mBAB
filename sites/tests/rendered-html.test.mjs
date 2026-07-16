import assert from "node:assert/strict";
import test from "node:test";

const workerUrl = new URL("../dist/server/index.js", import.meta.url);

async function render(path = "/") {
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request(`https://mbab.test${path}`, { headers: { accept: "text/html" } }),
    {
      ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
    },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the finished mBAB search experience", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>mBAB — Multi-Book Advanced Bible Search<\/title>/i);
  assert.match(html, /Find the thread/i);
  assert.match(html, /What do you want to find\?/i);
  assert.match(html, /All words/i);
  assert.match(html, /Berean Standard Bible/i);
  assert.match(html, /American King James Version/i);
  assert.match(html, /11 open editions/i);
  assert.match(html, /og:image/i);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("rejects underspecified searches before contacting the corpus", async () => {
  const response = await render("/api/search?q=a");
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.error, "Enter at least two characters.");
});
