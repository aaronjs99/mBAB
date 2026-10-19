import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

test("the familiar search interface exposes filters and reveals reading controls on demand", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Search", exact: true })).toBeEnabled();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Search the Bible");
  await expect(page.locator("#query")).toBeInViewport();
  await expect(page.getByLabel("Match case")).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Edition", exact: true })).toBeVisible();
  await expect(page.locator("#book-picker")).toBeVisible();
  await expect(page.getByRole("group", { name: "Search scope", exact: true }).getByRole("button", { name: "Entire Bible", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("How mBAB works", { exact: true })).toHaveCount(0);
  const options = page.getByLabel("Reading controls", { exact: true });
  await options.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Verse text size", { exact: true })).toHaveText("19px");
  await expect(page.getByRole("button", { name: "Larger verse text", exact: true })).toBeVisible();
  await options.click();
  await page.getByLabel("Search help", { exact: true }).click();
  await expect(page.locator(".help-panel")).toBeVisible();
  await page.getByLabel("Search help", { exact: true }).click();
  const output = process.env.MBAB_SCREENSHOTS;
  if (output) {
    await mkdir(output, { recursive: true });
    await page.screenshot({ path: join(output, "mbab-home-desktop.png") });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("#query")).toBeInViewport();
  await expect(page.locator("#book-picker")).not.toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  if (output) await page.screenshot({ path: join(output, "mbab-home-mobile.png") });
  await page.getByRole("button", { name: "Use dark theme", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  const contrast = await page.evaluate(() => {
    const luminance = (color: string) => {
      const values = color.match(/[\d.]+/g)!.slice(0, 3).map(value => {
        const channel = Number(value) / 255;
        return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
      });
      return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
    };
    const ratio = (foreground: string, background: string) => {
      const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
      return (values[0] + 0.05) / (values[1] + 0.05);
    };
    const brand = getComputedStyle(document.querySelector(".brand strong")!);
    const button = getComputedStyle(document.querySelector(".search-button")!);
    const arrow = getComputedStyle(document.querySelector(".search-button svg")!);
    return [ratio(brand.color, getComputedStyle(document.querySelector(".topbar")!).backgroundColor), ratio(arrow.color, button.backgroundColor)];
  });
  contrast.forEach(ratio => expect(ratio).toBeGreaterThanOrEqual(4.5));
  if (output) await page.screenshot({ path: join(output, "mbab-home-dark.png") });
  await page.setViewportSize({ width: 320, height: 640 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: /Choose books/ }).click();
  await expect(page.getByRole("button", { name: "John", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.locator("#book-picker")).not.toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "Use light theme", exact: true }).click();
  await page.locator("#query").fill("John 3:16-18");
  await page.locator("#query").press("Enter");
  await expect(page.locator("#results-heading")).toHaveText("3 verses found");
  await expect(page.locator(".result-content blockquote").first()).toBeInViewport();
  await expect(page.locator(".example-row")).toHaveCount(0);
  await page.evaluate(() => scrollTo(0, 0));
  if (output) await page.screenshot({ path: join(output, "mbab-results-desktop.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => scrollTo(0, 0));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  if (output) await page.screenshot({ path: join(output, "mbab-results-mobile.png") });
  expect(errors).toEqual([]);
});
