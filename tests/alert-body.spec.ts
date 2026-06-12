import { test, expect } from "@playwright/test";
import { target } from "./helpers/target";

// Regression guard for the "alert body renders at one size" fix in
// docs-theme-extras.css. The global `.content p` / `#content > .content li`
// rules size block children to 1rem, but a BARE inline text node inside an
// alert fell back to the `.solo-alert` 0.9rem — so the same alert rendered at
// a different size depending on its body shape (bare inline text vs a markdown
// list vs literal <ul>/<li>). The most visible case was two consecutive
// alerts where the list-bearing one looked smaller than its plain neighbor.
// The fix pins `.solo-alert-body` and its p/ul/ol/li children to 1rem.
//
// The fixture everything page has both shapes: bare-inline-text alerts
// (MARKER_ALERT_INFO etc.) and a list-bearing alert (MARKER_ALERT_LIST_*).

const ONE_REM_PX = 16;

const SAMPLE = target.pages.filter((p) => target.versionOf(p.url) !== null);
const PAGE = SAMPLE[0]?.url ?? null;

test.describe("alert body text renders at one size", () => {
  test.skip(PAGE === null, "no non-landing pages configured");

  test("every alert body and its p/ul/ol/li children resolve to 1rem", async ({
    page,
  }) => {
    await page.goto(PAGE!);
    const bodies = page.locator(".solo-alert-body");
    const count = await bodies.count();
    expect(count, "no .solo-alert-body elements on the sample page").toBeGreaterThan(0);

    const sizes = await page.evaluate(() => {
      const out: { tag: string; fontSize: number; text: string }[] = [];
      document.querySelectorAll(".solo-alert-body").forEach((body) => {
        const els: Element[] = [body, ...Array.from(body.querySelectorAll("p, ul, ol, li"))];
        for (const el of els) {
          out.push({
            tag: el === body ? "solo-alert-body" : el.tagName.toLowerCase(),
            fontSize: parseFloat(getComputedStyle(el as HTMLElement).fontSize),
            text: (el.textContent || "").slice(0, 40),
          });
        }
      });
      return out;
    });

    for (const s of sizes) {
      expect(
        s.fontSize,
        `<${s.tag}> in an alert body computed to ${s.fontSize}px, not ${ONE_REM_PX}px ` +
          `(1rem) — alert body text sizing is inconsistent. Near: "${s.text}"`,
      ).toBeCloseTo(ONE_REM_PX, 0);
    }
  });

  test("a bare-text alert and a list-bearing alert render at the same size", async ({
    page,
  }) => {
    await page.goto(PAGE!);
    // The exact two-consecutive-alerts symptom: locate the bare-inline-text
    // alert and the list-bearing alert by their sentinels and compare the
    // computed size of their body text.
    const sizes = await page.evaluate(() => {
      function bodyFontSizeContaining(marker: string): number | null {
        const bodies = Array.from(document.querySelectorAll(".solo-alert-body"));
        const hit = bodies.find((b) => (b.textContent || "").includes(marker));
        if (!hit) return null;
        // Prefer the size of the text-bearing leaf; for a list alert that's
        // the <li>, for a bare alert it's the body element itself.
        const li = hit.querySelector("li");
        const el = (li || hit) as HTMLElement;
        return parseFloat(getComputedStyle(el).fontSize);
      }
      return {
        bare: bodyFontSizeContaining("MARKER_ALERT_INFO"),
        list: bodyFontSizeContaining("MARKER_ALERT_LIST_ITEM1"),
      };
    });

    expect(sizes.bare, "bare-text alert (MARKER_ALERT_INFO) not found").not.toBeNull();
    expect(sizes.list, "list-bearing alert (MARKER_ALERT_LIST_ITEM1) not found").not.toBeNull();
    expect(sizes.bare!, "bare-text alert body is not 1rem").toBeCloseTo(ONE_REM_PX, 0);
    expect(
      sizes.list!,
      `list-bearing alert text (${sizes.list}px) differs from the bare-text ` +
        `alert (${sizes.bare}px) — the list alert fell back to the smaller ` +
        `.solo-alert font-size instead of the pinned 1rem.`,
    ).toBeCloseTo(sizes.bare!, 0);
  });
});
