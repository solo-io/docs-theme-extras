import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { target } from "./helpers/target";

// A CONFIGURED TITLE ON THE SECTION SELECTOR BUTTON.
//
// By default the selector's button carries the PRODUCT name — that is what
// distinguishes it from agentgateway-oss-website's generic "Docs" dropdown, and
// tests/section-selector.spec.ts pins it. `[params.sectionDropdown] title` lets
// a product put a short fixed word there instead, naming the sections only
// inside the menu. docs-hub agentgateway is the case that asked for it: "Solo
// Enterprise for agentgateway" on a button, beside a version dropdown and a
// search box, crowded the navbar row.
//
// WHY THIS NEEDS ITS OWN BUILD. The override does not just swap a string. The
// version dropdown drops its product-name prefix whenever a selector renders,
// on the assumption that the selector is showing the name — so an override that
// only changed the button would leave the navbar with NO product name anywhere:
// a section button reading "Docs" and a version button reading a bare "latest".
// utils/section-dropdown-label.html reports `isOverride` precisely so
// navbar.html can tell those two cases apart, and that interaction exists only
// on a VERSIONED site with a selector — the version-less fixtures cannot reach
// it, and setting the key on a branded fixture would move the navbar under the
// ~1900 assertions those builds already carry. hugo-section-title.toml is an
// overlay on hugo-oss.toml that changes publishDir and the one param; see its
// header.
//
// The DEFAULT half of every assertion below is checked against the harness
// target's own build, so the two configs are compared page-for-page rather than
// against hardcoded expectations of what "unchanged" looks like.
//
// Skips wholesale when the overlay build is absent, which is the case for every
// consumer running this suite against its own site.

const REPO = path.resolve(__dirname, "..");
const OVERLAY_ROOT = path.join(REPO, "public-section-title", "test");

// The page the assertions read. Deep enough to carry a version segment, so the
// version dropdown is in its normal state rather than the product-root
// fallback, and present in both builds because they mount the same content.
const PAGE = path.join("v2", "everything", "index.html");

const HAS_OVERLAY = fs.existsSync(path.join(OVERLAY_ROOT, PAGE));

// Both halves of the contrast are read out of the configs rather than typed in,
// so renaming the fixture product or changing the configured word cannot leave
// this spec asserting a string nothing produces any more.
function tomlValue(file: string, key: string): string {
  const src = fs.readFileSync(path.join(REPO, file), "utf8");
  const m = src.match(new RegExp(`^\\s*${key}\\s*=\\s*"([^"]*)"`, "m"));
  if (!m) throw new Error(`no ${key} in ${file}`);
  return m[1];
}

const PRODUCT = tomlValue("hugo-oss.toml", "product");
const CONFIGURED = tomlValue("hugo-section-title.toml", "title");

// The harness target is the branded fixture build for whichever brand is
// running (public-oss or public-enterprise). Both set the same params.product,
// and neither sets params.sectionDropdown, so either one is a valid DEFAULT
// side for the contrast.
// productRoot, not builtRoot: both fixtures publish under a "/test" baseURL
// segment, which is the same segment OVERLAY_ROOT spells out.
const IS_FIXTURE_TARGET = target.name.startsWith("docs-theme-extras-fixture");
const DEFAULT_PAGE = path.join(target.productRoot, PAGE);
const HAS_DEFAULT = IS_FIXTURE_TARGET && fs.existsSync(DEFAULT_PAGE);

function overlay(): string {
  return fs.readFileSync(path.join(OVERLAY_ROOT, PAGE), "utf8");
}

function byDefault(): string {
  return fs.readFileSync(DEFAULT_PAGE, "utf8");
}

/** Text of the section selector's button, whitespace-collapsed. */
function sectionButton(html: string): string | null {
  const m = html.match(
    /<button[^>]*class="section-dropdown-btn"[\s\S]*?<\/button>/,
  );
  if (!m) return null;
  return m[0]
    .replace(/<svg[\s\S]*?<\/svg>/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Labels of the section selector's MENU entries, in render order. */
function sectionMenuLabels(html: string): string[] {
  const menu = html.match(/<ul class="section-dropdown-menu"[\s\S]*?<\/ul>/);
  if (!menu) return [];
  return [
    ...menu[0].matchAll(
      /<a [^>]*class="section-dropdown-item[^"]*"[^>]*>([\s\S]*?)<\/a>/g,
    ),
  ].map((m) =>
    m[1]
      .replace(/<svg[\s\S]*?<\/svg>/g, "")
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

/** The product-name prefix on the version button, or null when suppressed. */
function versionProductName(html: string): string | null {
  const m = html.match(
    /<button[^>]*class="version-dropdown-btn"[\s\S]*?<\/button>/,
  );
  if (!m) return null;
  const span = m[0].match(
    /<span class="version-product-name">([\s\S]*?)<\/span>/,
  );
  return span ? span[1].replace(/\s*-\s*$/, "").trim() : null;
}

/** Group headers inside the version dropdown menu. */
function versionMenuHeaders(html: string): string[] {
  const menu = html.match(/<ul class="version-dropdown-menu"[\s\S]*?<\/ul>/);
  if (!menu) return [];
  return [
    ...menu[0].matchAll(/version-dropdown-header">([\s\S]*?)</g),
  ].map((m) => m[1].trim());
}

test.describe("section selector title override", () => {
  test.skip(
    !HAS_OVERLAY,
    "public-section-title/ not built (make build-section-title)",
  );

  test("the button shows the configured title instead of the product name", () => {
    expect(sectionButton(overlay())).toBe(CONFIGURED);
  });

  test("the product name is gone from the selector entirely", () => {
    const box = overlay().match(
      /<div class="section-dropdown[^"]*">[\s\S]*?<\/ul>\s*<\/div>/,
    );
    expect(box, "no section selector in the overlay build").not.toBeNull();
    expect(
      box![0],
      "the override replaces the product name; leaving it anywhere in the " +
        "control would defeat the point of shortening the button",
    ).not.toContain(PRODUCT);
  });

  test("only the button changes — the menu still names the sections", () => {
    // The override is a button-label setting, not a menu setting. If it ever
    // starts leaking into the entries, the control stops being a section
    // selector at all.
    const labels = sectionMenuLabels(overlay());
    expect(labels.length, "no menu entries").toBeGreaterThan(1);
    expect(labels).not.toContain(CONFIGURED);
    if (HAS_DEFAULT) {
      expect(
        labels,
        "the menu must be identical to the default build's",
      ).toEqual(sectionMenuLabels(byDefault()));
    }
  });

  test("the version button takes the product name back", () => {
    // The regression this exists to catch: suppress on both controls and the
    // navbar names no product at all.
    expect(
      versionProductName(overlay()),
      "the selector no longer shows the product name, so the version button " +
        "must stop suppressing it",
    ).toBe(PRODUCT);
  });

  test("this product's version-menu header comes back too", () => {
    // Same suppression, third site (navbar.html's own-group header). It moved
    // with the other two or it did not; asserting the button alone would miss
    // a partial fix.
    expect(versionMenuHeaders(overlay())).toContain(PRODUCT);
  });

  test("the default build still does the opposite", () => {
    test.skip(!HAS_DEFAULT, "branded fixture build not present");
    const html = byDefault();
    // Pins the contrast: same content, same layouts, one param apart. Without
    // this the assertions above would still pass if the override became the
    // default for everyone — which is the breaking change this feature was
    // shaped to avoid.
    expect(sectionButton(html)).toBe(PRODUCT);
    expect(versionProductName(html)).toBeNull();
    expect(versionMenuHeaders(html)).not.toContain(PRODUCT);
  });
});
