import { expect, test, type Locator, type Page } from "@playwright/test";

test.use({ hasTouch: true });

function wordIn(scope: Locator, word: string) {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return scope.getByRole("button", { name: new RegExp(`^Look up ${escaped}$`, "i") }).first();
}

async function wisdomPage(page: Page, secondPage = false) {
  await page.goto(`/?q=wisdom&mode=all&version=KJV${secondPage ? "&page=2" : ""}`);
  await expect(page.locator("#results-heading")).toHaveText("222 verses found");
  return page.locator(".reading-list > .result-card").first();
}

async function referencePage(page: Page) {
  await page.goto("/?q=John+3%3A16&version=KJV&books=42");
  await expect(page.locator("#results-heading")).toHaveText("1 verse found");
  return page.locator(".reading-list > .result-card").first();
}

test("tapping a highlighted verse word shows real meanings in place and preserves the search", async ({ page }) => {
  const external: string[] = [];
  page.on("request", request => {
    const url = new URL(request.url());
    if (!/^(localhost|127\.0\.0\.1)$/.test(url.hostname)) external.push(url.origin);
  });
  const verse = await wisdomPage(page, true);
  const trigger = wordIn(verse, "wisdom");
  await trigger.scrollIntoViewIfNeeded();
  const originalUrl = page.url();
  const originalText = await verse.locator("blockquote").innerText();
  const originalScroll = await page.evaluate(() => scrollY);
  const highlightCount = await verse.locator("mark").count();
  expect(highlightCount).toBeGreaterThan(0);
  await trigger.click();
  const popup = page.getByRole("dialog", { name: /^Meaning of wisdom$/i });
  await expect(popup).toBeVisible();
  await expect(popup.locator(".word-definition")).toHaveCount(3);
  await expect(popup.locator(".word-definition").filter({ hasText: /judgment|judgement|knowledge/ }).first()).toBeVisible();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("dialog", { name: "Dictionary", exact: true })).toHaveCount(0);
  await popup.getByRole("button", { name: "Show all meanings", exact: true }).click();
  await expect(popup.locator(".word-definition")).toHaveCount(5);
  expect(await popup.evaluate(element => element.contains(document.activeElement))).toBe(true);
  await popup.getByRole("button", { name: "Close meaning", exact: true }).click();
  await expect(popup).not.toBeVisible();
  expect(page.url()).toBe(originalUrl);
  expect(await verse.locator("blockquote").innerText()).toBe(originalText);
  await expect(verse.locator("mark")).toHaveCount(highlightCount);
  expect(Math.abs((await page.evaluate(() => scrollY)) - originalScroll)).toBeLessThanOrEqual(2);
  await expect(page.locator(".pagination")).toContainText("Page 2 of");
  expect(external).toEqual([]);
});

test("verse words use one Tab stop and arrow keys with Escape returning focus", async ({ page }) => {
  const verse = await referencePage(page);
  const words = verse.locator(".verse-word");
  await expect(verse.locator('.verse-word[tabindex="0"]')).toHaveCount(1);
  const first = words.first();
  const second = words.nth(1);
  await first.focus();
  await page.keyboard.press("ArrowRight");
  await expect(second).toBeFocused();
  await expect(verse.locator('.verse-word[tabindex="0"]')).toHaveCount(1);
  await page.keyboard.press("ArrowLeft");
  await expect(first).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  const popup = page.getByRole("dialog", { name: /^Meaning of God$/i });
  await expect(popup.locator(".word-definition").first()).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(popup).not.toBeVisible();
  await expect(second).toBeFocused();
  await expect(second).toHaveAttribute("aria-expanded", "false");
});

test("touch word meanings fit 320 and 390 pixel screens in light and dark themes", async ({ page }) => {
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    const verse = await wisdomPage(page);
    for (const theme of ["light", "dark"] as const) {
      const switchTheme = page.getByRole("button", { name: `Use ${theme} theme`, exact: true });
      if (await switchTheme.count()) await switchTheme.click();
      const trigger = wordIn(verse, "wisdom");
      await trigger.scrollIntoViewIfNeeded();
      await trigger.tap();
      const popup = page.getByRole("dialog", { name: /^Meaning of wisdom$/i });
      await expect(popup.locator(".word-definition").first()).toBeVisible();
      const bounds = await popup.boundingBox();
      expect(bounds).not.toBeNull();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
      expect(bounds!.y).toBeGreaterThanOrEqual(0);
      expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(844);
      expect(await popup.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.keyboard.press("Escape");
      await expect(popup).not.toBeVisible();
    }
  }
});

