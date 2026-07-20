import { test, expect } from "@playwright/test";
import { target } from "./helpers/target";

// Regression guard for the `table` shortcode display modes in
// layouts/_shortcodes/table.html + the `.solo-table--<mode>` rules in
// docs-theme-extras.css. Each mode wraps a rendered markdown table and
// overrides render-table.html's default column-count cap:
//   wrap   — width:100%, cells wrap, no cap, no horizontal scroll
//   nowrap — width:auto, cells never wrap, wrapper scrolls when overflowing
//   equal  — table-layout:fixed, columns divided evenly, cells wrap
//
// The equal-mode table is 3 columns, so render-table also tags it
// `.table-wrapper.table-capped`; asserting fixed layout + even columns there
// doubles as proof the mode rule outweighs the cap rule.
//
// Fixture-only page (test/v2/table-display); skipped against consumer builds.
// Runs at 1280px so the layout is stable.

const IS_FIXTURE_TARGET = target.name.startsWith("docs-theme-extras-fixture");
const FIXTURE_BASE = "/" + target.baseURL.replace(/^\/+|\/+$/g, "");
const PAGE = `${FIXTURE_BASE}/v2/table-display/`;

test.describe("table shortcode display modes", () => {
  test.skip(!IS_FIXTURE_TARGET, "fixture-only page");
  test.use({ viewport: { width: 1280, height: 800 } });

  test("wrap: fills the body width, cells wrap, no column cap, no scroll", async ({
    page,
  }) => {
    await page.goto(PAGE);
    const r = await page.evaluate(() => {
      const scope = document.querySelector(".solo-table--wrap");
      const table = scope?.querySelector("table") as HTMLElement | null;
      const wrapper = scope?.querySelector(".table-wrapper") as HTMLElement | null;
      const cell = scope?.querySelector("tbody td:last-child") as HTMLElement | null;
      if (!table || !wrapper || !cell) return null;
      const cs = getComputedStyle(cell);
      return {
        maxWidth: cs.maxWidth,
        whiteSpace: cs.whiteSpace,
        fillsWidth:
          Math.abs(table.getBoundingClientRect().width - wrapper.clientWidth) <= 2,
        noScroll: wrapper.scrollWidth <= wrapper.clientWidth + 1,
      };
    });
    expect(r, ".solo-table--wrap table/cell not found").not.toBeNull();
    expect(r!.maxWidth, "wrap cell is still capped (max-width != none)").toBe("none");
    expect(r!.whiteSpace, "wrap cell is not allowed to wrap").toBe("normal");
    expect(r!.fillsWidth, "wrap table does not fill the body width").toBe(true);
    expect(r!.noScroll, "wrap table should never scroll horizontally").toBe(true);
  });

  test("nowrap: cells never wrap and the table scrolls when wider than the body", async ({
    page,
  }) => {
    await page.goto(PAGE);
    const r = await page.evaluate(() => {
      const scope = document.querySelector(".solo-table--nowrap");
      const wrapper = scope?.querySelector(".table-wrapper") as HTMLElement | null;
      // first cell holds the intentionally long, unbreakable command
      const cell = scope?.querySelector("tbody td:first-child") as HTMLElement | null;
      if (!wrapper || !cell) return null;
      const cs = getComputedStyle(cell);
      return {
        whiteSpace: cs.whiteSpace,
        maxWidth: cs.maxWidth,
        overflowX: getComputedStyle(wrapper).overflowX,
        scrolls: wrapper.scrollWidth > wrapper.clientWidth + 1,
      };
    });
    expect(r, ".solo-table--nowrap table/cell not found").not.toBeNull();
    expect(r!.whiteSpace, "nowrap cell is allowed to wrap").toBe("nowrap");
    expect(r!.maxWidth, "nowrap cell is capped (max-width != none)").toBe("none");
    expect(r!.overflowX, "wrapper is not horizontally scrollable").toMatch(/auto|scroll/);
    expect(r!.scrolls, "the long nowrap command did not overflow into a scroll").toBe(true);
  });

  test("equal: fixed layout with evenly divided columns", async ({ page }) => {
    await page.goto(PAGE);
    const r = await page.evaluate(() => {
      const scope = document.querySelector(".solo-table--equal");
      const table = scope?.querySelector("table") as HTMLElement | null;
      const ths = scope
        ? (Array.from(scope.querySelectorAll("thead th")) as HTMLElement[])
        : [];
      if (!table || ths.length !== 3) return null;
      return {
        tableLayout: getComputedStyle(table).tableLayout,
        widths: ths.map((t) => Math.round(t.getBoundingClientRect().width)),
      };
    });
    expect(r, ".solo-table--equal not found or not 3 columns").not.toBeNull();
    expect(r!.tableLayout, "equal mode is not table-layout:fixed").toBe("fixed");
    const [a, b, c] = r!.widths;
    const maxDelta = Math.max(Math.abs(a - b), Math.abs(b - c), Math.abs(a - c));
    expect(
      maxDelta,
      `equal columns are not evenly divided: ${r!.widths.join(", ")}`,
    ).toBeLessThanOrEqual(2);
  });
});
