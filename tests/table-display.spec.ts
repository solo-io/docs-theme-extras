import { test, expect } from "@playwright/test";
import { target } from "./helpers/target";

// Regression guard for the `table` shortcode display modes in
// layouts/_shortcodes/table.html + the `.solo-table--<mode>` rules in
// docs-theme-extras.css. Each mode wraps a rendered markdown table and
// overrides render-table.html's default column-count cap:
//   wrap   — width:100%, cells wrap, no cap, no horizontal scroll
//   nowrap — width:max-content, cells never wrap, wrapper scrolls when overflowing
//   equal  — table-layout:fixed, columns divided evenly, cells wrap
// Plus the two resolution paths: an omitted mode defaults to wrap, and an
// unknown mode warns at build time (allowlisted in the fixture config) and
// falls back to wrap.
//
// The equal-mode table is 3 columns, so render-table also tags it
// `.table-wrapper.table-capped`; asserting fixed layout + even columns there
// doubles as proof the mode rule outweighs the cap rule.
//
// The modes live under the "Tables" section of the fixture `everything` topic;
// skipped against consumer builds. Runs at 1280px so the layout is stable.
// Each mode sits under its own heading so it is targeted unambiguously (default
// and unknown both render as wrap).

const IS_FIXTURE_TARGET = target.name.startsWith("docs-theme-extras-fixture");
const FIXTURE_BASE = "/" + target.baseURL.replace(/^\/+|\/+$/g, "");
const PAGE = `${FIXTURE_BASE}/v2/everything/`;

// Read the computed layout of the `.solo-table` block that follows a given
// heading id. All the per-mode assertions derive from this one probe, so each
// section's table is measured independently even though several render as
// wrap. Returns null when the section or its table is missing.
async function probe(page: import("@playwright/test").Page, headingId: string) {
  return page.evaluate((id) => {
    // Hextra puts the anchor id on a <span> INSIDE the heading, so climb to the
    // heading element, then walk its following siblings to the `.solo-table`.
    const anchor = document.getElementById(id);
    const heading = anchor
      ? anchor.closest("h1, h2, h3, h4, h5, h6")
      : null;
    let scope: Element | null = heading ? heading.nextElementSibling : null;
    while (scope && !(scope.classList && scope.classList.contains("solo-table"))) {
      scope = scope.nextElementSibling;
    }
    if (!scope) return null;
    const table = scope.querySelector("table") as HTMLElement | null;
    const wrapper = scope.querySelector(".table-wrapper") as HTMLElement | null;
    const ths = Array.from(scope.querySelectorAll("thead th")) as HTMLElement[];
    const firstCell = scope.querySelector("tbody td:first-child") as HTMLElement | null;
    const lastCell = scope.querySelector("tbody td:last-child") as HTMLElement | null;
    return {
      className: scope.className,
      hasTable: !!table,
      tableLayout: table ? getComputedStyle(table).tableLayout : null,
      tableW: table ? table.getBoundingClientRect().width : null,
      wrapperClientW: wrapper ? wrapper.clientWidth : null,
      wrapperScrollW: wrapper ? wrapper.scrollWidth : null,
      wrapperOverflowX: wrapper ? getComputedStyle(wrapper).overflowX : null,
      colWidths: ths.map((t) => Math.round(t.getBoundingClientRect().width)),
      firstCellWhiteSpace: firstCell ? getComputedStyle(firstCell).whiteSpace : null,
      firstCellMaxWidth: firstCell ? getComputedStyle(firstCell).maxWidth : null,
      lastCellWhiteSpace: lastCell ? getComputedStyle(lastCell).whiteSpace : null,
      lastCellMaxWidth: lastCell ? getComputedStyle(lastCell).maxWidth : null,
    };
  }, headingId);
}

