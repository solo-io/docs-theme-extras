import { test, expect } from "@playwright/test";
import fs from "node:fs";
import { crawlBuiltRoot } from "./helpers/crawl";
import { target } from "./helpers/target";

// Dev-build guard.
//
// `hugo server` (the dev server, e.g. `make server PRODUCT=…`) injects a
// LiveReload client script — `<script src="/livereload.js?mindelay=…&port=1313…">`
// — into every rendered page. A production build (`hugo` / `make build`) does
// NOT. When the harness runs against a dev-server `public/`, that script 404s
// under the test's static server, so console-errors.spec.ts reports the same
// "Failed to load resource: 404 /livereload.js" on hundreds of pages — a flood
// of near-identical failures that looks alarming but only means the wrong build
// was tested.
//
// This spec collapses that into ONE clear, actionable failure: if any built
// page carries the LiveReload injection, fail and say "rebuild for production".
// On a real production build no page matches and the spec passes. (The
// matching 404 is also suppressed in console-errors.spec.ts BUILTIN_NOISE, so
// the signal surfaces here once instead of per page.)

// The injected tag always carries a query string (mindelay/port/path); match
// that so a docs page merely *mentioning* "livereload.js" in prose can't trip
// the guard.
const LIVERELOAD = /livereload\.js\?/;

test.describe("dev-build guard", () => {
  let pages: { filePath: string; url: string }[] = [];
  let crawlFailed = false;
  try {
    pages = crawlBuiltRoot();
  } catch {
    crawlFailed = true;
  }

  test.skip(crawlFailed, "builtRoot not built yet — run the Hugo build first");

  test("built output is a production build, not a `hugo server` dev build", () => {
    const offenders: string[] = [];
    for (const p of pages) {
      let html: string;
      try {
        html = fs.readFileSync(p.filePath, "utf8");
      } catch {
        continue;
      }
      if (LIVERELOAD.test(html)) offenders.push(p.url);
    }

    const sample = offenders.slice(0, 5).join("\n  ");
    expect(
      offenders.length,
      `${offenders.length} of ${pages.length} built page(s) inject Hugo's ` +
        `LiveReload script (/livereload.js), which 404s under the test server. ` +
        `Those pages came from \`hugo server\` (dev), not a production build. ` +
        `Two common causes: (1) the whole build is a dev build — rebuild for ` +
        `production (\`hugo --gc --minify\`, or \`make build PRODUCT=<product>\` ` +
        `for the docs hub); or (2) STALE dev pages are left in the publish dir ` +
        `from a prior \`hugo server\` run, mixed in with a clean build — ` +
        `\`rm -rf <publishDir>\` and rebuild so the harness only sees the ` +
        `intended pages. Then re-run.\n  ${sample}` +
        (offenders.length > 5 ? `\n  …and ${offenders.length - 5} more` : ""),
    ).toBe(0);
  });
});
