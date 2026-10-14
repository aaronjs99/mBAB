import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const firstVerse = "The book of the generation of Jesus Christ, the son of David, the son of Abraham.";
const secondVerse = "Jacob became the father of Joseph, the husband of Mary, from whom was born Jesus, who is called Christ.";

test("WEB verses read, copy, and save without raw annotations on mobile", async ({ page, context, request }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => localStorage.setItem("mbab:theme", "dark"));
  const noteSearch = await request.get("/api/search?q=Yehoshua&version=WEB&books=39");
  expect(noteSearch.status()).toBe(200);
  expect((await noteSearch.json()).total).toBe(0);
  const omittedChapter = await request.get("/api/chapter?book=Acts&chapter=8&version=WEB");
  expect(omittedChapter.status()).toBe(200);
  expect((await omittedChapter.json()).verses.some((verse: { verse: number }) => verse.verse === 37)).toBe(false);
  await page.goto("/?q=Jesus&version=WEB&books=39");
  const verses = page.locator(".result-content blockquote");
  await expect(verses.first()).toHaveText(firstVerse);
  await expect(verses.nth(1)).toHaveText(secondVerse);
  await expect(verses.first().locator("mark")).toHaveText("Jesus");
  await page.locator(".result-tools").first().getByRole("button", { name: "Copy", exact: true }).click();
  await expect(page.locator(".toast")).toContainText("copied");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`Matthew 1:1 (WEB) — ${firstVerse}`);
  await page.locator(".result-tools").first().getByRole("button", { name: "Save", exact: true }).click();
  await page.reload();
  await expect(verses.first()).toHaveText(firstVerse);
  await page.getByRole("button", { name: "Saved 1", exact: true }).click();
  await expect(page.locator(".saved-card")).toContainText(firstVerse);
  await page.getByRole("region", { name: "Saved verses" }).getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Read in context", exact: true }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator(".reader-verse.current .reader-primary")).toContainText(firstVerse);
  await expect(dialog.locator(".reader-verse.current .reader-primary")).not.toContainText(/[{}\\]/);
  await dialog.getByRole("button", { name: "Close reader", exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const output = process.env.MBAB_SCREENSHOTS;
  if (output) {
    await mkdir(output, { recursive: true });
    await page.locator(".result-card").first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(output, "mbab-web-verses-mobile.png") });
  }
});
