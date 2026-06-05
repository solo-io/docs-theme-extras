import { defineConfig, devices } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";
import { parse as parseToml } from "smol-toml";

// Resolve the served directory from the CONFIG TOML referenced by
// DOCS_TEST_CONFIG. Falls back to <repo>/public when DOCS_TEST_CONFIG is
// unset, which keeps `npx playwright test` working for a freshly built
// fixture in the repo root.
function servedDir(): string {
  const cfg = process.env.DOCS_TEST_CONFIG;
  if (cfg && fs.existsSync(cfg)) {
    const data = parseToml(fs.readFileSync(cfg, "utf8")) as Record<string, unknown>;
    const builtRoot = String(data.builtRoot ?? "");
    if (builtRoot) {
      return path.resolve(path.dirname(cfg), builtRoot);
    }
  }
  return path.resolve(__dirname, "public");
}

const PUBLIC_DIR = servedDir();
const PORT = Number(process.env.TEST_PORT ?? 4321);
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  fullyParallel: true,
  // One retry everywhere (not just CI). The webServer is a single `npx serve`
  // process; under the concurrent load of the full crawl (~1k pages) it
  // occasionally returns a transient 404 for a valid, on-disk page. That is
  // infra noise, not a content bug — a fresh-page retry clears it, while a
  // real error still fails both attempts.
  retries: 1,
  workers: process.env.CI ? 4 : undefined,
  reporter: process.env.CI
    ? [["list"], ["html", { open: "never" }], ["github"]]
    : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
  },
  webServer: {
    command: `npx serve ${PUBLIC_DIR} -l ${PORT} --no-clipboard --no-port-switching`,
    port: PORT,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
  projects: [
    {
      name: "static",
      testMatch:
        /static\.spec\.ts$|versioning\.spec\.ts$|version-nested-list\.spec\.ts$|version-inside-fence\.spec\.ts$|version-table-row\.spec\.ts$|version-cards\.spec\.ts$|markdown-leaks\.spec\.ts$|shortcode-contexts\.spec\.ts$|conditional-block\.spec\.ts$|cond-reuse-table\.spec\.ts$|hugo-warnings\.spec\.ts$|auto-cards\.spec\.ts$|card-image\.spec\.ts$|dev-build\.spec\.ts$|presence\.spec\.ts$|curl-quotes\.spec\.ts$|shortcode-args\.spec\.ts$|include-form\.spec\.ts$|cascade-type\.spec\.ts$|github-shortcode\.spec\.ts$/,
    },
    {
      name: "browser",
      use: { ...devices["Desktop Chrome"] },
      testMatch:
        /browser\.spec\.ts$|contrast\.spec\.ts$|viewport\.spec\.ts$|brand\.spec\.ts$|theme-toggle\.spec\.ts$/,
    },
    {
      name: "cross-browser-chromium",
      use: { ...devices["Desktop Chrome"] },
      testMatch: /cross-browser\.spec\.ts$/,
    },
    {
      name: "cross-browser-firefox",
      use: { ...devices["Desktop Firefox"] },
      testMatch: /cross-browser\.spec\.ts$/,
    },
    {
      name: "cross-browser-webkit",
      use: { ...devices["Desktop Safari"] },
      testMatch: /cross-browser\.spec\.ts$/,
    },
    {
      name: "smoke",
      testMatch: /smoke\.spec\.ts$/,
    },
    // Browser-based crawl: open every built page and assert no uncaught JS
    // exceptions, console.error calls, or 4xx responses on JS/CSS resources.
    // Distinct from the fixture-page-only "browser" project — this one crawls
    // the entire build output (up to smoke.maxFiles pages).
    {
      name: "browser-smoke",
      use: { ...devices["Desktop Chrome"] },
      testMatch: /console-errors\.spec\.ts$/,
    },
  ],
});
