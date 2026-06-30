import { test, expect } from "@playwright/test";
import { target } from "./helpers/target";

// Regression guards for the desktop left-nav "rail" work in
// docs-theme-extras.css (the @media (min-width:1280px) .sidebar-container
// block + --solo-rail-top) and head-end.html (the sessionStorage-scoped
// expand state and the scroll-position restore). None of these had coverage
// before — they are pure CSS/JS behavior, the highest-churn area of the
// sidebar, and exactly what Playwright is for.
//
// All run at >= 1280px, where the persistent desktop sidebar is visible and
// the rail rules apply (below xl it's the mobile slide-in panel, untouched).

const SAMPLE = target.pages.filter((p) => target.versionOf(p.url) !== null);
const PAGE = SAMPLE[0]?.url ?? null;

test.describe("desktop sidebar rail", () => {
  test.skip(!target.shouldRun("viewport"), "viewport check disabled in CONFIG");
  test.skip(PAGE === null, "no non-landing pages configured");
  test.use({ viewport: { width: 1280, height: 800 } });

  test("is a pinned, independently scrolling rail (not scrolling with the article)", async ({
    page,
  }) => {
    await page.goto(PAGE!);
    const styles = await page.evaluate(() => {
      const c = document.querySelector(".sidebar-container") as HTMLElement | null;
      const w = document.querySelector(".sidebar-nav-wrapper") as HTMLElement | null;
      if (!c || !w) return null;
      const cs = getComputedStyle(c);
      const ws = getComputedStyle(w);
      return {
        cPosition: cs.position,
        cDisplay: cs.display,
        cOverflow: cs.overflow,
        wOverflowY: ws.overflowY,
        wMinHeight: ws.minHeight,
        wFlexGrow: ws.flexGrow,
      };
    });
    expect(styles, ".sidebar-container / .sidebar-nav-wrapper not found").not.toBeNull();
    // The container pins itself and clips, so only its inner wrapper scrolls.
    expect(styles!.cPosition, ".sidebar-container is not position:sticky").toBe("sticky");
    expect(styles!.cDisplay, ".sidebar-container is not display:flex").toBe("flex");
    expect(styles!.cOverflow, ".sidebar-container is not overflow:hidden").toBe("hidden");
    // The nav tree is the scroll region.
    expect(styles!.wOverflowY, ".sidebar-nav-wrapper is not overflow-y:auto").toBe("auto");
    expect(styles!.wMinHeight, ".sidebar-nav-wrapper min-height is not 0").toBe("0px");
    expect(styles!.wFlexGrow, ".sidebar-nav-wrapper does not flex-grow to fill the rail").toBe("1");
  });

  test("pins to --solo-rail-top, which tracks the announcement-banner height", async ({
    page,
  }) => {
    await page.goto(PAGE!);
    // The drift bug: both rails stuck at a hardcoded top:4rem (navbar only),
    // ignoring the announcement banner, so they slid up by the banner height
    // on scroll. The fix sets top: var(--solo-rail-top) =
    // calc(navbar-height + banner-height). Prove the rails consume the banner
    // var: override --hextra-banner-height with two values and assert each
    // rail's sticky `top` tracks the delta 1:1. A hardcoded top would not move.
    const STEP_PX = 64;
    const tops = await page.evaluate((stepPx) => {
      const read = () => {
        const c = document.querySelector(".sidebar-container") as HTMLElement | null;
        const t = document.querySelector(".solo-toc-inner") as HTMLElement | null;
        return {
          sidebar: c ? parseFloat(getComputedStyle(c).top) : NaN,
          toc: t ? parseFloat(getComputedStyle(t).top) : NaN,
        };
      };
      const style = document.createElement("style");
      document.head.appendChild(style);
      style.textContent = ":root{--hextra-banner-height:0px}";
      void document.body.offsetHeight;
      const at0 = read();
      style.textContent = `:root{--hextra-banner-height:${stepPx}px}`;
      void document.body.offsetHeight;
      const atStep = read();
      return { at0, atStep };
    }, STEP_PX);

    expect(
      tops.atStep.sidebar - tops.at0.sidebar,
      `sidebar rail top did not track the banner-height change — it is not ` +
        `pinned to --solo-rail-top (likely a hardcoded top, the drift bug). ` +
        `at0=${tops.at0.sidebar} atStep=${tops.atStep.sidebar}`,
    ).toBeCloseTo(STEP_PX, 0);
    // The TOC rail shares the same variable; assert it tracks in lockstep.
    expect(
      tops.atStep.toc - tops.at0.toc,
      `TOC rail top did not track the banner-height change — the two rails are ` +
        `no longer pinned to the same --solo-rail-top.`,
    ).toBeCloseTo(STEP_PX, 0);
    // And the two rails pin at the same offset (same variable, same value).
    expect(
      tops.atStep.sidebar,
      "sidebar and TOC rails do not pin at the same top offset",
    ).toBeCloseTo(tops.atStep.toc, 0);
  });

  test("expanding a section persists to sessionStorage, never localStorage", async ({
    page,
  }) => {
    await page.goto(PAGE!);
    // Start from a clean slate, then reload so the load handler re-applies.
    await page.evaluate(() => {
      sessionStorage.clear();
      localStorage.clear();
    });
    await page.reload();

    const item = page.locator('.sidebar-container [data-sidebar-item]').first();
    if ((await item.count()) === 0) {
      test.skip(true, "no collapsible sidebar section in this build");
    }
    // A collapsed branch we can expand (the nav-group fixture section).
    await expect(item).toHaveAttribute("data-expanded", "false");
    const href = await item
      .locator(":scope > .sidebar-link-wrapper > .sidebar-link")
      .getAttribute("href");
    expect(href, "collapsible item has no link href").toBeTruthy();

    await item.locator(":scope > .sidebar-link-wrapper > .sidebar-toggle").click();
    await expect(item).toHaveAttribute("data-expanded", "true");

    const storage = await page.evaluate((key) => {
      const parse = (raw: string | null) => {
        try {
          return raw ? JSON.parse(raw) : null;
        } catch {
          return "PARSE_ERROR";
        }
      };
      return {
        session: parse(sessionStorage.getItem("solo-sidebar-expanded")),
        local: localStorage.getItem("solo-sidebar-expanded"),
        keyExpanded:
          (parse(sessionStorage.getItem("solo-sidebar-expanded")) || {})[key as string] === true,
      };
    }, href!);

    expect(
      storage.keyExpanded,
      `the expanded branch (${href}) was not recorded as true in ` +
        `sessionStorage['solo-sidebar-expanded']`,
    ).toBe(true);
    expect(
      storage.local,
      `expand state leaked into localStorage — it must use sessionStorage so ` +
        `it can't bleed across tabs and a hard refresh can clear it.`,
    ).toBeNull();
  });

  test("a hard refresh resets expanded sections", async ({ page }) => {
    await page.goto(PAGE!);
    await page.evaluate(() => {
      sessionStorage.clear();
      localStorage.clear();
    });
    await page.reload();

    const item = page.locator('.sidebar-container [data-sidebar-item]').first();
    if ((await item.count()) === 0) {
      test.skip(true, "no collapsible sidebar section in this build");
    }
    // Expand it, then reload (a "reload" navigation, which clears the store).
    await item.locator(":scope > .sidebar-link-wrapper > .sidebar-toggle").click();
    await expect(item).toHaveAttribute("data-expanded", "true");

    await page.reload();
    const itemAfter = page.locator('.sidebar-container [data-sidebar-item]').first();
    // The reloaded page re-renders server-side ancestors only; the manually
    // expanded (non-ancestor) branch must collapse again.
    await expect(
      itemAfter,
      "expanded section survived a hard refresh — the reload-clear of " +
        "sessionStorage['solo-sidebar-expanded'] did not run",
    ).toHaveAttribute("data-expanded", "false");
  });

  test("nav scroll position is restored across a reload", async ({ page }) => {
    await page.goto(PAGE!);
    const scrollable = await page.evaluate(() => {
      const w = document.querySelector(".sidebar-nav-wrapper") as HTMLElement | null;
      return w ? w.scrollHeight - w.clientHeight : 0;
    });
    if (scrollable < 40) {
      // The bundled fixture's nav is short; this exercises in consumer builds
      // (docs hub) where the harness also runs and the nav actually scrolls.
      test.skip(true, "sidebar nav is not tall enough to scroll in this build");
    }
    const target = Math.min(120, scrollable);
    await page.evaluate((t) => {
      const w = document.querySelector(".sidebar-nav-wrapper") as HTMLElement;
      w.scrollTop = t;
    }, target);

    // A reload fires pagehide (which saves scrollTop) then load (which
    // restores it). Back/forward would use bfcache and skip this path.
    await page.reload();
    const restored = await page.evaluate(() => {
      const w = document.querySelector(".sidebar-nav-wrapper") as HTMLElement;
      return w.scrollTop;
    });
    expect(
      Math.abs(restored - target),
      `sidebar nav scroll position was not restored after reload ` +
        `(expected ~${target}, got ${restored})`,
    ).toBeLessThanOrEqual(4);
  });
});

