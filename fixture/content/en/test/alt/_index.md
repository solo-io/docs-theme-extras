---
title: Alt
weight: 910
description: >-
  The second registered section, so the navbar section selector has more than one
  entry and is therefore rendered at all.
---

`alt` is the fixture's second registered section. It exists so the product-name
section selector in the navbar has two entries: with only one section there is
nothing to select between, so the selector is suppressed and the version dropdown
keeps its product-name prefix.

Its version set OVERLAPS but does not match the other sections', which is what
the version remap in `utils/resolve-sections.html` exists for — a link to another
section cannot reuse the current version verbatim, because that version may not
exist there:

| section  | versions | nests its trees? |
| -------- | -------- | ---------------- |
| `demo`   | v2, v1, v3, v4-link, v8-link | no |
| `alt`    | v2, main, v3, v4-link, v8-link | no |
| `nested` | v2, v1, v3, v4-link, v8-link | **yes** |

`v1` exists only in `demo`/`nested` and `main` only in `alt`, so each is a probe
for one direction of the remap, with `v2` as the control.

**The remap is only OBSERVABLE from a section that nests its trees**, which
`demo` and `alt` deliberately do not. Their links resolve to a landing page
(`/test/alt/`) whatever the current version is, so from `/test/v1/` the "must not
be `/test/alt/v1/`" assertion holds trivially and proves nothing about the remap.
This page previously claimed otherwise.

The real probe is the `nested` section: from `/test/nested/v1/page/` the `alt`
link has to remap, because `alt` has no `v1`. That is asserted in
`tests/section-nested-versions.spec.ts`; what `tests/section-selector.spec.ts`
covers here is this section's presence, label, and landing-page fallback.

The production case is agentgateway, whose kubernetes section ships `2.3.x` and
`2026.7.1` while standalone ships only `latest`.
