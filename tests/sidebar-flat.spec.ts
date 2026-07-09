import { test, expect } from "@playwright/test";
import path from "node:path";
import { TEST_PRODUCT_ROOT, readFixture } from "./helpers/fixture";
import { target } from "./helpers/target";

// Regression guard for the NON-VERSIONED sidebar fallback in
// layouts/partials/sidebar.html. On a flat, unversioned OSS site
// (/…/<section>/<page>/ with no version segment — e.g. agentregistry), the
// fallback must root render-sidebar-tree at the docs root (via
// `cond (eq site.Home.Type "docs") site.Home $context.FirstSection`), NOT at
// $context. Rooting at $context collapses the nav to the current page's own
// (often empty) children, hiding every sibling section — the bug this fixes.
//
// The fixture's /test/flatguide/ section (a plain _index + two topics, no
// version segment) exercises exactly that branch. From the leaf
// /test/flatguide/alpha/, the sidebar must still list its sibling
// /test/flatguide/beta/.
//
// Fixture-only: these pages exist solely in the extras build and are
// intentionally NOT in the [[pages]] list (static.spec.ts would treat them as
// comprehensive topic pages). Resolve by direct path and gate on the fixture
// target — the same pattern version-nested-list / conditional-block use.
// Server-rendered markup, so this reads the built HTML statically (no browser).

const IS_FIXTURE_TARGET = target.name.startsWith("docs-theme-extras-fixture");

// Strip the copy-as-markdown <script> (raw markdown source) so hrefs embedded
// there can't be mistaken for rendered sidebar links.
function visibleHtml(filePath: string): string {
  return readFixture(filePath).replace(
    /<script[^>]*type=["']text\/markdown["'][^>]*>[\s\S]*?<\/script>/gi,
    "",
  );
}

// Isolate the sidebar <aside> so body / TOC / breadcrumb links can't satisfy
// the sibling assertion.
function sidebarHtml(filePath: string): string {
  const html = visibleHtml(filePath);
  const m = html.match(/<aside class="sidebar-container[\s\S]*?<\/aside>/);
  return m ? m[0] : "";
}

test.describe("non-versioned sidebar fallback roots at the docs section", () => {
  test.skip(
    !IS_FIXTURE_TARGET,
    "fixture-only: /flatguide/ exists only in the extras fixture build",
  );

  const alphaFile = path.join(TEST_PRODUCT_ROOT, "flatguide/alpha", "index.html");

  test("flat leaf page renders the fallback sidebar aside", () => {
    const sidebar = sidebarHtml(alphaFile);
    expect(
      sidebar,
      "no .sidebar-container aside rendered on the flat, non-versioned page",
    ).not.toBe("");
  });

  test("sidebar lists the sibling topic (section-rooting, not current-page rooting)", () => {
    const sidebar = sidebarHtml(alphaFile);
    // The sibling /flatguide/beta/ appears only if the tree rooted at the
    // docs section / home. If the fallback regressed to rooting at $context
    // (the alpha leaf, which has no children), beta would be absent.
    expect(
      sidebar,
      "sibling '/flatguide/beta/' missing from the sidebar — the fallback rooted at the current page instead of the docs section",
    ).toContain("/flatguide/beta/");
  });

  // Guard for the navbar version dropdown on versionless pages
  // (layouts/_partials/navbar.html). The flatguide segment ("flatguide") is
  // not a known version, so a version swap could only build links to
  // /test/<version>/<segment>/ pages that don't exist. The navbar must
  // suppress the dropdown here — matching the sidebar, which shows no version
  // switcher on this page — instead of emitting those broken links (the bug
  // the docs framework-test link checker flagged for /test/{v1,v2,main}/alpha).
  test("navbar hides the version dropdown on the versionless page", () => {
    const html = visibleHtml(alphaFile);
    expect(
      html,
      "navbar version dropdown rendered on a versionless page — it would emit broken /test/<version>/<page>/ swap links",
    ).not.toContain('class="version-dropdown"');
    expect(
      html,
      "broken version-swap link to a page that only exists under /flatguide/",
    ).not.toMatch(/href="\/test\/(v1|v2|main)\/alpha\//);
  });
});
