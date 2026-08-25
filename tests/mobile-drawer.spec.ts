import { test, expect } from "@playwright/test";
import fs from "node:fs";
import { crawlBuiltRoot } from "./helpers/crawl";
import { target } from "./helpers/target";

// Mobile drawer: the AJAX section/version swap and its hardening
// (assets/js/mobile-nav.js).
//
// Below the sidebar breakpoint the persistent sidebar becomes a slide-out
// drawer. Its section and version chips point at a DIFFERENT content tree than
// the current page, so — unlike the tab chips, whose trees are pre-rendered in
// the page — tapping one used to navigate, which closed the drawer and ejected
// a reader who was mid-way through picking section -> version -> topic. The
// handler now fetches the target page, lifts its drawer nav, and swaps it in
// place.
//
// WHY THIS LIVES IN ITS OWN FILE: browser.spec.ts carries a file-level
// `test.skip(!EVERYTHING)` because most of its tests need the `/everything/`
// fixture page. Consumer configs declare no `[[pages]]` at all, so EVERYTHING
// is "" there and the whole file opts out. These tests don't need that page —
// they need any versioned page with 2+ version chips — so keeping them here
// lets them run against real consumer builds (agentgateway, kgateway) where
// this drawer actually ships, instead of only against the bundled fixture.
//
// The target page is DISCOVERED by crawling the built output rather than read
// from `target.pages`/`target.versions`, for the same reason: consumers declare
// neither. Sites with no version chips (unversioned, e.g. ambientmesh.io,
// agentregistry) have no drawer version row and skip.

type DrawerTarget = {
  url: string;
  /** Distinct version segments reachable from this page's chip row. */
  versions: string[];
  /** The version this page itself is on (its active chip). */
  current: string | null;
};

/** Anchor tags in `html` whose class list includes `cls`. Attribute-order and
 *  quote agnostic, since consumer builds run `hugo --minify`, which strips
 *  quotes from single-valued attributes. */
function anchorsWithClass(html: string, cls: string): string[] {
  return (html.match(/<a\s[^>]*>/g) ?? []).filter((a) => a.includes(cls));
}

