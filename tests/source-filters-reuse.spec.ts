import { test, expect } from "@playwright/test";
import path from "node:path";
import { TEST_PRODUCT_ROOT, readFixture } from "./helpers/fixture";
import { target } from "./helpers/target";

// Guard for the `upstream` / `downstream` source filters across ALL THREE render
// paths, and specifically for the one that used to be unfiltered.
//
// Neither template carries a condition: `upstream` always emits `.Inner`,
// `downstream` always discards it. That is the DIRECT-render answer. The flip to
// the downstream answer is done by filtering the source TEXT before either
// template runs — stripping `upstream` blocks and unwrapping `downstream` ones.
//
// rebase.html did that filtering (Stage 3b) and reuse.html did not, which made
// the pair silently inert for content that reaches downstream through a reuse.
// That is not a corner case: the docs hub does not rebase agentgateway's
// `assets/agw-docs/pages/*` at all. It rebases a one-line
// `content/docs/<section>/<ver>/…` stub whose entire body is a single reuse
// call, so Stage 3b only ever saw the stub and every gate below it rendered on
// BOTH sides. Reproduced here by source-filters-rebase-reuse.md.
//
// The angle-form sentinels are deliberate. Percent is the documented form for
// block bodies (these templates emit `.Inner` untouched, so angle form leaks a
// block body as literal text after Goldmark), but the filters must match both —
// reuse.html does no percent-to-angle conversion of its own, unlike rebase.

const IS_FIXTURE_TARGET = target.name.startsWith("docs-theme-extras-fixture");

const UPSTREAM_ONLY = [
  "MARKER_SF_UPSTREAM_ONLY",
  "MARKER_SF_INLINE_UP",
  "MARKER_SF_ANGLE_UP",
];
const DOWNSTREAM_ONLY = [
  "MARKER_SF_DOWNSTREAM_ONLY",
  "MARKER_SF_INLINE_DOWN",
  "MARKER_SF_ANGLE_DOWN",
];
// Present on every path. MARKER_SF_TAIL sits AFTER the last gated block, so a
// strip regex that ran past its own closing tag would remove it.
const ALWAYS = [
  "MARKER_SF_ALWAYS",
  "MARKER_SF_INLINE_LEAD",
  "MARKER_SF_ANGLE_LEAD",
  "MARKER_SF_TAIL",
];

function pageHtml(slug: string): string {
  return readFixture(path.join(TEST_PRODUCT_ROOT, "v2", slug, "index.html"))
    // The copy-as-markdown embed carries the UNFILTERED source, so every
    // sentinel appears in it regardless of gating. Strip it or every
    // "not present" assertion is vacuously false.
    .replace(/<script[^>]*type=["']text\/markdown["'][^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");
}

test.describe("upstream/downstream source filters", () => {
  test.skip(!IS_FIXTURE_TARGET, "fixture-only pages");

  test("direct reuse keeps upstream and drops downstream", () => {
    const html = pageHtml("source-filters-reuse");
    for (const m of ALWAYS) expect(html, `${m} should always render`).toContain(m);
    for (const m of UPSTREAM_ONLY) expect(html, `${m} should render on the direct path`).toContain(m);
    for (const m of DOWNSTREAM_ONLY) expect(html, `${m} must NOT render on the direct path`).not.toContain(m);
  });

  test("rebase into reuse drops upstream and keeps downstream", () => {
    const html = pageHtml("source-filters-rebase-reuse");
    for (const m of ALWAYS) expect(html, `${m} should always render`).toContain(m);
    for (const m of DOWNSTREAM_ONLY) expect(html, `${m} should render downstream`).toContain(m);
    for (const m of UPSTREAM_ONLY) expect(html, `${m} must NOT survive the reuse filter`).not.toContain(m);
  });

  test("direct rebase drops upstream and keeps downstream (Stage 3b, unchanged)", () => {
    const html = pageHtml("source-filters-rebase");
    for (const m of ALWAYS) expect(html, `${m} should always render`).toContain(m);
    for (const m of DOWNSTREAM_ONLY) expect(html, `${m} should render downstream`).toContain(m);
    for (const m of UPSTREAM_ONLY) expect(html, `${m} must NOT survive Stage 3b`).not.toContain(m);
  });

  test("no shortcode tag leaks as literal text on any path", () => {
    for (const slug of ["source-filters-reuse", "source-filters-rebase-reuse", "source-filters-rebase"]) {
      const html = pageHtml(slug);
      expect(html, `${slug} leaked a raw gate tag`).not.toMatch(
        /\{\{[<%]\s*\/?(up|down)stream/,
      );
    }
  });

  test("the gated block body renders as markdown, not literal text", () => {
    // The upstream body on the direct path and the downstream body downstream
    // are the same shape: an h2, an ordered list, and a fenced code block. If
    // the emit were not transparent, these would arrive as literal text and the
    // heading id would never exist.
    expect(pageHtml("source-filters-reuse"), "upstream body did not re-flow through Markdown")
      .toContain('id="sf-upstream"');
    expect(pageHtml("source-filters-rebase-reuse"), "downstream body did not re-flow through Markdown")
      .toContain('id="sf-downstream"');
  });

  test("the fix is non-vacuous: the two paths disagree", () => {
    // If reuse.html's filters were removed, this page would match the direct
    // one and every assertion above would still pass on a naive read.
    const direct = pageHtml("source-filters-reuse");
    const downstream = pageHtml("source-filters-rebase-reuse");
    expect(direct.includes("MARKER_SF_UPSTREAM_ONLY")).toBe(true);
    expect(downstream.includes("MARKER_SF_UPSTREAM_ONLY")).toBe(false);
  });
});
