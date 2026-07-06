---
title: Flat Guide
---

<!--
  Fixture for the NON-VERSIONED sidebar fallback in layouts/partials/sidebar.html.

  This section sits directly under /test/ with no version segment, so the
  sidebar's version detector classifies its pages as non-versioned and takes
  the fallback branch (the one flat, unversioned consumers like agentregistry
  hit). sidebar-flat.spec.ts asserts that from the /flatguide/alpha/ leaf the
  sidebar still lists its sibling /flatguide/beta/ — i.e. the fallback roots
  the tree at the docs section, not at the current page.

  Kept intentionally minimal and OUT of the [[pages]] list in
  .docs-test-oss.toml / .docs-test-enterprise.toml (static.spec.ts treats every
  listed page as a comprehensive "all shortcode markers" topic page).
-->
