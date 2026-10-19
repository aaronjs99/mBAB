import { expect, test, type Page } from "@playwright/test";

async function lookup(page: Page, word: string) {
  const dialog = page.getByRole("dialog", { name: "Dictionary", exact: true });
  await dialog.getByRole("textbox", { name: "Dictionary word" }).fill(word);
  await dialog.getByRole("button", { name: "Look up", exact: true }).click();
  return dialog;
}

test("dictionary loads real local definitions only when requested and restores focus", async ({ page }) => {
  const dictionaryRequests: string[] = [];
  const errors: string[] = [];
  const external: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("request", request => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/dictionary/")) dictionaryRequests.push(url.pathname);
    if (!/^(localhost|127\.0\.0\.1)$/.test(url.hostname)) external.push(url.origin);
  });
  await page.goto("/");
  expect(dictionaryRequests).toEqual([]);
  const open = page.getByRole("button", { name: "Dictionary", exact: true });
  await open.click();
  expect(dictionaryRequests).toEqual([]);
  const dialog = await lookup(page, "wisdom");
  await expect(dialog.getByRole("article", { name: "Meanings of wisdom" })).toBeVisible();
  await expect(dialog.locator(".dictionary-definition")).toHaveCount(5);
  await expect(dialog.locator(".dictionary-definition").filter({ hasText: /judgment|judgement|knowledge/ }).first()).toBeVisible();
  await lookup(page, "love");
  await expect(dialog.getByRole("article", { name: "Meanings of love" })).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "verb", exact: true })).toBeVisible();
  await expect(dialog.locator(".dictionary-example").first()).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(open).toBeFocused();
  expect(dictionaryRequests).toContain("/dictionary/w.json");
  expect(dictionaryRequests).toContain("/dictionary/l.json");
  expect(dictionaryRequests).not.toContain("/dictionary/a.json");
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});

