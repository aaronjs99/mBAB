import { expect, test, type Locator, type Page } from "@playwright/test";

function wordIn(scope: Locator, word: string) {
  return scope.getByRole("button", { name: `Look up ${word}`, exact: true }).first();
}

async function referencePage(page: Page, reference = "John 3:16") {
  await page.goto(`/?${new URLSearchParams({ q: reference, version: "KJV" })}`);
  await expect(page.locator("#results-heading")).toHaveText("1 verse found");
  return page.locator(".reading-list > .result-card");
}

async function openMeaning(trigger: Locator, page: Page, word: string) {
  await trigger.click();
  const popup = page.getByRole("dialog", { name: `Meaning of ${word}`, exact: true });
  await expect(popup.locator(".word-definition").first()).toBeVisible();
  return popup;
}

test("an outside click closes the meaning and still follows Next", async ({ page }) => {
  await page.goto("/?q=wisdom&version=KJV");
  await expect(page.locator("#results-heading")).toHaveText("222 verses found");
  const next = page.getByRole("button", { name: "Next", exact: true });
  await next.scrollIntoViewIfNeeded();
  const trigger = wordIn(page.locator(".reading-list > .result-card").last(), "wisdom");
  await expect(trigger).toBeInViewport();
  const popup = await openMeaning(trigger, page, "wisdom");
  await expect(next).toBeInViewport();
  await next.click();
  await expect(page.locator(".pagination")).toContainText("Page 2 of 12");
  await expect(page).toHaveURL(url => url.searchParams.get("page") === "2");
  await expect(popup).not.toBeVisible();
  await expect(page.locator(".reading-list .result-ref").first()).toContainText("1 Kings 10:6");
});

test("meanings stay attached while scrolling and close when their word leaves view", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 640 });
  const verse = await referencePage(page, "1 John 4:8");
  const popup = await openMeaning(wordIn(verse, "love"), page, "love");
  await popup.getByRole("button", { name: "Show all meanings", exact: true }).click();
  await expect(popup.locator(".word-definition")).not.toHaveCount(3);
  const originalPageScroll = await page.evaluate(() => scrollY);
  await popup.hover();
  await page.mouse.wheel(0, 240);
  await expect.poll(() => popup.evaluate(element => Math.max(
    element.scrollTop,
    ...[...element.querySelectorAll<HTMLElement>("*")].map(child => child.scrollTop),
  ))).toBeGreaterThan(0);
  await expect(popup).toBeVisible();
  expect(await page.evaluate(() => scrollY)).toBe(originalPageScroll);
  await page.evaluate(() => scrollBy(0, scrollY > 0 ? -40 : 40));
  await expect(popup).toBeVisible();
  await page.evaluate(() => scrollTo({ top: 0, behavior: "instant" }));
  await expect(popup).not.toBeVisible();
  await expect(page.locator("#results-heading")).toHaveText("1 verse found");
});

test("reader meanings follow visible words and close when those words scroll out of view", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 640 });
  const verse = await referencePage(page);
  await verse.getByRole("button", { name: "Read in context", exact: true }).click();
  const reader = page.getByRole("dialog", { name: "John 3 · Read in context", exact: true });
  await expect(reader.locator(".reader-verse.current")).toBeVisible();
  await reader.getByRole("button", { name: "Read full chapter", exact: true }).click();
  await expect(reader.locator(".reader-verse")).toHaveCount(36);
  const popup = await openMeaning(wordIn(reader.locator(".reader-verse.current"), "loved"), page, "loved");
  const body = reader.getByLabel("Chapter verses", { exact: true });
  const previous = await body.evaluate(element => element.scrollTop);
  await body.evaluate(element => element.scrollBy(0, 80));
  await expect.poll(() => body.evaluate(element => element.scrollTop)).not.toBe(previous);
  await expect(popup).toBeVisible();
  await body.evaluate(element => element.scrollTo({ top: 0, behavior: "instant" }));
  await expect(popup).not.toBeVisible();
  await expect(reader).toBeVisible();
  await expect(reader.locator(".reader-verse.current")).toContainText("For God so loved the world");
});

test("restoring different results removes the old word popup", async ({ page }) => {
  const verse = await referencePage(page);
  await page.locator("#query").fill("John 3:17");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(verse.locator(".result-ref")).toContainText("John 3:17");
  const popup = await openMeaning(wordIn(verse, "world"), page, "world");
  await page.goBack();
  await expect(verse.locator(".result-ref")).toContainText("John 3:16");
  await expect(popup).not.toBeVisible();
  await expect(page.locator(".word-meaning")).toHaveCount(0);
  await expect(verse.locator("blockquote")).toContainText("For God so loved the world");
});

test("reader meaning source and license links are reachable with Tab", async ({ page }) => {
  const verse = await referencePage(page);
  await verse.getByRole("button", { name: "Read in context", exact: true }).click();
  const reader = page.getByRole("dialog", { name: "John 3 · Read in context", exact: true });
  await expect(reader.locator(".reader-verse.current")).toBeVisible();
  const popup = await openMeaning(wordIn(reader.locator(".reader-verse.current"), "loved"), page, "loved");
  const source = popup.getByRole("link", { name: /WordNet/i });
  const license = popup.getByRole("link", { name: "License", exact: true });
  await expect(source).toHaveAttribute("href", "https://wordnet.princeton.edu/");
  await expect(license).toHaveAttribute("href", "/WORDNET-LICENSE.txt");
  await popup.getByRole("button", { name: "Close meaning", exact: true }).focus();
  let sourceReached = false;
  let licenseReached = false;
  for (let step = 0; step < 12 && !(sourceReached && licenseReached); step += 1) {
    await page.keyboard.press("Tab");
    sourceReached ||= await source.evaluate(element => element === document.activeElement);
    licenseReached ||= await license.evaluate(element => element === document.activeElement);
    expect(await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.tabIndex >= 0)).toBe(true);
  }
  expect(sourceReached).toBe(true);
  expect(licenseReached).toBe(true);
  await page.keyboard.press("Tab");
  expect(await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.tabIndex >= 0)).toBe(true);
  await expect(reader).toBeVisible();
  await reader.getByRole("button", { name: "Close reader", exact: true }).focus();
  await expect(popup).not.toBeVisible();
  await page.keyboard.press("Shift+Tab");
  expect(await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.tabIndex >= 0)).toBe(true);
  await expect(reader).toBeVisible();
});

test("verse selection and Copy preserve plain verse text without lookup labels", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const verse = await referencePage(page);
  const expected = "For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.";
  const text = verse.locator("blockquote");
  await expect(text).toHaveText(expected);
  const selected = await text.evaluate(element => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const selection = getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    return selection.toString();
  });
  expect(selected).toBe(expected);
  await verse.getByRole("button", { name: "Copy", exact: true }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(`John 3:16 (KJV) — ${expected}`);
  await expect(page.locator(".word-meaning")).not.toBeVisible();
});
