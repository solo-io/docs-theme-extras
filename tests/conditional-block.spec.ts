import { test, expect } from "@playwright/test";
import path from "node:path";
import { TEST_PRODUCT_ROOT, readFixture } from "./helpers/fixture";
import { target } from "./helpers/target";
import { CONDITIONAL_MARKERS } from "./helpers/sentinels";

// Fixture-only: the block-direct page exists solely in the extras fixture
// build. The static project also runs against consumer sites (agw, kgw),
// whose builds have no such page, so skip there rather than error on a
// missing file. Mirrors the IS_FIXTURE_TARGET gate in version-cards.spec.
const IS_FIXTURE_TARGET = target.name.startsWith("docs-theme-extras-fixture");

// Block-content support for the {{< conditional-text >}} shortcode.
//
// The shared emit partial (utils/emit-inner) renders a conditional-text
// body as block (display:"block") when its shape leads with a block
// marker, and inline otherwise. Before centralization the shortcode only
// ever rendered inline, so a heading body escaped as literal `## …` text.
//
// These cases use a DIRECT page (test/v2/block-direct) rather than the
// reuse/rebase-driven everything/rebased pages, because a conditional-text
// body whose first line is a markdown heading cannot be surfaced through
// reuse/rebase: Hugo's shortcode lexer fails extraction
// ("shortcode … must be closed or self-closed") when the conref is
// re-rendered through RenderString. The lexer runs before any template
// logic, so that is a Hugo limitation independent of the shortcode
// template. Used directly, the block bodies render correctly.

const PAGE = path.join(TEST_PRODUCT_ROOT, "v2/block-direct/index.html");

// Strip the copy-as-markdown <script> so its embedded raw source (which
// contains the literal marker strings and `##`/`|` markdown) can't produce
// false positives.
function visibleHtml(): string {
  return readFixture(PAGE).replace(
    /<script[^>]*type=["']text\/markdown["'][^>]*>[\s\S]*?<\/script>/gi,
    "",
  );
}

test.describe("conditional-text block content (direct page)", () => {
  test.skip(!IS_FIXTURE_TARGET, "fixture-only: block-direct page exists only in the extras fixture build");

  test("heading body renders as a real heading element, not literal '##'", () => {
    const html = visibleHtml();
    // The body heading carries inline emphasis, which forces the
    // display:"block" RenderString path. Assert the marker sits inside an
    // <h1>-<h6> together with the <strong> from its `**emphasis**`, i.e.
    // it rendered as a heading rather than escaping to literal text.
    const re = new RegExp(
      `<h[1-6][^>]*>${CONDITIONAL_MARKERS.blockHeading}[^<]*` +
        `<strong>${CONDITIONAL_MARKERS.blockHeadingEmphasis}</strong>`,
    );
    expect(
      html,
      `${CONDITIONAL_MARKERS.blockHeading} did not render as a heading with ` +
        `inline <strong> — conditional-text routed the heading body through ` +
        `inline emit (or escaped it) instead of display:"block".`,
    ).toMatch(re);

    // It must NOT appear as a literal "## " ATX marker in the body.
    expect(
      html,
      `Found a literal "## ${CONDITIONAL_MARKERS.blockHeading}" — the heading ` +
        `body leaked as raw markdown instead of rendering as a heading.`,
    ).not.toContain(`## ${CONDITIONAL_MARKERS.blockHeading}`);
  });

  test("table body renders as a real table cell, not literal pipes", () => {
    const html = visibleHtml();
    expect(
      html,
      `${CONDITIONAL_MARKERS.blockTable} is not inside a <td> — the table ` +
        `body leaked as literal pipe text instead of rendering as a table.`,
    ).toMatch(new RegExp(`<td[^>]*>${CONDITIONAL_MARKERS.blockTable}`));
    expect(
      html,
      `Found a literal "| ${CONDITIONAL_MARKERS.blockTable}" pipe row — the ` +
        `table body leaked as raw markdown.`,
    ).not.toContain(`| ${CONDITIONAL_MARKERS.blockTable}`);
  });

  test("inline body still renders inline with surrounding spaces preserved", () => {
    const html = visibleHtml();
    // The fixture sentence is: "… start <marker> inline body end."
    // Inline emit must keep the body in the flowing paragraph (no block
    // wrapper) and preserve the single spaces on either side.
    expect(
      html,
      `${CONDITIONAL_MARKERS.blockInline} lost its surrounding spaces or got ` +
        `wrapped in a block element — inline emit changed the mid-sentence flow.`,
    ).toContain(`start ${CONDITIONAL_MARKERS.blockInline} inline body end.`);
  });

  test("excluded block heading produces no output", () => {
    const html = visibleHtml();
    expect(
      html,
      `${CONDITIONAL_MARKERS.blockExcluded} rendered despite an exclude-if that ` +
        `matches the build condition — the block path did not honor the gate.`,
    ).not.toContain(CONDITIONAL_MARKERS.blockExcluded);
  });
});
