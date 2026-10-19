import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

function relatedVerses(version: string) {
  return [
    { ref: "Proverbs 1:5", book: "Proverbs", chapter: 1, verse: 5, text: "A wise man will hear.", version },
    { ref: "Proverbs 1:6", book: "Proverbs", chapter: 1, verse: 6, text: "Walk wisely.", version },
    { ref: "Proverbs 1:7", book: "Proverbs", chapter: 1, verse: 7, text: "The wise seek counsel.", version },
  ];
}

async function installFixtures(page: Page, emptyExact = false) {
  await page.route("**/api/search?**", route => {
    const params = new URL(route.request().url()).searchParams;
    const query = params.get("q") ?? "";
    const version = params.get("version") ?? "KJV";
    const pageNumber = Number(params.get("page") ?? 1);
    const selectedBookCount = params.get("books")?.split(",").length ?? 66;
    const common = { page: pageNumber, pageSize: 20, selectedBookCount, source: "Fixture corpus" };
    if (query.toLowerCase() === "wisdom") {
      const total = emptyExact ? 0 : 21;
      const first = (pageNumber - 1) * 20;
      const results = Array.from({ length: Math.min(20, Math.max(0, total - first)) }, (_, index) => ({
        ref: `Proverbs 3:${first + index + 1}`, book: "Proverbs", chapter: 3, verse: first + index + 1,
        text: "Wisdom guides the heart.", version,
      }));
      return route.fulfill({ json: {
        ...common, results, total, totalPages: total ? 2 : 1, expression: query,
        bookCounts: total ? [{ bookId: 19, count: total }] : [],
        related: { terms: ["wise", "wisely"], total: 7, results: relatedVerses(version) },
      } });
    }
    const results = query === "wise wisely" ? relatedVerses(version) : [{
      ref: "Proverbs 3:1", book: "Proverbs", chapter: 3, verse: 1, text: "Mercy endures.", version,
    }];
    return route.fulfill({ json: {
      ...common, page: 1, results, total: results.length, totalPages: 1,
      expression: query === "wise wisely" ? "wise,wisely" : query,
      bookCounts: [{ bookId: 19, count: results.length }],
    } });
  });
  await page.route("**/api/chapter?**", route => route.fulfill({ json: {
    book: "Proverbs", chapter: 1, version: "KJV",
    verses: relatedVerses("KJV").map(({ verse, text }) => ({ verse, text })),
  } }));
}

test("Entire Bible is the default and related words follow exact results and pagination quietly", async ({ page }) => {
  await installFixtures(page);
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Choose books: Entire Bible (66/66)", exact: true })).toContainText("Entire Bible");
  await page.locator("#query").fill("wisdom");
  await page.locator("#query").press("Enter");
  await expect(page.locator("#results-heading")).toHaveText("21 verses found");
  await expect(page.locator(".results-head .eyebrow")).toContainText("Entire Bible");
  const related = page.locator(".related-words");
  await expect(related).not.toHaveAttribute("open");
  await expect(related.locator("summary")).toContainText("wise, wisely");
  await expect(related.locator("summary")).toContainText("7 verses");
  await expect(page.locator(".reading-list > .result-card")).toHaveCount(20);
  expect(await related.evaluate(element => Boolean(document.querySelector(".pagination")!.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
  await related.locator("summary").focus();
  await page.keyboard.press("Enter");
  await expect(related.locator(".result-card")).toHaveCount(3);
  await expect(related.locator("mark")).toHaveText(["wise", "wisely", "wise"]);
  await page.locator(".book-overview > summary").click();
  await expect(page.getByText("Choose a book to narrow results.", { exact: true })).toBeVisible();
  const output = process.env.MBAB_SCREENSHOTS;
  if (output) {
    await mkdir(output, { recursive: true });
    await related.scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(output, "related-words-desktop.png") });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await related.scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  if (output) await page.screenshot({ path: join(output, "related-words-mobile.png") });
});

test("related Read, Copy, Save, and search use the submitted edition and book scope", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await installFixtures(page);
  await page.goto("/?q=wisdom&version=KJV&books=19,42");
  await expect(page.locator("#results-heading")).toHaveText("21 verses found");
  await page.locator("#query").fill("peace");
  await page.locator("#version").selectOption("WEB");
  const related = page.locator(".related-words");
  await related.locator("summary").click();
  const first = related.locator(".result-card").first();
  const read = first.getByRole("button", { name: "Read in context", exact: true });
  await read.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator(".reader-verse.current")).toContainText("A wise man will hear.");
  await expect(dialog.locator(".reader-verse.current mark")).toHaveText("wise");
  await dialog.getByRole("button", { name: "Close reader", exact: true }).click();
  await expect(read).toBeFocused();
  await first.getByRole("button", { name: "Copy", exact: true }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe("Proverbs 1:5 (KJV) — A wise man will hear.");
  await first.getByRole("button", { name: "Save", exact: true }).click();
  await expect(first.getByRole("button", { name: "Saved", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".count-badge")).toHaveText("1");
  const requested = page.waitForRequest(request => new URL(request.url()).pathname === "/api/search");
  await related.getByRole("button", { name: "Search related words", exact: true }).click();
  const params = new URL((await requested).url()).searchParams;
  expect(Object.fromEntries(params)).toMatchObject({ q: "wise wisely", mode: "any", version: "KJV", books: "19,42", page: "1", case: "false" });
  await expect(page.locator(".expression code")).toHaveText("wise,wisely");
  await expect(page.locator("#query")).toHaveValue("wise wisely");
  await expect(page.locator("#version")).toHaveValue("KJV");
  await expect(related).toHaveCount(0);
});

test("a new submitted scope or edition closes the related preview", async ({ page }) => {
  await installFixtures(page);
  await page.goto("/?q=wisdom&version=KJV&books=19,42");
  const related = page.locator(".related-words");
  await related.locator("summary").click();
  await page.getByRole("button", { name: "Choose books: 2 books (2/66)", exact: true }).click();
  await page.getByRole("button", { name: "John", exact: true }).click();
  await page.getByRole("button", { name: "Job", exact: true }).click();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page).toHaveURL(/books=17%2C19/);
  await expect(related).not.toHaveAttribute("open");
  await related.locator("summary").click();
  await page.locator("#version").selectOption("WEB");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.locator(".results-head .eyebrow")).toContainText("WEB");
  await expect(related).not.toHaveAttribute("open");
  await related.locator("summary").click();
  await page.locator("#query").fill("Wisdom");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.locator(".expression code")).toHaveText("Wisdom");
  await expect(related).not.toHaveAttribute("open");
});

