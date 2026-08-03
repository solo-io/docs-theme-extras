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
});
