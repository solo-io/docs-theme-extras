import { test, expect } from "@playwright/test";
import { parse as parse5 } from "parse5";

// Guards the nested-group flatten in `layouts/_shortcodes/tabs.html`.
//
// WHAT THIS PINS
//
// A `tabs` group inside a percent-form gate is part of the gate's `.Inner`, and
// gate-emit hands that back to Goldmark as markdown. Hextra's partial emits the
// group over several lines with every line after the first at column 0, so
// inside a list item the second line ended the item. The group's closing
// `</div>`s then landed later, where they closed the page's `.content` wrapper,
// and every heading after the gate rendered outside it, unstyled. Reported on
// kgateway.dev (outlier-detection, PR 1041), where the workaround was moving the
// gated section into a snippet and gating a one-line `reuse`.
//
// Structural, through parse5, because this is container ejection: no element
// goes missing, they only change parent, so counting tags cannot see it.

type Hit = { path: string[]; ols: any[] };

/** Ancestor chain (tag plus first non-utility class) of the first text node in
    <main> that contains `marker`, skipping the copy-as-markdown <script>. Takes
    the parsed tree, not the HTML, so two lookups can compare <ol> identity. */
function locate(doc: any, marker: string): Hit | null {
  let found: Hit | null = null;
  const walk = (node: any, path: string[], ols: any[], inMain: boolean) => {
    if (found) return;
    if (node.tagName === "script") return;
    if (inMain && node.nodeName === "#text" && String(node.value).includes(marker)) {
      found = { path, ols };
      return;
    }
    const isMain = inMain || node.tagName === "main";
    let next = path;
    let nextOls = ols;
    if (node.tagName) {
      const cls = (node.attrs ?? []).find((a: any) => a.name === "class")?.value ?? "";
      const first = cls.split(/\s+/).find((c: string) => c && !c.startsWith("hx:"));
      next = [...path, first ? `${node.tagName}.${first}` : node.tagName];
      if (node.tagName === "ol") nextOls = [...ols, node];
    }
    for (const child of node.childNodes ?? []) walk(child, next, nextOls, isMain);
  };
  walk(doc, [], [], false);
  return found;
}

const IN_CONTENT = [
  "GTAB_A_INTRO",
  "GTAB_A_STEP_ONE",
  "GTAB_A_STEP_TWO_TAIL",
  "GTAB_A_STEP_THREE",
  "GTAB_B_HEADING",
  "GTAB_B_AFTER",
  "GTAB_C_STEP_ONE",
  "GTAB_C_TAB_BODY",
  "GTAB_C_STEP_THREE",
  "GTAB_D_TAB_BODY",
  "GTAB_D_AFTER",
];

// [first, last] markers that must share ONE <ol>: a split list is the
// first visible symptom, before the ejection.
const SAME_LIST: [string, string][] = [
  ["GTAB_A_STEP_ONE", "GTAB_A_STEP_THREE"],
  ["GTAB_C_STEP_ONE", "GTAB_C_STEP_THREE"],
];

test.describe("tabs inside a percent-form gate keep the page structure", () => {
  let doc: any;
  test.beforeEach(async ({ page }) => {
    const res = await page.goto("/test/v2/gate-tabs/");
    test.skip(res?.status() === 404, "fixture page not in this build");
    doc = parse5(await page.content());
  });

  for (const marker of IN_CONTENT) {
    test(`${marker} stays inside .content`, () => {
      const hit = locate(doc, marker);
      expect(hit, `${marker} not found in <main>`).not.toBeNull();
      expect(
        hit!.path.includes("div.content"),
        `${marker} was ejected from .content. Ancestors: ${hit!.path.join(" > ")}`,
      ).toBe(true);
    });
  }

  for (const [first, last] of SAME_LIST) {
    test(`${first} and ${last} are steps of the same list`, () => {
      const a = locate(doc, first);
      const b = locate(doc, last);
      expect(a && b, "markers not found").toBeTruthy();
      expect(a!.path.at(-2), `${first} is not in a list item`).toBe("li");
      expect(b!.path.at(-2), `${last} is not in a list item`).toBe("li");
      expect(
        a!.ols.at(-1) === b!.ols.at(-1),
        `the gated tabs split the list: ${last} is in a different <ol> than ${first}`,
      ).toBe(true);
    });
  }
});
