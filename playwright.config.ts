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
    // Layout / theme-behavior specs. Every spec here renders the theme's
    // bundled FIXTURE and asserts how the THEME behaves (versioning, cards,
    // sidebar, callouts, shortcode edge cases). Against a consumer's own build
    // they test.skip (their fixture pages aren't in the consumer's builtRoot),
    // so they carry signal only when LAYOUTS change — a consumer runs this
    // project on layout PRs. Specs whose pass/fail depends on the consumer's
    // real content or source live in the "content" project below, NOT here.
    {
      name: "static",
      testMatch:
        /static\.spec\.ts$|versioning\.spec\.ts$|versioned-image-auto\.spec\.ts$|version-nested-list\.spec\.ts$|version-inside-fence\.spec\.ts$|version-table-row\.spec\.ts$|version-cards\.spec\.ts$|shortcode-contexts\.spec\.ts$|conditional-block\.spec\.ts$|cond-reuse-table\.spec\.ts$|callout-in-table-cell\.spec\.ts$|auto-cards\.spec\.ts$|card-image\.spec\.ts$|presence\.spec\.ts$|github-shortcode\.spec\.ts$|language-switch\.spec\.ts$|redirect\.spec\.ts$|sidebar-linktitle\.spec\.ts$|sidebar-flat\.spec\.ts$|link-hextra-apiref\.spec\.ts$|build-resilience\.spec\.ts$|page-feedback\.spec\.ts$|footnotes-after-cards\.spec\.ts$|callout-icon\.spec\.ts$|custom-alert\.spec\.ts$|docs-tabs\.spec\.ts$|meta-description\.spec\.ts$|link-hextra-lang-prefix\.spec\.ts$|warn-missing-description\.spec\.ts$/,
    },
    // Consumer-content specs. Every spec here reads the CONSUMER's own content
    // — either the built HTML tree (target.builtRoot) or the markdown source
    // (target.scanRoots) — so its pass/fail tracks content edits, not layout
    // edits. A consumer runs this project whenever CONTENT changes (and on
    // layout PRs too, since a layout change alters how existing content
    // renders). This is the coverage a layout-only trigger was missing.
    //   builtRoot scanners: markdown-leaks (rendering leaks), missing-images
    //     (<img>/<source> refs that 404), built-html-integrity (<p>-in-<pre>,
    //     fragmented code blocks, copy-md presence), copy-md-fidelity
    //     (copy-as-markdown output vs HTML), hugo-warnings (build-log warnings),
    //     dev-build (fails if the build carries a dev-server LiveReload script).
    //   source scanners: curl-quotes, tab-syntax, shortcode-args,
    //     heading-shortcode-id, include-form, cascade-type (all walk scanRoots
    //     markdown).
    // The pure-unit describe blocks inside these specs (deterministic, no build
    // needed) ride along here too — cheap, and they keep helper regressions
    // visible.
    {
      name: "content",
      testMatch:
        /markdown-leaks\.spec\.ts$|missing-images\.spec\.ts$|built-html-integrity\.spec\.ts$|copy-md-fidelity\.spec\.ts$|hugo-warnings\.spec\.ts$|dev-build\.spec\.ts$|curl-quotes\.spec\.ts$|tab-syntax\.spec\.ts$|shortcode-args\.spec\.ts$|heading-shortcode-id\.spec\.ts$|include-form\.spec\.ts$|cascade-type\.spec\.ts$/,
    },
    {
      name: "browser",
      use: { ...devices["Desktop Chrome"] },
      testMatch:
        /browser\.spec\.ts$|contrast\.spec\.ts$|viewport\.spec\.ts$|brand\.spec\.ts$|theme-toggle\.spec\.ts$|mermaid-render\.spec\.ts$|sidebar-rail\.spec\.ts$|toc-layout\.spec\.ts$|alert-body\.spec\.ts$|back-to-top\.spec\.ts$|table-display\.spec\.ts$/,
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
    // Browser-based crawl: open every built page and assert no uncaught JS
    // exceptions, console.error calls, or 4xx responses on JS/CSS resources.
    // Distinct from the fixture-page-only "browser" project — this one crawls
    // the entire build output (up to [crawl].maxFiles pages).
    {
      name: "browser-crawl",
      use: { ...devices["Desktop Chrome"] },
      testMatch: /console-errors\.spec\.ts$/,
    },
  ],
});
