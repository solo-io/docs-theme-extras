---
title: Nested
weight: 920
description: >-
  The section that actually NESTS its version trees, so the section-then-version
  URL shape is exercised by real built pages instead of only by source
  assertions.
---

`demo` and `alt` register sections without nesting anything under them: their
version trees live at `/test/<version>/`, so those two pin the FALLBACK — a
section link has to point at the landing page, because `/test/demo/v2/` was
never built.

This section is the other half. Its versions really do live one level deeper, at
`/test/nested/<version>/`, which is the shape the tagged-versions release exists
for:

    /<product>/<section>/<version>/…      docs hub, production
    /<section>/<version>/…                docs hub, hugo server
    /docs/<section>/<version>/…           OSS sites

The fixture's `contentDir` is `fixture/content/en/test` with `baseURL = /test`,
which is the production enterprise shape exactly: the product segment appears in
the URL and NOT in the `site.GetPage` path. So `/test/nested/v2/page/` resolves
through `GetPage "/nested/v2/"` — the same two-coordinate translation the docs
hub does, and the reason this fixture can cover it at all.

Until this section existed, every part of the model was pinned by source
assertions only:

| behavior | failure mode if broken |
| -------- | ---------------------- |
| `version-root.html` prefixing `lookupPath` with the section | `GetPage` resolves nothing and the left nav renders EMPTY, with no error |
| `resolve-sections.html` appending a version | a dead menu entry, or a link that silently drops to the landing page |
| `breadcrumb.html` collapsing a version at depth 3 | the breadcrumb repeats the section instead of showing the version |
| `resolve-section-versions.html` filtering | another section's versions offered here, pointing at pages that do not exist |

The empty left nav is the one to worry about: it is silent, it looks like a
content problem rather than a template one, and it is exactly what
`version-root.html`'s own comment warns about.

Asserted by `tests/section-nested-versions.spec.ts`.

## Version set

`nested` is tagged on `v2` and `v1`, and NOT on `main` (which is `alt`-only), so
this section's version dropdown must offer v2 and v1 and must not offer `main`.

The untagged entries (`v3`, `v4-link`, `v8-link`) apply to every section by
definition, so they appear here too. That is correct and deliberately left
as-is: the navbar resolves each entry against a real page and falls back when
there is none, so an untagged version with no tree under this section does not
put a 404 in the menu. `tests/section-nested-versions.spec.ts` asserts that
fallback rather than pretending the case does not arise.

No `version-cards` on this page, for the same reason: the cards build one href
per resolved version and would emit `/test/nested/v3/`. `version-cards` is
covered on `/test/` by `tests/version-cards.spec.ts`.

## Gating on a section landing page

This page is `/test/nested/` — a section with no version below it, which
`utils/section-segment.html` matches through its condition (b). The fixture is
`siteParams` mode, so the build condition is the product (`test`) and is
non-empty here, and `conditional-text` therefore gates on the section name.

That is NOT true of the same URL shape on an OSS site. In `url` mode
`page-context` only assigns a condition when the path carries both a section and
a version, so `/docs/nested/` resolves `""` and every gate on it is dropped.
Reused content that gates on a section renders here and not there. The
divergence is deliberate — see the comment in
`layouts/_shortcodes/conditional-text.html` — and the other half is pinned by
`tests/section-versionless.spec.ts`.

Naming this landing page's own section — renders:

{{% conditional-text include-if="nested" %}}COND_SEC_LANDING_SECTION{{% /conditional-text %}}

Naming the build condition — renders:

{{% conditional-text include-if="test" %}}COND_SEC_LANDING_PRODUCT{{% /conditional-text %}}

Naming a different section — dropped, since a landing page resolves exactly one:

{{% conditional-text include-if="demo" %}}COND_SEC_LANDING_OTHER{{% /conditional-text %}}
