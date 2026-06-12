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

// The full inner HTML of the <a class="sidebar-link"> whose href ends with the
// given path (tags intact). null if no such link. Used by both the label
// assertions (which strip tags) and the icon/badge assertions (which inspect
// the markup the label-stripping would otherwise hide).
function navLinkHtmlFor(sidebar: string, hrefSuffix: string): string | null {
  const re = new RegExp(
    `<a[^>]*\\bhref="([^"]*${hrefSuffix.replace(/[/]/g, "\\/")})"[^>]*\\bclass="[^"]*\\bsidebar-link\\b[^"]*"[^>]*>([\\s\\S]*?)<\\/a>`,
  );
  const m = sidebar.match(re);
  return m ? m[2] : null;
}

// The nav label text of the <a class="sidebar-link"> whose href ends with the
// given path. The label is the page title only — the leading icon <i> (whose
// text node is the glyph name, e.g. "rocket_launch") and the trailing
// enterprise/oss badge <span>s are adornments that would otherwise pollute a
// naive tag-strip, so they're removed first. null if no such link.
function navLabelFor(sidebar: string, hrefSuffix: string): string | null {
  const inner = navLinkHtmlFor(sidebar, hrefSuffix);
  if (inner === null) return null;
  return inner
    .replace(/<i\b[^>]*>[\s\S]*?<\/i>/g, " ")
    .replace(/<span[^>]*\bsidebar-badge\b[^>]*>[\s\S]*?<\/span>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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

// render-sidebar-tree also emits two per-page adornments off front matter:
// a Material Symbols icon (`.Params.icon`) and the Enterprise / Open Source
// nav badges (`.Params.enterprise`, `.Params.oss`). These render in the left
// nav only — distinct from the page-header badges static.spec.ts checks next
// to the H1. The sidebar lost this markup in a refactor and nothing caught it
// (the H1 badges kept working), so these guard the sidebar copy specifically.
//
// Fixtures: `everything` sets enterprise+oss (and alpha/beta/experimental, which
// are header-only and must NOT reach the sidebar); `nav-group/child` sets
// `icon: rocket_launch` and no badge flags. Each is the other's negative case.
test.describe("sidebar renders per-page icon and enterprise/oss badges", () => {
  test.skip(
    !fs.existsSync(V2_INDEX) ||
      !fs.existsSync(path.join(TEST_PRODUCT_ROOT, "v2/nav-group/child/index.html")),
    "icon/badge fixtures not present in this build",
  );

  test("a page with `enterprise: true` gets the Enterprise nav badge", () => {
    const inner = navLinkHtmlFor(sidebarHtml(), "/v2/everything/");
    expect(inner, "no sidebar link for /v2/everything/").not.toBeNull();
    expect(
      /<span[^>]*\bsidebar-badge-enterprise\b[^>]*>\s*Enterprise\s*<\/span>/.test(inner!),
      "the Enterprise sidebar badge is missing — render-sidebar-tree dropped " +
        "the `.Params.enterprise` badge span",
    ).toBe(true);
  });

  test("a page with `oss: true` gets the Open Source nav badge", () => {
    const inner = navLinkHtmlFor(sidebarHtml(), "/v2/everything/");
    expect(
      /<span[^>]*\bsidebar-badge-oss\b[^>]*>\s*Open Source\s*<\/span>/.test(inner!),
      "the Open Source sidebar badge is missing — render-sidebar-tree dropped " +
        "the `.Params.oss` badge span",
    ).toBe(true);
  });

  test("header-only badges (alpha/beta/experimental) do NOT leak into the nav", () => {
    // `everything` sets all five flags, but only enterprise/oss are sidebar
    // badges; the rest belong to the page header. A broad badge dump in the
    // sidebar would wrongly surface them.
    const inner = navLinkHtmlFor(sidebarHtml(), "/v2/everything/")!;
    for (const word of ["Alpha", "Beta", "Experimental"]) {
      expect(
        inner.includes(word),
        `"${word}" leaked into the sidebar nav label; only Enterprise/Open ` +
          "Source are sidebar badges",
      ).toBe(false);
    }
  });

  test("a page with `icon` gets a Material Symbols sidebar icon", () => {
    const inner = navLinkHtmlFor(sidebarHtml(), "/v2/nav-group/child/");
    expect(inner, "no sidebar link for /v2/nav-group/child/").not.toBeNull();
    expect(
      /<i[^>]*\bmaterial-icons\b[^>]*\bsidebar-icon\b[^>]*>\s*rocket_launch\s*<\/i>/.test(inner!),
      "the sidebar icon is missing — render-sidebar-tree dropped the " +
        "`.Params.icon` <i class=\"material-icons sidebar-icon\"> element",
    ).toBe(true);
  });

  test("a page with no icon/badge flags renders a bare nav link", () => {
    // `nav-group/child` has an icon but no badges; `everything` has badges but
    // no icon. Cross-check the negatives so a future change can't accidentally
    // emit a badge with no flag set (or an icon with no `icon`).
    const sidebar = sidebarHtml();
    const child = navLinkHtmlFor(sidebar, "/v2/nav-group/child/")!;
    expect(
      /sidebar-badge/.test(child),
      "a badge rendered on a page with no enterprise/oss flag",
    ).toBe(false);
    const everything = navLinkHtmlFor(sidebar, "/v2/everything/")!;
    expect(
      /sidebar-icon/.test(everything),
      "a sidebar icon rendered on a page with no `icon` front matter",
    ).toBe(false);
  });
});