// Long, unbreakable nav labels (CRD names like `EnterpriseKgatewayTrafficPolicy`)
// must WRAP inside the fixed-width sidebar, not get clipped at its right edge.
// The fix is the `.sidebar-link > span { min-width:0; overflow-wrap:anywhere }`
// rule in docs-theme-extras.css. `anywhere` (not `break-word`) is load-bearing:
// only `anywhere` shrinks the flex item's min-content size, so the word actually
// breaks instead of overflowing. This is pure layout behavior — a static HTML
// read can't see it — so it runs in a real browser at desktop width.
//
// The fixture page `enterprise-kgateway-traffic-policy` exists only in the
// bundled fixture; against a real consumer build the link is absent and this
// test skips itself (same no-op-on-consumer pattern as the rest of the suite).
test.describe("long sidebar nav labels wrap instead of clipping", () => {
  test.skip(!target.shouldRun("viewport"), "viewport check disabled in CONFIG");
  test.skip(PAGE === null, "no non-landing pages configured");
  test.use({ viewport: { width: 1280, height: 800 } });

  test("the EnterpriseKgatewayTrafficPolicy label breaks onto multiple lines", async ({
    page,
  }) => {
    // Any versioned page renders the whole section tree, so the link is in the
    // DOM here even though PAGE isn't the long-titled page itself.
    await page.goto(PAGE!);
    const m = await page.evaluate(() => {
      const link = [...document.querySelectorAll(".sidebar-container a.sidebar-link")].find(
        (a) =>
          (a.getAttribute("href") ?? "")
            .replace(/\/$/, "")
            .endsWith("/enterprise-kgateway-traffic-policy"),
      ) as HTMLElement | undefined;
      if (!link) return null;
      const span = link.querySelector("span") as HTMLElement | null;
      if (!span) return null;
      const cs = getComputedStyle(span);
      const lineHeight = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2;
      return {
        text: (span.textContent ?? "").trim(),
        overflowWrap: cs.overflowWrap,
        // Content wider than the box ⇒ the word didn't wrap (it's clipped).
        spanScrollWidth: span.scrollWidth,
        spanClientWidth: span.clientWidth,
        spanHeight: span.getBoundingClientRect().height,
        lineHeight,
      };
    });

    // Fixture page not in this build (real consumer) — nothing to assert.
    test.skip(m === null, "EnterpriseKgatewayTrafficPolicy fixture link not present");

    expect(m!.text, "the test located the wrong sidebar link").toContain(
      "EnterpriseKgatewayTrafficPolicy",
    );
    // The fix's CSS actually reached the label span.
    expect(
      m!.overflowWrap,
      "the .sidebar-link > span overflow-wrap rule did not apply (expected 'anywhere')",
    ).toBe("anywhere");
    // The label content fits within its box horizontally — i.e. it wrapped
    // rather than overflowing. A clipped long word would make scrollWidth > clientWidth.
    expect(
      m!.spanScrollWidth,
      `the nav label overflows its box horizontally (scrollWidth ${m!.spanScrollWidth} > ` +
        `clientWidth ${m!.spanClientWidth}) — the long word is being clipped, not wrapped`,
    ).toBeLessThanOrEqual(m!.spanClientWidth + 1);
    // And it genuinely occupies more than one line, proving the long word broke.
    expect(
      m!.spanHeight,
      `the nav label is only one line tall (${m!.spanHeight}px ≈ ${m!.lineHeight}px line) — ` +
        `the long word did not wrap`,
    ).toBeGreaterThan(m!.lineHeight * 1.5);
  });
});