function hrefOf(tag: string): string | null {
  return tag.match(/href=("|')?([^"'\s>]+)\1?/)?.[2] ?? null;
}

/** `npx serve` (the harness webServer) resolves a URL whose FINAL path segment
 *  contains a dot as a file rather than a directory, so a version-root landing
 *  like `/docs/kubernetes/1.0.x/` comes back as a directory listing instead of
 *  its index.html — no scripts, no drawer, every assertion meaningless. Deep
 *  pages under the same dotted directory (`/docs/kubernetes/1.0.x/install/`)
 *  serve fine, since their last segment is a plain name. Skip the unservable
 *  ones during discovery rather than asserting against a directory listing.
 *  Harness quirk only; the real sites serve these landings correctly. */
function isServable(url: string): boolean {
  const segs = url.split("/").filter(Boolean);
  const last = segs[segs.length - 1] ?? "";
  return !last.includes(".");
}

/** First built page carrying a usable drawer version row. */
function findDrawerPage(): DrawerTarget | null {
  for (const p of crawlBuiltRoot()) {
    if (!isServable(p.url)) continue;
    let html: string;
    try {
      html = fs.readFileSync(p.filePath, "utf8");
    } catch {
      continue;
    }
    const chips = anchorsWithClass(html, "sidebar-mobile-version-link");
    if (chips.length < 2) continue;

    const versions: string[] = [];
    for (const c of chips) {
      const href = hrefOf(c);
      if (!href) continue;
      const v = target.versionOf(href);
      if (v && !versions.includes(v)) versions.push(v);
    }
    if (versions.length < 2) continue;

    // Require an ACTIVE chip. Every test here needs a well-defined "the version
    // this page is on" to swap away from and (for reset-on-close) return to.
    // Some built trees are archived: still published, but dropped from the
    // version switcher, so their chip row lists only the live versions and
    // nothing is marked active (e.g. agentgateway's /docs/kubernetes/1.0.x/).
    // Those pages can't anchor these assertions — keep looking.
    const activeTag = chips.find((c) =>
      c.includes("sidebar-mobile-version-active"),
    );
    if (!activeTag) continue;
    const activeHref = hrefOf(activeTag);
    const current = activeHref ? target.versionOf(activeHref) : p.version;
    if (!current) continue;
    return { url: p.url, versions, current };
  }
  return null;
}

const DRAWER = findDrawerPage();
/** Versions we can hop TO (anything that isn't the page's own). */
const HOPS = DRAWER ? DRAWER.versions.filter((v) => v !== DRAWER.current) : [];

const PHONE = { width: 390, height: 844 }; // below the xl (1280px) breakpoint

test.describe("mobile drawer: AJAX section/version swap", () => {
  test.skip(
    DRAWER === null || HOPS.length < 1,
    "no built page has a drawer version row with 2+ distinct versions",
  );
  test.use({ viewport: PHONE });

  /** Open the drawer and return its locators. */
  async function openDrawer(page: import("@playwright/test").Page) {
    await page.goto(DRAWER!.url);
    await page.evaluate(() =>
      (
        window as unknown as { toggleMobileSidebar: () => void }
      ).toggleMobileSidebar(),
    );
    const panel = page.locator(".sidebar-mobile-panel");
    await expect(panel).toHaveClass(/mobile-sidebar-open/);
    return {
      panel,
      active: panel.locator(".sidebar-mobile-version-active"),
      chipFor: (v: string) =>
        panel.locator(`.sidebar-mobile-version-link[href*="/${v}/"]`).first(),
    };
  }

  /** Assert the drawer's active chip now belongs to version `v`. Compares by
   *  version segment rather than chip text, because the label is the configured
   *  `dropdown` string ("main (dev)") and need not contain the slug. */
  async function expectActiveVersion(
    active: ReturnType<typeof Object>,
    v: string,
  ) {
    await expect(active as never).toHaveAttribute("href", new RegExp(`/${v}/`));
  }

  test("tapping a version chip swaps the drawer in place without navigating", async ({
    page,
  }) => {
    const { panel, active, chipFor } = await openDrawer(page);
    const startUrl = page.url();

    await chipFor(HOPS[0]).click();

    await expectActiveVersion(active, HOPS[0]);
    expect(page.url(), "swap navigated instead of fetching in place").toBe(
      startUrl,
    );
    await expect(panel).toHaveClass(/mobile-sidebar-open/);
  });

  // Only a SECOND swap exercises bindDrawer's re-bind: the first is driven by
  // the listeners bound on DOMContentLoaded, so a regression that dropped the
  // re-bind would otherwise ship green.
  test("a second version chip tap still swaps — the re-bound handlers survive", async ({
    page,
  }) => {
    test.skip(HOPS.length < 2, "needs 2 distinct hop targets");
    const { panel, active, chipFor } = await openDrawer(page);
    const startUrl = page.url();

    await chipFor(HOPS[0]).click();
    await expectActiveVersion(active, HOPS[0]);

    await chipFor(HOPS[1]).click();
    await expectActiveVersion(active, HOPS[1]);

    expect(page.url(), "second swap navigated instead of swapping").toBe(
      startUrl,
    );
    await expect(panel).toHaveClass(/mobile-sidebar-open/);
  });

  // A swap changes only the drawer — the page, its URL and the navbar version
  // dropdown still belong to the version the reader started on. Closing without
  // picking a topic is a cancel, so reopening must show the page's OWN tree.
  test("closing the drawer discards the swap instead of leaving a stale tree", async ({
    page,
  }) => {
    const { panel, active, chipFor } = await openDrawer(page);
    const ownHref = await active.getAttribute("href");
    const toggle = () =>
      page.evaluate(() =>
        (
          window as unknown as { toggleMobileSidebar: () => void }
        ).toggleMobileSidebar(),
      );

    await chipFor(HOPS[0]).click();
    await expectActiveVersion(active, HOPS[0]);

    await toggle();
    await expect(panel).not.toHaveClass(/mobile-sidebar-open/);
    await toggle();
    await expect(panel).toHaveClass(/mobile-sidebar-open/);

    await expect(
      active,
      "reopened drawer still shows the browsed-to version — the swap outlived the drawer",
    ).toHaveAttribute("href", ownHref!);

    // The restored drawer must be live, not inert markup.
    await chipFor(HOPS[0]).click();
    await expectActiveVersion(active, HOPS[0]);
  });

  // wireScroller registers a window 'resize' listener and a ResizeObserver per
  // chip row. Those are the two registrations that do NOT die when innerHTML is
  // replaced, so without explicit teardown they accumulate for as long as the
  // reader keeps hopping. Live observer count is the measurable proxy: it should
  // track the number of chip rows, not the number of swaps.
  test("repeated swaps do not accumulate observers", async ({ page }) => {
    await page.addInitScript(() => {
      const Native = window.ResizeObserver;
      let live = 0;
      (window as unknown as { __liveObservers: () => number }).__liveObservers =
        () => live;
      class Counting extends Native {
        private counted = false;
        observe(...args: Parameters<ResizeObserver["observe"]>) {
          if (!this.counted) {
            this.counted = true;
            live++;
          }
          return super.observe(...args);
        }
        disconnect() {
          if (this.counted) {
            this.counted = false;
            live--;
          }
          return super.disconnect();
        }
      }
      window.ResizeObserver = Counting as unknown as typeof ResizeObserver;
    });
    const { active, chipFor } = await openDrawer(page);
    const count = () =>
      page.evaluate(() =>
        (
          window as unknown as { __liveObservers: () => number }
        ).__liveObservers(),
      );

    const baseline = await count();
    expect(baseline, "no ResizeObserver created — the probe is inert").toBeGreaterThan(0);

    for (let i = 0; i < 4; i++) {
      const v = HOPS[i % HOPS.length];
      await chipFor(v).click();
      await expectActiveVersion(active, v);
    }

    expect(
      await count(),
      "live ResizeObserver count grew across swaps — bindDrawer is not disconnecting the previous binding's observers",
    ).toBeLessThanOrEqual(baseline);
  });

  // A chip must always do something. When the fetch cannot complete, the handler
  // falls back to plain navigation rather than leaving the reader behind a
  // dimmed, input-locked drawer.
  test("a failed fetch falls back to navigating instead of stranding the drawer", async ({
    page,
  }) => {
    const { chipFor } = await openDrawer(page);
    const startUrl = page.url();

    // Fail only the background fetch; the subsequent real navigation must load.
    await page.route(`**/${HOPS[0]}/**`, (route) =>
      route.request().resourceType() === "fetch"
        ? route.abort()
        : route.continue(),
    );
    await chipFor(HOPS[0]).click();

    await page.waitForURL((u) => u.toString() !== startUrl, { timeout: 5000 });
    expect(page.url(), "fetch failure did not fall back to navigation").toContain(
      `/${HOPS[0]}/`,
    );
  });

  // A HANG is the failure the abort test above does not cover: route.abort()
  // rejects immediately, so the catch runs even with no timeout. On a bad phone
  // network the fetch neither resolves nor rejects, and .drawer-loading leaves
  // the drawer dimmed and pointer-events:none with no spinner. SWAP_TIMEOUT_MS
  // aborts it into the same navigate fallback.
  test("a hanging fetch times out and falls back to navigating", async ({
    page,
  }) => {
    const { chipFor } = await openDrawer(page);
    const startUrl = page.url();

    // Never fulfil, never abort — the background fetch just sits there. The
    // real navigation that follows (resourceType "document") must still load.
    await page.route(`**/${HOPS[0]}/**`, (route) => {
      if (route.request().resourceType() !== "fetch") return route.continue();
    });
    await chipFor(HOPS[0]).click();

    // Generous relative to the 5s budget: the assertion is "it gives up at
    // all", not the exact deadline.
    await page.waitForURL((u) => u.toString() !== startUrl, { timeout: 20000 });
    expect(page.url(), "a hung fetch never fell back to navigation").toContain(
      `/${HOPS[0]}/`,
    );
  });

  // Widening past the breakpoint promotes the drawer back into the DESKTOP
  // sidebar. A swap left in place there would show another version's tree while
  // the page, URL and navbar dropdown still belong to the original — and the
  // overlay, which has no media query of its own, would stay over the page.
  test("widening past the breakpoint closes the drawer and drops the swap", async ({
    page,
  }) => {
    const { panel, active, chipFor } = await openDrawer(page);
    const ownHref = await active.getAttribute("href");

    await chipFor(HOPS[0]).click();
    await expectActiveVersion(active, HOPS[0]);

    await page.setViewportSize({ width: 1400, height: 900 });

    await expect(
      panel,
      "drawer stayed open as the desktop sidebar",
    ).not.toHaveClass(/mobile-sidebar-open/);
    await expect(
      page.locator(".sidebar-mobile-overlay"),
      "the mobile scrim survived onto the desktop layout",
    ).not.toHaveClass(/active/);
    await expect(
      active,
      "the swapped tree became the desktop sidebar — it outlived the drawer",
    ).toHaveAttribute("href", ownHref!);
  });
});

// ── Drawer header: chip parity and the CONTENTS heading ────────────────────
//
// The drawer's section chips are styled as TWIN SELECTORS on the version chip
// rules (see the .sidebar-mobile-section-link block in docs-theme-extras.css):
// the two rows must read as the same kind of control. They forked once —
// full-width centered section chips with a blue-tint active against outlined
// version pills with the brand-tint active — and these tests pin the styles
// together so a restyle of one row cannot silently leave the other behind.
//
// The header also draws NO divider line any more: the CONTENTS heading is what
// separates the section/version rows from the page tree, so it must be present
// on every drawer, not just on tabbed pages (where it originally lived).

/** First built page whose drawer carries BOTH chip rows. `wantActive`
 *  additionally requires an active chip of each kind, for the active-state
 *  comparison (a page outside every section has a section row but no active
 *  section chip). */
function findTwoRowPage(wantActive: boolean): string | null {
  for (const p of crawlBuiltRoot()) {
    if (!isServable(p.url)) continue;
    let html: string;
    try {
      html = fs.readFileSync(p.filePath, "utf8");
    } catch {
      continue;
    }
    if (anchorsWithClass(html, "sidebar-mobile-section-link").length < 2) continue;
    if (anchorsWithClass(html, "sidebar-mobile-version-link").length < 1) continue;
    if (
      wantActive &&
      !(
        html.includes("sidebar-mobile-section-active") &&
        html.includes("sidebar-mobile-version-active")
      )
    )
      continue;
    return p.url;
  }
  return null;
}

const TWO_ROW_PAGE = findTwoRowPage(false);
const TWO_ROW_ACTIVE_PAGE = findTwoRowPage(true);

/** The computed properties that make the two chip kinds "the same control".
 *  Colors are deliberately included for the ACTIVE pair (brand tint + brand
 *  border) but not the inactive pair, whose grey text differs per dark-mode
 *  state the fixture doesn't pin. */
const SHAPE_PROPS = [
  "fontSize",
  "fontWeight",
  "paddingTop",
  "paddingRight",
  "borderTopWidth",
  "borderTopStyle",
  "borderTopLeftRadius",
] as const;
const ACTIVE_PROPS = [
  ...SHAPE_PROPS,
  "backgroundColor",
  "borderTopColor",
] as const;

function computedOf(
  page: import("@playwright/test").Page,
  selector: string,
  props: readonly string[],
) {
  return page.evaluate(
    ([sel, keys]) => {
      const el = document.querySelector(sel as string);
      if (!el) return null;
      const cs = getComputedStyle(el);
      return Object.fromEntries(
        (keys as string[]).map((k) => [k, cs[k as keyof CSSStyleDeclaration]]),
      );
    },
    [selector, props] as const,
  );
}

test.describe("mobile drawer: section chips are the version chips' twins", () => {
  test.use({ viewport: PHONE });

  test("an inactive section chip and an inactive version chip share their shape", async ({ page }) => {
    test.skip(TWO_ROW_PAGE === null, "no built page has both chip rows");
    await page.goto(TWO_ROW_PAGE!);
    await page.evaluate(() =>
      (window as unknown as { toggleMobileSidebar: () => void }).toggleMobileSidebar(),
    );
    const section = await computedOf(
      page,
      ".sidebar-mobile-section-link:not(.sidebar-mobile-section-active)",
      SHAPE_PROPS,
    );
    const version = await computedOf(
      page,
      ".sidebar-mobile-version-link:not(.sidebar-mobile-version-active)",
      SHAPE_PROPS,
    );
    expect(section, "no inactive section chip").not.toBeNull();
    expect(version, "no inactive version chip").not.toBeNull();
    expect(section).toEqual(version);
  });

  test("the ACTIVE section chip and the ACTIVE version chip share fill, border, and weight", async ({ page }) => {
    test.skip(
      TWO_ROW_ACTIVE_PAGE === null,
      "no built page has an active chip in both rows",
    );
    await page.goto(TWO_ROW_ACTIVE_PAGE!);
    await page.evaluate(() =>
      (window as unknown as { toggleMobileSidebar: () => void }).toggleMobileSidebar(),
    );
    const section = await computedOf(
      page,
      ".sidebar-mobile-section-active",
      ACTIVE_PROPS,
    );
    const version = await computedOf(
      page,
      ".sidebar-mobile-version-active",
      ACTIVE_PROPS,
    );
    expect(section, "no active section chip").not.toBeNull();
    expect(version, "no active version chip").not.toBeNull();
    expect(section).toEqual(version);
  });

  test("the drawer labels its page tree CONTENTS and draws no divider under the header", async ({ page }) => {
    test.skip(DRAWER === null, "no built page has a drawer version row");
    await page.goto(DRAWER!.url);
    await page.evaluate(() =>
      (window as unknown as { toggleMobileSidebar: () => void }).toggleMobileSidebar(),
    );
    const panel = page.locator(".sidebar-mobile-panel");
    await expect(panel).toHaveClass(/mobile-sidebar-open/);
    // The heading is unconditional — this target page is chosen by version
    // chips alone, so it covers non-tabbed drawers, where the heading used to
    // be missing entirely.
    await expect(
      panel.locator(".sidebar-nav-wrapper .sidebar-mobile-row-label").first(),
      "no CONTENTS heading above the drawer's page tree",
    ).toBeVisible();
    const border = await computedOf(page, ".sidebar-mobile-header", [
      "borderBottomWidth",
    ]);
    if (border) {
      expect(
        border.borderBottomWidth,
        "the header divider is back — the CONTENTS heading replaced it",
      ).toBe("0px");
    }
  });
});

// ── Landing pages: the phone navbar matches content pages, and the hamburger
//    opens a real drawer ────────────────────────────────────────────────────
//
// A landing page (the product root, a section landing) used to render no
// drawer at all and keep the navbar section/version dropdowns at every width
// as "its only selector". Two failures came from that:
//   - at phone widths the two dropdowns don't fit beside the logo, and the
//     justify-end navbar spilled the overflow off the LEFT edge — clipping the
//     hamburger and hiding the logo, so landing pages showed a different (and
//     broken-looking) top nav than content pages;
//   - the hamburger that remained was DEAD: mobile-nav.js wires its click to
//     toggleMobileSidebar(), which no-ops without a .sidebar-mobile-panel.
// Landing pages now render a mobile-only drawer carrying the page's actual
// choices (section chips, and version chips where unambiguous), so the
// hamburger works, and the phone navbar hides the dropdowns exactly as it
// does on content pages.

/** First built landing page: it has the landing drawer (a panel with a
 *  section chip row but NO page tree) plus the navbar version dropdown. */
function findLandingDrawerPage(): string | null {
  for (const p of crawlBuiltRoot()) {
    if (!isServable(p.url)) continue;
    let html: string;
    try {
      html = fs.readFileSync(p.filePath, "utf8");
    } catch {
      continue;
    }
    if (!html.includes("version-dropdown-btn")) continue;
    if (!html.includes("sidebar-mobile-panel")) continue;
    if (!html.includes("sidebar-mobile-section-row")) continue;
    if (html.includes("sidebar-nav-wrapper")) continue;
    return p.url;
  }
  return null;
}

const LANDING = findLandingDrawerPage();

test.describe("landing page navbar and drawer: phone", () => {
  test.use({ viewport: PHONE });

  test("the dropdowns are hidden, and the hamburger opens the landing drawer", async ({ page }) => {
    test.skip(LANDING === null, "no built landing page has a landing drawer");
    await page.goto(LANDING!);
    // Same navbar as a content page: no dropdowns eating the row.
    await expect(page.locator(".version-dropdown")).toBeHidden();
    // The hamburger is not a dead button any more: it opens the drawer, which
    // offers the landing page's choices as section chips.
    const burger = page.locator(".hextra-hamburger-menu");
    await expect(burger).toBeVisible();
    await burger.click();
    const panel = page.locator(".sidebar-mobile-panel");
    await expect(panel).toHaveClass(/mobile-sidebar-open/);
    await expect(
      panel.locator(".sidebar-mobile-section-link").first(),
    ).toBeVisible();
  });
});

test.describe("landing page navbar: desktop", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("the version dropdown is still the selector at desktop width", async ({ page }) => {
    test.skip(LANDING === null, "no built landing page has a landing drawer");
    await page.goto(LANDING!);
    await expect(page.locator(".version-dropdown-btn").first()).toBeVisible();
    // The landing drawer is mobile chrome; the desktop layout must not show it.
    await expect(page.locator(".sidebar-mobile-panel")).toBeHidden();
  });
});
