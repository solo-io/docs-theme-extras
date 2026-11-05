import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { TEST_PRODUCT_ROOT } from "./helpers/fixture";
import { target } from "./helpers/target";

// Guards components/test-status-badge.html, the doc-test "Verified" badge.
//
// The badge is gated on `test_status: passed` in front matter, which CI injects
// from doc-test results just before a production build. The gate is the whole
// contract: `failed` and `partial` are real values the inject script writes,
// and a page carrying either must NOT claim its examples were verified.
//
// docs/single.html calls the partial directly, inside the heading column, so
// the spec reads the badge where readers see it: after the `<h1>`, before the
// copy/context buttons. It skips that call when the under-heading slot already
// prints a badge (a consumer's pre-0.3.18 override), so the page never shows
// two. fixture/layouts/partials/docs/under-heading.html plays that consumer.
// Fixture-only; server-rendered markup read statically.

const IS_FIXTURE_TARGET = target.name.startsWith("docs-theme-extras-fixture");

function builtPage(status: string): string {
  const file = path.join(TEST_PRODUCT_ROOT, "v2", `test-status-${status}`, "index.html");
  expect(fs.existsSync(file), `fixture page not built: ${file}`).toBe(true);
  return fs.readFileSync(file, "utf8");
}

const BADGE = 'class="test-status-badge';

test.describe("doc-test Verified badge", () => {
  test.skip(!IS_FIXTURE_TARGET, "fixture-only: reads built fixture pages");

  test("test_status: passed renders one badge, readable without hover", () => {
    const html = builtPage("passed");
    expect(html.split(BADGE).length - 1, "badge count").toBe(1);
    expect(html).toContain('class="test-status-badge test-status-passed"');
    expect(html).toContain(">Verified</span>");
    // The explanation is real text in the badge, hidden only visually, so a
    // screen reader gets it in browse mode and on focus. The tooltip draws the
    // same text and is aria-hidden so it is not read twice.
    expect(html).toMatch(/class="test-status-sr">: Code examples on this page/);
    expect(html).toMatch(/class="test-status-tooltip" aria-hidden="true">Code examples on this page/);
    // Focusable, so keyboard users can open the tooltip.
    expect(html).toContain('tabindex="0"');
  });

  test("test_types lists each known kind, in order, and skips unknown ones", () => {
    // The fixture lists kubernetes, config, helm, functional, and an unknown kind. The
    // tooltip shows the intro and a label plus description for the known kinds,
    // in place of the generic sentence, and never prints the raw unknown name.
    const html = builtPage("types");
    expect(html.split(BADGE).length - 1, "badge count").toBe(1);
    expect(html).toContain('class="test-status-tooltip test-status-tooltip-types" aria-hidden="true"');
    expect(html).toContain("passed these automated tests:");
    const labels = [...html.matchAll(/class="test-status-type-label">([^<]+)</g)].map((m) => m[1]);
    expect(labels).toEqual([
      "Matches the Kubernetes API",
      "Matches the config schema",
      "Matches the Helm chart",
      "Runs end to end",
    ]);
    expect(html).not.toContain("not-a-kind");
    expect(html).not.toContain("Code examples on this page have been automatically tested");
    // Screen readers get the same rows as text, in one sentence.
    expect(html).toMatch(/class="test-status-sr">: The code examples on this page passed these automated tests: Matches the Kubernetes API: The Kubernetes resources on this page/);
  });

  test("without test_types the tooltip keeps the generic sentence", () => {
    expect(builtPage("passed")).not.toContain("test-status-type-label");
  });

  test("a slot override that already prints a badge leaves exactly one", () => {
    const html = builtPage("legacy-override");
    expect(html.split(BADGE).length - 1, "badge count").toBe(1);
    expect(html, "the override's badge should be the one kept").toContain(
      'data-fixture="legacy-override"',
    );
  });

  test("the badge sits in the heading column, after the h1 and before the buttons", () => {
    // Inside the heading column is what keeps the badge above the copy/context
    // buttons when the title area stacks on a narrow viewport.
    const html = builtPage("passed");
    const h1 = html.indexOf('<h1 class="hx:mb-0">');
    const badge = html.indexOf(BADGE);
    const buttons = html.indexOf('<div class="hx:flex hx:items-center hx:gap-2">', h1);
    expect(h1, "h1 missing").toBeGreaterThan(-1);
    expect(buttons, "button row missing").toBeGreaterThan(-1);
    expect(badge).toBeGreaterThan(h1);
    expect(badge).toBeLessThan(buttons);
  });

  test("test_status: failed renders nothing", () => {
    expect(builtPage("failed")).not.toContain(BADGE);
  });

  test("no page without test_status: passed renders a badge", () => {
    // The badge is built in, so a loosened gate would put it on every page.
    // This is where that shows up.
    const offenders: string[] = [];
    const walk = (d: string) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const full = path.join(d, e.name);
        if (e.isDirectory()) walk(full);
        else if (
          e.name.endsWith(".html") &&
          !full.includes(`${path.sep}test-status-passed${path.sep}`) &&
          !full.includes(`${path.sep}test-status-legacy-override${path.sep}`) &&
          !full.includes(`${path.sep}test-status-types${path.sep}`) &&
          fs.readFileSync(full, "utf8").includes(BADGE)
        )
          offenders.push(path.relative(target.builtRoot, full));
      }
    };
    walk(target.builtRoot);
    expect(offenders).toEqual([]);
  });

  test("the stylesheet ships the badge rules", () => {
    const css = path.join(TEST_PRODUCT_ROOT, "css", "docs-theme-extras.css");
    expect(fs.existsSync(css), `built stylesheet missing: ${css}`).toBe(true);
    const src = fs.readFileSync(css, "utf8");
    for (const sel of [
      ".test-status-badge",
      ".test-status-tooltip",
      ".test-status-sr",
      ".test-status-dismissed",
      ".dark .test-status-passed",
      ".test-status-type-label",
    ]) {
      expect(src, `${sel} missing from docs-theme-extras.css`).toContain(sel);
    }
  });
});
