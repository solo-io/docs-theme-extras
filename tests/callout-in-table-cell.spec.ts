import { test, expect } from "@playwright/test";
import path from "node:path";
import { TEST_PRODUCT_ROOT, readFixture } from "./helpers/fixture";
import { target } from "./helpers/target";

// Two ways the everything page puts an admonition INSIDE a markdown table
// cell, plus the typographer guard that rides along with each:
//
//   1. "Callout inside a table cell" — the `callout` shortcode. Its
//      `solo-alert` div is emitted on one logical line (body newlines →
//      `&#10;`), so it lands inside the `<td>` instead of breaking the row.
//
//   2. "Inside a table cell" (GitHub-styling section) — GFM `[!NOTE]` syntax
//      is block-level and cannot live in an inline-only table cell, so the
//      in-cell note is faked with `<br><br>` + a bold `**Note**` lead-in.
//
// Both cells carry a `--set` backtick code span; the third test guards that it
// renders as a literal `--`, not the Goldmark typographer's `&ndash;set` en
// dash. (This render path — an angle-form `{{< callout >}}` body, and a plain
// `<br>`+bold cell — keeps the `--set` in a backtick span, which the
// typographer skips, so it survives without special hardening.)
//
// Fixture source: the "Callout inside a table cell" and "Inside a table cell"
// subsections of fixture/assets/conrefs/test/everything.md.

const IS_FIXTURE_TARGET = target.name.startsWith("docs-theme-extras-fixture");

const PAGE = path.join(TEST_PRODUCT_ROOT, "v2/everything/index.html");

// Strip the copy-as-markdown <script> source embed (raw markdown with literal
// backticks / `--`) so it can't produce false positives.
function visibleHtml(): string {
  return readFixture(PAGE).replace(
    /<script[^>]*type=["']text\/markdown["'][^>]*>[\s\S]*?<\/script>/gi,
    "",
  );
}

// The `<td>` that holds a given description marker: from the cell's opening
// `<td …>`, through the marker, up to the next `</td>`. Newlines are decoded
// from the callout's `&#10;` flattening so the body reads as one block.
function cellWith(html: string, descMarker: string): string | null {
  const re = new RegExp(
    `<td\\b(?:(?!</td>)[\\s\\S])*?${descMarker}(?:(?!</td>)[\\s\\S])*?</td>`,
  );
  const m = html.replace(/&#10;/g, "\n").match(re);
  return m ? m[0] : null;
}

test.describe("admonition inside a table cell", () => {
  test.skip(!IS_FIXTURE_TARGET, "fixture-only: lives in the extras everything page");

  test("the callout shortcode renders its solo-alert div inside the cell", () => {
    const html = visibleHtml();
    const cell = cellWith(html, "MARKER_CALLOUT_IN_CELL_DESC");
    expect(cell, "no <td> wraps MARKER_CALLOUT_IN_CELL_DESC — the row may have broken").not.toBeNull();

    // The callout's div and its body marker sit inside that same cell.
    expect(cell, "solo-alert div not inside the cell").toMatch(/class="solo-alert\b/);
    expect(cell, "callout body marker not inside the cell").toContain("MARKER_CALLOUT_IN_CELL_BODY");
  });

  test("the <br>+bold note renders inside the cell (GitHub-styling section)", () => {
    const html = visibleHtml();
    const cell = cellWith(html, "MARKER_BRNOTE_CELL_DESC");
    expect(cell, "no <td> wraps MARKER_BRNOTE_CELL_DESC").not.toBeNull();

    // The faked note: line breaks + a bold lead-in, body marker in the cell.
    expect(cell, "expected <br> breaks before the note").toMatch(/<br\s*\/?>\s*<br\s*\/?>/);
    expect(cell, "bold Note lead-in missing").toMatch(/<strong>Note<\/strong>/);
    expect(cell).toContain("MARKER_BRNOTE_CELL_BODY");
  });

  test("the --set code span in each cell keeps its literal -- (no typographer mangling)", () => {
    const html = visibleHtml();

    // Neither the entity nor the literal-character en dash may appear.
    expect(html, "`--set` rendered as the &ndash; entity in a cell").not.toContain("&ndash;set apiVersion");
    expect(html, "`--set` rendered as a literal en dash in a cell").not.toContain("–set apiVersion");

    // Each cell's flag renders as a real <code> reading `--set` (hardened to the
    // numeric-entity form, which a browser shows as `--`).
    for (const desc of ["MARKER_CALLOUT_IN_CELL_DESC", "MARKER_BRNOTE_CELL_DESC"]) {
      const cell = cellWith(html, desc) ?? "";
      expect(cell, `--set code span missing/mangled in the ${desc} cell`).toMatch(
        /<code>(?:--|&#45;&#45;)set apiVersion<\/code>/,
      );
    }
  });
});
