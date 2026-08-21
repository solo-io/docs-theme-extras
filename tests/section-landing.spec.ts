import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { TEST_PRODUCT_ROOT } from "./helpers/fixture";
import { target } from "./helpers/target";

const IS_FIXTURE_TARGET = target.name.startsWith("docs-theme-extras-fixture");

// The left nav on a SECTION LANDING page — the "pick a version / deployment
// type" splash that sits ABOVE the version trees.
//
// WHY THIS EXISTS. sidebar.html has always suppressed the nav on those pages
// (there is no single version tree to show one for), but it tested for the
// literal OSS shape `/docs/<section>/`. The docs hub serves the same page at
// `/<product>/<section>/` in production and `/<section>/` under `hugo server`,
// so agentgateway's /kubernetes/ and /standalone/ splash pages rendered a full
// left nav for a tree that does not exist at that level. Same bug class as the
// rest of this module's URL parsing: one shape hardcoded where two exist.
//
// No fixture had a section landing page in ANY shape before this, which is why
// the gap was invisible. fixture/content/en/test/demo/ is the probe; `demo` is
// a registered section, so /test/demo/ is the enterprise-shaped case.

const LANDING = path.join(TEST_PRODUCT_ROOT, "demo", "index.html");

/** The real sidebar renders a nav tree; the suppressed one is a bare hidden aside. */
function sidebarState(html: string): "rendered" | "suppressed" | "absent" {
  if (/<aside class="sidebar-container/.test(html)) return "rendered";
  if (/<aside class="hx:hidden"><\/aside>/.test(html)) return "suppressed";
  return "absent";
}

test.describe("section landing pages suppress the left nav", () => {
  test.skip(!IS_FIXTURE_TARGET, "asserts the bundled fixture's section registry");

  test("the fixture actually built the probe page", () => {
    // Without this, a moved or unbuilt page turns every assertion below into a
    // silent skip rather than a failure.
    expect(
      fs.existsSync(LANDING),
      `${LANDING} not built — the section-landing probe is gone, so nothing ` +
        "below is being tested",
    ).toBe(true);
  });

  test("/test/demo/ renders no nav tree", () => {
    test.skip(!fs.existsSync(LANDING), "probe not built");
    const html = fs.readFileSync(LANDING, "utf8");
    expect(
      sidebarState(html),
      "a section landing page must not render the left nav: it sits above the " +
        "version trees, so the tree it would show does not exist. This is the " +
        "agentgateway /kubernetes/ and /standalone/ case.",
    ).toBe("suppressed");
    expect(
      html,
      "no nav tree markup at all should reach a landing page",
    ).not.toContain("sidebar-nav-wrapper");
  });

  test("a versioned page still renders the nav", () => {
    // The control. Without it, suppressing EVERY page's nav would pass above.
    const versioned = path.join(TEST_PRODUCT_ROOT, "v2", "everything", "index.html");
    test.skip(!fs.existsSync(versioned), "no versioned page built");
    const html = fs.readFileSync(versioned, "utf8");
    expect(
      sidebarState(html),
      "suppression must be scoped to landing pages — a versioned page keeps " +
        "its nav",
    ).toBe("rendered");
    expect(html).toContain("sidebar-nav-wrapper");
  });

  test("a page INSIDE a section is not treated as a landing page", () => {
    // The section segment appears in these URLs too; only the page whose URL
    // ENDS at the section is a landing page. Any versioned page under a section
    // would lose its nav if the rule dropped the last-segment requirement.
    const inside = path.join(TEST_PRODUCT_ROOT, "v1", "everything", "index.html");
    test.skip(!fs.existsSync(inside), "no such page built");
    expect(sidebarState(fs.readFileSync(inside, "utf8"))).toBe("rendered");
  });
});

test.describe("section-landing detection source contract", () => {
  const SIDEBAR = path.resolve(__dirname, "../layouts/partials/sidebar.html");

  function activeSrc(): string {
    return fs
      .readFileSync(SIDEBAR, "utf8")
      .replace(/\{\{-?\s*\/\*[\s\S]*?\*\/\s*-?\}\}/g, "");
  }

  test("detection goes through utils/section-segment.html, not a literal path", () => {
    test.skip(!fs.existsSync(SIDEBAR), "module-relative path only");
    const src = activeSrc();
    expect(
      /partial "utils\/section-segment\.html"/.test(src),
      "the section test must use utils/section-segment.html — the one place " +
        "that knows where a section segment sits in EITHER URL shape",
    ).toBe(true);
    expect(
      /printf "\/docs\/%s\/" \./.test(src),
      "the literal `/docs/<section>/` comparison is back. It matches only the " +
        "OSS shape, so the docs hub's /<product>/<section>/ and /<section>/ " +
        "landing pages regain a nav for a tree that does not exist.",
    ).toBe(false);
  });

  test("the section must be the LAST url segment", () => {
    test.skip(!fs.existsSync(SIDEBAR), "module-relative path only");
    const src = activeSrc();
    expect(
      /sub \(len \$urlParts\) 1/.test(src),
      "without the last-segment requirement every page under a section counts " +
        "as a landing page and loses its nav",
    ).toBe(true);
  });
});
