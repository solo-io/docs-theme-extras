import { test, expect, type Page } from "@playwright/test";
import { target } from "./helpers/target";

// TABS INSIDE TABS — the runtime half. tests/tabs-nested.spec.ts asserts the
// TREE in the built HTML; this asserts what a reader gets when they click.
//
// WHY A BROWSER IS REQUIRED. Every panel of every group is present in the
// static HTML; which one a reader sees is decided entirely at runtime, by
// Hextra's `assets/js/core/tabs.js` toggling `data-state` and `aria-hidden`
// against a CSS rule (`hx:hidden hx:data-[state=selected]:block`). So the one
// thing that matters about a nested group — that it switches INDEPENDENTLY of
// the group it sits inside — is invisible to any HTML-only check.
//
// THE SPECIFIC HAZARD. tabs.js finds a clicked button's siblings with
// `container.querySelectorAll('.hextra-tabs-toggle')` and its panels with
// `container.parentElement.nextElementSibling`, where `container` is the
// clicked button's own tablist. Nesting works because those relations are
// group-local. Widen either one — a page-level `document.querySelectorAll`, a
// descendant walk instead of `.children` — and a click on an outer tab starts
// driving the inner group too, or an inner click reaches back up and switches
// the outer panel out from under itself. Both failures leave the HTML and every
// count unchanged, and both are the kind of thing a Hextra minor bump does.
//
// The panel ids are NOT usable as selectors here: they collide across nested
// groups (see tabs-nested.spec.ts's duplicate-ids test), so every locator below
// goes through the accessible tab name or through marker text.

const BASE_URL = "/" + target.baseURL.replace(/^\/+|\/+$/g, "");
const PAGE = `${BASE_URL}/v2/tabs-nested/`;

// Fixture-only page (build.list=never, deliberately out of CONFIG [[pages]]),
// same gate ordered-list-numbering.spec.ts and the version-cards specs use.
const IS_FIXTURE_TARGET = target.name.startsWith("docs-theme-extras-fixture");

/** The marker's paragraph, scoped to the article so the TOC can never match. */
function marker(page: Page, name: string) {
  return page.locator(`#content .content :text("${name}")`).first();
}

/** A tab button by its visible label, scoped to the article. */
function tab(page: Page, name: string) {
  return page.locator("#content .content").getByRole("tab", { name, exact: true });
}

