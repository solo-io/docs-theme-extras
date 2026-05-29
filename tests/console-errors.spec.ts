import { test, expect } from "@playwright/test";
import { target } from "./helpers/target";
import { crawlBuiltRoot, type CrawledPage } from "./helpers/crawl";

// Browser-level smoke: open every built page in Chromium and fail if any of
// these appear before or shortly after load:
//
//   • pageerror   — uncaught JS exceptions, e.g.
//                   "TypeError: can't access property 'setAttribute', e is null"
//                   These show as red entries in the browser DevTools Console.
//
//   • console.error — explicit error logging from theme or third-party JS.
//
//   • HTTP 4xx/5xx on .js or .css resources — a missing script is the most
//                   common root cause of follow-on JS TypeErrors.
//
// Each page becomes its own test so Playwright's parallel execution keeps
// the total runtime manageable. The smoke.maxFiles cap applies (50 by
// default; set to 0 in .docs-test.toml for unlimited coverage).
//
// Known noise from analytics CDNs and similar third-party scripts is
// suppressed by BUILTIN_NOISE below. Add per-consumer patterns under
// [allowlists].consoleErrors in the .docs-test.toml — they are compiled
// to RegExp and matched against every error message string.
//
// For uncaught exceptions (pageerror) the matched string includes the error
// STACK as well as the message, so an allowlist pattern can target the
// originating source file. That lets a consumer suppress a specific error
// from a vendored bundle (e.g. Hextra's main.min.js, which dereferences the
// sidebar on every page without a null guard) WITHOUT having to allowlist a
// generic message like "...null (reading 'x')" site-wide — which would also
// hide the same error coming from the consumer's or the theme's own code.

const ENABLED = target.shouldRun("consoleErrors");
const MAX = target.smoke.maxFiles;

// Patterns matched against every error string before the test fails.
// Anything that matches is silently dropped. These cover universal
// third-party noise that appears in CI regardless of product content.
const BUILTIN_NOISE: RegExp[] = [
  // Google Analytics / Tag Manager loaded async; logs benign errors
  // on localhost and CI hosts that are not in the GA allowlist.
  /googletagmanager\.com/i,
  /google-analytics\.com/i,
  // Google Fonts / Material Symbols fetched from a CDN — may time out
  // on restricted CI runners with no external network access.
  /fonts\.googleapis\.com/i,
  /fonts\.gstatic\.com/i,
  // Favicon is non-critical and commonly absent in fixture builds.
  /Failed to load resource.*\/favicon\./i,
  // Hugo's dev-server LiveReload client (`hugo server` injects
  // /livereload.js?…port=1313…) 404s when a dev build is served statically.
  // That only means the wrong build was tested; dev-build.spec.ts reports it
  // once with a clear "rebuild for production" message, so don't also flood
  // the browser-smoke report with the same 404 on every page.
  /\/livereload\.js/i,
];

function isSuppressed(msg: string, extra: RegExp[]): boolean {
  return [...BUILTIN_NOISE, ...extra].some((re) => re.test(msg));
}

// Collect pages at module-evaluation time so Playwright can generate one
// test per URL. The build must exist before the test suite runs (same
// assumption as smoke.spec.ts and all other specs that call crawlBuiltRoot).
let pages: CrawledPage[] = [];
try {
  const all = crawlBuiltRoot();
  pages = MAX > 0 ? all.slice(0, MAX) : all;
} catch {
  // builtRoot not yet built; every test below will be skipped via the
  // test.skip(!ENABLED || pages.length === 0, ...) guard.
}

test.describe(`console errors: ${target.name}`, () => {
  test.skip(
    !ENABLED || pages.length === 0,
    "consoleErrors check disabled in CONFIG or no pages found (run the Hugo build first)",
  );

  for (const { url } of pages) {
    test(`no errors on ${url}`, async ({ page }) => {
      const allowlist = target.consoleErrorsAllowlist;
      const errors: string[] = [];

      // Uncaught JS exceptions — the primary target of this spec.
      // These are the red "Uncaught TypeError: ..." lines in DevTools.
      page.on("pageerror", (err) => {
        // Append the stack so allowlist patterns can scope to the originating
        // source file (see header note). The stack is also useful in the
        // failure report when an error is NOT allowlisted.
        const msg = `pageerror: ${err.message}${err.stack ? `\n${err.stack}` : ""}`;
        if (!isSuppressed(msg, allowlist)) errors.push(msg);
      });

      // Explicit console.error() calls from theme JS or third-party scripts.
      page.on("console", (msg) => {
        if (msg.type() === "error") {
          // Browser-generated messages like "Failed to load resource: … 404"
          // carry NO URL in .text() — the failing resource is in
          // .location().url. Append it so the failure report is actionable AND
          // so URL-scoped patterns (allowlist or BUILTIN_NOISE, e.g.
          // /livereload.js/) can match these messages, not just the parallel
          // `response` 4xx channel.
          const loc = msg.location();
          const suffix = loc?.url ? ` (${loc.url})` : "";
          const txt = `console.error: ${msg.text()}${suffix}`;
          if (!isSuppressed(txt, allowlist)) errors.push(txt);
        }
      });

      // HTTP 4xx/5xx on JS and CSS resources. A missing script is the most
      // common root cause of follow-on JS TypeErrors (the element the script
      // expects is never initialised, so subsequent DOM queries return null).
      // Images and fonts are excluded — they are non-critical and noisy.
      page.on("response", (res) => {
        if (res.status() >= 400) {
          const u = res.url();
          if (/\.(js|css)(\?[^/]*)?$/.test(u)) {
            const msg = `HTTP ${res.status()} — ${u}`;
            if (!isSuppressed(msg, allowlist)) errors.push(msg);
          }
        }
      });

      await page.goto(url, { waitUntil: "load" });

      // Give async scripts (mermaid, copy-md, analytics initialisation) a
      // moment to run and potentially throw before we assert.
      await page.waitForTimeout(400);

      expect(
        errors,
        `${errors.length} error(s) on ${url}:\n${errors.join("\n")}`,
      ).toEqual([]);
    });
  }
});
