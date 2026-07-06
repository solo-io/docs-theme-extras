import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { TEST_PRODUCT_ROOT } from "./helpers/fixture";
import { target } from "./helpers/target";

// Guards the callout `icon=` override (added so a consumer can restore branded
// callout icons — e.g. ambientmesh's solo / waypoint logos — that the
// type-derived Material icon can't express).
//
// The fixture's flatguide/alpha page has two callouts:
//   - icon="flask": a site.Data.icons entry (fixture/data/icons.yaml), so the
//     icon slot renders that inline <svg class="solo-alert-icon-svg" …> (the
//     SVG carries data-testicon="flask").
//   - icon="rocket_launch": NOT in site.Data.icons, so it renders as a Material
//     Icons ligature (<i class="material-icons">rocket_launch</i>).
// A callout with no icon= (elsewhere in the fixture) keeps the type-derived
// Material icon — covered by shortcode-contexts / the untouched default path.
//
// Fixture-only; server-rendered markup read statically.

const IS_FIXTURE_TARGET = target.name.startsWith("docs-theme-extras-fixture");

test.describe("callout icon= override", () => {
  test.skip(
    !IS_FIXTURE_TARGET,
    "fixture-only: relies on the fixture's icons.yaml + flatguide callouts",
  );

  const filePath = path.join(TEST_PRODUCT_ROOT, "flatguide", "alpha", "index.html");

  test("icon= resolves a site.Data.icons entry to an inline SVG", () => {
    test.skip(!fs.existsSync(filePath), "flatguide/alpha not built");
    const html = fs.readFileSync(filePath, "utf8");
    // The flask icon rendered as an inline SVG inside the alert icon slot.
    expect(html, "flask SVG icon missing").toContain('data-testicon="flask"');
    expect(html, "SVG icon should carry the solo-alert-icon-svg class").toContain(
      "solo-alert-icon-svg",
    );
    // It must NOT have fallen back to a Material ligature literally named "flask".
    expect(html).not.toContain(
      '<i class="material-icons" aria-hidden="true">flask</i>',
    );
  });

  test("icon= not in site.Data.icons renders a Material Icons ligature", () => {
    test.skip(!fs.existsSync(filePath), "flatguide/alpha not built");
    const html = fs.readFileSync(filePath, "utf8");
    expect(html, "material-icons fallback for rocket_launch missing").toContain(
      '<i class="material-icons" aria-hidden="true">rocket_launch</i>',
    );
  });
});
