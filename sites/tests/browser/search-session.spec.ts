import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

async function search(page: Page, query: string) {
  await page.locator("#query").fill(query);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.locator("#results-heading")).toBeVisible();
  await expect(page.locator(".expression code")).toHaveText(query);
}

test("the Sites bridge searches the configured local corpus", async ({ request }) => {
  const response = await request.get("/api/search?q=love&version=KJV&books=42");
  expect(response.status()).toBe(200);
  const payload = await response.json();
  expect(payload.total).toBeGreaterThan(0);
  expect(payload.results.every((result: { book: string; version: string }) =>
    result.book === "John" && result.version === "KJV")).toBe(true);
});

test("opening a shared search restores case, scope and page and runs it", async ({ page }) => {
  await page.goto("/?q=God&mode=any&version=KJV&books=42&case=true&page=2");
  await expect(page.locator("#query")).toHaveValue("God");
  await expect(page.getByLabel("Match case")).toBeChecked();
  await expect(page.locator("#results-heading")).toBeVisible();
  await expect(page.locator(".pagination")).toContainText("Page 2 of");
  await expect(page.locator(".results-head .eyebrow")).toHaveText("KJV · 1 book");
  await expect(page.locator(".result-ref").first()).toContainText("John");
});

test("editing the form leaves existing results and their labels tied to the submitted search", async ({ page }) => {
  await page.goto("/");
  await search(page, "love");
  await page.locator("#query").fill("peace");
  await page.locator("#version").selectOption("WEB");
  await page.getByRole("button", { name: "Any word", exact: true }).click();
  await expect(page.locator(".results-head .eyebrow")).toHaveAttribute("title", "King James Version");
  await expect(page.locator(".result-content mark").first()).toHaveText(/love/i);
  await expect(page.getByText("Settings changed. Search to update these results.")).toBeVisible();
});

test("pagination keeps the submitted search even when the form has unsent edits", async ({ page }) => {
  await page.goto("/");
  await search(page, "love");
  await page.locator("#query").fill("peace");
  await page.locator("#version").selectOption("WEB");
  const nextRequest = page.waitForRequest(request => request.url().includes("/api/search?"));
  await page.getByRole("button", { name: "Next", exact: true }).click();
  const params = new URL((await nextRequest).url()).searchParams;
  expect(params.get("q")).toBe("love");
  expect(params.get("version")).toBe("KJV");
  expect(params.get("page")).toBe("2");
  await expect(page.locator(".pagination")).toContainText("Page 2 of");
  await expect(page.locator("#query")).toHaveValue("peace");
  await expect(page.locator(".results-head .eyebrow")).toHaveText("KJV · Entire Bible");
});

test("successful searches support browser back and forward", async ({ page }) => {
  await page.goto("/");
  await search(page, "love");
  await search(page, "grace");
  await page.goBack();
  await expect(page.locator("#query")).toHaveValue("love");
  await expect(page.locator(".expression code")).toHaveText("love");
  await page.goForward();
  await expect(page.locator("#query")).toHaveValue("grace");
  await expect(page.locator(".expression code")).toHaveText("grace");
});

test("share links preserve case matching and the current result page", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Search", exact: true })).toBeEnabled();
  await expect(page.getByLabel("Match case")).toBeVisible();
  await page.getByLabel("Match case").check();
  await search(page, "love");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.locator(".pagination")).toContainText("Page 2 of");
  await page.getByRole("button", { name: "Share search", exact: true }).click();
  await expect(page.getByText("Share link copied.", { exact: true }).last()).toBeVisible();
  const link = await page.evaluate(() => navigator.clipboard.readText());
  const params = new URL(link).searchParams;
  expect(params.get("case")).toBe("true");
  expect(params.get("page")).toBe("2");
  const shared = await context.newPage();
  await shared.goto(link);
  await expect(shared.getByLabel("Match case")).toBeChecked();
  await expect(shared.locator(".pagination")).toContainText("Page 2 of");
});

