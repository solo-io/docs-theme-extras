import { test, expect } from "@playwright/test";
import { target } from "./helpers/target";

// Layout invariants over the fixture's table matrix: tables in the `everything`
// topic that copy production shapes with varied content lengths per column
// (kagent network ports, generated API reference, concept tables with lists,
// a wide compatibility matrix, plus all-short and all-prose controls). Each
// shape failed in production in a different way, and a fix for one has
// repeatedly broken another, so every table is held to the same checks:
//
//   1. No plain-text header word splits mid-word. `overflow-wrap: anywhere`
//      let a header collapse to one glyph (`Defaul` / `t`, `Runtim` / `e`).
//   2. No word in a short cell (30 characters or fewer) splits mid-word.
//      Short cells are what render-table.html protects from that collapse.
//   3. No prose cell (more than 60 characters) renders as a ribbon. Short
//      cells that hold their full width starve the one wrapping column: the
//      kagent network table's Description measured 39px and 1 character per
//      line at 1280px, 34,000px tall.
//   4. No ordinary word (2 to 12 letters, outside code) splits mid-word in
//      any cell. A prose column that still collapses splits words like
//      `Reader` into `Reade` / `r` (the kagent security roles table).
//   5. A cell that starts with an icon keeps the icon on the same line as its
//      name (the agentgateway LLM providers table).
//   6. At 1280px, tables that fit the content width do not scroll sideways.
//
// Fixture-only: skipped against consumer builds.

const IS_FIXTURE_TARGET = target.name.startsWith("docs-theme-extras-fixture");
const FIXTURE_BASE = "/" + target.baseURL.replace(/^\/+|\/+$/g, "");
const PAGE = `${FIXTURE_BASE}/v2/everything/`;

// Heading id of each matrix table, and whether it may scroll sideways at
// 1280px. Three are wider than the content area by design: the nine-column
// compatibility matrix, the eight-column providers table, and the roles table,
// whose unbreakable words (`AgentInstanceAllCreators` and the role names)
// leave no room for a readable Verbs column. That table scrolled in production
// before any of this; the alternative to scrolling is the Verbs ribbon.
const TABLES: { id: string; scrollsAtDesktop: boolean }[] = [
  { id: "capped-table-header-wider-than-its-column", scrollsAtDesktop: false },
  { id: "table-matrix-network-ports-in-wrap-mode", scrollsAtDesktop: false },
  { id: "table-matrix-network-ports-without-the-shortcode", scrollsAtDesktop: false },
  { id: "table-matrix-generated-api-reference", scrollsAtDesktop: false },
  { id: "table-matrix-concept-table-with-lists", scrollsAtDesktop: false },
  { id: "table-matrix-wide-compatibility-matrix", scrollsAtDesktop: true },
  { id: "table-matrix-all-short-cells", scrollsAtDesktop: false },
  { id: "table-matrix-all-prose-cells", scrollsAtDesktop: false },
  { id: "table-matrix-role-names-beside-a-verbs-column", scrollsAtDesktop: true },
  { id: "table-matrix-icon-before-a-name", scrollsAtDesktop: true },
  { id: "table-matrix-long-unbroken-value-beside-prose", scrollsAtDesktop: false },
];

// Fewest characters per rendered line a prose cell may average. Production
// failures measured 1 to 5; ordinary wrapped prose in these tables runs 15+.
const MIN_PROSE_CHARS_PER_LINE: Record<number, number> = { 1280: 10, 375: 8 };

