import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { target } from "./helpers/target";

// WHAT THE SECTION SELECTOR'S BUTTON SAYS.
//
// By default it carries the PRODUCT name — that is what distinguishes the
// control from agentgateway-oss-website's generic "Docs" dropdown, and
// tests/section-selector.spec.ts pins it. `[params.sectionDropdown]` moves it
// off that default two ways, and this spec covers both plus the default:
//
//   showCurrentSection  the button names the section being read, the way the
//                       version dropdown names the version you are on
//   title               a fixed word, and the fallback for pages that are in
//                       no section at all
//
// The two COMPOSE — current section where there is one, title where there is
// not — which is why they are asserted together here rather than in two specs.
//
// WHY EACH MODE NEEDS ITS OWN BUILD, ON A VERSIONED SITE. The button does not
// live alone: the version dropdown beside it drops its own product-name prefix
// whenever a selector renders, so "what the section button says" and "what the
// version button says" are one navbar's worth of decisions and have to be read
// together. The rule is that relabelling the section button changes NOTHING
// about the version dropdown, and the only place that can be checked is a
// versioned build with a selector. The version-less fixtures have no version
// dropdown at all, and setting the keys on a branded fixture would move the
// navbar under the ~1650 assertions those builds already carry. Hence
// hugo-section-title.toml and hugo-section-current.toml, overlays on
// hugo-oss.toml that change publishDir and the params under test; see their
// headers, particularly for why the current-section overlay sets BOTH keys.
//
// The DEFAULT half of the contrast is read from the harness target's own build,
// so the configs are compared page-for-page rather than against hardcoded
// expectations of what "unchanged" looks like.
//
// Skips wholesale when the overlay builds are absent, which is the case for
// every consumer running this suite against its own site.

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
//
// Table-scoped, not first-match. hugo-oss.toml carries `product` twice over:
// once under [params] and once on every [[params.versions]] entry, where it is
// the short slug "test". A first-match regex picks the right one only because
// [params] happens to come first in the file, which is not a property anything
// enforces.
function tomlValue(file: string, table: string, key: string): string {
  const lines = fs.readFileSync(path.join(REPO, file), "utf8").split("\n");
  const kv = new RegExp(`^\\s*${key}\\s*=\\s*"([^"]*)"`);
  let current = "";
  for (const line of lines) {
    const header = line.match(/^\s*\[\[?([^\]]+)\]\]?/);
    if (header) {
      current = header[1].trim();
      continue;
    }
    if (current !== table) continue;
    const m = line.match(kv);
    if (m) return m[1];
  }
  throw new Error(`no ${key} under [${table}] in ${file}`);
}

const PRODUCT = tomlValue("hugo-oss.toml", "params", "product");
const CONFIGURED = tomlValue(
  "hugo-section-title.toml",
  "params.sectionDropdown",
  "title",
);

// ── The third mode: the button names the CURRENT section ──────────────────────
// hugo-section-current.toml sets showCurrentSection AND title, because the two
// compose rather than competing: the section name where a section is active, the
// title where none is. Its header explains why both are needed for the build to
// be able to fail.
const CURRENT_ROOT = path.join(REPO, "public-section-current", "test");
const CURRENT_FALLBACK = tomlValue(
  "hugo-section-current.toml",
  "params.sectionDropdown",
  "title",
);

// A page INSIDE a section, and one in none. Both are real shapes the resolution
// chain has to answer for, and the second is not an edge case — it is the
// product landing page, where the reader is above the sections choosing one.
//
// "nested" is the fixture's only section that nests its version trees, which is
// what makes nested/v2 a page that is simultaneously inside a section and inside
// a version. demo and alt deliberately do not nest, so a versioned page under
// THEM does not exist; picking nested keeps the in-section case realistic rather
// than section-landing-only.
const IN_SECTION = path.join("nested", "v2", "index.html");
const NO_SECTION = "index.html";
const HAS_CURRENT = fs.existsSync(path.join(CURRENT_ROOT, IN_SECTION));

