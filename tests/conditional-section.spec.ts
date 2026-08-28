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

// The positional rule's two halves, on the gating side. See the fixture pages
// for which half each one covers.
const COLLISION_LEAF = path.join(
  TEST_PRODUCT_ROOT,
  "v2/nested/collision/index.html",
);
const COLLISION_INDEX = path.join(TEST_PRODUCT_ROOT, "v2/nested/index.html");

// The section LANDING page, /test/nested/ — a section with no version below it.
const LANDING_PAGE = path.join(TEST_PRODUCT_ROOT, "nested/index.html");

const MD_SCRIPT =
  /<script[^>]*type=["']text\/markdown["'][^>]*>[\s\S]*?<\/script>/gi;

// Strip the copy-as-markdown <script>, whose embedded raw source contains the
// literal marker strings for gates that did NOT render — a guaranteed false
// positive for every "must not appear" assertion below.
//
// EVERY negative assertion in this file depends on this regex matching. If the
// tag's attributes ever change shape, the strip silently becomes a no-op, the
// raw source stays in the haystack and the negatives start passing for the
// wrong reason. The first test below asserts the strip actually removed
// something, so that failure mode is loud instead of silent.
function visibleHtml(p: string): string {
  return readFixture(p).replace(MD_SCRIPT, "");
}

test.describe("conditional-text gates on the section segment", () => {
  test.skip(
    !IS_FIXTURE_TARGET,
    "fixture-only: cond-section pages exist only in the extras fixture build",
  );

  test("the copy-as-markdown strip is not a no-op — every negative below rests on it", () => {
    const raw = readFixture(SECTION_PAGE);
    expect(
      raw.match(MD_SCRIPT),
      `No <script type="text/markdown"> on /test/nested/v2/cond-section/. ` +
        `Either the copy-as-markdown feature stopped emitting it, or its tag ` +
        `shape changed. Until visibleHtml() is updated to match, every ` +
        `"must not appear" assertion in this file is passing vacuously: the ` +
        `raw shortcode source, markers and all, stays in the haystack.`,
      // `raw.match` rather than `toMatch(MD_SCRIPT)`: the regex is global, and
      // a global regex carries lastIndex between calls.
    ).not.toBeNull();
    expect(
      visibleHtml(SECTION_PAGE).length,
      `visibleHtml() removed nothing from /test/nested/v2/cond-section/.`,
    ).toBeLessThan(raw.length);
  });

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

  test("exclude-if naming an UNRELATED section is a no-op inside a section", () => {
    // The mirror of the test above, and the one that pins the direction in
    // which this change can DELETE content. Adding a token to an exclude-if can
    // only ever suppress more, so a segment that over-matches shows up here
    // first — as content silently vanishing, not as content appearing.
    expect(
      visibleHtml(SECTION_PAGE),
      `exclude-if="demo" was suppressed at /test/nested/v2/, which is in the ` +
        `nested section, not demo. The section segment is over-matching, and ` +
        `on the exclude path over-matching DELETES content.`,
    ).toContain(C.secExcludeOther);
  });

  test("a comma list matches on the product token when the section is not in it", () => {
    expect(
      visibleHtml(SECTION_PAGE),
      `include-if="demo, test" did not render at /test/nested/v2/. Either ` +
        `token in the list should satisfy the gate, and list entries are trimmed.`,
    ).toContain(C.secListWithProduct);
  });

  test("a section name does NOT match on a page whose URL never mentions it", () => {
    // The WEAK negative, kept deliberately and labelled as such. /test/v2/
    // contains no registered section name at any position, so this gate could
    // not fire under any implementation — match-anywhere included. It says
    // "tokens do not leak onto unrelated pages" and nothing more. The
    // positional rule is tested by the two collision pages below, which is
    // where a naive implementation actually breaks.
    const html = visibleHtml(NO_SECTION_PAGE);
    expect(
      html,
      `include-if="nested" rendered at /test/v2/, whose URL contains no ` +
        `registered section name at all. Some token is being added to the ` +
        `gate slice that has nothing to do with this page.`,
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

  // THE POSITIONAL RULE, on the gating side.
  //
  // `nested` is a registered section whose real trees live at
  // /test/nested/<version>/. The fixture ALSO ships an ordinary content
  // directory of the same name at /test/v2/nested/, below a version. A
  // match-anywhere implementation reads those pages as being in the `nested`
  // section; utils/section-segment.html's two-part rule refuses them. These
  // are the only fixture pages that can tell the two implementations apart.

  test("positional rule (a): a section name mid-path, not followed by a version, does not gate", () => {
    const html = visibleHtml(COLLISION_LEAF);
    expect(
      html,
      `include-if="nested" rendered at /test/v2/nested/collision/. The ` +
        `segment after "nested" is "collision", not a version, so this is a ` +
        `content directory that happens to share a section's name. Matching ` +
        `it means every gate naming a section fires on unrelated pages — the ` +
        `same class of bug that gave those pages an empty left nav.`,
    ).not.toContain(C.secCollisionSection);
    expect(
      html,
      `include-if="test" did not render at /test/v2/nested/collision/ — the ` +
        `negative above proves nothing if no gate on this page fires.`,
    ).toContain(C.secCollisionProduct);
  });

  test("positional rule (b): a section name as the LAST segment, below a version, does not gate", () => {
    const html = visibleHtml(COLLISION_INDEX);
    expect(
      html,
      `include-if="nested" rendered at /test/v2/nested/. Being the last ` +
        `segment is the shape of a section landing page, and the only thing ` +
        `that disqualifies this one is the version (v2) preceding it. Drop ` +
        `that half of the rule and every _index.md under a same-named content ` +
        `directory starts answering to its section's gates.`,
    ).not.toContain(C.secCollIndexSection);
    expect(
      html,
      `include-if="test" did not render at /test/v2/nested/ — the negative ` +
        `above proves nothing if no gate on this page fires.`,
    ).toContain(C.secCollIndexProduct);
  });

  // SECTION LANDING PAGES. /test/nested/ is a section with no version below it,
  // matched through section-segment's condition (b). In siteParams mode the
  // build condition is the product and is non-empty here, so gates resolve.
  //
  // The same URL shape on an OSS site does NOT gate: `url` mode assigns a
  // condition only when the path carries both a section and a version, so
  // /docs/nested/ resolves "" and the outer guard drops everything. That
  // divergence is deliberate and documented in conditional-text.html; its other
  // half is pinned by tests/section-versionless.spec.ts. These two tests are
  // what make it a pinned decision rather than an accident nobody noticed.

  test("a section landing page gates on its own section (siteParams mode)", () => {
    const html = visibleHtml(LANDING_PAGE);
    expect(
      html,
      `include-if="nested" did not render at /test/nested/, the section's own ` +
        `landing page. section-segment matches a section with no version ` +
        `below it via condition (b), and the build condition is non-empty in ` +
        `siteParams mode, so the gate must resolve.`,
    ).toContain(C.secLandingSection);
    expect(
      html,
      `include-if="test" did not render at /test/nested/.`,
    ).toContain(C.secLandingProduct);
  });

  test("a section landing page does not gate on a DIFFERENT section", () => {
    expect(
      visibleHtml(LANDING_PAGE),
      `include-if="demo" rendered at /test/nested/. A landing page resolves ` +
        `exactly one section — its own.`,
    ).not.toContain(C.secLandingOther);
  });
});
