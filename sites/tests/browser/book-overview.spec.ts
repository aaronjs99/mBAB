import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

test("overview totals cover every page and narrow the submitted search with back navigation", async ({ page, request }) => {
  const initial = "/?q=love&mode=all&version=KJV&books=0,42,43&case=false&page=2";
  const payload = await (await request.get("/api/search?q=love&version=KJV&books=0,42,43&page=2")).json();
  expect(payload.bookCounts.reduce((sum: number, book: { count: number }) => sum + book.count, 0)).toBe(payload.total);
  await page.goto(initial);
  await expect(page.locator(".pagination")).toContainText("Page 2");
  await page.locator(".book-overview > summary").click();
  const overview = page.getByRole("region", { name: "Matches by book", exact: true });
  await expect(overview).toContainText(`${payload.total.toLocaleString()} matched verses`);
  const johnCount = payload.bookCounts.find((book: { bookId: number }) => book.bookId === 42).count;
  await expect(overview.getByRole("button", { name: `Narrow to John: ${johnCount} matched verses`, exact: true })).toBeVisible();
  await page.locator("#query").fill("peace");
  await page.locator("#version").selectOption("WEB");
  await overview.getByRole("button", { name: `Narrow to John: ${johnCount} matched verses`, exact: true }).click();
  await expect(page).toHaveURL(/q=love.*version=KJV.*books=42.*page=1/);
  await expect(page.locator("#query")).toHaveValue("love");
  await expect(page.locator("#version")).toHaveValue("KJV");
  await expect(page.locator(".result-ref").first()).toContainText("John");
  await expect(page.locator("#results-heading")).toHaveText(`${johnCount} verses found`);
  await page.goBack();
  await expect(page.locator(".pagination")).toContainText("Page 2");
  await expect(overview).toContainText(`${payload.total.toLocaleString()} matched verses`);
});

test("overview expands and remains usable on mobile without overflow", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/?q=love&version=KJV");
  await expect(page.locator("#results-heading")).toBeVisible();
  await expect(page.locator(".book-overview")).not.toHaveAttribute("open");
  await page.locator(".book-overview > summary").click();
  const overview = page.getByRole("region", { name: "Matches by book", exact: true });
  await expect(overview).toBeVisible();
  await expect(overview.locator(".book-match")).toHaveCount(8);
  await overview.getByRole("button", { name: /^Show all \d+ books$/ }).click();
  expect(await overview.locator(".book-match").count()).toBeGreaterThan(8);
  await overview.getByRole("button", { name: "Show fewer books", exact: true }).click();
  await expect(overview.locator(".book-match")).toHaveCount(8);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const output = process.env.MBAB_SCREENSHOTS;
  if (output) {
    await mkdir(output, { recursive: true });
    await overview.scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(output, "mbab-overview-mobile.png") });
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.evaluate(() => {
      const top = document.querySelector("#search-results")!.getBoundingClientRect().top + window.scrollY;
      window.scrollTo(0, top - 20);
    });
    await page.screenshot({ path: join(output, "mbab-overview-desktop.png") });
  }
  expect(errors).toEqual([]);
});

test("references and empty results do not offer misleading book narrowing", async ({ page }) => {
  await page.goto("/?q=John+3%3A16&version=KJV&books=42");
  await expect(page.locator("#results-heading")).toHaveText("1 verse found");
  await expect(page.getByRole("region", { name: "Matches by book", exact: true })).toHaveCount(0);
  await page.locator("#query").fill("mbabnevermatches");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.locator("#results-heading")).toHaveText("0 verses found");
  await expect(page.getByRole("region", { name: "Matches by book", exact: true })).toHaveCount(0);
});