function current(rel: string): string {
  return fs.readFileSync(path.join(CURRENT_ROOT, rel), "utf8");
}

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
  return [...menu[0].matchAll(/version-dropdown-header">([\s\S]*?)</g)].map(
    (m) => m[1].trim(),
  );
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

  test("the version dropdown is untouched — the product name stays suppressed", () => {
    // The version button drops its product-name prefix whenever a selector
    // RENDERS, and relabelling that selector's button does not change it.
    //
    // An earlier draft made the suppression ask whether the selector was
    // showing the product NAME, so relabelling handed the name back here on the
    // reasoning that otherwise nothing in the navbar would say which product
    // this is. That was rejected: the sidebar logo carries it, and "Solo
    // Enterprise for agentgateway - 2026.8.1 (latest)" beside a short section
    // button spends the whole row on naming. This assertion is what stops that
    // idea coming back by accident.
    expect(versionProductName(overlay())).toBeNull();
    expect(versionMenuHeaders(overlay())).not.toContain(PRODUCT);
  });

  test("the default build differs in the button and nowhere else", () => {
    test.skip(!HAS_DEFAULT, "branded fixture build not present");
    const html = byDefault();
    // Pins the contrast: same content, same layouts, one param apart. Without
    // this the assertions above would still pass if the override became the
    // default for everyone — which is the breaking change this feature was
    // shaped to avoid.
    expect(sectionButton(html)).toBe(PRODUCT);
    expect(sectionButton(overlay())).not.toBe(sectionButton(html));
    // And the version dropdown reads identically in both, which is the whole
    // claim of the test above stated as a comparison rather than as a constant.
    expect(versionProductName(html)).toBeNull();
    expect(versionMenuHeaders(overlay())).toEqual(versionMenuHeaders(html));
  });
});

test.describe("section selector naming the current section", () => {
  test.skip(
    !HAS_CURRENT,
    "public-section-current/ not built (make build-section-current)",
  );

  test("the button names the section being read", () => {
    // The whole point of the mode: the button reports WHERE YOU ARE, the way the
    // version button reports which version you are on. Compared against the
    // menu's own active entry rather than a hardcoded "Nested", so renaming the
    // fixture's section cannot leave this asserting a string nothing produces.
    const html = current(IN_SECTION);
    const active = html.match(
      /<a [^>]*class="section-dropdown-item section-dropdown-item-active"[^>]*>([\s\S]*?)<\/a>/,
    );
    expect(active, "no active entry in the menu").not.toBeNull();
    const activeLabel = active![1]
      .replace(/<svg[\s\S]*?<\/svg>/g, "")
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim();
    expect(sectionButton(html)).toBe(activeLabel);
    // And it is genuinely a third state, not the fallback or the product name
    // reached by accident.
    expect(sectionButton(html)).not.toBe(CURRENT_FALLBACK);
    expect(sectionButton(html)).not.toBe(PRODUCT);
  });

  test("a page in no section falls back to the configured title", () => {
    // The product landing page renders the selector with every entry inactive.
    // Without a fallback this button would be empty on the one page whose whole
    // job is to let you pick a section.
    const html = current(NO_SECTION);
    expect(html, "the landing page should still render a selector").toContain(
      "section-dropdown-btn",
    );
    expect(html).not.toContain("section-dropdown-item-active");
    expect(sectionButton(html)).toBe(CURRENT_FALLBACK);
  });

  test("the menu is untouched in both cases", () => {
    // Same guarantee as the title mode: this is a button-label setting. A
    // regression that wrote the current section into the entries would turn the
    // control into a list of one thing repeated.
    const inside = sectionMenuLabels(current(IN_SECTION));
    expect(inside.length).toBeGreaterThan(1);
    expect(sectionMenuLabels(current(NO_SECTION))).toEqual(inside);
    if (HAS_DEFAULT) {
      expect(inside).toEqual(sectionMenuLabels(byDefault()));
    }
  });

  test("the version dropdown is untouched in both cases", () => {
    // Same guarantee as the title mode, asserted on both pages the fall-through
    // can reach. Naming the section on one control changes nothing about the
    // control beside it.
    expect(versionProductName(current(IN_SECTION))).toBeNull();
    expect(versionMenuHeaders(current(IN_SECTION))).not.toContain(PRODUCT);

    // The landing page is asserted on the button's TEXT rather than through
    // versionProductName(). It composes its label in a different navbar.html
    // branch — the product-root fallback, which emits one flat <span> and no
    // <span class="version-product-name"> — so the strict helper reads null
    // there whether the name is present or not, and would pass vacuously.
    const rootBtn = current(NO_SECTION).match(
      /<button[^>]*class="version-dropdown-btn"[\s\S]*?<\/button>/,
    );
    expect(rootBtn, "no version button on the landing page").not.toBeNull();
    expect(rootBtn![0].replace(/<[^>]+>/g, "")).not.toContain(PRODUCT);
  });

  test("showCurrentSection alone does not explain the result", () => {
    // Guards the composition rather than either mode. The title-only build must
    // still read the title INSIDE a section — if it started tracking the current
    // section there, showCurrentSection would be doing nothing and this suite
    // would not notice, because both builds would agree.
    test.skip(!HAS_OVERLAY, "title-only build not present");
    const titleInside = path.join(OVERLAY_ROOT, IN_SECTION);
    test.skip(!fs.existsSync(titleInside), "no in-section page in that build");
    expect(sectionButton(fs.readFileSync(titleInside, "utf8"))).toBe(
      CONFIGURED,
    );
  });
});
