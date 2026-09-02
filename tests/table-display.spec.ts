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
    // The horizontal scroller is the TABLE, not `.table-wrapper`: Hextra renders
    // `table { display: block; overflow-x: auto }`, so a table whose columns
    // outgrow their box scrolls itself and the wrapper's scrollWidth never
    // moves. Measuring only the wrapper (as this spec originally did) reports
    // "no scroll" for a table that is visibly cut off — see tests/HAZARDS.md.
    // `cellOverflow` is the ground truth: how far the widest cell reaches past
    // the table's own right edge.
    const cells = Array.from(scope.querySelectorAll("th, td")) as HTMLElement[];
    const cellOverflow =
      table && cells.length
        ? Math.round(
            Math.max(...cells.map((c) => c.getBoundingClientRect().right)) -
              table.getBoundingClientRect().right,
          )
        : null;
    return {
      className: scope.className,
      hasTable: !!table,
      tableLayout: table ? getComputedStyle(table).tableLayout : null,
      tableDisplay: table ? getComputedStyle(table).display : null,
      tableW: table ? table.getBoundingClientRect().width : null,
      tableClientW: table ? table.clientWidth : null,
      tableScrollW: table ? table.scrollWidth : null,
      cellOverflow,
      inlineNowrapCells: cells.filter((c) =>
        /nowrap/.test(c.getAttribute("style") || ""),
      ).length,
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
    expect(r!.cellOverflow, "wrap cells reach past the table's right edge").toBeLessThanOrEqual(1);
  });

  // The shape that actually broke: four columns (so render-table.html also tags
  // it `.table-capped`) with short leading cells carrying render-table.html's
  // inline `white-space: nowrap`. Hextra renders content tables
  // `display: block`, which is not a table box — `width: 100%` sized the block
  // while the columns inside it sized to their own content and painted OUTSIDE
  // it, so the trailing column was cut off mid-word and `.table-wrapper` would
  // not scroll to reveal it (the overflow belonged to the table element, not
  // the wrapper). Measured on the real gateway/1.22.x Helm-values page: 115px
  // outside the box before `display: table`, 0 after, with column widths
  // unchanged at 262/86/223/375.
  //
  // Asserting `cellOverflow` rather than the wrapper's scrollWidth is the whole
  // point — the original wrap test checked only the wrapper and passed happily
  // on a visibly clipped table. See tests/HAZARDS.md.
  test("wrap: short cells do not force the trailing column off the edge", async ({
    page,
  }) => {
    await page.goto(PAGE);
    const r = await probe(page, "table-shortcode-wrap-mode-with-short-cells");
    expect(r, ".solo-table for wrap-mode-with-short-cells not found").not.toBeNull();
    expect(r!.className).toContain("solo-table--wrap");
    expect(r!.colWidths.length, "fixture table is not 4 columns").toBe(4);
    // Non-vacuity: the section only exercises the bug while it still holds
    // cells short enough for render-table.html to stamp (tests/HAZARDS.md #1).
    // Those cells are the pressure that used to push the last column out.
    expect(
      r!.inlineNowrapCells,
      "fixture no longer contains short (<=30 char) cells, so it cannot reproduce the bug",
    ).toBeGreaterThan(0);
    expect(
      r!.cellOverflow,
      "the trailing column is cut off past the table's right edge",
    ).toBeLessThanOrEqual(1);
  });

  // Guards the `display: table` fix directly. Without it the declaration below
  // it in the same rule (`width: 100%`, `table-layout: auto`) is inert, because
  // neither applies to a `display: block` element.
  test("the table is a real table box, not Hextra's display:block", async ({
    page,
  }) => {
    await page.goto(PAGE);
    const r = await probe(page, "table-shortcode-wrap-mode-with-short-cells");
    expect(
      r!.tableDisplay,
      "table is display:block, so width/table-layout do not apply and cells paint outside the box",
    ).toBe("table");
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
    // render-table.html's inline declaration must survive into nowrap mode.
    // The fixture's second row exists to guarantee at least one cell short
    // enough (<=30 chars) to carry it, so this is not vacuous.
    expect(
      r!.inlineNowrapCells,
      "nowrap mode lost render-table.html's inline white-space:nowrap",
    ).toBeGreaterThan(0);
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
  col: number,
) {
  return page.evaluate(({ headingId: id, col }) => {
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
    // Column index of the cell under test: the long registry token sits in the
    // Registry column (2nd), the prose sentence in the Description column (4th).
    const cell = wrapper.querySelector(
      `tbody td:nth-child(${col})`,
    ) as HTMLElement | null;
    const cs = cell ? getComputedStyle(cell) : null;
    // Count real line boxes via Range rects rather than height/line-height:
    // computed line-height is "normal" on these cells, so the arithmetic form
    // yields NaN. Distinct rect tops == rendered lines.
    let cellLines: number | null = null;
    if (cell) {
      const range = document.createRange();
      range.selectNodeContents(cell);
      const tops = new Set(
        [...range.getClientRects()]
          .filter((r) => r.height > 0)
          .map((r) => Math.round(r.top)),
      );
      cellLines = tops.size;
    }
    const chars = cell ? (cell.textContent || "").trim().length : 0;
    // Widths of the first row's cells. A cell-level fold is only observable as
    // column sizing, so the uncapped-code-span block below asserts on these:
    // an unfolded token pins its column at the token's min-content width and
    // starves the rest of the row.
    const firstRow = wrapper.querySelector("tbody tr");
    const colWidths = firstRow
      ? [...firstRow.children].map((c) =>
          Math.round(c.getBoundingClientRect().width),
        )
      : [];
    // Computed `overflow-wrap` on the inline code INSIDE the cell, which is a
    // different value from the cell's own: Hextra declares it directly on
    // `.content code`, so it does not inherit the cell's. This field is what
    // distinguishes "the cell rule is right but never reaches the token" from
    // "the fold is actually applied".
    const code = cell ? cell.querySelector("code") : null;
    return {
      className: wrapper.className,
      clientW: wrapper.clientWidth,
      scrollW: wrapper.scrollWidth,
      overflowX: getComputedStyle(wrapper).overflowX,
      cellWhiteSpace: cs ? cs.whiteSpace : null,
      cellOverflowWrap: cs ? cs.overflowWrap : null,
      cellCodeOverflowWrap: code ? getComputedStyle(code).overflowWrap : null,
      colWidths,
      cellLines,
      // Characters per rendered line. The single number that distinguishes the
      // two failure modes this file guards: a char-per-line fold drives it
      // toward 1, a nowrap override drives it to the full cell length.
      cellCharsPerLine: cellLines ? Math.round(chars / cellLines) : null,
    };
  }, { headingId, col });
}

// Phone-width behavior of `.table-capped` (every 3+ column markdown table).
// These two blocks bound it from BOTH sides at 375px (iPhone SE), because the
// two plausible failure modes pull in opposite directions:
//
//   under-wide  — a cell folds one character per line (unreadable vertical
//                 strip); this is what a `white-space: nowrap` fix was reaching
//                 for, and what `overflow-wrap: anywhere` could in principle
//                 cause since it lets min-content collapse to a single glyph.
//   over-wide   — a cell is forced onto ONE line; measured on the real
//                 agentgateway airgap / CRD shapes this produced an 11,133px
//                 description cell and a 33x-viewport horizontal scroll.
//
// The shipped fix — `overflow-wrap: break-word` below 767px — clears both:
// measured 13 chars/line (token) and 10 chars/line (prose) with no horizontal
// scroll. Reverting to `anywhere` drops both to 1 char/line; switching to
// `nowrap` drives prose to 209 chars/line at 5.7x the viewport. Both guards
// must hold for any future change to this area.
const MIN_CHARS_PER_LINE = 4; // below this a cell is a vertical strip
const MAX_VIEWPORT_MULTIPLE = 3; // above this the table is a swipe marathon

test.describe("capped reference table at phone width: unbreakable token", () => {
  test.skip(!IS_FIXTURE_TARGET, "fixture-only page");
  test.use({ viewport: { width: 375, height: 800 } });

  // The agentgateway airgap `kgateway-image-versions.md` shape: a long,
  // break-free registry token in a capped table.
  test("a long registry token does not fold one character per line", async ({
    page,
  }) => {
    await page.goto(PAGE);
    const r = await probeWrapper(page, "capped-table-long-unbreakable-token", 2);
    expect(r, ".table-wrapper for the capped token table not found").not.toBeNull();
    expect(r!.className, "table is not flagged .table-capped").toContain(
      "table-capped",
    );
    expect(r!.overflowX, "wrapper is not horizontally scrollable").toMatch(
      /auto|scroll/,
    );
    expect(
      r!.cellCharsPerLine,
      `registry token rendered at ${r!.cellCharsPerLine} chars/line over ${r!.cellLines} lines at 375px — that is the char-per-line fold`,
    ).toBeGreaterThanOrEqual(MIN_CHARS_PER_LINE);
  });
});

test.describe("capped reference table at phone width: prose description", () => {
  test.skip(!IS_FIXTURE_TARGET, "fixture-only page");
  test.use({ viewport: { width: 375, height: 800 } });

  // The `Field | Type | Default | Description` shape that `.table-capped` is
  // applied to en masse. 25% of capped cells in kgateway-oss exceed 60 chars
  // and the longest runs ~2750, so these must keep wrapping on a phone.
  test("a prose description cell keeps wrapping and the table does not balloon", async ({
    page,
  }) => {
    await page.goto(PAGE);
    const r = await probeWrapper(page, "capped-table-prose-description-column", 4);
    expect(r, ".table-wrapper for the capped prose table not found").not.toBeNull();
    expect(r!.className, "table is not flagged .table-capped").toContain(
      "table-capped",
    );
    expect(
      r!.cellWhiteSpace,
      "prose description cell is nowrap at phone width — a ~200-char sentence would render on one line",
    ).not.toBe("nowrap");
    expect(
      r!.cellLines,
      `prose description cell rendered on ${r!.cellLines} line(s) at 375px — it must wrap onto several`,
    ).toBeGreaterThan(2);
    // The prose column folds the same way the token does when the collapse
    // floor is missing (measured 1 char/line over 146 lines before the fix).
    expect(
      r!.cellCharsPerLine,
      `prose description cell rendered at ${r!.cellCharsPerLine} chars/line over ${r!.cellLines} lines at 375px — that is the char-per-line fold`,
    ).toBeGreaterThanOrEqual(MIN_CHARS_PER_LINE);
    const ratio = r!.scrollW / Math.max(1, r!.clientW);
    expect(
      ratio,
      `capped prose table is ${ratio.toFixed(1)}x the viewport at 375px — prose is not wrapping`,
    ).toBeLessThan(MAX_VIEWPORT_MULTIPLE);
  });
});

// Uncapped (2-column) markdown table whose first column holds a long,
// break-free token inside a CODE SPAN. This is the shape that the two capped
// blocks above do not reach, and the gap that let the cell-level fold sit inert
// against real content: both capped fixtures put their token in bare text,
// where `.table-wrapper th, td { overflow-wrap: anywhere }` applies and the
// fold works. Hextra's prose styling declares
// `.content :where(code):not(…) { overflow-wrap: break-word }` DIRECTLY on
// inline code, and a direct declaration outranks an inherited one, so the cell
// rule never reached a backticked token — which is how every real docs table
// writes its field paths.
//
// render-table.html tags only 3+ column tables `.table-capped`, so a 2-column
// table has no `max-width` bound either: the token's min-content width pinned
// column 1 open and starved column 2. Measured on kgateway 2.3.x response
// header sanitization at 1280px, 627px/38px with the Description cell folded
// to 44 lines; 253px/391px and 4 lines after. Production page showing the same
// shape:
// https://docs.solo.io/gateway/1.23.x/traffic-management/redirect/path/
//
// Asserted at both widths because the fix is deliberately ASYMMETRIC with the
// capped rule above: capped tables drop to `break-word` under 767px to keep a
// collapse floor against their `max-width`, while uncapped tables stay on
// `anywhere` at every width. Reverting uncapped tables at phone width was
// measured to reinstate the 627px/38px split, so this block pins that the
// phone-width guard does NOT apply here.
const UNCAPPED_ID = "uncapped-table-long-unbreakable-code-token";
// Column 1 holds the token. Before the fix it took 97% of the row (627/645).
const MAX_TOKEN_COL_SHARE = 0.55;
// Column 2 holds the prose. Before the fix it got 6% (38/645).
const MIN_PROSE_COL_SHARE = 0.35;

test.describe("uncapped reference table: long code token folds", () => {
  test.skip(!IS_FIXTURE_TARGET, "fixture-only content");
  test.use({ viewport: { width: 1280, height: 800 } });

  test("code span folds, so neither column starves", async ({ page }) => {
    await page.goto(PAGE);
    const r = await probeWrapper(page, UNCAPPED_ID, 1);
    expect(r, ".table-wrapper for the uncapped code-token table not found").not.toBeNull();
    // Guards the premise: if render-table.html ever caps 2-column tables, this
    // block is measuring something else and the shares below stop meaning what
    // their names say.
    expect(
      r!.className,
      "2-column table is flagged .table-capped — this block assumes it is NOT capped",
    ).not.toContain("table-capped");
    // The mechanism, not just the symptom. A regression here almost certainly
    // means Hextra's `.content code` rule out-specified the theme's again.
    expect(
      r!.cellCodeOverflowWrap,
      "inline code in the cell is not on `overflow-wrap: anywhere` — Hextra's `.content code` rule is winning, so the token cannot fold",
    ).toBe("anywhere");
    const total = r!.colWidths.reduce((a, b) => a + b, 0);
    expect(total, "no column widths measured").toBeGreaterThan(0);
    const tokenShare = r!.colWidths[0] / total;
    const proseShare = r!.colWidths[1] / total;
    expect(
      tokenShare,
      `token column took ${(tokenShare * 100).toFixed(0)}% of the row (${r!.colWidths.join("/")}px) — the token is pinning the column open`,
    ).toBeLessThan(MAX_TOKEN_COL_SHARE);
    expect(
      proseShare,
      `description column got ${(proseShare * 100).toFixed(0)}% of the row (${r!.colWidths.join("/")}px) — it is being starved`,
    ).toBeGreaterThan(MIN_PROSE_COL_SHARE);
    expect(
      r!.scrollW,
      `uncapped table scrolls at 1280px (${r!.scrollW} > ${r!.clientW}) — it should fit the content width`,
    ).toBeLessThanOrEqual(r!.clientW + 1);
  });
});

test.describe("uncapped reference table at phone width", () => {
  test.skip(!IS_FIXTURE_TARGET, "fixture-only content");
  test.use({ viewport: { width: 375, height: 800 } });

  test("stays folded at 375px and does not fold one char per line", async ({ page }) => {
    await page.goto(PAGE);
    const r = await probeWrapper(page, UNCAPPED_ID, 1);
    expect(r, ".table-wrapper for the uncapped code-token table not found").not.toBeNull();
    // The asymmetry with `.table-capped`, pinned deliberately: the phone-width
    // `break-word` guard must not extend to uncapped tables.
    expect(
      r!.cellCodeOverflowWrap,
      "uncapped table dropped to `break-word` at phone width — that reinstates the pinned-open column this release fixes",
    ).toBe("anywhere");
    expect(
      r!.scrollW,
      `uncapped table scrolls at 375px (${r!.scrollW} > ${r!.clientW})`,
    ).toBeLessThanOrEqual(r!.clientW + 1);
    // Without a `max-width` cap squeezing the column there is no char-per-line
    // risk here (measured 122/177px over 7 lines at 375px), but assert it so a
    // future cap on 2-column tables cannot land silently.
    expect(
      r!.cellCharsPerLine,
      `token cell rendered at ${r!.cellCharsPerLine} chars/line over ${r!.cellLines} lines at 375px — that is the char-per-line fold`,
    ).toBeGreaterThanOrEqual(MIN_CHARS_PER_LINE);
  });
});