test("dictionary starts from the current word and preserves search page and filters", async ({ page }) => {
  await page.goto("/?q=wisdom&mode=all&version=KJV&page=2");
  await expect(page.locator("#results-heading")).toHaveText(/222 verses found/);
  const original = page.url();
  await page.getByRole("button", { name: "Dictionary", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Dictionary", exact: true });
  await expect(dialog.getByRole("article", { name: "Meanings of wisdom" })).toBeVisible();
  await expect(dialog.getByRole("textbox", { name: "Dictionary word" })).toHaveValue("wisdom");
  await dialog.getByRole("button", { name: "Close dictionary" }).click();
  expect(page.url()).toBe(original);
  await expect(page.locator(".pagination")).toContainText("Page 2 of");
});

test("dictionary handles misspellings, phrases and ambiguous inflections honestly", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Dictionary", exact: true }).click();
  const dialog = await lookup(page, "wisdm");
  await expect(dialog.getByRole("heading", { name: "No entry for “wisdm”" })).toBeVisible();
  await dialog.getByRole("button", { name: "wisdom", exact: true }).click();
  await expect(dialog.getByRole("article", { name: "Meanings of wisdom" })).toBeVisible();
  await lookup(page, "went");
  await expect(dialog.getByRole("article", { name: "Meanings of go" })).toBeVisible();
  await lookup(page, "does");
  await expect(dialog.getByRole("button", { name: "do", exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "do", exact: true }).click();
  await expect(dialog.getByRole("article", { name: "Meanings of do" })).toBeVisible();
  await lookup(page, "Holy Spirit");
  await expect(dialog.getByRole("article", { name: "Meanings of holy spirit" })).toBeVisible();
  await expect(dialog.locator(".dictionary-definition")).toContainText(["the third person in the Trinity"]);
});

test("dictionary failures can retry without losing Bible search results", async ({ page }) => {
  await page.goto("/?q=wisdom&mode=all&version=KJV");
  await expect(page.locator("#results-heading")).toHaveText(/222 verses found/);
  let first = true;
  await page.route("**/dictionary/w.json?**", route => {
    if (first) { first = false; return route.fulfill({ status: 503, body: "Unavailable" }); }
    return route.continue();
  });
  await page.getByRole("button", { name: "Dictionary", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Dictionary", exact: true });
  await expect(dialog.getByRole("alert")).toContainText("Couldn’t load");
  await dialog.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(dialog.getByRole("article", { name: "Meanings of wisdom" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#results-heading")).toHaveText(/222 verses found/);
});

test("a late dictionary response cannot replace a newer lookup", async ({ page }) => {
  await page.goto("/");
  let release!: () => void;
  const hold = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/dictionary/w.json?**", async route => {
    const response = await route.fetch();
    await hold;
    await route.fulfill({ response }).catch(() => {});
  });
  await page.getByRole("button", { name: "Dictionary", exact: true }).click();
  const request = page.waitForRequest(request => new URL(request.url()).pathname === "/dictionary/w.json");
  await lookup(page, "wisdom");
  await request;
  const dialog = await lookup(page, "love");
  await expect(dialog.getByRole("article", { name: "Meanings of love" })).toBeVisible();
  release();
  await expect(dialog.getByRole("article", { name: "Meanings of love" })).toBeVisible();
});

test("dictionary Find verses keeps the chosen edition and closes the panel", async ({ page }) => {
  await page.goto("/?q=wisdom&mode=all&version=WEB");
  await expect(page.locator("#results-heading")).toBeVisible();
  await page.getByRole("button", { name: "Dictionary", exact: true }).click();
  const dialog = await lookup(page, "mercy");
  await expect(dialog.getByRole("article", { name: "Meanings of mercy" })).toBeVisible();
  await dialog.getByRole("button", { name: "Find verses" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(".expression code")).toHaveText("mercy");
  await expect(page.locator("#version")).toHaveValue("WEB");
});

test("familiar desktop filters, reset and reading controls are directly accessible", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/?q=wisdom&mode=all&version=KJV");
  await expect(page.locator("#results-heading")).toBeVisible();
  const books = page.getByRole("complementary", { name: "Book selection" });
  await expect(books).toBeVisible();
  await expect(page.getByLabel("Match case")).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Edition", exact: true })).toBeVisible();
  await page.locator(".quick-scope").getByRole("button", { name: "New Testament", exact: true }).click();
  await expect(books.locator(".book-filter-bar")).toContainText("27/66");
  await page.getByLabel("Match case").check();
  await books.getByRole("button", { name: "Reset filters" }).click();
  await expect(page.locator("#query")).toHaveValue("wisdom");
  await expect(page.getByLabel("Match case")).not.toBeChecked();
  await expect(books.locator(".book-filter-bar")).toContainText("66/66");
  await page.getByLabel("Reading controls").click();
  await page.getByRole("button", { name: "Larger verse text" }).click();
  await expect(page.locator(".reading-list blockquote").first()).toHaveCSS("font-size", "21px");
  await expect(page.locator(".topbar")).toHaveCSS("background-color", "rgb(49, 46, 129)");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("mobile books and dictionary fit narrow screens in light and dark themes", async ({ page }) => {
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Dictionary", exact: true })).toBeVisible();
    await page.getByRole("button", { name: /Choose books/ }).click();
    await expect(page.getByRole("complementary", { name: "Book selection" })).toBeVisible();
    await page.locator("#book-picker").getByRole("button", { name: "Done", exact: true }).click();
    await page.getByRole("button", { name: "Dictionary", exact: true }).click();
    const dialog = await lookup(page, "counterrevolutionary");
    await expect(dialog.getByRole("article", { name: "Meanings of counterrevolutionary" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await page.keyboard.press("Escape");
    const dark = page.getByRole("button", { name: "Use dark theme" });
    if (await dark.count()) await dark.click();
    await page.getByRole("button", { name: "Dictionary", exact: true }).click();
    await lookup(page, "wisdom");
    await expect(page.getByRole("article", { name: "Meanings of wisdom" })).toBeVisible();
    await page.keyboard.press("Escape");
  }
});