// The same long-CRD-name overflow, one component over: a prev/next PAGER link.
// Hextra's pager anchors carry the `[word-break:break-word]` utility, which —
// like plain `break-word` — does NOT reduce the flex item's min-content size,
// so a long unbreakable title overran the `hx:max-w-[50%]` anchor and pushed
// the pager arrow past the viewport's right edge: a horizontal scrollbar on
// mobile. The fix is `a[class*="word-break:break-word"] { min-width:0;
// overflow-wrap:anywhere }` in docs-theme-extras.css. Tested at a narrow
// (mobile) width, where the anchor is small enough that an unbroken word would
// genuinely overflow — at desktop the 50% anchor is wide enough to hide the bug.
test.describe("long pager titles wrap instead of forcing horizontal scroll", () => {
  test.skip(!target.shouldRun("viewport"), "viewport check disabled in CONFIG");
  test.skip(SAMPLE.length === 0, "no non-landing pages configured");
  test.use({ viewport: { width: 375, height: 800 } });

  test("the EnterpriseKgatewayTrafficPolicy pager link wraps within its box", async ({
    page,
  }) => {
    // The pager link to the long-titled page lives only on its nav-adjacent
    // sibling, not on every page, so walk the versioned fixture pages until we
    // find the pager anchor (the sidebar link to the same page carries
    // `sidebar-link`, not `word-break:break-word`, so the class filter picks
    // out the pager specifically).
    let found: {
      overflowWrap: string;
      scrollWidth: number;
      clientWidth: number;
      text: string;
    } | null = null;
    for (const p of SAMPLE) {
      await page.goto(p.url);
      found = await page.evaluate(() => {
        const a = [
          ...document.querySelectorAll('a[class*="word-break:break-word"]'),
        ].find((el) =>
          (el.getAttribute("href") ?? "")
            .replace(/\/$/, "")
            .endsWith("/enterprise-kgateway-traffic-policy"),
        ) as HTMLElement | undefined;
        if (!a) return null;
        const cs = getComputedStyle(a);
        return {
          overflowWrap: cs.overflowWrap,
          scrollWidth: a.scrollWidth,
          clientWidth: a.clientWidth,
          text: (a.textContent ?? "").trim(),
        };
      });
      if (found) break;
    }

    // No fixture pager link in this build (real consumer) — nothing to assert.
    test.skip(found === null, "EnterpriseKgatewayTrafficPolicy pager link not present");

    expect(found!.text, "located the wrong pager link").toContain(
      "EnterpriseKgatewayTrafficPolicy",
    );
    // The fix's CSS actually reached the pager anchor (default would be 'normal').
    expect(
      found!.overflowWrap,
      "the a[class*=\"word-break:break-word\"] overflow-wrap rule did not apply (expected 'anywhere')",
    ).toBe("anywhere");
    // The long CRD name broke within the narrow anchor instead of overflowing it.
    expect(
      found!.scrollWidth,
      `the pager link overflows its box horizontally (scrollWidth ${found!.scrollWidth} > ` +
        `clientWidth ${found!.clientWidth}) — the long CRD name is not wrapping`,
    ).toBeLessThanOrEqual(found!.clientWidth + 1);
  });
});
