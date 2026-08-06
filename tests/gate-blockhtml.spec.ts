import { test, expect } from "@playwright/test";
import { parse as parse5 } from "parse5";

// Guards the already-rendered-body exception in
// `layouts/_partials/utils/gate-normalize-form.html`.
//
// WHAT THIS PINS
//
// A gate's body normally holds markdown, and percent form exists to get that
// markdown parsed. But a body containing a `reuse` call holds that call's
// OUTPUT, which is rendered, flattened HTML. Percent form splices it straight
// into the markdown stream, and a block-level fragment inside a list item
// terminates the list.
//
// The control case is the important one: case G is a bare percent `reuse` with
// NO gate at all, and it breaks identically. So this is not a gate defect — it
// is the pre-existing `reuse` behavior tracked as backlog 7i, which a gate in
// percent form merely re-exposes. Regressing the exception would put 105
// markdown leaks back on the gloo-mesh-enterprise build.
//
// The page is authored directly in `content/` on purpose. An earlier version of
// this fixture routed the cases through `reuse`, which normalizes the form
// before rendering — so the angle cases silently became percent and every case
// "failed" identically, hiding the very distinction under test.

type Case = {
  marker: string;
  what: string;
  /** true = the marker must still be inside its <li>. */
  staysInList: boolean;
};

const CASES: Case[] = [
  { marker: "CASE_A_STEP_THREE", what: "conditional-text percent, body is only a block reuse", staysInList: false },
  { marker: "CASE_B_STEP_THREE", what: "conditional-text angle, body is only a block reuse", staysInList: true },
  { marker: "CASE_C_STEP_THREE", what: "conditional-text percent, text plus a block reuse", staysInList: false },
  { marker: "CASE_D_STEP_THREE", what: "no gate, angle reuse (control: fine)", staysInList: true },
  { marker: "CASE_E_STEP_THREE", what: "version percent, body is only a block reuse", staysInList: false },
  { marker: "CASE_F_STEP_THREE", what: "version angle, body is only a block reuse", staysInList: true },
  { marker: "CASE_G_STEP_THREE", what: "NO GATE, percent reuse (control: breaks anyway — backlog 7i)", staysInList: false },
  { marker: "CASE_H_STEP_THREE", what: "conditional-text percent, INLINE reuse target", staysInList: true },
];

/** Tag names from the marker's text node up to <main>, outermost first. */
function ancestorPath(html: string, marker: string): string[] | null {
  const doc = parse5(html) as any;
  let found: string[] | null = null;
  const walk = (node: any, path: string[]) => {
    if (found) return;
    if (node.nodeName === "#text" && String(node.value).includes(marker)) {
      found = path;
      return;
    }
    for (const child of node.childNodes ?? []) {
      walk(child, node.tagName ? [...path, node.tagName] : path);
    }
  };
  walk(doc, []);
  return found;
}

test.describe("a gate must not splice rendered HTML into a list item", () => {
  for (const c of CASES) {
    test(`${c.marker}: ${c.what}`, async ({ page }) => {
      const res = await page.goto("/test/v2/gate-blockhtml/");
      test.skip(res?.status() === 404, "fixture page not in this build");
      const body = await page.content();

      const path = ancestorPath(body, c.marker);
      expect(path, `${c.marker} not found on the page`).not.toBeNull();

      // parse5 ancestor path, not substring counting: the claim is structural.
      const inListItem = path!.includes("li");
      expect(
        inListItem,
        c.staysInList
          ? `${c.marker} escaped its list item — the gate spliced rendered HTML ` +
            `into the markdown stream. Ancestors: ${path!.join(" > ")}`
          : `${c.marker} is now INSIDE a list item, which this case is pinned as ` +
            `NOT doing. If backlog 7i was fixed, update this expectation.`,
      ).toBe(c.staysInList);
    });
  }
});