test("failed searches keep the previous results and retry the failed request", async ({ page }) => {
  await page.goto("/");
  await search(page, "love");
  await page.route("**/api/search?**", route => route.fulfill({ status: 503, json: { error: "The corpus is unavailable." } }));
  await page.locator("#query").fill("grace");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("The corpus is unavailable.");
  await expect(page.locator(".expression code")).toHaveText("love");
  await page.unroute("**/api/search?**");
  await page.locator("#query").fill("peace");
  await page.getByRole("button", { name: "Retry search", exact: true }).click();
  await expect(page.locator(".expression code")).toHaveText("grace");
  await expect(page.locator("#query")).toHaveValue("peace");
});

test("cancel stops the pending search without losing previous results", async ({ page }) => {
  await page.goto("/");
  await search(page, "love");
  let release!: () => void;
  const hold = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/search?**", async route => {
    await hold;
    await route.fulfill({ status: 503, json: { error: "Delayed response" } }).catch(() => {});
  });
  await page.locator("#query").fill("grace");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.getByRole("button", { name: "Cancel search", exact: true }).click();
  release();
  await expect(page.getByRole("button", { name: "Search", exact: true })).toBeEnabled();
  await expect(page.locator(".expression code")).toHaveText("love");
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("an older response cannot replace a newer example search", async ({ page }) => {
  await page.goto("/");
  let release!: () => void;
  const hold = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/search?**", async route => {
    if (new URL(route.request().url()).searchParams.get("q") === "love") {
      const response = await route.fetch();
      await hold;
      await route.fulfill({ response }).catch(() => {});
    } else await route.continue();
  });
  await page.locator("#query").fill("love");
  const firstRequest = page.waitForRequest(request => new URL(request.url()).pathname === "/api/search");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await firstRequest;
  await page.getByRole("button", { name: "Any word", exact: true }).click();
  await page.getByRole("button", { name: /peace or hope/ }).click();
  await expect(page.locator(".expression code")).toHaveText("peace,hope");
  release();
  await expect(page.getByRole("button", { name: "Search", exact: true })).toBeEnabled();
  await expect(page.locator(".expression code")).toHaveText("peace,hope");
  await expect(page.locator("#query")).toHaveValue("peace hope");
});

test("unavailable storage does not break search or claim that verses were saved", async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new DOMException("Storage blocked", "SecurityError"); };
    Storage.prototype.setItem = () => { throw new DOMException("Storage blocked", "SecurityError"); };
    Storage.prototype.removeItem = () => { throw new DOMException("Storage blocked", "SecurityError"); };
  });
  await page.goto("/");
  await search(page, "love");
  await page.getByRole("button", { name: "Save", exact: true }).first().click();
  await expect(page.locator(".toast")).toContainText("could not save");
  await expect(page.getByRole("button", { name: "Saved", exact: true })).toHaveCount(0);
  await expect(page.locator(".count-badge")).toHaveText("0");
  await page.getByRole("button", { name: "Use dark theme", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("a reference range loads real verses from the local corpus", async ({ page }) => {
  await page.goto("/?q=John+3%3A16-18&mode=advanced&version=WEB&books=42");
  await expect(page.locator("#results-heading")).toHaveText("3 verses found");
  await expect(page.locator(".result-ref")).toHaveText(["John 3:16 WEB", "John 3:17 WEB", "John 3:18 WEB"]);
  await expect(page.locator(".result-content blockquote").first()).toContainText("God so loved the world");
  await expect(page.locator(".result-content mark")).toHaveCount(0);
  await expect(page.locator(".results-head .eyebrow")).toHaveAttribute("title", "World English Bible");
  await expect(page.locator(".results-logic")).toHaveText("Reference");
});

test("saved verses survive reload and can be removed from the saved tray", async ({ page }) => {
  await page.goto("/?q=John+3%3A16&version=KJV&books=42");
  await expect(page.locator("#results-heading")).toHaveText("1 verse found");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.locator(".count-badge")).toHaveText("1");
  await page.reload();
  await expect(page.locator(".count-badge")).toHaveText("1");
  await expect(page.locator(".result-tools button[aria-pressed=true]")).toHaveText("Saved");
  await page.getByRole("button", { name: "Saved 1", exact: true }).click();
  await expect(page.getByRole("region", { name: "Saved verses" })).toContainText("John 3:16");
  await page.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(page.locator(".count-badge")).toHaveText("0");
  await page.reload();
  await expect(page.locator(".count-badge")).toHaveText("0");
  await expect(page.locator(".result-tools button[aria-pressed=false]")).toHaveText("Save");
});

test("empty results and invalid queries offer honest recovery states", async ({ page }) => {
  await page.goto("/");
  await search(page, "mbabnevermatches");
  await expect(page.locator("#results-heading")).toHaveText("0 verses found");
  await expect(page.locator(".empty-state")).toBeVisible();
  await expect(page.locator(".pagination")).toHaveCount(0);
  await page.getByRole("button", { name: "Advanced", exact: true }).click();
  await page.locator("#query").fill("grace+");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Finish the search with a word");
  await expect(page.getByRole("button", { name: "Retry search" })).toHaveCount(0);
});

test("invalid shared book scopes require a selection before searching", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", request => {
    if (request.url().includes("/api/search?")) requests.push(request.url());
  });
  await page.goto("/?q=love&books=42,");
  await expect(page.getByRole("alert")).toContainText("Choose at least one book");
  expect(requests).toEqual([]);
  await expect(page.locator(".search-card").getByRole("button", { name: /Choose books/ })).toContainText("0/66");
});

