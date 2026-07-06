import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { TEST_PRODUCT_ROOT } from "./helpers/fixture";
import { target } from "./helpers/target";

// Guards the theme's built-in custom GitHub-style alert types, [!SOLO] and
// [!WAYPOINT] (components/github-style-alert.html + data/icons.yaml). These
// need NO consumer config — the fixture declares no themeExtras.alertTypes, so
// this proves a bare consumer gets them. The `everything` conref's
// "Callouts - Github default styling" section carries a `> [!SOLO]` and a
// `> [!WAYPOINT]` alert alongside the five built-in GitHub types.
//
// Also implicitly covers: render-blockquote-alert must NOT warn on these
// (they're in the supported list), and the icons resolve from the theme-shipped
// data (the fixture ships none of its own).
//
// Fixture-only; server-rendered markup read statically.

const IS_FIXTURE_TARGET = target.name.startsWith("docs-theme-extras-fixture");

// The everything page is per-version; any version's copy carries the same
// conref content. Use the first version whose everything page was built.
function everythingPage(): string | null {
  for (const v of target.versions) {
    const p = path.join(TEST_PRODUCT_ROOT, v, "everything", "index.html");
    if (fs.existsSync(p)) return p;
  }
  return null;
}

test.describe("built-in custom alert types (solo, waypoint)", () => {
  test.skip(
    !IS_FIXTURE_TARGET,
    "fixture-only: relies on the everything alerts + theme-shipped icons",
  );

  const filePath = everythingPage();

  test("[!SOLO] renders the Solo label, logo SVG, and indigo style", () => {
    test.skip(!filePath, "no everything page built");
    const html = fs.readFileSync(filePath!, "utf8");
    expect(html, "Solo alert label missing").toContain("Solo Enterprise for Istio");
    // The solo logo SVG (from the theme's data/icons.yaml) rendered inline.
    expect(html, "solo logo SVG missing").toContain('viewBox="0 0 84 84"');
    // Indigo tint applied (matches the legacy alert-default callout).
    expect(html, "indigo alert style missing").toContain("hx:bg-indigo-100");
  });

  test("[!WAYPOINT] renders the Waypoint label and waypoint icon", () => {
    test.skip(!filePath, "no everything page built");
    const html = fs.readFileSync(filePath!, "utf8");
    expect(html, "Waypoint alert label missing").toContain("Waypoint");
    // The waypoint icon SVG (theme data) rendered inline.
    expect(html, "waypoint icon SVG missing").toContain('viewBox="0 0 36 36"');
  });
});
