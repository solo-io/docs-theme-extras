---
title: Nested (name collision)
weight: 95
description: >-
  An ordinary content directory that happens to share a name with a registered
  section, sitting BELOW a version. It must not be mistaken for a section.
---

`nested` is a registered section (`[params.sections.nested]`) whose real trees
live at `/test/nested/<version>/`. This directory is at
`/test/v2/nested/` — the same name, but below the version segment, where it is
just content.

`utils/section-segment.html` used to match a registered key **anywhere** in the
path, so this page was read as being in the `nested` section.
`utils/version-root.html` then built `lookupPath = "/nested/v2/"`,
`site.GetPage` resolved a tree that has nothing to do with this page, and the
left nav was wrong or empty — with no error and no warning.

The production instance: `solo-io/docs` imports
`github.com/kgateway-dev/kgateway.dev` for content and therefore inherits its
`sections.envoy` key, while also shipping
`content/en/kgateway/2.3.x/setup/customize/envoy/`. Five real pages rendered with
a completely empty left nav.

A section sits ABOVE version trees, never below one, so detection is now
constrained by position. Asserted by `tests/section-nested-versions.spec.ts`.

## Gating

`collision.md` in this directory covers the same positional rule for
`conditional-text`, but through condition (a): the segment after `nested` is
`collision`, not a version. This page covers the OTHER half, condition (b).
`nested` is the LAST segment here, which is the shape of a section landing page
— and the only thing that stops it being read as one is that a version (`v2`)
precedes it. Drop that half of the rule and this page starts answering to
`include-if="nested"`.

The first gate below must be dropped and the second must render. See
`tests/conditional-section.spec.ts`.

Naming the section — dropped, because a version precedes `nested` here:

{{% conditional-text include-if="nested" %}}COND_SEC_COLLINDEX_SECTION{{% /conditional-text %}}

Naming the build condition — renders, so the assertion above is not vacuous:

{{% conditional-text include-if="test" %}}COND_SEC_COLLINDEX_PRODUCT{{% /conditional-text %}}