test("a disconnected search keeps existing results and offers retry", async ({ page }) => {
  await page.goto("/");
  await search(page, "love");
  await page.route("**/api/search?**", route => route.abort("internetdisconnected"));
  await page.locator("#query").fill("grace");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Check your connection");
  await expect(page.locator(".expression code")).toHaveText("love");
  await expect(page.getByRole("button", { name: "Retry search", exact: true })).toBeEnabled();
});

test("unreadable search data becomes an error instead of crashing the result view", async ({ page }) => {
  await page.goto("/");
  await search(page, "love");
  await page.route("**/api/search?**", route => route.fulfill({ json: { results: [], page: 1 } }));
  await page.locator("#query").fill("grace");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("unreadable response");
  await expect(page.locator(".expression code")).toHaveText("love");
});

test("links beyond the last page are corrected to the actual result page", async ({ page }) => {
  await page.goto("/?q=love&books=42&page=9999");
  await expect(page.locator("#results-heading")).toHaveText("19 verses found");
  await expect(page).toHaveURL(/page=1$/);
  await expect(page.locator(".pagination")).toHaveCount(0);
});

test("mobile book selection and keyboard submission remain usable without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.locator(".search-card").getByRole("button", { name: /Choose books/ }).click();
  await page.getByRole("button", { name: "John", exact: true }).click();
  await expect(page.locator(".search-card").getByRole("button", { name: /Choose books/ })).toContainText("65/66");
  await page.getByRole("button", { name: "John", exact: true }).click();
  await page.locator(".search-card").getByRole("button", { name: /Choose books/ }).click();
  await page.locator("#query").fill("love");
  await page.locator("#query").press("Enter");
  await expect(page.locator("#results-heading")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Use dark theme", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("desktop and mobile search results render without console or layout errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => {
    if (["error", "warning"].includes(message.type())) errors.push(message.text());
  });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/?q=John+3%3A16-18&version=KJV&books=42");
  await expect(page).toHaveTitle("mBAB — Multi-Book Advanced Bible Search");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Search the Bible");
  await expect(page.locator("#results-heading")).toHaveText("3 verses found");
  await page.locator("#query").fill("peace");
  await page.locator("#version").selectOption("WEB");
  await expect(page.locator(".draft-notice")).toBeVisible();
  await expect(page.locator(".results-head .eyebrow")).toHaveAttribute("title", "King James Version");
  await expect(page.locator("vite-error-overlay, nextjs-portal")).toHaveCount(0);
  const output = process.env.MBAB_SCREENSHOTS;
  if (output) {
    await mkdir(output, { recursive: true });
    await page.evaluate(() => {
      const top = document.querySelector(".search-card")!.getBoundingClientRect().top + window.scrollY;
      window.scrollTo(0, top - 20);
    });
    await page.screenshot({ path: join(output, "mbab-desktop.png") });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Use dark theme", exact: true }).click();
  await page.evaluate(() => {
    const top = document.querySelector("#search-results")!.getBoundingClientRect().top + window.scrollY;
    window.scrollTo(0, top);
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  if (output) await page.screenshot({ path: join(output, "mbab-mobile.png") });
  expect(errors).toEqual([]);
});
