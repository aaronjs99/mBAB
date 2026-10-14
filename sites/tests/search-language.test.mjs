import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

let server;
let expressionFor;

before(async () => {
  server = await createServer({
    configFile: false, cacheDir: "node_modules/.vite-language-tests",
    resolve: { alias: { "@": fileURLToPath(new URL("../", import.meta.url)) } },
    server: { middlewareMode: true, hmr: false, ws: false },
  });
  ({ expressionFor } = await server.ssrLoadModule("/app/search/query.ts"));
});
after(async () => { await server.close(); });

test("advanced search recognizes textual operators between operands", () => {
  for (const [input, expected] of [
    ["love AND mercy", "love+mercy"],
    ["love or mercy", "love,mercy"],
    ["(love)OR(mercy AND grace)", "(love),(mercy+grace)"],
    ["and OR mercy", "and,mercy"],
  ]) assert.deepEqual(expressionFor(input, "advanced"), { expression: expected });
});

test("operator names stay literal when used as words", () => {
  for (const input of ["and", "or", "AND", "love+and", "love,or", "(and+or)", "love+and+mercy"]) {
    assert.deepEqual(expressionFor(input, "advanced"), { expression: input });
  }
  assert.deepEqual(expressionFor("and or", "all"), { expression: "and+or" });
  assert.deepEqual(expressionFor("and or", "any"), { expression: "and,or" });
});

test("adjacent words and incomplete Boolean expressions are rejected", () => {
  for (const input of ["love mercy+", "love mercy", "love AND", "love OR OR mercy", "love(mercy)", "()", "love+", "(love,mercy"]) {
    assert.ok(expressionFor(input, "advanced").error, input);
  }
});
