import { test, expect, type Page } from "@playwright/test";
import path from "node:path";
import { TEST_PRODUCT_ROOT, readFixture } from "./helpers/fixture";
import { target } from "./helpers/target";

// `tabs.sync` — and what it does once a group is NESTED.
//
// WHY THIS EXISTS. Syncing was the gap left by tests/tabs-nested.spec.ts and
// tests/tabs-nested-switch.spec.ts: neither fixture page turns it on, so
// nothing said what happens when the feature that moves OTHER groups meets the
// shape where groups sit inside each other.
//
// The rule, which is not written down anywhere a docs author would find it:
// Hextra keys a sync group on the COMMA-JOINED LIST OF ITS TAB NAMES
// (`data-tab-group="Helm,kubectl"`), and `tabs.js` drives every element on the
// page carrying that key. Position, nesting depth and containment are not part
// of the key and are never consulted. Three consequences, all asserted below:
//
//   1. Two top-level groups with matching labels move together. Documented,
//      intended, and the reason the feature exists.
//   2. Two INNER groups with matching labels move together too, even under
//      different outer panels — including while one of them is hidden.
//   3. An inner group and a top-level group with matching labels move together
//      across the nesting boundary.
//
// 2 and 3 are the ones that surprise, and they are easy to reach by accident:
// "Helm / kubectl" under both a Linux and a macOS panel is the natural way to
// write an install page, and on a site with `tabs.sync` on, those two inner
// groups are then one control. THIS SPEC DOES NOT CLAIM THAT IS WRONG. It is
// the documented key applied consistently, and a reader who picks Helm once
// probably does want Helm everywhere. It is pinned here because it is
// surprising, because nothing else measures it, and because the alternative
// (scoping the key to the containing panel) would be a behavior change that
// needs a decision rather than a silent drift.
//
// The control is shape 3: a group labelled "Terraform / Pulumi" that must never
// move when any of the others do. Without it, a bug that synced EVERYTHING
// would pass every other assertion in this file.

const BASE_URL = "/" + target.baseURL.replace(/^\/+|\/+$/g, "");
const PAGE = `${BASE_URL}/v2/tabs-sync/`;
const FILE = path.join(TEST_PRODUCT_ROOT, "v2", "tabs-sync", "index.html");

const IS_FIXTURE_TARGET = target.name.startsWith("docs-theme-extras-fixture");

/** A tab button by visible label, within the group that owns `groupMarker`. */
function tabIn(page: Page, panelText: string, name: string) {
  return page
    .locator(".hextra-tabs-panel", { hasText: panelText })
    .getByRole("tab", { name, exact: true });
}

/** A tab button by visible label, nth on the page (document order). */
function tabAt(page: Page, name: string, index: number) {
  return page.locator("#content .content").getByRole("tab", { name, exact: true }).nth(index);
}

function marker(page: Page, name: string) {
  return page.locator(`#content .content :text("${name}")`).first();
}

