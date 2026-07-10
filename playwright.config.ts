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
    // Layout / theme-behavior specs: they render the bundled fixture and
    // assert how the THEME behaves (versioning, cards, sidebar, callouts,
    // shortcode edge cases). Their pass/fail depends on layouts, not on the
    // consumer's real content, so a consumer runs these only when layouts
    // change. Specs that scan the consumer's actual content live in the
    // "content" project below.
    {
      name: "static",
      testMatch:
        /static\.spec\.ts$|versioning\.spec\.ts$|version-nested-list\.spec\.ts$|version-inside-fence\.spec\.ts$|version-table-row\.spec\.ts$|version-cards\.spec\.ts$|shortcode-contexts\.spec\.ts$|conditional-block\.spec\.ts$|cond-reuse-table\.spec\.ts$|callout-in-table-cell\.spec\.ts$|hugo-warnings\.spec\.ts$|auto-cards\.spec\.ts$|card-image\.spec\.ts$|dev-build\.spec\.ts$|presence\.spec\.ts$|shortcode-args\.spec\.ts$|tab-syntax\.spec\.ts$|include-form\.spec\.ts$|cascade-type\.spec\.ts$|github-shortcode\.spec\.ts$|language-switch\.spec\.ts$|redirect\.spec\.ts$|sidebar-linktitle\.spec\.ts$|sidebar-flat\.spec\.ts$|page-feedback\.spec\.ts$|footnotes-after-cards\.spec\.ts$|callout-icon\.spec\.ts$|custom-alert\.spec\.ts$|copy-md-fidelity\.spec\.ts$/,
    },
    // Content-facing scanners: their pass/fail depends on the CONSUMER's real
    // content — markdown-leaks walks the built HTML tree (target.builtRoot),
    // curl-quotes lints the source markdown (target.scanRoots). A consumer must
    // run these whenever CONTENT changes, not just on layout changes — that is
    // the gap that let content-only PRs (which never touched layouts/**) ship
    // rendering breaks unscanned. Kept as their own project so a consumer's
    // content workflow can target `--project=content` on content + layout PRs
    // while the "static" project runs only on layout PRs. NOTE: the pure-unit
    // `describe` blocks inside these specs (deterministic, no build needed)
    // ride along here too — cheap, and they keep helper regressions visible.
    {
      name: "content",
      testMatch: /markdown-leaks\.spec\.ts$|curl-quotes\.spec\.ts$/,
    },
    {
      name: "browser",
      use: { ...devices["Desktop Chrome"] },
      testMatch:
        /browser\.spec\.ts$|contrast\.spec\.ts$|viewport\.spec\.ts$|brand\.spec\.ts$|theme-toggle\.spec\.ts$|mermaid-render\.spec\.ts$|sidebar-rail\.spec\.ts$|toc-layout\.spec\.ts$|alert-body\.spec\.ts$|back-to-top\.spec\.ts$/,
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
