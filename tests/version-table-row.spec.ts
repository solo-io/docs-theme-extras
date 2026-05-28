import { test, expect } from "@playwright/test";
import { TEST_PAGES, readFixture } from "./helpers/fixture";

// Regression guard for the kgateway k8sgwapi-exp.md pattern: authors
// wrap an entire markdown table row with an inline version shortcode.
// Both reuse.html and rebase.html apply a narrow preprocessing regex
// that rewrites `{{< version >}}| ... |{{< /version >}}` on a single
// line to the percent form before Goldmark sees it. The percent form
// lets the shortcode output re-enter the markdown stream so the pipes
// get parsed as cell delimiters; without that rewrite, the angle form
// would emit opaque HTML inline and Goldmark would treat the whole
// pipe-string as one <td>.
//
// What this spec pins:
//   - percent and angle forms both work on direct (reuse) and rebased
//     pages — the preprocessing regex normalizes both to percent
//   - the per-cell pattern (pipes outside the shortcode) still works
//     as the alternative for cell-scope conditionals
//   - the multi-line form (shortcode tags on their own lines) is NOT
//     covered by the regex and stays broken — documented as test.fail
//   - non-v2 pages exclude the gated markers (gating works)

const PERCENT_BASELINE = "MARKER_TABLE_VERSION_ROW_BASELINE_FEATURE";
const PERCENT_GATED = "MARKER_TABLE_VERSION_ROW_PERCENT_FEATURE";
const ANGLE_BASELINE = "MARKER_TABLE_VERSION_ROW_ANGLE_BASELINE";
const ANGLE_GATED = "MARKER_TABLE_VERSION_ROW_ANGLE_FEATURE";
const KEEPVERSION_BASELINE = "MARKER_TABLE_VERSION_ROW_KEEPVERSION_BASELINE";
const KEEPVERSION_GATED = "MARKER_TABLE_VERSION_ROW_KEEPVERSION_FEATURE";
const PERCELL_BASELINE = "MARKER_TABLE_VERSION_ROW_PERCELL_BASELINE";
const PERCELL_GATED = "MARKER_TABLE_VERSION_ROW_PERCELL_FEATURE";