test.describe("nested tab groups switch independently", () => {
  test.skip(
    !IS_FIXTURE_TARGET,
    "fixture-only page (v2/tabs-nested, build.list=never)",
  );

  test.beforeEach(async ({ page }) => {
    await page.goto(PAGE);
    // The fixture must actually be there; an empty page would make every
    // toBeHidden() below pass for the wrong reason.
    await expect(tab(page, "Kubernetes")).toBeVisible();
  });

  test("on load, the first panel of every group is the visible one", async ({
    page,
  }) => {
    await expect(marker(page, "MARKER_NESTTABS_S1_OUTER_A")).toBeVisible();
    await expect(marker(page, "MARKER_NESTTABS_S1_INNER_A1")).toBeVisible();

    await expect(marker(page, "MARKER_NESTTABS_S1_INNER_A2")).toBeHidden();
    await expect(marker(page, "MARKER_NESTTABS_S1_OUTER_B")).toBeHidden();

    // The inner group's own BAR is visible too — a nested group whose buttons
    // are hidden by its parent's panel rule is unusable even when its panels
    // resolve correctly.
    await expect(tab(page, "Helm")).toBeVisible();
    await expect(tab(page, "kubectl")).toBeVisible();
  });

  test("clicking an inner tab switches the inner group only", async ({
    page,
  }) => {
    await tab(page, "kubectl").click();

    await expect(marker(page, "MARKER_NESTTABS_S1_INNER_A2")).toBeVisible();
    await expect(marker(page, "MARKER_NESTTABS_S1_INNER_A1")).toBeHidden();

    // The outer group did not move: its panel still shows its own prose on
    // both sides of the inner group, and its other panel is still hidden.
    await expect(marker(page, "MARKER_NESTTABS_S1_OUTER_A")).toBeVisible();
    await expect(marker(page, "MARKER_NESTTABS_S1_OUTER_A_TAIL")).toBeVisible();
    await expect(marker(page, "MARKER_NESTTABS_S1_OUTER_B")).toBeHidden();

    await expect(tab(page, "Kubernetes")).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(tab(page, "Standalone")).toHaveAttribute(
      "aria-selected",
      "false",
    );
  });

  test("switching the outer tab hides the whole inner group", async ({
    page,
  }) => {
    await tab(page, "Standalone").click();

    await expect(marker(page, "MARKER_NESTTABS_S1_OUTER_B")).toBeVisible();
    await expect(marker(page, "MARKER_NESTTABS_S1_OUTER_A")).toBeHidden();

    // Both inner panels AND the inner bar go with the panel that contained
    // them. An inner group that stayed on screen would be a group with no
    // context, offering alternatives for a path the reader just left.
    await expect(marker(page, "MARKER_NESTTABS_S1_INNER_A1")).toBeHidden();
    await expect(marker(page, "MARKER_NESTTABS_S1_INNER_A2")).toBeHidden();
    await expect(tab(page, "Helm")).toBeHidden();

    // And switching back restores the inner group's own selection rather than
    // resetting it — the panels were never re-rendered, only re-shown.
    await tab(page, "Kubernetes").click();
    await expect(marker(page, "MARKER_NESTTABS_S1_INNER_A1")).toBeVisible();
  });

  test("two inner groups under one outer group do not drive each other", async ({
    page,
  }) => {
    // Shape 2: an inner group in each outer panel. The second one is only
    // reachable by switching the outer group first, which is what makes it the
    // interesting case — nothing about it is exercised on page load.
    await expect(marker(page, "MARKER_NESTTABS_S2_INNER_A1")).toBeVisible();

    await tab(page, "macOS").click();
    await expect(marker(page, "MARKER_NESTTABS_S2_INNER_B1")).toBeVisible();

    await tab(page, "Intel").click();
    await expect(marker(page, "MARKER_NESTTABS_S2_INNER_B2")).toBeVisible();
    await expect(marker(page, "MARKER_NESTTABS_S2_INNER_B1")).toBeHidden();

    // Back to the first outer panel: its inner group must still be on its own
    // first option. The two inner groups have the same SHAPE and sit under the
    // same parent; if the click above had matched by position instead of by
    // container, this is where it would show.
    await tab(page, "Linux").click();
    await expect(marker(page, "MARKER_NESTTABS_S2_INNER_A1")).toBeVisible();
    await expect(marker(page, "MARKER_NESTTABS_S2_INNER_A2")).toBeHidden();
    await expect(tab(page, "amd64")).toHaveAttribute("aria-selected", "true");
  });

  test("keyboard navigation inside an inner group stays inside it", async ({
    page,
  }) => {
    // tabs.js handles ArrowRight/Left/Home/End on the same `container` it uses
    // for clicks, so the keyboard path can regress independently of the click
    // path — and it is the path a reader who cannot use a mouse depends on.
    await tab(page, "Helm").focus();
    await page.keyboard.press("ArrowRight");

    await expect(tab(page, "kubectl")).toBeFocused();
    await expect(marker(page, "MARKER_NESTTABS_S1_INNER_A2")).toBeVisible();

    await expect(tab(page, "Kubernetes")).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(marker(page, "MARKER_NESTTABS_S1_OUTER_B")).toBeHidden();
  });

  test("a code fence nested two levels deep keeps its copy button", async ({
    page,
  }) => {
    // The fence in shape 3 lives in an inner panel inside an outer panel, so
    // its body is markdownified twice. The reader-visible consequence of that
    // going wrong is not a missing fence — it is a FRAGMENTED one: Hextra
    // attaches the copy button to `pre > code`, and a `<p>` injected mid-block
    // splits the code into pieces that lose it.
    await tab(page, "Install").click();

    const fence = page
      .locator("#content .content pre")
      .filter({ hasText: "MARKER_NESTTABS_S3_AFTER" });
    await expect(fence).toHaveCount(1);
    await expect(fence.locator("p")).toHaveCount(0);
    await expect(fence.locator("code")).toHaveCount(1);
  });
});
