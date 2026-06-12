import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { TEST_PRODUCT_ROOT, readFixture } from "./helpers/fixture";

// The left-nav label (and a collapsible branch's toggle aria-label) is sourced
// from Hugo's `.LinkTitle`, not `.Title`. `.LinkTitle` returns the page's
// `linkTitle` front-matter when set and otherwise falls back to `.Title`, so a
// page that sets `linkTitle` gets a short nav label while pages that don't are
// unchanged. This guards both edited lines in render-sidebar-tree (the
// <span> label and the toggle aria-label) and the .Title fallback.
//
// The nav-group fixture sets linkTitle != title on both the child-bearing
// section (_index: title "Nav group" / linkTitle "Nav grp") and its leaf
// (child: title "Nav group child" / linkTitle "NG child"). The sidebar renders
// the whole v2 tree on any v2 page, so the collapsed branch's links are in the
// DOM even when hidden — this reads the static HTML, no browser needed.

const V2_INDEX = path.join(TEST_PRODUCT_ROOT, "v2/everything/index.html");

// Pull the rendered sidebar tree out of the page so the assertions can't be
// fooled by the same string appearing in the article body or breadcrumb.
function sidebarHtml(): string {
  const html = readFixture(V2_INDEX);
  const m = html.match(/<aside[^>]*\bsidebar-container\b[\s\S]*?<\/aside>/);
  expect(m, "no .sidebar-container <aside> in the built v2 page").not.toBeNull();
  return m![0];
}

// The visible text of the <a class="sidebar-link"> whose href ends with the
// given path (tags stripped, whitespace collapsed). null if no such link.
function navLabelFor(sidebar: string, hrefSuffix: string): string | null {
  const re = new RegExp(
    `<a[^>]*\\bhref="([^"]*${hrefSuffix.replace(/[/]/g, "\\/")})"[^>]*\\bclass="[^"]*\\bsidebar-link\\b[^"]*"[^>]*>([\\s\\S]*?)<\\/a>`,
  );
  const m = sidebar.match(re);
  if (!m) return null;
  return m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

test.describe("sidebar uses linkTitle for nav labels", () => {
  // The linkTitle != title nav-group fixtures only ship in the bundled
  // fixture. Against a real consumer build they don't exist, so this spec
  // is a no-op there (same pattern as auto-cards.spec.ts: guard on the
  // expected built file rather than a CONFIG check toggle).
  test.skip(
    !fs.existsSync(V2_INDEX) ||
      !fs.existsSync(path.join(TEST_PRODUCT_ROOT, "v2/nav-group/child/index.html")),
    "nav-group linkTitle fixtures not present in this build",
  );

  test("a leaf page's nav label is its linkTitle, not its title", () => {
    const sidebar = sidebarHtml();
    const label = navLabelFor(sidebar, "/nav-group/child/");
    expect(label, "no sidebar link for /nav-group/child/").not.toBeNull();
    expect(
      label,
      "leaf nav label is the title, not the linkTitle — render-sidebar-tree " +
        "is reading .Title instead of .LinkTitle for the <span> label",
    ).toBe("NG child");
    expect(
      sidebar.includes("Nav group child"),
      "the leaf's full title leaked into the sidebar; linkTitle should win",
    ).toBe(false);
  });

  test("a section's nav label and toggle aria-label are its linkTitle", () => {
    const sidebar = sidebarHtml();
    expect(
      navLabelFor(sidebar, "/nav-group/"),
      "section nav label is not the linkTitle",
    ).toBe("Nav grp");
    // The collapsible branch's chevron <button> labels itself off the same
    // expression; it must track linkTitle too.
    expect(
      sidebar.includes('aria-label="Toggle Nav grp subsection"'),
      "the toggle aria-label is not built from linkTitle (expected " +
        '"Toggle Nav grp subsection")',
    ).toBe(true);
    expect(
      sidebar.includes('aria-label="Toggle Nav group subsection"'),
      "the toggle aria-label still uses .Title; it should use .LinkTitle",
    ).toBe(false);
  });

  test("a page without linkTitle falls back to its title", () => {
    const sidebar = sidebarHtml();
    // `everything` sets no linkTitle, so .LinkTitle returns .Title unchanged.
    expect(
      navLabelFor(sidebar, "/v2/everything/"),
      "a page with no linkTitle did not fall back to .Title — the " +
        "`.LinkTitle | default .File.LogicalName` fallback chain is broken",
    ).toBe("Everything");
  });
});
