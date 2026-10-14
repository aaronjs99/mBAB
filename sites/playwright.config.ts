import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig, devices } from "@playwright/test";

const python = process.env.MBAB_TEST_PYTHON ?? "python";

export default defineConfig({
  testDir: "./tests/browser",
  outputDir: process.env.MBAB_TEST_OUTPUT ?? join(tmpdir(), "mbab-playwright"),
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: "list",
  use: {
    baseURL: "http://localhost:3018",
    ...devices["Desktop Chrome"],
    channel: process.env.MBAB_TEST_BROWSER,
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: `"${python}" ../manage.py runserver 127.0.0.1:8008 --noreload`,
      url: "http://127.0.0.1:8008/",
      reuseExistingServer: !process.env.CI,
      env: { GROQ_API_KEY: "", OPENAI_API_KEY: "", DEEPSEEK_API_KEY: "", DJANGO_DEBUG: "true" },
    },
    {
      command: "npm run dev -- --port 3018",
      url: "http://localhost:3018/",
      reuseExistingServer: !process.env.CI,
      env: {
        MBAB_LEGACY_SEARCH_URL: "http://127.0.0.1:8008/ajax/search/",
        MBAB_CHAPTER_URL: "http://127.0.0.1:8008/chapter/",
      },
    },
  ],
});
