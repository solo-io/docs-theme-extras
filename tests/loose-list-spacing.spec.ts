import { test, expect } from "@playwright/test";
import { target } from "./helpers/target";

// A gate around one list item must not change the list's rendered height.
//
// THE MEASUREMENT THIS PINS, and the wrong one it replaced.
//
// `{{% version %}}` gives `.Inner` a newline at each end. Those land beside the
// source's own newlines and produce blank lines, and CommonMark reads blank
// lines between items as the "loose list" signal — so gating ONE step wraps
// EVERY item in the list in `<p>`:
//
//   gated     <li><p>step one</p></li>
//   baseline  <li>step one</li>
//
// That HTML difference is real, and `tests/gate-transparency.spec.ts` pins it as
// shape 07. The open question was whether a READER can see it, because in
// ordinary Tailwind typography `<p>` carries `margin: 16px 0` and a loose list
// stands ~60% taller.
//
// Measured here: they render at IDENTICAL height. Tailwind's preflight zeroes
// element margins, and this theme never restores a typography margin on `<p>`
// inside `<li>`, so the wrapper costs nothing visually. Shape 07 is invisible.
//
// A first attempt at this measurement loaded the page over `file://`, where the
// absolute stylesheet href 404s. That reports BROWSER DEFAULT styling — `<p>` at
// `1em` margins — and produced a confident 86px-vs-54px "defect" that exists in
// no build. Hence this spec goes through the Playwright web server, and hence
// the non-vacuity guards below. Never measure theme CSS over file://.
//
// Keep this spec even though no fix sits behind it. It is what makes shape 07's
// "invisible" claim continuously true: the day someone adds prose margins to
// list paragraphs, shape 07 stops being cosmetic-only and this goes red, instead
// of the regression shipping behind a `test.fail()` everyone reads as
// already-known.

const BASE_URL = "/" + target.baseURL.replace(/^\/+|\/+$/g, "");
const PAGE = `${BASE_URL}/v2/gate-transparency/`;

// Fixture-only page, matching the gate other fixture specs use.
const IS_FIXTURE_TARGET = target.name.startsWith("docs-theme-extras-fixture");

test.describe("a gate does not change rendered list spacing", () => {
  test.skip(!IS_FIXTURE_TARGET, "fixture-only page");

  test("the gated list is the same height as the ungated one", async ({ page }) => {
    await page.goto(PAGE);

    const m = await page.evaluate(() => {
      const out: Record<
        string,
        { height: number; items: number; wrapped: boolean }
      > = {};
      for (const h of Array.from(document.querySelectorAll("h2"))) {
        const label = (h.textContent ?? "").trim();
        if (!label.startsWith("Shape 07")) continue;
        const ol = h.nextElementSibling;
        if (!ol || ol.tagName !== "OL") continue;
        out[label] = {
          height: Math.round(ol.getBoundingClientRect().height),
          items: ol.querySelectorAll(":scope > li").length,
          wrapped: Boolean(ol.querySelector(":scope > li > p")),
        };
      }
      return out;
    });

    const gated = m["Shape 07 gated"];
    const baseline = m["Shape 07 baseline"];

    // Without these, a renamed heading yields two undefineds that compare equal
    // and a stylesheet that failed to load yields two zeroes that also compare
    // equal. Both are how this measurement went wrong the first time.
    expect(gated, "no 'Shape 07 gated' <ol> found").toBeTruthy();
    expect(baseline, "no 'Shape 07 baseline' <ol> found").toBeTruthy();
    expect(gated.items, "gated list should have 3 items").toBe(3);
    expect(baseline.items, "baseline list should have 3 items").toBe(3);
    expect(
      baseline.height,
      "list height is 0 — the page or its stylesheet did not load, so this " +
        "measurement proves nothing",
    ).toBeGreaterThan(20);

    // The premise of the comparison: the gated list really IS the loose one. If
    // Goldmark ever stops wrapping, this spec compares two identical structures
    // and silently proves nothing.
    expect(
      gated.wrapped,
      "the gated list no longer has <li><p> — shape 07 may be fixed at the HTML " +
        "level, in which case remove its gate-transparency KNOWN_BROKEN entry",
    ).toBe(true);
    expect(baseline.wrapped, "the baseline list should NOT be wrapped").toBe(false);

    // Exact equality, not a tolerance: identical text at identical width, so any
    // difference is the <p> wrapper becoming visible.
    expect(
      gated.height,
      `gated list is ${gated.height}px vs baseline ${baseline.height}px. A <p> ` +
        `margin inside <li> has come back, which makes solo-io/docs#3280 shape ` +
        `07 visible to readers: gating one step now re-spaces every step in the ` +
        `list. Find the rule adding margin to '.content li p' — in this theme or ` +
        `in a consumer's custom.css — rather than relaxing this test.`,
    ).toBe(baseline.height);
  });
});