test("reader meanings stay above the modal and Escape closes only the active layer", async ({ page }) => {
  const verse = await referencePage(page);
  const originalUrl = page.url();
  await verse.getByRole("button", { name: "Read in context", exact: true }).click();
  const reader = page.getByRole("dialog", { name: "John 3 · Read in context", exact: true });
  await expect(reader.locator(".reader-verse.current")).toBeVisible();
  const primary = wordIn(reader.locator(".reader-verse.current .reader-primary"), "loved");
  await primary.click();
  const popup = page.getByRole("dialog", { name: /^Meaning of loved$/i });
  await expect(popup.locator(".word-definition").first()).toBeVisible();
  expect(await popup.evaluate(element => {
    const bounds = element.getBoundingClientRect();
    const hit = document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + Math.min(12, bounds.height / 2));
    return !!hit && element.contains(hit);
  })).toBe(true);
  await page.keyboard.press("Escape");
  await expect(popup).not.toBeVisible();
  await expect(reader).toBeVisible();
  await expect(primary).toBeFocused();
  await reader.getByLabel("Compare edition").selectOption("WEB");
  const secondary = wordIn(reader.locator(".reader-verse.current .reader-secondary"), "loved");
  await secondary.click();
  await expect(popup.locator(".word-definition").first()).toBeVisible();
  await popup.getByRole("button", { name: "Close meaning", exact: true }).click();
  await expect(reader).toBeVisible();
  await expect(reader.getByLabel("Compare edition")).toHaveValue("WEB");
  await secondary.click();
  await page.keyboard.press("Escape");
  await expect(reader).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(reader).toHaveCount(0);
  expect(page.url()).toBe(originalUrl);
});

test("switching words ignores an older delayed dictionary response", async ({ page }) => {
  let release = () => {};
  let fulfilled = () => {};
  const hold = new Promise<void>(resolve => { release = resolve; });
  const served = new Promise<void>(resolve => { fulfilled = resolve; });
  await page.route("**/dictionary/w.json?**", async route => {
    const response = await route.fetch();
    await hold;
    await route.fulfill({ response }).catch(() => {});
    fulfilled();
  });
  try {
    const verse = await referencePage(page);
    const requested = page.waitForRequest(request => new URL(request.url()).pathname === "/dictionary/w.json");
    await wordIn(verse, "world").click();
    await requested;
    await wordIn(verse, "God").click();
    const current = page.getByRole("dialog", { name: /^Meaning of God$/i });
    await expect(current.locator(".word-definition").first()).toBeVisible();
    release();
    await served;
    await expect(current.locator(".word-definition").first()).toBeVisible();
    await expect(page.getByRole("dialog", { name: /^Meaning of world$/i })).not.toBeVisible();
  } finally { release(); }
});

test("word meaning download failures retry without changing results or filters", async ({ page }) => {
  let attempts = 0;
  await page.route("**/dictionary/w.json?**", route => {
    attempts += 1;
    return attempts === 1 ? route.fulfill({ status: 503, body: "Unavailable" }) : route.continue();
  });
  const verse = await wisdomPage(page, true);
  const originalUrl = page.url();
  await wordIn(verse, "wisdom").click();
  const popup = page.getByRole("dialog", { name: /^Meaning of wisdom$/i });
  await expect(popup.getByRole("alert")).toContainText(/load|unavailable/i);
  await popup.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(popup.locator(".word-definition")).toHaveCount(3);
  expect(await popup.evaluate(element => element.contains(document.activeElement))).toBe(true);
  expect(attempts).toBe(2);
  expect(page.url()).toBe(originalUrl);
  await page.keyboard.press("Escape");
  await expect(page.locator("#results-heading")).toHaveText("222 verses found");
  await expect(page.locator(".pagination")).toContainText("Page 2 of");
});

test("an actual archaic verse word without an entry gets an honest empty state", async ({ page }) => {
  await page.goto("/?q=Joshua+1%3A9&version=KJV&books=5");
  await expect(page.locator("#results-heading")).toHaveText("1 verse found");
  const originalUrl = page.url();
  await wordIn(page.locator(".reading-list"), "whithersoever").click();
  const popup = page.getByRole("dialog", { name: /^Meaning of whithersoever$/i });
  await expect(popup).toContainText(/no (?:dictionary )?entry|meaning.*(?:unavailable|not found)/i);
  await expect(popup.locator(".word-definition")).toHaveCount(0);
  await page.keyboard.press("Escape");
  expect(page.url()).toBe(originalUrl);
});

test("related and saved verses support meanings while selecting verse text does not open one", async ({ page }) => {
  const verse = await wisdomPage(page);
  const trigger = wordIn(verse, "wisdom");
  await trigger.evaluate(element => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await trigger.dispatchEvent("click", { detail: 1 });
  await expect(page.locator(".word-meaning")).not.toBeVisible();
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: /^Meaning of wisdom$/i }).locator(".word-definition").first()).toBeVisible();
  await page.keyboard.press("Escape");
  await page.evaluate(() => getSelection()?.removeAllRanges());
  await verse.getByRole("button", { name: "Save", exact: true }).click();
  await page.locator(".topnav").getByRole("button", { name: /^Saved/ }).click();
  const saved = page.getByRole("region", { name: "Saved verses", exact: true });
  await wordIn(saved, "wisdom").click();
  await expect(page.getByRole("dialog", { name: /^Meaning of wisdom$/i }).locator(".word-definition").first()).toBeVisible();
  await page.keyboard.press("Escape");
  await saved.getByRole("button", { name: "Close", exact: true }).click();
  await page.locator(".related-preview > summary").click();
  await wordIn(page.locator(".related-verse-list"), "wise").click();
  await expect(page.getByRole("dialog", { name: /^Meaning of wise$/i }).locator(".word-definition").first()).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#results-heading")).toHaveText("222 verses found");
});