test.describe("table shortcode display modes", () => {
  test.skip(!IS_FIXTURE_TARGET, "fixture-only page");
  test.use({ viewport: { width: 1280, height: 800 } });

  test("wrap: fills the body width, cells wrap, no column cap, no scroll", async ({
    page,
  }) => {
    await page.goto(PAGE);
    const r = await probe(page, "table-shortcode-wrap-mode");
    expect(r, ".solo-table for wrap-mode not found").not.toBeNull();
    expect(r!.className).toContain("solo-table--wrap");
    expect(r!.lastCellMaxWidth, "wrap cell is still capped (max-width != none)").toBe(
      "none",
    );
    expect(r!.lastCellWhiteSpace, "wrap cell is not allowed to wrap").toBe("normal");
    expect(
      Math.abs(r!.tableW! - r!.wrapperClientW!) <= 2,
      "wrap table does not fill the body width",
    ).toBe(true);
    expect(
      r!.wrapperScrollW! <= r!.wrapperClientW! + 1,
      "wrap table should never scroll horizontally",
    ).toBe(true);
  });

  test("nowrap: cells never wrap and the table scrolls when wider than the body", async ({
    page,
  }) => {
    await page.goto(PAGE);
    const r = await probe(page, "table-shortcode-nowrap-mode");
    expect(r, ".solo-table for nowrap-mode not found").not.toBeNull();
    expect(r!.className).toContain("solo-table--nowrap");
    // first cell holds the intentionally long, unbreakable command
    expect(r!.firstCellWhiteSpace, "nowrap cell is allowed to wrap").toBe("nowrap");
    expect(r!.firstCellMaxWidth, "nowrap cell is capped (max-width != none)").toBe("none");
    expect(r!.wrapperOverflowX, "wrapper is not horizontally scrollable").toMatch(
      /auto|scroll/,
    );
    expect(
      r!.wrapperScrollW! > r!.wrapperClientW! + 1,
      "the long nowrap command did not overflow into a scroll",
    ).toBe(true);
  });

  test("equal: fixed layout with evenly divided columns", async ({ page }) => {
    await page.goto(PAGE);
    const r = await probe(page, "table-shortcode-equal-mode");
    expect(r, ".solo-table for equal-mode not found").not.toBeNull();
    expect(r!.className).toContain("solo-table--equal");
    expect(r!.colWidths.length, "equal-mode table is not 3 columns").toBe(3);
    expect(r!.tableLayout, "equal mode is not table-layout:fixed").toBe("fixed");
    const [a, b, c] = r!.colWidths;
    const maxDelta = Math.max(Math.abs(a - b), Math.abs(b - c), Math.abs(a - c));
    expect(
      maxDelta,
      `equal columns are not evenly divided: ${r!.colWidths.join(", ")}`,
    ).toBeLessThanOrEqual(2);
  });

  test("default: an omitted mode resolves to wrap", async ({ page }) => {
    await page.goto(PAGE);
    const r = await probe(page, "table-shortcode-default-mode");
    expect(r, ".solo-table for default-mode not found").not.toBeNull();
    expect(r!.className, "default did not resolve to the wrap class").toContain(
      "solo-table--wrap",
    );
    expect(
      Math.abs(r!.tableW! - r!.wrapperClientW!) <= 2,
      "default (wrap) table does not fill the body width",
    ).toBe(true);
    expect(
      r!.wrapperScrollW! <= r!.wrapperClientW! + 1,
      "default (wrap) table should not scroll horizontally",
    ).toBe(true);
  });

  test("unknown: an unrecognized mode falls back to wrap", async ({ page }) => {
    await page.goto(PAGE);
    const r = await probe(page, "table-shortcode-unknown-mode");
    expect(r, ".solo-table for unknown-mode not found").not.toBeNull();
    expect(r!.className, "unknown mode did not fall back to wrap").toContain(
      "solo-table--wrap",
    );
    expect(r!.className, "the invalid mode token leaked into the class").not.toContain(
      "bogus",
    );
  });
});

// Read the bare `.table-wrapper` (NOT `.solo-table`) that follows a heading —
// a plain markdown reference table, which render-table.html tags
// `.table-capped` when it has 3+ columns. Mirrors `probe` above but targets the
// wrapper directly since capped reference tables aren't wrapped by the `table`
// shortcode.
async function probeWrapper(
  page: import("@playwright/test").Page,
  headingId: string,
) {
  return page.evaluate((id) => {
    const anchor = document.getElementById(id);
    const heading = anchor ? anchor.closest("h1, h2, h3, h4, h5, h6") : null;
    let scope: Element | null = heading ? heading.nextElementSibling : null;
    while (
      scope &&
      !(scope.classList && scope.classList.contains("table-wrapper"))
    ) {
      scope = scope.nextElementSibling;
    }
    if (!scope) return null;
    const wrapper = scope as HTMLElement;
    // The long registry token lives in the 2nd cell (Registry column).
    const tokenCell = wrapper.querySelector(
      "tbody td:nth-child(2)",
    ) as HTMLElement | null;
    return {
      className: wrapper.className,
      clientW: wrapper.clientWidth,
      scrollW: wrapper.scrollWidth,
      overflowX: getComputedStyle(wrapper).overflowX,
      tokenCellWhiteSpace: tokenCell
        ? getComputedStyle(tokenCell).whiteSpace
        : null,
      tokenCellMaxWidth: tokenCell ? getComputedStyle(tokenCell).maxWidth : null,
    };
  }, headingId);
}

// A capped reference table holding a long, break-free registry token (the
// agentgateway airgap `kgateway-image-versions.md` shape). At phone width the
// `@media (max-width: 767px)` rule must switch it from char-per-line folding to
// horizontal scroll. Runs at 375px (iPhone SE width).
test.describe("capped reference table on mobile scrolls instead of char-folding", () => {
  test.skip(!IS_FIXTURE_TARGET, "fixture-only page");
  test.use({ viewport: { width: 375, height: 800 } });

  test("wrapper scrolls horizontally and the long token does not wrap", async ({
    page,
  }) => {
    await page.goto(PAGE);
    const r = await probeWrapper(page, "capped-table-long-unbreakable-token");
    expect(r, ".table-wrapper for the capped mobile table not found").not.toBeNull();
    expect(r!.className, "table is not flagged .table-capped").toContain(
      "table-capped",
    );
    expect(r!.overflowX, "wrapper is not horizontally scrollable").toMatch(
      /auto|scroll/,
    );
    expect(
      r!.tokenCellWhiteSpace,
      "capped cell still wraps at mobile width (should be nowrap)",
    ).toBe("nowrap");
    expect(
      r!.tokenCellMaxWidth,
      "capped cell max-width not lifted at mobile width",
    ).toBe("none");
    expect(
      r!.scrollW > r!.clientW + 1,
      `capped table did not overflow into a scroll at 375px (scrollW ${r!.scrollW} <= clientW ${r!.clientW})`,
    ).toBe(true);
  });
});
