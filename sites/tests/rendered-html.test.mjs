import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createBuiltWorker } from "./built-worker.mjs";

const worker = createBuiltWorker();
after(() => worker.dispose());

function render(path = "/") {
  return worker.dispatchFetch(`https://mbab.test${path}`, { headers: { accept: "text/html" } });
}

test("server-renders the finished mBAB search experience", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>mBAB — Multi-Book Advanced Bible Search<\/title>/i);
  assert.match(html, /Search the Bible/i);
  assert.match(html, /Words or a verse reference/i);
  assert.match(html, /<details class="search-help"/i);
  assert.match(html, /<details class="[^"]*\bsearch-options\b/i);
  assert.match(html, /All words/i);
  assert.match(html, /Berean Standard Bible/i);
  assert.match(html, /American King James Version/i);
  assert.match(html, /Text credits/i);
  assert.match(html, /og:image/i);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
  assert.doesNotMatch(html, /Find the thread|How mBAB works|A better question leads|query-inspector/i);
});

test("rejects underspecified searches before contacting the corpus", async () => {
  const response = await render("/api/search?q=a");
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.error, "Enter at least two characters.");
});
