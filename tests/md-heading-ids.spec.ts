import { test, expect } from "@playwright/test";
import path from "node:path";
import { TEST_PRODUCT_ROOT, readFixture } from "./helpers/fixture";
import { target } from "./helpers/target";

// Regression guard for explicit heading ids in the .md output format
// (utils/page-to-markdown.html).
//
// transform.HTMLToMarkdown drops the id that Hextra puts on the <span> inside a
// heading, so `## Title {#custom-id}` used to come out as plain `## Title`. Any
// in-page `[x](#custom-id)` link in the .md file then pointed at nothing, and
// Lychee (which scans the .md exports) fell back to the heading-text slug and
// reported "Cannot find fragment" (kagent-dev/website#737).
//
// The partial now restores `{#custom-id}` when the id differs from the slug of
// the heading text, and leaves auto-id headings alone.

const IS_FIXTURE_TARGET = target.name.startsWith("docs-theme-extras-fixture");

const md = (rel: string) => readFixture(path.join(TEST_PRODUCT_ROOT, rel));

test.describe(".md export keeps explicit heading ids", () => {
  test.skip(!IS_FIXTURE_TARGET, "fixture-only: relies on the extras fixture pages");

  test("explicit id that differs from the slug is kept as {#id}", () => {
    const out = md("v1/reference/cel/variables.md");
    expect(out).toMatch(/^## Functions: policy\.all \{#functions-policy-all\}$/m);
  });

  test("auto-id heading gets no attribute", () => {
    const out = md("v2/ol-split.md");
    const line = out.split("\n").find((l) => /^## Shape 1\b/.test(l));
    expect(line, "Shape 1 heading missing from ol-split.md").toBeTruthy();
    expect(line).not.toContain("{#");
  });

  test("no placeholder leaks into the output", () => {
    for (const rel of ["v1/reference/cel/variables.md", "v2/ol-split.md", "v2/everything.md"]) {
      expect(md(rel), rel).not.toContain("XHEADINGIDPLACEHOLDER");
    }
  });
});
