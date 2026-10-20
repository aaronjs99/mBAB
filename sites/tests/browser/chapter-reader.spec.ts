import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

async function openReader(page: Page) {
  await page.goto("/?q=John+3%3A16&version=KJV&books=42");
  await expect(page.locator("#results-heading")).toHaveText("1 verse found");
  await page.getByRole("button", { name: "Read in context", exact: true }).click();
  return page.getByRole("dialog", { name: "John 3 · Read in context" });
}

test("reader loads real context, expands the chapter, compares editions and returns to the same search", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  const dialog = await openReader(page);
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(".reader-verse")).toHaveCount(5);
  await expect(dialog.locator(".reader-verse.current")).toContainText("only begotten Son");
  await dialog.getByLabel("Compare edition").selectOption("WEB");
  await expect(dialog.locator(".reader-column-heads")).toContainText("World English Bible");
  await expect(dialog.locator(".reader-verse.current .reader-secondary")).toContainText("one and only Son");
  const bounds = await dialog.boundingBox();
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(1100);
  await expect(dialog.getByRole("button", { name: "Close reader", exact: true })).toBeInViewport();
  const output = process.env.MBAB_SCREENSHOTS;
  if (output) { await mkdir(output, { recursive: true }); await page.screenshot({ path: join(output, "mbab-reader-desktop.png") }); }
  await dialog.getByRole("button", { name: "Read full chapter", exact: true }).click();
  await expect(dialog.locator(".reader-verse")).toHaveCount(36);
  await expect(dialog.locator(".reader-verse").first()).toContainText("Nicodemus");
  await dialog.getByRole("button", { name: "Close reader", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL(/q=John\+3%3A16.*version=KJV.*books=42/);
  await expect(page.locator("#results-heading")).toHaveText("1 verse found");
  await expect(page.getByRole("button", { name: "Read in context", exact: true })).toBeFocused();
});

test("keyboard focus stays inside the reader and Escape restores its trigger", async ({ page }) => {
  const dialog = await openReader(page);
  await expect(dialog.locator(".reader-verse.current")).toBeVisible();
  await page.keyboard.press("Shift+Tab");
  expect(await dialog.evaluate(element => element.contains(document.activeElement)
    && document.activeElement instanceof HTMLElement && document.activeElement.tabIndex >= 0)).toBe(true);
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("button", { name: "Close reader", exact: true })).toBeFocused();
  for (let index = 0; index < 9; index += 1) {
    await page.keyboard.press("Tab");
    expect(await dialog.evaluate(element => ({ inside: element.contains(document.activeElement), focused: document.activeElement?.tagName }))).toMatchObject({ inside: true });
  }
  await page.keyboard.press("/");
  expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Read in context", exact: true })).toBeFocused();
});

test("reader failure can retry and closing during loading leaves search usable", async ({ page }) => {
  let attempts = 0;
  await page.route("**/api/chapter?**", async route => {
    attempts += 1;
    if (attempts === 1) await route.fulfill({ status: 503, json: { error: "Chapter source is unavailable." } });
    else await route.continue();
  });
  const dialog = await openReader(page);
  await expect(dialog.getByRole("alert")).toContainText("unavailable");
  await dialog.getByRole("button", { name: "Retry chapter", exact: true }).click();
  await expect(dialog.locator(".reader-verse.current")).toContainText("God so loved");
  expect(attempts).toBe(2);
  await dialog.getByRole("button", { name: "Close reader", exact: true }).click();
  let release: () => void = () => {};
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/chapter?**", async route => { await gate; await route.abort().catch(() => {}); });
  await page.getByRole("button", { name: "Read in context", exact: true }).click();
  await expect(dialog.getByRole("status")).toContainText("Loading");
  await dialog.getByRole("button", { name: "Close reader", exact: true }).click();
  release();
  await expect(dialog).toHaveCount(0);
  await page.locator("#query").fill("peace");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.locator(".expression code")).toHaveText("peace");
});

