import { test, expect } from "@playwright/test";
import path from "node:path";
import { TEST_PRODUCT_ROOT, readFixture } from "./helpers/fixture";
import { target } from "./helpers/target";

// Guard for reuse.html flattening its expansion to one logical line.
//
// Hugo substitutes a shortcode's output at the call's SOURCE POSITION. For
// `2. {{% reuse "…" %}}` the first line lands at the list-item content column
// and every later line lands at column 0, so Goldmark's list-item continuation
// rule terminates the list there — closing </li>/</ol> early and hoisting the
// snippet's tail into an <ol start="N"> fragment.
//
// ANGLE form is immune: its output is placeholder-substituted AFTER Goldmark,
// so the list is already parsed. That asymmetry is why this went unnoticed in
// the module for so long — the flatten lived only in the docs hub's LOCAL
// reuse.html override (see OVERRIDES.md), and the fixture only ever exercised
// angle form.
//
// KNOWN LIMITATION, not covered here: a snippet containing a fenced code block
// takes utils/flatten-rendered's <pre> bypass, so the percent-form list still
// splits and the fence emits <p> inside <pre>. Fixturing it would put invalid
// HTML in the build and permanently fail built-html-integrity, so it lives in
// the plan's consumer-cleanup backlog instead. Do not "fix" it with
// bypassPre:false without re-reading the bypass rationale — a reuse expansion
// re-enters the page's markdown stream, which is what the bypass protects.

const IS_FIXTURE_TARGET = target.name.startsWith("docs-theme-extras-fixture");
const PAGE = path.join(TEST_PRODUCT_ROOT, "v2", "reuse-list-continuation", "index.html");

function visibleHtml(): string {
  return readFixture(PAGE)
    .replace(/<script[^>]*type=["']text\/markdown["'][^>]*>[\s\S]*?<\/script>/gi, "")
    // The page's own explanatory HTML comment contains literal `<ol start="N">`
    // text, which would otherwise be counted as markup.
    .replace(/<!--[\s\S]*?-->/g, "");
}

function closesBetween(html: string, a: string, b: string): number {
  const i = html.indexOf(a);
  const j = html.indexOf(b);
  expect(i, `${a} missing`).toBeGreaterThan(-1);
  expect(j, `${b} missing`).toBeGreaterThan(i);
  return (html.slice(i, j).match(/<\/ol>/g) ?? []).length;
}

test.describe("reuse expansion inside a numbered step", () => {
  test.skip(!IS_FIXTURE_TARGET, "fixture-only page");

  test("angle form keeps the list intact", () => {
    expect(
      closesBetween(visibleHtml(), "MARKER_LISTCONT_STEP1", "MARKER_LISTCONT_STEP3"),
    ).toBe(0);
  });

  test("percent form keeps the list intact when the snippet has no fence", () => {
    expect(
      closesBetween(visibleHtml(), "MARKER_LISTCONT_NF_STEP1", "MARKER_LISTCONT_NF_STEP3"),
      "reuse.html is not flattening its output — a multi-line percent-form " +
        "expansion terminated the parent <ol>",
    ).toBe(0);
  });


  test("the reused fence renders as a real code block in every case", () => {
    const html = visibleHtml();
    expect(html).toContain("MARKER_LISTCONT_CODE");
    expect(html).toContain("MARKER_LISTCONT_NF_TAIL");
    expect(html).not.toMatch(/```/);
  });
});
