import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const contractUrl = new URL("../../contracts/search.json", import.meta.url);

test("the shared search contract is complete and internally consistent", async () => {
  const contract = JSON.parse(await readFile(contractUrl, "utf8"));
  const editionIds = contract.versions.map(({ id }) => id);
  const bookIds = contract.books.map(({ id }) => id);
  const groups = Object.fromEntries(
    contract.groups.map(({ id, book_ids: ids }) => [id, ids]),
  );

  assert.equal(contract.schema_version, 1);
  assert.equal(contract.versions.length, 11);
  assert.equal(contract.books.length, 66);
  assert.equal(new Set(editionIds).size, editionIds.length);
  assert.equal(new Set(bookIds).size, bookIds.length);
  assert.ok(editionIds.includes(contract.default_version));
  assert.deepEqual(groups.all, bookIds);
  assert.deepEqual(
    [...groups.old, ...groups.new],
    groups.all,
  );
});