async function measure(page: import("@playwright/test").Page, headingId: string) {
  return page.evaluate((id) => {
    // Hextra puts the anchor id on a <span> INSIDE the heading, so climb to the
    // heading element, then walk its following siblings to the first table.
    const anchor = document.getElementById(id);
    const heading = anchor ? anchor.closest("h1, h2, h3, h4, h5, h6") : null;
    let scope: Element | null = heading ? heading.nextElementSibling : null;
    while (scope && !scope.querySelector?.("table") && scope.tagName !== "TABLE") {
      scope = scope.nextElementSibling;
    }
    const table = scope
      ? ((scope.tagName === "TABLE" ? scope : scope.querySelector("table")) as HTMLElement)
      : null;
    if (!table) return null;

    // Rendered lines in a range. Boxes on one line do not share a top edge:
    // an icon with `vertical-align: middle` or a padded code pill sits a few
    // pixels off the text beside it, so counting distinct tops reports extra
    // lines. A box starts a new line only when its vertical midpoint is below
    // the bottom of the line so far.
    const lineCount = (range: Range) => {
      const rects = [...range.getClientRects()]
        .filter((r) => r.height > 0 && r.width > 0)
        .sort((a, b) => a.top - b.top);
      let lines = 0;
      let bottom = -Infinity;
      for (const r of rects) {
        if ((r.top + r.bottom) / 2 > bottom) {
          lines++;
          bottom = r.bottom;
        } else {
          bottom = Math.max(bottom, r.bottom);
        }
      }
      return lines;
    };

    // Words in `root` that span more than one line. A word is a run of 2+
    // letters or digits, so a break at a hyphen or a dot is not counted:
    // those are ordinary break points.
    const splitWords = (root: Element, skipCode: boolean) => {
      const out: string[] = [];
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (skipCode && n.parentElement?.closest("code")) continue;
        for (const m of (n.textContent || "").matchAll(/[A-Za-z0-9]{2,}/g)) {
          const range = document.createRange();
          range.setStart(n, m.index!);
          range.setEnd(n, m.index! + m[0].length);
          if (lineCount(range) > 1) out.push(m[0]);
        }
      }
      return out;
    };

    // Header text inside code keeps the long-token fold on purpose, so only
    // plain header text is checked.
    const headerSplits = [...table.querySelectorAll("thead th")].flatMap((th) =>
      splitWords(th, true),
    );
    const shortCellSplits: string[] = [];
    // Ordinary words anywhere in the body. Longer runs are identifiers or
    // tokens, which may legitimately fold.
    const wordSplits = [...table.querySelectorAll("tbody td")]
      .flatMap((td) => splitWords(td, true))
      .filter((w) => w.length <= 12);
    // Icon cells whose content spans more than one line.
    const iconCellsWrapped = [...table.querySelectorAll("tbody td")]
      .filter((td) => td.querySelector("img"))
      .filter((td) => {
        const range = document.createRange();
        range.selectNodeContents(td);
        return lineCount(range) > 1;
      })
      .map((td) => (td.textContent || "").trim());
    const ribbons: { text: string; charsPerLine: number }[] = [];
    let minProseCharsPerLine: number | null = null;
    for (const td of table.querySelectorAll("tbody td")) {
      const text = (td.textContent || "").trim();
      if (!text) continue;
      if (text.length <= 30) shortCellSplits.push(...splitWords(td, false));
      // A bulleted list renders one item per line by design, so it is not
      // prose and its chars-per-line says nothing about column width.
      if (text.length > 60 && !td.querySelector("ul, ol")) {
        const range = document.createRange();
        range.selectNodeContents(td);
        const cpl = Math.round(text.length / Math.max(1, lineCount(range)));
        ribbons.push({ text: text.slice(0, 40), charsPerLine: cpl });
        minProseCharsPerLine =
          minProseCharsPerLine === null ? cpl : Math.min(minProseCharsPerLine, cpl);
      }
    }
    // How far the widest cell reaches past the visible box. The table itself
    // can be the scroller (see table-display.spec.ts), so measure cells.
    const wrapper = table.closest(".table-wrapper") as HTMLElement | null;
    const box = (wrapper || table).getBoundingClientRect();
    const cells = [...table.querySelectorAll("th, td")];
    const right = Math.max(...cells.map((c) => c.getBoundingClientRect().right));
    return {
      headerSplits,
      shortCellSplits,
      wordSplits,
      iconCellsWrapped,
      minProseCharsPerLine,
      narrowest: ribbons.sort((a, b) => a.charsPerLine - b.charsPerLine)[0] || null,
      overflowPx: Math.max(0, Math.round(right - box.right)),
      heightPx: Math.round(table.getBoundingClientRect().height),
    };
  }, headingId);
}

for (const width of [1280, 375]) {
  test.describe(`table matrix at ${width}px`, () => {
    test.skip(!IS_FIXTURE_TARGET, "fixture-only content");
    test.use({ viewport: { width, height: 900 } });

    for (const { id, scrollsAtDesktop } of TABLES) {
      test(`${id}`, async ({ page }) => {
        await page.goto(PAGE);
        const r = await measure(page, id);
        expect(r, `table under #${id} not found`).not.toBeNull();
        expect(
          r!.headerSplits,
          `header words split mid-word: ${r!.headerSplits.join(", ")}`,
        ).toEqual([]);
        expect(
          r!.shortCellSplits,
          `short-cell words split mid-word: ${r!.shortCellSplits.join(", ")}`,
        ).toEqual([]);
        expect(
          r!.wordSplits,
          `ordinary words split mid-word: ${r!.wordSplits.join(", ")}`,
        ).toEqual([]);
        expect(
          r!.iconCellsWrapped,
          `icon cells wrapped onto a second line: ${r!.iconCellsWrapped.join(", ")}`,
        ).toEqual([]);
        if (r!.minProseCharsPerLine !== null) {
          expect(
            r!.minProseCharsPerLine,
            `prose cell "${r!.narrowest!.text}…" renders ${r!.minProseCharsPerLine} chars/line (table ${r!.heightPx}px tall)`,
          ).toBeGreaterThanOrEqual(MIN_PROSE_CHARS_PER_LINE[width]);
        }
        if (width === 1280 && !scrollsAtDesktop) {
          expect(
            r!.overflowPx,
            `table reaches ${r!.overflowPx}px past the content area at 1280px`,
          ).toBeLessThanOrEqual(1);
        }
      });
    }
  });
}