test.describe("tabs.sync across nested groups", () => {
  test.skip(
    !IS_FIXTURE_TARGET,
    "fixture-only page (v2/tabs-sync, build.list=never)",
  );

  test("every group carries the sync key its labels produce", () => {
    const body = readFixture(FILE).replace(
      /<script[^>]*class=["']copy-md-source["'][^>]*>[\s\S]*?<\/script>/gi,
      "",
    );

    // Six groups, and the key is the tab names — so the four "Helm / kubectl"
    // groups share one key across two nesting levels. If a future Hextra
    // scoped the key (per group, per panel, per page) this is the assertion
    // that reports it, and the runtime tests below would then be asserting
    // behavior that no longer exists.
    const keys = [...body.matchAll(/data-tab-group="([^"]*)"/g)].map((m) => m[1]);
    expect(keys, "sync keys in document order").toEqual([
      "Helm,kubectl", // shape 1, group A (top level)
      "Helm,kubectl", // shape 1, group B (top level)
      "Linux,macOS", // shape 2, outer
      "Helm,kubectl", // shape 2, inner under Linux
      "Helm,kubectl", // shape 2, inner under macOS
      "Terraform,Pulumi", // shape 3, the control
    ]);

    // Sync is off by default, so a key on every group also proves the page
    // param was read: `tabs.sync` in front matter, not the site param.
    expect(
      (body.match(/role="tablist"/g) || []).length,
      "one key per group — a group with no key never syncs and would make the " +
        "runtime tests below pass for the wrong reason",
    ).toBe(keys.length);
  });

  test("two top-level groups with matching labels move together", async ({
    page,
  }) => {
    await page.goto(PAGE);
    await expect(marker(page, "MARKER_SYNCTABS_S1_A_HELM")).toBeVisible();
    await expect(marker(page, "MARKER_SYNCTABS_S1_B_HELM")).toBeVisible();

    await tabAt(page, "kubectl", 0).click();

    await expect(marker(page, "MARKER_SYNCTABS_S1_A_KUBECTL")).toBeVisible();
    await expect(
      marker(page, "MARKER_SYNCTABS_S1_B_KUBECTL"),
      "the second top-level group did not follow the first — tabs.sync is not " +
        "firing at all",
    ).toBeVisible();

    // The control never moves.
    await expect(marker(page, "MARKER_SYNCTABS_S3_TERRAFORM")).toBeVisible();
    await expect(marker(page, "MARKER_SYNCTABS_S3_PULUMI")).toBeHidden();
  });

  test("a nested group follows a top-level one across the nesting boundary", async ({
    page,
  }) => {
    await page.goto(PAGE);

    // Shape 2's outer group is untouched by this: its labels are Linux/macOS.
    await expect(marker(page, "MARKER_SYNCTABS_S2_INNER_A_HELM")).toBeVisible();

    await tabAt(page, "kubectl", 0).click();

    await expect(
      marker(page, "MARKER_SYNCTABS_S2_INNER_A_KUBECTL"),
      "a nested group with matching labels did not follow a top-level group — " +
        "the sync key stopped reaching across the nesting boundary",
    ).toBeVisible();
    await expect(marker(page, "MARKER_SYNCTABS_S2_INNER_A_HELM")).toBeHidden();

    // The outer group stayed on Linux: a synced inner group must not drag the
    // panel it lives in.
    await expect(marker(page, "MARKER_SYNCTABS_S2_OUTER_A")).toBeVisible();
    await expect(marker(page, "MARKER_SYNCTABS_S2_OUTER_B")).toBeHidden();
  });

  test("a hidden nested group is synced too, and shows its synced tab when revealed", async ({
    page,
  }) => {
    await page.goto(PAGE);

    // The inner group under macOS is inside a hidden panel at load. Sync it
    // while it cannot be seen...
    await tabAt(page, "kubectl", 0).click();

    // ...then reveal it. This is the case a sync implementation that skipped
    // hidden elements, or that ran once at load, would get wrong — and the
    // reader would see a group on Helm while every other group says kubectl.
    await page.locator("#content .content").getByRole("tab", { name: "macOS", exact: true }).click();

    await expect(marker(page, "MARKER_SYNCTABS_S2_OUTER_B")).toBeVisible();
    await expect(
      marker(page, "MARKER_SYNCTABS_S2_INNER_B_KUBECTL"),
      "the inner group under macOS was still on Helm after being revealed — " +
        "it was not synced while hidden",
    ).toBeVisible();
    await expect(marker(page, "MARKER_SYNCTABS_S2_INNER_B_HELM")).toBeHidden();
  });

  test("clicking inside a nested group drives the top-level ones", async ({
    page,
  }) => {
    await page.goto(PAGE);

    // The reverse direction of the boundary crossing above. Click the inner
    // group under Linux, not a top-level one.
    await tabIn(page, "MARKER_SYNCTABS_S2_OUTER_A", "kubectl").click();

    await expect(marker(page, "MARKER_SYNCTABS_S2_INNER_A_KUBECTL")).toBeVisible();
    await expect(
      marker(page, "MARKER_SYNCTABS_S1_A_KUBECTL"),
      "a click inside a nested group did not reach the top-level groups",
    ).toBeVisible();
    await expect(marker(page, "MARKER_SYNCTABS_S1_B_KUBECTL")).toBeVisible();

    // And still not the control, and still not the outer group.
    await expect(marker(page, "MARKER_SYNCTABS_S3_TERRAFORM")).toBeVisible();
    await expect(marker(page, "MARKER_SYNCTABS_S2_OUTER_A")).toBeVisible();
  });

  test("the choice survives a reload, for nested groups as well", async ({
    page,
  }) => {
    await page.goto(PAGE);
    await tabAt(page, "kubectl", 0).click();

    // tabs.js writes `hextra-tab-<encoded key>` to localStorage and replays it
    // on the next load. Nested groups are restored by the same pass, since the
    // replay also selects on the key rather than on position.
    await page.reload();

    await expect(marker(page, "MARKER_SYNCTABS_S1_A_KUBECTL")).toBeVisible();
    await expect(marker(page, "MARKER_SYNCTABS_S1_B_KUBECTL")).toBeVisible();
    await expect(
      marker(page, "MARKER_SYNCTABS_S2_INNER_A_KUBECTL"),
      "the nested group reverted to its first tab on reload while the " +
        "top-level groups were restored",
    ).toBeVisible();

    // The control has no stored state and opens on its first tab.
    await expect(marker(page, "MARKER_SYNCTABS_S3_TERRAFORM")).toBeVisible();
  });
});
