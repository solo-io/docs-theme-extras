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

Its version set OVERLAPS but does not match `demo`'s, which is what exercises the
version remap in `utils/resolve-sections.html` — a link to another section cannot
reuse the current version verbatim, because that version may not exist there:

| section | versions |
| ------- | -------- |
| `demo`  | v2, v1, v3, v4-link, v8-link |
| `alt`   | v2, main, v3, v4-link, v8-link |

So `v1` exists only in `demo` and `main` only in `alt`, and each is the probe for
one direction of the remap. From a `/test/v1/` page the `alt` link must NOT point
at `/test/alt/v1/` (no such page); from a `/test/main/` page the `demo` link must
not point at `/test/demo/main/`. `v2` is in both, so it is the control: from a
`/test/v2/` page neither link is remapped.

The production case is agentgateway, whose kubernetes section ships `2.3.x` and
`2026.7.1` while standalone ships only `latest`.

Asserted by `tests/section-selector.spec.ts`.