test("rapid comparison changes never display an earlier edition under a new label", async ({ page }) => {
  let release: () => void = () => {};
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/chapter?**version=ASV", async route => {
    await gate;
    await route.fulfill({ json: { book: "John", chapter: 3, version: "ASV", verses: [{ verse: 16, text: "STALE ASV RESPONSE" }] } }).catch(() => {});
  });
  const dialog = await openReader(page);
  await expect(dialog.locator(".reader-verse.current")).toBeVisible();
  await dialog.getByLabel("Compare edition").selectOption("ASV");
  await expect(dialog.locator(".reader-comparison")).toContainText("Loading");
  await dialog.getByLabel("Compare edition").selectOption("WEB");
  await expect(dialog.locator(".reader-verse.current .reader-secondary")).toContainText("one and only Son");
  await expect(dialog.locator(".reader-verse.current .reader-verse-number")).toBeInViewport();
  release();
  await expect(dialog).not.toContainText("STALE ASV RESPONSE");
  await expect(dialog.locator(".reader-column-heads")).toContainText("World English Bible");
});

test("comparison errors, wrong identities and missing verses stay honest", async ({ page }) => {
  let attempt = 0;
  await page.route("**/api/chapter?**version=WEB", async route => {
    attempt += 1;
    await route.fulfill({ json: {
      book: "John", chapter: 3, version: attempt === 1 ? "ASV" : "WEB",
      verses: [{ verse: 15, text: "Comparison verse fifteen." }],
    } });
  });
  const dialog = await openReader(page);
  await expect(dialog.locator(".reader-verse.current")).toBeVisible();
  await dialog.getByLabel("Compare edition").selectOption("WEB");
  await expect(dialog.locator(".reader-comparison").getByRole("alert")).toContainText("unreadable");
  await dialog.getByRole("button", { name: "Retry comparison", exact: true }).click();
  await expect(dialog.locator(".reader-verse.current .reader-secondary")).toContainText("not present in this edition");
  await expect(dialog.locator(".reader-verse[data-verse='15'] .reader-secondary")).toContainText("Comparison verse fifteen.");
});

test("saved verses reopen in context without running a new search", async ({ page }) => {
  await page.goto("/?q=John+3%3A16&version=KJV&books=42");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: "Saved 1", exact: true }).click();
  await page.getByRole("region", { name: "Saved verses" }).getByRole("button", { name: "Read in context", exact: true }).click();
  await expect(page.getByRole("dialog").locator(".reader-verse.current")).toContainText("God so loved");
});

test("reader remains usable on mobile in both themes without console errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const dialog = await openReader(page);
  await expect(dialog.locator(".reader-verse.current")).toBeVisible();
  await dialog.getByLabel("Compare edition").selectOption("WEB");
  await expect(dialog.locator(".reader-verse.current .reader-secondary")).toContainText("one and only Son");
  await expect(dialog.locator(".reader-verse.current .reader-verse-number")).toBeInViewport();
  expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await expect(dialog.getByRole("button", { name: "Close reader", exact: true })).toBeInViewport();
  const output = process.env.MBAB_SCREENSHOTS;
  if (output) { await mkdir(output, { recursive: true }); await page.screenshot({ path: join(output, "mbab-reader-mobile.png") }); }
  await dialog.getByRole("button", { name: "Close reader", exact: true }).click();
  await page.getByRole("button", { name: "Use dark theme", exact: true }).click();
  await page.getByRole("button", { name: "Read in context", exact: true }).click();
  await expect(dialog.locator(".reader-verse.current")).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  if (output) await page.screenshot({ path: join(output, "mbab-reader-dark.png") });
  expect(errors).toEqual([]);
});

test("literal operator words and textual Boolean searches work through both runtimes", async ({ request, page }) => {
  for (const query of ["and", "or", "love+and", "love,or", "(and+or)"]) {
    const response = await request.get(`/api/search?q=${encodeURIComponent(query)}&mode=advanced&version=KJV&books=42`);
    expect(response.status(), query).toBe(200);
    expect((await response.json()).total, query).toBeGreaterThan(0);
  }
  await page.goto("/?q=love+OR+mercy&mode=advanced&version=KJV&books=42");
  await expect(page.locator(".expression code")).toHaveText("love,mercy");
  expect(await page.locator(".result-content mark").allTextContents()).not.toContain("or");
});