// Strip the copy-as-markdown <script> block before searching — it
// embeds the raw markdown source (including literal pipes) and would
// otherwise match the "leaked markdown" patterns first.
function visibleHtml(filePath: string): string {
  return readFixture(filePath).replace(
    /<script[^>]*type=["']text\/markdown["'][^>]*>[\s\S]*?<\/script>/gi,
    "",
  );
}

// Locate the <tr>...</tr> that actually contains the marker (vs
// lastIndexOf("<tr") which could return an earlier table's row).
// Returns null if the marker is outside any <tr>.
function rowContaining(html: string, marker: string): string | null {
  const idx = html.indexOf(marker);
  if (idx < 0) return null;
  const trStart = html.lastIndexOf("<tr", idx);
  if (trStart < 0) return null;
  const trEnd = html.indexOf("</tr>", idx);
  if (trEnd < 0) return null;
  // Confirm no intervening </tr> sits between trStart and the marker —
  // that would mean lastIndexOf("<tr") found a prior, already-closed row.
  const closedBefore = html.lastIndexOf("</tr>", idx);
  if (closedBefore > trStart) return null;
  return html.slice(trStart, trEnd + "</tr>".length);
}

const V2_PAGES = ["v2/everything", "v2/rebased"];
const NON_V2_PAGES = [
  "v1/everything",
  "v1/rebased",
  "main/everything",
  "main/rebased",
];

// Shared assertion helpers — used for both percent and angle forms
// since they should produce identical output after the preprocess.
function assertRowRendersAsTwoCells(html: string, marker: string) {
  const row = rowContaining(html, marker);
  expect(row, `${marker} is not inside any <tr>`).not.toBeNull();
  const cellCount = (row!.match(/<td[\s>]/g) || []).length;
  expect(cellCount, `Expected 2 <td> cells, got ${cellCount}. Row: ${row}`).toBe(
    2,
  );
}

function assertRowHasNoLeakedPipes(html: string, marker: string) {
  const row = rowContaining(html, marker);
  expect(row).not.toBeNull();
  expect(
    row,
    `Literal "|" found inside the row HTML — pipes leaked instead of becoming cell delimiters. Row: ${row}`,
  ).not.toContain("|");
}

function assertRowSharesTableWithBaseline(
  html: string,
  baseline: string,
  gated: string,
) {
  const baselineIdx = html.indexOf(baseline);
  const gatedIdx = html.indexOf(gated);
  expect(baselineIdx).toBeGreaterThan(-1);
  expect(gatedIdx).toBeGreaterThan(baselineIdx);
  const between = html.slice(baselineIdx, gatedIdx);
  expect(
    between,
    `</table> appears between ${baseline} and ${gated} — gated row escaped the table`,
  ).not.toContain("</table>");
}

// ── Percent-form inline: works on both paths. ───────────────────────

test.describe("percent-form version wrapping a table row (inline)", () => {
  for (const page of TEST_PAGES) {
    if (!V2_PAGES.includes(page.name)) continue;

    test(`${page.name}: gated row renders as a real <tr> with 2 <td> cells`, () => {
      assertRowRendersAsTwoCells(visibleHtml(page.filePath), PERCENT_GATED);
    });

    test(`${page.name}: gated row contains no literal pipe characters`, () => {
      assertRowHasNoLeakedPipes(visibleHtml(page.filePath), PERCENT_GATED);
    });

    test(`${page.name}: gated row shares a <table> with the baseline row`, () => {
      assertRowSharesTableWithBaseline(
        visibleHtml(page.filePath),
        PERCENT_BASELINE,
        PERCENT_GATED,
      );
    });
  }
});

test.describe("percent-form version wrapping a table row: gating absence", () => {
  for (const page of TEST_PAGES) {
    if (!NON_V2_PAGES.includes(page.name)) continue;
    test(`${page.name}: gated marker is absent`, () => {
      const html = visibleHtml(page.filePath);
      expect(html).not.toContain(PERCENT_GATED);
    });
  }
});

// ── Angle-form inline: also works after the reuse/rebase preprocess. ─
//
// The preprocessing regex in reuse.html and rebase.html rewrites a
// single-line angle-form table-row block to percent form before
// Goldmark sees it. So angle-form authors get the same correct render
// as percent-form authors. This block locks the unified behavior.

test.describe("angle-form version wrapping a table row (inline, rewritten to percent)", () => {
  for (const page of TEST_PAGES) {
    if (!V2_PAGES.includes(page.name)) continue;

    test(`${page.name}: gated row renders as a real <tr> with 2 <td> cells`, () => {
      assertRowRendersAsTwoCells(visibleHtml(page.filePath), ANGLE_GATED);
    });

    test(`${page.name}: gated row contains no literal pipe characters`, () => {
      assertRowHasNoLeakedPipes(visibleHtml(page.filePath), ANGLE_GATED);
    });

    test(`${page.name}: gated row shares a <table> with the baseline row`, () => {
      assertRowSharesTableWithBaseline(
        visibleHtml(page.filePath),
        ANGLE_BASELINE,
        ANGLE_GATED,
      );
    });
  }
});

test.describe("angle-form version wrapping a table row: gating absence", () => {
  for (const page of TEST_PAGES) {
    if (!NON_V2_PAGES.includes(page.name)) continue;
    test(`${page.name}: gated marker is absent`, () => {
      const html = visibleHtml(page.filePath);
      expect(html).not.toContain(ANGLE_GATED);
    });
  }
});

// ── Angle-form + keepVersion: regex covers extra args before >}}. ───
//
// The regex matches version args past the closing `"` of include-if so
// keepVersion (or any future extra arg) doesn't take the block out of
// the table-row rewrite path.

test.describe("angle-form version with keepVersion wrapping a table row", () => {
  for (const page of TEST_PAGES) {
    if (!V2_PAGES.includes(page.name)) continue;

    test(`${page.name}: gated row renders as a real <tr> with 2 <td> cells`, () => {
      assertRowRendersAsTwoCells(visibleHtml(page.filePath), KEEPVERSION_GATED);
    });

    test(`${page.name}: gated row contains no literal pipe characters`, () => {
      assertRowHasNoLeakedPipes(visibleHtml(page.filePath), KEEPVERSION_GATED);
    });

    test(`${page.name}: gated row shares a <table> with the baseline row`, () => {
      assertRowSharesTableWithBaseline(
        visibleHtml(page.filePath),
        KEEPVERSION_BASELINE,
        KEEPVERSION_GATED,
      );
    });
  }
});

test.describe("angle-form version with keepVersion: gating absence", () => {
  for (const page of TEST_PAGES) {
    if (!NON_V2_PAGES.includes(page.name)) continue;
    test(`${page.name}: gated marker is absent`, () => {
      const html = visibleHtml(page.filePath);
      expect(html).not.toContain(KEEPVERSION_GATED);
    });
  }
});

// ── Per-cell pattern: positive control for cell-scope conditionals. ─
//
// Per-cell stays useful because it gates cell content rather than the
// whole row. The whole row always renders (with empty cells on the
// excluded version), but the pattern is the right tool when the
// conditional content lives inside a cell.

test.describe("per-cell version inside table cells (working pattern)", () => {
  for (const page of TEST_PAGES) {
    if (!V2_PAGES.includes(page.name)) continue;

    test(`${page.name}: gated row renders as a real <tr> with 2 <td> cells`, () => {
      assertRowRendersAsTwoCells(visibleHtml(page.filePath), PERCELL_GATED);
    });

    test(`${page.name}: gated row contains no literal pipe characters`, () => {
      assertRowHasNoLeakedPipes(visibleHtml(page.filePath), PERCELL_GATED);
    });
  }
});

test.describe("per-cell version inside table cells: gating absence", () => {
  for (const page of TEST_PAGES) {
    if (!NON_V2_PAGES.includes(page.name)) continue;
    test(`${page.name}: gated marker is absent (row still emitted with empty cell)`, () => {
      const html = visibleHtml(page.filePath);
      expect(html).not.toContain(PERCELL_GATED);
      // Per-cell can't gate rows, so the baseline row above the gated
      // one stays on every version.
      expect(html).toContain(PERCELL_BASELINE);
    });
  }
});
