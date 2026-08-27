import { test, expect } from "@playwright/test";
import path from "node:path";
import { TEST_PRODUCT_ROOT, readFixture } from "./helpers/fixture";
import { target } from "./helpers/target";
import { CONDITIONAL_MARKERS as C } from "./helpers/sentinels";

// Fixture-only: both pages exist solely in the extras fixture build. The
// static project also runs against consumer sites, which have no such
// pages, so skip there rather than error on a missing file. Mirrors the
// IS_FIXTURE_TARGET gate in conditional-block.spec / version-cards.spec.
const IS_FIXTURE_TARGET = target.name.startsWith("docs-theme-extras-fixture");

// conditional-text resolves TWO tokens, not one.
//
// `utils/page-context` returns a single condition, and in "siteParams" mode
// (the multi-product hub) that condition is the site-wide
// `Site.Params.buildCondition` — a PRODUCT id. It cannot vary within a build.
//
// A product that ships parallel documentation sections needs a second axis.
// solo-io/docs' agentgateway build has `kubernetes` and `standalone` sections;
// with only the product token, every `include-if="kubernetes"` /
// `include-if="standalone"` gate in content shared with the OSS site was
// dropped on BOTH sections — not gated, DROPPED. Measured on that build before
// the fix: 50 pages lost content, and `llm/providers/realtime/` rendered "For
// more information about LLM metrics and observability, see ." — both branches
// gone, leaving a dangling sentence.
//
// So the shortcode passes the section segment alongside the build condition,
// reusing `gate-decide`'s existing slice-of-tokens contract (the same one
// `version.html` uses for version + linkVersion).
//
// The fixture's `nested` section is the right shape to pin this: it is the
// only fixture section that NESTS its version trees, at /test/nested/<version>/,
// which is exactly the agentgateway URL shape.

const SECTION_PAGE = path.join(
  TEST_PRODUCT_ROOT,
  "nested/v2/cond-section/index.html",
);
const NO_SECTION_PAGE = path.join(
  TEST_PRODUCT_ROOT,
  "v2/cond-section/index.html",
);

// Strip the copy-as-markdown <script>, whose embedded raw source contains the
// literal marker strings for gates that did NOT render — a guaranteed false
// positive for every "must not appear" assertion below.
function visibleHtml(p: string): string {
  return readFixture(p).replace(
    /<script[^>]*type=["']text\/markdown["'][^>]*>[\s\S]*?<\/script>/gi,
    "",
  );
}

test.describe("conditional-text gates on the section segment", () => {
  test.skip(
    !IS_FIXTURE_TARGET,
    "fixture-only: cond-section pages exist only in the extras fixture build",
  );

  test("include-if naming the section renders inside that section's tree", () => {
    expect(
      visibleHtml(SECTION_PAGE),
      `include-if="nested" did not render at /test/nested/v2/. The section ` +
        `segment is not reaching gate-decide, so section-gated content is ` +
        `silently dropped rather than gated.`,
    ).toContain(C.secSection);
  });

  test("include-if naming the buildCondition still renders — the product token is not replaced", () => {
    expect(
      visibleHtml(SECTION_PAGE),
      `include-if="test" stopped rendering at /test/nested/v2/. The section ` +
        `token must be ADDITIVE: solo-io/docs has 82 include-if="agentgateway" ` +
        `gates that distinguish product, not section, and they must keep firing.`,
    ).toContain(C.secProduct);
  });

  test("include-if naming a DIFFERENT registered section does not render", () => {
    expect(
      visibleHtml(SECTION_PAGE),
      `include-if="demo" rendered at /test/nested/v2/. Only the page's own ` +
        `section may match, or gating between sections is meaningless.`,
    ).not.toContain(C.secOtherSection);
  });

  test("exclude-if naming the section suppresses the body", () => {
    expect(
      visibleHtml(SECTION_PAGE),
      `exclude-if="nested" still rendered at /test/nested/v2/. The section ` +
        `token must feed the exclude path as well as the include path.`,
    ).not.toContain(C.secExcludeSection);
  });

  test("a comma list matches on the product token when the section is not in it", () => {
    expect(
      visibleHtml(SECTION_PAGE),
      `include-if="demo, test" did not render at /test/nested/v2/. Either ` +
        `token in the list should satisfy the gate, and list entries are trimmed.`,
    ).toContain(C.secListWithProduct);
  });

  test("a section name does NOT match on a page outside any section tree", () => {
    const html = visibleHtml(NO_SECTION_PAGE);
    expect(
      html,
      `include-if="nested" rendered at /test/v2/, which has no section ` +
        `segment. A registered section name must only resolve where a section ` +
        `can legitimately sit — see the positional rule in ` +
        `utils/section-segment.html.`,
    ).not.toContain(C.secSection);
    // The control: the product token still works there, so the page itself
    // renders gates at all and the negative above is not vacuous.
    expect(
      html,
      `include-if="test" did not render at /test/v2/ either — the negative ` +
        `assertion above proves nothing if no gate on this page fires.`,
    ).toContain(C.secProduct);
  });

  test("exclude-if naming a section renders where that section does not apply", () => {
    expect(
      visibleHtml(NO_SECTION_PAGE),
      `exclude-if="nested" was suppressed at /test/v2/, which is not in the ` +
        `nested section. Excluding an unrelated section must be a no-op.`,
    ).toContain(C.secExcludeSection);
  });
});