test("related-only matches and older cached responses have honest empty states", async ({ page }) => {
  await installFixtures(page, true);
  await page.goto("/?q=wisdom&version=KJV");
  await expect(page.locator("#results-heading")).toHaveText("0 verses found");
  await expect(page.locator(".empty-state")).toHaveText("No exact matches.");
  await page.locator(".related-words > summary").click();
  await expect(page.locator(".related-words .result-card")).toHaveCount(3);
  await page.locator("#query").fill("mercy");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.locator("#results-heading")).toHaveText("1 verse found");
  await expect(page.locator(".related-words")).toHaveCount(0);
  await expect(page.locator(".reading-list > .result-card")).toHaveCount(1);
});

test("real corpus offers distinct related wisdom verses", async ({ page, request }) => {
  const response = await request.get("/api/search?q=wisdom&version=KJV&books=19");
  expect(response.status()).toBe(200);
  const payload = await response.json();
  expect(payload.total).toBeGreaterThan(0);
  expect(payload.results.length).toBeGreaterThan(0);
  expect(payload.related.terms).toContain("wise");
  expect(payload.related.total).toBeGreaterThanOrEqual(3);
  expect(payload.related.results).toHaveLength(3);
  const exactRefs = new Set(payload.results.map((verse: { ref: string }) => verse.ref));
  const relatedWord = new RegExp(`\\b(?:${payload.related.terms.join("|")})\\b`, "i");
  for (const verse of payload.results) {
    expect(verse.book).toBe("Proverbs");
    expect(verse.version).toBe("KJV");
    expect(verse.text).toMatch(/\bwisdom\b/i);
  }
  for (const verse of payload.related.results) {
    expect(verse.book).toBe("Proverbs");
    expect(verse.version).toBe("KJV");
    expect(verse.text).toMatch(relatedWord);
    expect(verse.text).not.toMatch(/\bwisdom\b/i);
    expect(exactRefs.has(verse.ref)).toBe(false);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/?q=wisdom&version=KJV&books=19");
  await expect(page.locator("#results-heading")).toHaveText(`${payload.total.toLocaleString()} verses found`);
  const related = page.locator(".related-words");
  await expect(related).not.toHaveAttribute("open");
  await expect(related.locator("summary")).toContainText(`${payload.related.total.toLocaleString()} verses`);
  await related.locator("summary").click();
  await expect(related.locator(".result-card")).toHaveCount(3);
  await expect(related.locator("blockquote")).toHaveText(payload.related.results.map((verse: { text: string }) => verse.text));
  expect(await related.locator("mark").count()).toBeGreaterThanOrEqual(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const output = process.env.MBAB_SCREENSHOTS;
  if (output) {
    await mkdir(output, { recursive: true });
    await related.scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(output, "related-words-real-mobile.png") });
  }
});
