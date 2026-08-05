import { test, expect, type Page } from "@playwright/test";
import { target } from "./helpers/target";

// Regression guard for solo-io/docs#3280 §2 — ordered-list numbering across a
// SPLIT list.
//
// The theme hides native markers (`list-style: none`) and draws the grey badge
// with `::before { content: counter(...) }`. When a numbered list is
// interrupted by a block Goldmark renders outside the parent <li> — a
// {{< tabs >}} block, a fenced code block — Goldmark emits TWO <ol>s and puts
// `start="N"` on the second. The nested levels used to count with CUSTOM
// counters (`sublistitem` / `subsublistitem`), which cannot see `start`, and
// whose scope only reaches FOLLOWING SIBLINGS. So when the two fragments ended
// up under different parent <li>s (the tabs case) the second restarted at "a".
// The `ol ol:not([start])` trick only ever covered the direct-sibling case.
//
// The fix drops the custom counters and uses the BUILT-IN `list-item` counter,
// which the UA seeds from `start` (per the HTML Standard's list rendering
// rules). Pure CSS — the JS shim the issue proposed is not needed.
//
// HOW THIS TEST READS A MARKER, and why it looks odd:
// `getComputedStyle(el, "::before").content` returns the SPECIFIED value
// ("counter(list-item, lower-alpha)") in chromium, firefox AND webkit — never
// the resolved glyph. innerText and ariaSnapshot exclude generated content too.
// A spec written the obvious way could never fail. So instead we compare
// PIXELS: screenshot the ::before box, then re-screenshot it with the expected
// literal forced via an injected rule, and require the two to be byte-equal.
// Same page, same state, same font, so it is deterministic.

const BASE_URL = "/" + target.baseURL.replace(/^\/+|\/+$/g, "");
const PAGE = `${BASE_URL}/v2/ol-split/`;

// Fixture-only page (deliberately not in CONFIG [[pages]] — static.spec.ts
// would treat it as a comprehensive topic page). Same gate the trailing-step /
// conditional-block / version-cards specs use.
const IS_FIXTURE_TARGET = target.name.startsWith("docs-theme-extras-fixture");

// The ::before box, from docs-theme-extras.css: position:absolute, left:0,
// top:3px, 20x20, on a position:relative <li>.
const MARKER_BOX = { dx: 0, dy: 3, width: 20, height: 20 };

/**
 * Assert that the marker drawn for the <li> containing `marker` is `expected`.
 *
 * Locates the INNERMOST li containing the marker text, clips to its ::before
 * box, then forces `content: "<expected>"` on that one element and re-clips.
 * Byte-equal PNGs mean the counter resolved to exactly the expected glyph.
 */
async function expectMarker(page: Page, marker: string, expected: string) {
  const li = page
    .locator(`#content .content li`, { hasText: marker })
    .filter({ has: page.locator(`:scope:not(:has(li:has-text("${marker}")))`) })
    .first();

  await expect(li, `no <li> found containing ${marker}`).toBeVisible();

  // boundingBox() is viewport-relative and page.screenshot() clips against the
  // viewport, so an <li> below the fold yields an out-of-range clip.
  await li.scrollIntoViewIfNeeded();

  const box = await li.boundingBox();
  expect(box, `no bounding box for ${marker}`).not.toBeNull();
  const clip = {
    x: box!.x + MARKER_BOX.dx,
    y: box!.y + MARKER_BOX.dy,
    width: MARKER_BOX.width,
    height: MARKER_BOX.height,
  };

  const actual = await page.screenshot({ clip });

  const token = `expect-${marker}`;
  await li.evaluate((el, t) => el.setAttribute("data-marker-probe", t), token);
  await page.addStyleTag({
    content: `li[data-marker-probe="${token}"]::before { content: "${expected}" !important; }`,
  });
  const reference = await page.screenshot({ clip });

  // Clean up so a later assertion on the same page isn't affected.
  await li.evaluate((el) => el.removeAttribute("data-marker-probe"));

  expect(
    actual.equals(reference),
    `${marker}: marker did not render as "${expected}"`,
  ).toBe(true);
}

test.describe("ordered-list markers across a split list", () => {
  test.skip(
    !IS_FIXTURE_TARGET,
    "ol-split is a fixture-only page; skipped against consumer builds",
  );

  test.beforeEach(async ({ page }) => {
    await page.goto(PAGE);
    // Marker glyphs are font-dependent; wait for webfonts so the two
    // screenshots in expectMarker() are taken in the same rendering state.
    await page.evaluate(() => document.fonts.ready);
  });

  // THE REGRESSION. Two nested fragments under different parent <li>s,
  // separated by a tabs block. Rendered "a", "b" before the fix.
  test("shape 1: nested list continues across a tabs block", async ({
    page,
  }) => {
    await expectMarker(page, "MARKER_OLSPLIT_S1_TOP1", "1");
    await expectMarker(page, "MARKER_OLSPLIT_S1_SUB_A", "a");
    await expectMarker(page, "MARKER_OLSPLIT_S1_SUB_B", "b");
    await expectMarker(page, "MARKER_OLSPLIT_S1_TOP2", "2");
    await expectMarker(page, "MARKER_OLSPLIT_S1_SUB_C", "c");
    await expectMarker(page, "MARKER_OLSPLIT_S1_SUB_D", "d");
  });

  // Non-regression: the top level already used counter(list-item).
  test("shape 2: top-level list continues across a tabs block", async ({
    page,
  }) => {
    await expectMarker(page, "MARKER_OLSPLIT_S2_ONE", "1");
    await expectMarker(page, "MARKER_OLSPLIT_S2_TWO", "2");
    await expectMarker(page, "MARKER_OLSPLIT_S2_THREE", "3");
  });

  // Non-regression: this is the case the old `:not([start])` rule covered.
  test("shape 3: nested list continues across a fenced code block", async ({
    page,
  }) => {
    await expectMarker(page, "MARKER_OLSPLIT_S3_SUB_A", "a");
    await expectMarker(page, "MARKER_OLSPLIT_S3_SUB_B", "b");
    await expectMarker(page, "MARKER_OLSPLIT_S3_SUB_C", "c");
  });

  // Non-regression. Verified by break-test: shapes 2, 3 and 4 all pass under
  // the OLD custom-counter CSS; only shape 1 fails (SUB_C rendered "a"). These
  // three are here to prove the rewrite didn't cost anything, not to catch the
  // reported bug.
  test("shape 4: doubly-nested split, and a no-start list restarts", async ({
    page,
  }) => {
    await expectMarker(page, "MARKER_OLSPLIT_S4_SUB_A", "a");
    await expectMarker(page, "MARKER_OLSPLIT_S4_DEEP_I", "i");
    await expectMarker(page, "MARKER_OLSPLIT_S4_DEEP_II", "ii");
    // A nested <ol> with no start attribute must still begin at "a".
    await expectMarker(page, "MARKER_OLSPLIT_S4_RESTART", "a");
  });
});
