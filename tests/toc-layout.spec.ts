import { test, expect } from "@playwright/test";
import { target } from "./helpers/target";

// Regression guard for the "On this page" TOC footer-overlap fix in
// docs-theme-extras.css. The old layout made .solo-toc-bottom a
// `position: sticky; bottom: 0` row INSIDE the scrollable .solo-toc-inner
// with a transparent background, so on a long TOC the heading links scrolled
// up behind the footer and visually overlapped it. The fix restructures
// .solo-toc-inner into a flex column where only the top-level heading list
// (.solo-toc-inner > .solo-toc-sublist) scrolls, while the heading and the
// footer are pinned as non-scrolling flex rows — so nothing can scroll behind
// the footer regardless of brand background.
//
// Runs at >= 1280px, where the right rail is visible (hx:xl:block).

const SAMPLE = target.pages.filter((p) => target.versionOf(p.url) !== null);
const PAGE = SAMPLE[0]?.url ?? null;

test.describe("TOC footer does not overlap the heading list", () => {
  test.skip(!target.shouldRun("viewport"), "viewport check disabled in CONFIG");
  test.skip(PAGE === null, "no non-landing pages configured");
  test.use({ viewport: { width: 1280, height: 800 } });

  test("the heading list is the scroll region, the footer is a pinned flex row", async ({
    page,
  }) => {
    await page.goto(PAGE!);
    const layout = await page.evaluate(() => {
      const inner = document.querySelector(".solo-toc-inner") as HTMLElement | null;
      if (!inner) return null;
      const sublist = inner.querySelector(":scope > .solo-toc-sublist") as HTMLElement | null;
      const footer = inner.querySelector(".solo-toc-bottom") as HTMLElement | null;
      const is = getComputedStyle(inner);
      const ss = sublist ? getComputedStyle(sublist) : null;
      const fs = footer ? getComputedStyle(footer) : null;
      return {
        hasSublist: !!sublist,
        hasFooter: !!footer,
        innerDisplay: is.display,
        innerFlexDir: is.flexDirection,
        innerOverflow: is.overflow,
        subOverflowY: ss?.overflowY,
        subFlexGrow: ss?.flexGrow,
        subMinHeight: ss?.minHeight,
        footerPosition: fs?.position,
        footerFlexShrink: fs?.flexShrink,
        // DOM-order + geometry: the footer must come after the scroller and
        // sit at or below where the scroll region starts (never above it).
        scrollerTop: sublist?.getBoundingClientRect().top,
        footerTop: footer?.getBoundingClientRect().top,
      };
    });
    expect(layout, ".solo-toc-inner not found").not.toBeNull();
    expect(layout!.hasFooter, ".solo-toc-bottom footer not found").toBe(true);

    // The container is a clipping flex column — it does NOT scroll itself.
    expect(layout!.innerDisplay, ".solo-toc-inner is not display:flex").toBe("flex");
    expect(layout!.innerFlexDir, ".solo-toc-inner is not flex-direction:column").toBe("column");
    expect(
      layout!.innerOverflow,
      ".solo-toc-inner overflow is not hidden — the whole container scrolls, " +
        "so links can pass behind the footer (the old overlap bug).",
    ).toBe("hidden");

    // The heading list is the one and only scroll region.
    expect(layout!.hasSublist, "no .solo-toc-inner > .solo-toc-sublist scroll region").toBe(true);
    expect(
      layout!.subOverflowY,
      "the top-level .solo-toc-sublist is not the overflow-y:auto scroll region",
    ).toBe("auto");
    expect(layout!.subFlexGrow, ".solo-toc-sublist does not flex-grow to fill the rail").toBe("1");
    expect(layout!.subMinHeight, ".solo-toc-sublist min-height is not 0 (can't shrink to scroll)").toBe("0px");

    // The footer is a pinned, non-scrolling flex row — NOT sticky-overlaid.
    expect(
      layout!.footerPosition,
      ".solo-toc-bottom is position:sticky — the old sticky-footer layout that " +
        "let links scroll behind it. It must be a normal flex row now.",
    ).not.toBe("sticky");
    expect(
      layout!.footerFlexShrink,
      ".solo-toc-bottom is not flex-shrink:0 — it would be squeezed/scrolled " +
        "instead of staying pinned below the heading list.",
    ).toBe("0");

    // Geometry sanity: the footer sits at or below the top of the scroll
    // region (it never overlaps the start of the list).
    if (layout!.scrollerTop != null && layout!.footerTop != null) {
      expect(
        layout!.footerTop,
        "the TOC footer renders above the top of the heading list — overlap",
      ).toBeGreaterThanOrEqual(layout!.scrollerTop - 1);
    }
  });
});
