import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { SearchExample } from "../../app/search/types";

async function toggleBooks(page: Page, names: string[]) {
  const picker = page.getByRole("complementary", { name: "Book selection", exact: true });
  if (!await picker.isVisible()) await page.getByRole("button", { name: /Choose books:/ }).click();
  for (const name of names) await picker.getByRole("button", { name, exact: true }).click();
  const done = picker.getByRole("button", { name: "Done", exact: true });
  if (await done.isVisible()) await done.click();
}

function relatedVerses(version: string) {
  return [
    { ref: "Proverbs 1:5", book: "Proverbs", chapter: 1, verse: 5, text: "A wise man will hear.", version },
    { ref: "Proverbs 1:6", book: "Proverbs", chapter: 1, verse: 6, text: "Walk wisely.", version },
    { ref: "Proverbs 1:7", book: "Proverbs", chapter: 1, verse: 7, text: "The wise seek counsel.", version },
  ];
}

async function installFixtures(page: Page, emptyExact = false, relatedSuggestions?: SearchExample[]) {
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
        ...(relatedSuggestions === undefined ? {} : { relatedSuggestions }),
      } });
    }
    const results = query === "wise wisely" || query === "wise" ? relatedVerses(version).filter(verse => query !== "wise" || /\bwise\b/i.test(verse.text)) : [{
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

const structuredScenarios = [
  { mode: "all", query: "wisdom mercy", expression: "wisdom+mercy", replacement: "wise mercy", replacementExpression: "wise+mercy", caseSensitive: true },
  { mode: "any", query: "wisdom mercy", expression: "wisdom,mercy", replacement: "wise mercy", replacementExpression: "wise,mercy", caseSensitive: false },
  { mode: "advanced", query: "(wisdom+mercy),grace", expression: "(wisdom+mercy),grace", replacement: "(wise+mercy),grace", replacementExpression: "(wise+mercy),grace", caseSensitive: false },
] as const;

async function installStructuredFixture(page: Page, scenario: typeof structuredScenarios[number]) {
  await page.route("**/api/search?**", route => {
    const params = new URL(route.request().url()).searchParams;
    const original = params.get("q") === scenario.query;
    const version = params.get("version") ?? "KJV";
    const total = original ? 21 : 1;
    return route.fulfill({ json: {
      results: [{ ref: "Proverbs 3:21", book: "Proverbs", chapter: 3, verse: 21, version,
        text: original ? "wisdom brings mercy and grace." : "wise words bring mercy and grace." }],
      total, page: original ? Number(params.get("page") ?? 1) : 1,
      pageSize: 20, totalPages: original ? 2 : 1, source: "Fixture corpus",
      selectedBookCount: params.get("books")?.split(",").length ?? 66,
      expression: original ? scenario.expression : scenario.replacementExpression,
      bookCounts: [{ bookId: 19, count: total }],
      relatedSuggestions: original ? [{ label: "wisdom → wise", query: scenario.replacement, mode: scenario.mode }] : [],
    } });
  });
}

for (const scenario of structuredScenarios) {
  test(`structured related query preserves ${scenario.mode} conditions and completed settings`, async ({ page }) => {
    await installStructuredFixture(page, scenario);
    await page.setViewportSize(scenario.mode === "any" ? { width: 1440, height: 1000 } : { width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    const location = new URLSearchParams({ q: scenario.query, mode: scenario.mode, version: "KJV", books: "19,42", page: "2", case: String(scenario.caseSensitive) });
    await page.goto(`/?${location}`);
    await expect(page.locator(".pagination")).toContainText("Page 2 of 2");
    const related = page.getByRole("region", { name: "Related words", exact: true });
    const chip = related.getByRole("button", { name: `Search related query: ${scenario.replacement} (wisdom → wise)`, exact: true });
    await expect(chip).toHaveText("wisdom → wise");
    await expect(chip).toBeInViewport();
    await expect(related.locator("details")).toHaveCount(0);
    await expect(page.locator(".reading-list > .result-card")).toHaveCount(1);
    const output = process.env.MBAB_SCREENSHOTS;
    if (output) {
      await mkdir(output, { recursive: true });
      await page.screenshot({ path: join(output, `related-suggestions-${scenario.mode}.png`) });
    }
    await page.locator("#query").fill("peace hope");
    await page.locator("#version").selectOption("WEB");
    await page.getByRole("button", { name: scenario.mode === "advanced" ? "All words" : "Advanced", exact: true }).click();
    await page.getByRole("checkbox", { name: "Match case", exact: true }).setChecked(!scenario.caseSensitive);
    await toggleBooks(page, ["John", "Job"]);
    await chip.focus();
    await expect(chip).toBeFocused();
    const requested = page.waitForRequest(request => {
      const url = new URL(request.url());
      return url.pathname === "/api/search" && url.searchParams.get("q") === scenario.replacement;
    });
    await chip.press("Enter");
    expect(Object.fromEntries(new URL((await requested).url()).searchParams)).toMatchObject({
      q: scenario.replacement, mode: scenario.mode, version: "KJV", books: "19,42", page: "1", case: String(scenario.caseSensitive),
    });
    await expect(page.locator("#query")).toHaveValue(scenario.replacement);
    await expect(page.locator("#version")).toHaveValue("KJV");
    await expect(page.locator(".expression code")).toHaveText(scenario.replacementExpression);
    await expect(related).toHaveCount(0);
    await expect(page.locator("#results-heading")).toBeFocused();
  });
}

test("explicit empty suggestions suppress legacy chips while keeping the optional preview", async ({ page }) => {
  await installFixtures(page, false, []);
  await page.goto("/?q=wisdom&version=KJV");
  await expect(page.locator("#results-heading")).toHaveText("21 verses found");
  const related = page.getByRole("region", { name: "Related words", exact: true });
  await expect(related.locator(".related-term")).toHaveCount(0);
  await expect(related.locator("details")).not.toHaveAttribute("open");
  await related.locator("summary").click();
  await expect(related.locator(".result-card").first()).toBeVisible();
  await expect(page.locator(".reading-list > .result-card")).toHaveCount(20);
});

test("provided suggestions take precedence over legacy terms and choose the server mode", async ({ page }) => {
  await installFixtures(page, false, [{ label: "wise", query: "wise", mode: "all" }]);
  await page.goto("/?q=wisdom&mode=any&version=KJV");
  const related = page.getByRole("region", { name: "Related words", exact: true });
  await expect(related.locator(".related-term")).toHaveCount(1);
  const chip = related.getByRole("button", { name: "Search related query: wise", exact: true });
  await expect(chip).toHaveText("wise");
  await expect(related.locator("details")).not.toHaveAttribute("open");
  const requested = page.waitForRequest(request => {
    const url = new URL(request.url());
    return url.pathname === "/api/search" && url.searchParams.get("q") === "wise";
  });
  await chip.click();
  expect(Object.fromEntries(new URL((await requested).url()).searchParams)).toMatchObject({ q: "wise", mode: "all", version: "KJV", page: "1" });
  await expect(page.getByRole("button", { name: "All words", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".reading-list > .result-card")).toHaveCount(2);
});

test("a failed related query keeps exact results and does not focus an unchanged heading", async ({ page }) => {
  const scenario = structuredScenarios[0];
  await installStructuredFixture(page, scenario);
  await page.route("**/api/search?**", route => new URL(route.request().url()).searchParams.get("q") === scenario.replacement
    ? route.fulfill({ json: {} }) : route.fallback());
  const location = new URLSearchParams({ q: scenario.query, mode: scenario.mode, version: "KJV", books: "19,42", page: "2", case: "true" });
  await page.goto(`/?${location}`);
  const chip = page.getByRole("button", { name: `Search related query: ${scenario.replacement} (wisdom → wise)`, exact: true });
  await chip.focus();
  await chip.press("Enter");
  await expect(page.getByRole("alert")).toContainText("unreadable response");
  await expect(page.locator("#results-heading")).toHaveText("21 verses found");
  await expect(page.locator("#results-heading")).not.toBeFocused();
  await expect(chip).toBeEnabled();
  await expect(page.locator(".expression code")).toHaveText(scenario.expression);
  await expect(page.locator(".pagination")).toContainText("Page 2 of 2");
});

test("Entire Bible is the default and related words are available above exact matches", async ({ page }) => {
  await installFixtures(page);
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Choose books: Entire Bible (66/66)", exact: true })).toContainText("Entire Bible");
  await page.locator("#query").fill("wisdom");
  await page.locator("#query").press("Enter");
  await expect(page.locator("#results-heading")).toHaveText("21 verses found");
  await expect(page.locator(".results-head .eyebrow")).toContainText("Entire Bible");
  const related = page.getByRole("region", { name: "Related words", exact: true });
  const preview = related.locator("details");
  const wise = related.getByRole("button", { name: "Search related query: wise", exact: true });
  await expect(related).toBeInViewport();
  await expect(wise).toBeInViewport();
  await expect(related.getByRole("button", { name: "Search related query: wisely", exact: true })).toBeVisible();
  await expect(preview).not.toHaveAttribute("open");
  await expect(preview.locator("summary")).toContainText("Preview verses");
  await expect(preview.locator("summary")).toContainText("7 verses");
  await expect(preview.locator(".result-card").first()).not.toBeVisible();
  await expect(page.locator(".reading-list > .result-card")).toHaveCount(20);
  expect(await related.evaluate(element => Boolean(element.compareDocumentPosition(document.querySelector(".book-overview")!) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
  expect(await related.evaluate(element => Boolean(element.compareDocumentPosition(document.querySelector(".reading-list")!) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
  const output = process.env.MBAB_SCREENSHOTS;
  if (output) {
    await mkdir(output, { recursive: true });
    await page.screenshot({ path: join(output, "related-words-desktop.png") });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(related).toBeInViewport();
  await expect(wise).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  if (output) await page.screenshot({ path: join(output, "related-words-mobile.png") });
  await wise.focus();
  await expect(wise).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(related.getByRole("button", { name: "Search related query: wisely", exact: true })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(preview.locator("summary")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(preview).toHaveAttribute("open", "");
  await expect(preview.locator(".result-card").first()).toBeVisible();
  await expect(preview.locator("mark")).toHaveText(["wise", "wisely", "wise"]);
  await page.locator(".book-overview > summary").click();
  await expect(page.getByText("Choose a book to narrow results.", { exact: true })).toBeVisible();
});

test("related Read, Copy, Save, and search use the submitted edition and book scope", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await installFixtures(page);
  await page.goto("/?q=wisdom&version=KJV&books=19,42");
  await expect(page.locator("#results-heading")).toHaveText("21 verses found");
  await page.locator("#query").fill("peace");
  await page.locator("#version").selectOption("WEB");
  const related = page.getByRole("region", { name: "Related words", exact: true });
  await related.locator("details > summary").click();
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

test("a direct related term on page two preserves completed settings and starts at page one", async ({ page }) => {
  await installFixtures(page);
  await page.goto("/?q=wisdom&version=KJV&books=19,42&page=2");
  await expect(page.locator(".pagination")).toContainText("Page 2 of 2");
  const related = page.getByRole("region", { name: "Related words", exact: true });
  const wise = related.getByRole("button", { name: "Search related query: wise", exact: true });
  await expect(related).toBeInViewport();
  await expect(wise).toBeInViewport();
  await page.locator("#query").fill("peace");
  await page.locator("#version").selectOption("WEB");
  await toggleBooks(page, ["John", "Job"]);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(wise).toBeInViewport();
  await expect(related.locator("details")).not.toHaveAttribute("open");
  await wise.focus();
  await expect(wise).toBeFocused();
  const requested = page.waitForRequest(request => {
    const url = new URL(request.url());
    return url.pathname === "/api/search" && url.searchParams.get("q") === "wise";
  });
  await wise.press("Enter");
  const params = new URL((await requested).url()).searchParams;
  expect(Object.fromEntries(params)).toMatchObject({ q: "wise", mode: "any", version: "KJV", books: "19,42", page: "1", case: "false" });
  await expect(page.locator("#query")).toHaveValue("wise");
  await expect(page.locator("#version")).toHaveValue("KJV");
  await expect(page.getByRole("button", { name: "Choose books: 2 books (2/66)", exact: true })).toBeVisible();
  await expect(page.locator(".expression code")).toHaveText("wise");
  await expect(page.locator(".reading-list > .result-card")).toHaveCount(2);
  await expect(related).toHaveCount(0);
});

test("a new submitted scope or edition closes the related preview", async ({ page }) => {
  await installFixtures(page);
  await page.goto("/?q=wisdom&version=KJV&books=19,42");
  const related = page.locator(".related-preview");
  await related.locator("summary").click();
  await toggleBooks(page, ["John", "Job"]);
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
  await page.locator(".related-preview > summary").click();
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
  expect(payload.related.terms.length).toBeGreaterThan(0);
  expect(new Set(payload.related.terms).size).toBe(payload.related.terms.length);
  for (const term of payload.related.terms) expect(term).toMatch(/^[a-z]+$/);
  expect(payload.related.total).toBeGreaterThanOrEqual(3);
  expect(payload.related.results).toHaveLength(3);
  expect(new Set(payload.related.results.map((verse: { ref: string }) => verse.ref)).size).toBe(3);
  expect(payload.relatedSuggestions.length).toBeGreaterThan(0);
  const firstSuggestion = payload.relatedSuggestions[0] as SearchExample;
  expect(payload.related.terms).toContain(firstSuggestion.query.toLowerCase());
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
  const related = page.getByRole("region", { name: "Related words", exact: true });
  await expect(related).toBeInViewport();
  await expect(related.getByRole("button", { name: `Search related query: ${firstSuggestion.query}`, exact: true })).toBeInViewport();
  const preview = related.locator("details");
  await expect(preview).not.toHaveAttribute("open");
  await expect(preview.locator("summary")).toContainText(`${payload.related.total.toLocaleString()} verses`);
  await preview.locator("summary").click();
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

test("real Jesus search keeps page two and puts related searches within reach", async ({ page, request }) => {
  const path = "/?q=jesus&mode=all&version=KJV&page=2";
  const response = await request.get("/api/search?q=jesus&version=KJV&page=2");
  expect(response.status()).toBe(200);
  const payload = await response.json();
  expect(payload.page).toBe(2);
  expect(payload.total).toBe(942);
  expect(payload.selectedBookCount).toBe(66);
  expect(payload.results).toHaveLength(20);
  for (const verse of payload.results) {
    expect(verse.version).toBe("KJV");
    expect(verse.text).toMatch(/\bjesus\b/i);
  }
  const suggestions = payload.relatedSuggestions as SearchExample[];
  expect(suggestions.length).toBeGreaterThan(0);
  const christ = suggestions.find(suggestion => suggestion.query.toLowerCase() === "christ");
  expect(christ).toMatchObject({ label: "christ", query: "christ", mode: "all" });
  await Promise.all(suggestions.map(async suggestion => {
    expect(suggestion.query).toMatch(/^[a-z]+$/);
    expect(suggestion.mode).toBe("all");
    const params = new URLSearchParams({ q: suggestion.query, mode: suggestion.mode, version: "KJV" });
    const suggestedResponse = await request.get(`/api/search?${params}`);
    expect(suggestedResponse.status()).toBe(200);
    const suggested = await suggestedResponse.json();
    expect(suggested.total).toBeGreaterThan(0);
    expect(suggested.selectedBookCount).toBe(66);
    for (const verse of suggested.results) {
      expect(verse.version).toBe("KJV");
      expect(verse.text).toMatch(new RegExp(`\\b${suggestion.query}\\b`, "i"));
    }
  }));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(path);
  await expect(page.locator("#results-heading")).toHaveText(`${payload.total.toLocaleString()} verses found`);
  await expect(page.locator(".pagination")).toContainText("Page 2");
  const related = page.getByRole("region", { name: "Related words", exact: true });
  await expect(related).toBeInViewport();
  await expect(page.locator(".reading-list .result-ref").first()).toContainText(payload.results[0].ref);
  const output = process.env.MBAB_SCREENSHOTS;
  if (output) {
    await mkdir(output, { recursive: true });
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: join(output, "mbab-jesus-desktop.png") });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await related.scrollIntoViewIfNeeded();
  const christButton = related.getByRole("button", { name: `Search related query: ${christ!.query}`, exact: true });
  await expect(christButton).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  if (output) await page.screenshot({ path: join(output, "mbab-jesus-mobile.png") });
  await christButton.click();
  await expect(page.locator("#query")).toHaveValue(christ!.query);
  await expect(page).toHaveURL(url => url.searchParams.get("q") === christ!.query
    && url.searchParams.get("mode") === christ!.mode && url.searchParams.get("version") === "KJV" && url.searchParams.get("page") === "1");
  await expect(page.locator(".results-head .eyebrow")).toHaveText("KJV · Entire Bible");
  await expect(page.locator(".reading-list blockquote").first()).toContainText(/\bChrist\b/i);
});

test("real corpus expands happiness and preserves a multiword search", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const scenarios = [
    { query: "happiness", replacement: "happy", label: "happy", accessibleName: "Search related query: happy", expression: "happy", words: ["happy"] },
    { query: "happiness mercy", replacement: "happy mercy", label: "happiness → happy", accessibleName: "Search related query: happy mercy (happiness → happy)", expression: "happy+mercy", words: ["happy", "mercy"] },
  ];
  for (const [index, scenario] of scenarios.entries()) {
    const originalResponse = page.waitForResponse(response => {
      const url = new URL(response.url());
      return url.pathname === "/api/search" && url.searchParams.get("q") === scenario.query;
    });
    if (index === 0) {
      const params = new URLSearchParams({ q: scenario.query, mode: "all", version: "KJV", books: "19", page: "1", case: "false" });
      await page.goto(`/?${params}`);
    } else {
      await page.locator("#query").fill(scenario.query);
      await page.locator("#query").press("Enter");
    }
    const original = await originalResponse;
    expect(original.status()).toBe(200);
    const exact = await original.json();
    expect(exact.total).toBe(0);
    expect(exact.selectedBookCount).toBe(1);
    expect(exact.relatedSuggestions).toContainEqual({ label: scenario.label, query: scenario.replacement, mode: "all" });
    await expect(page.locator("#results-heading")).toHaveText("0 verses found");
    await expect(page.locator(".empty-state")).toHaveText("No exact matches.");
    const chip = page.getByRole("button", { name: scenario.accessibleName, exact: true });
    await expect(chip).toHaveText(scenario.label);
    await expect(chip).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const output = process.env.MBAB_SCREENSHOTS;
    if (output) {
      await mkdir(output, { recursive: true });
      await page.screenshot({ path: join(output, index === 0 ? "related-words-happiness-mobile.png" : "related-words-multiword-mobile.png") });
    }
    const selectedResponse = page.waitForResponse(response => {
      const url = new URL(response.url());
      return url.pathname === "/api/search" && url.searchParams.get("q") === scenario.replacement;
    });
    await chip.focus();
    await chip.press("Enter");
    const response = await selectedResponse;
    expect(response.status()).toBe(200);
    expect(Object.fromEntries(new URL(response.request().url()).searchParams)).toMatchObject({
      q: scenario.replacement, mode: "all", version: "KJV", books: "19", page: "1", case: "false",
    });
    const selected = await response.json();
    expect(selected.total).toBeGreaterThan(0);
    expect(selected.selectedBookCount).toBe(1);
    expect(selected.expression).toBe(scenario.expression);
    for (const verse of selected.results) {
      expect(verse.book).toBe("Proverbs");
      expect(verse.version).toBe("KJV");
      for (const word of scenario.words) expect(verse.text).toMatch(new RegExp(`\\b${word}\\b`, "i"));
    }
    await expect(page.locator("#query")).toHaveValue(scenario.replacement);
    await expect(page.locator("#version")).toHaveValue("KJV");
    await expect(page.getByRole("button", { name: "All words", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("button", { name: "Choose books: Proverbs (1/66)", exact: true })).toBeVisible();
    await expect(page.locator(".expression code")).toHaveText(scenario.expression);
    await expect(page.locator("#results-heading")).toHaveText(`${selected.total.toLocaleString()} ${selected.total === 1 ? "verse" : "verses"} found`);
    await expect(page.locator("#results-heading")).toBeFocused();
    await expect(page.locator(".reading-list blockquote")).toHaveText(selected.results.map((verse: { text: string }) => verse.text));
  }
});
