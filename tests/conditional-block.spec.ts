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

  // Direct-path render of a conditional-text body whose first non-blank line
  // is an INDENTED fence (a list-step continuation). NOTE: on the direct page
  // a single RenderString does NOT fragment the list whether or not the
  // isFencedBlock raw-emit fires — the fragmentation the fix targets only
  // shows up on the SECOND render (reuse/rebase re-parse), which conditional-
  // text can't be driven through here (Hugo's shortcode lexer rejects a
  // list-spanning percent block on the reuse path). So this is a render +
  // gating smoke for the direct block path, not a discriminating guard for
  // the isFencedBlock fix itself — that shared logic is guarded through the
  // version reuse path in version-nested-list.spec.ts (trailing-step).
  test("fenced code block in a list step renders as an in-list code block", () => {
    const html = visibleHtml();
    const code = CONDITIONAL_MARKERS.fenceBlockCode;
    const after = CONDITIONAL_MARKERS.fenceBlockAfter;

    const codeIdx = html.indexOf(code);
    const afterIdx = html.indexOf(after);
    expect(codeIdx, `${code} missing from block-direct`).toBeGreaterThan(-1);
    expect(afterIdx, `${after} missing from block-direct`).toBeGreaterThan(-1);

    // 1) The fence rendered as a real Chroma-highlighted code block, not as
    //    literal ```sh text. The marker is a yaml/sh comment INSIDE the <code>.
    const preIdx = html.lastIndexOf("<pre", codeIdx);
    expect(preIdx, `${code} has no preceding <pre> — fence not parsed`).toBeGreaterThan(-1);
    const preTag = html.slice(preIdx, html.indexOf(">", preIdx) + 1);
    expect(
      preTag,
      `${code}'s enclosing <pre> has no Chroma class — the indented fence ` +
        `was not raw-emitted into the list and rendered as a code block.`,
    ).toMatch(/class="[^"]*chroma/);

    // 2) The fence sits inside an open <code> at the marker position (not a
    //    closed earlier block). codeOpens > codeCloses before the marker.
    const before = html.slice(0, codeIdx);
    const codeOpens = (before.match(/<code[\s>]/g) || []).length;
    const codeCloses = (before.match(/<\/code>/g) || []).length;
    expect(
      codeOpens,
      `${code} is not inside an open <code> block — fence leaked as plain text.`,
    ).toBeGreaterThan(codeCloses);

    // 3) No fragmentation between the fence and the following step: the
    //    parent <ol> must NOT close early (the symptom that drops the next
    //    step out of the list and leaks it as raw "3." text). Assert no
    //    </ol> appears between the rendered fence and the trailing step.
    const region = html.slice(codeIdx, afterIdx);
    expect(
      (region.match(/<\/ol>/g) || []).length,
      `An </ol> closes between ${code} and ${after} — the conditional-text ` +
        `fence broke the surrounding list on the direct render path.`,
    ).toBe(0);

    // 4) No empty hextra-code-block wrapper orphaned by the fragmentation.
    expect(
      region,
      `An empty hextra-code-block wrapper appears after the fence — the ` +
        `block fragmented (a dead copy-button shell outside the list).`,
    ).not.toMatch(/hextra-code-block[^"]*"[^>]*>\s*<\/div>/);

    // 5) The trailing step continues the list as its own <li>, with no
    //    closed </ol> immediately before it.
    const liIdx = html.lastIndexOf("<li", afterIdx);
    const olCloseIdx = html.lastIndexOf("</ol>", afterIdx);
    expect(
      liIdx,
      `${after} has no preceding <li> — the trailing step left the list.`,
    ).toBeGreaterThan(-1);
    expect(
      liIdx,
      `${after} sits after a closed </ol> — the trailing step rendered ` +
        `outside the parent list (leaked as raw "3." text).`,
    ).toBeGreaterThan(olCloseIdx);
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
