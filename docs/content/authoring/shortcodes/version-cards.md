---
# GENERATED FILE — DO NOT EDIT.
#
# Written by scripts/gen-docs.mjs from layouts/_shortcodes/version-cards.html.
# Edit that instead and re-run `npm run gen:docs`; CI runs
# `npm run gen:docs -- --check` and fails on any diff.
title: version-cards
description: "Renders a card grid mirroring the navbar version dropdown"
weight: 200
---

Either call form works, and both produce identical HTML.

## Parameters

| Name | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `section` | string | no | `last URL segment` | Key under params.sections whose versions to list. |
| `desc` | string | no | — | Description rendered under each card title. Supports Markdown. |

## Example

> [!NOTE]
> There is no live example on this page: this shortcode cannot be rendered safely in isolation. See [Notes](#notes) for why.

## Notes

Designed for a section landing page. Each card links to
`<currentPagePath>/<linkVersion>/`.

`section` defaults to the last segment of the current page's URL, so on
`/docs/kubernetes/` the section is `kubernetes`.

Versions resolve through `utils/resolve-section-versions.html`, the single
place that knows which entries in `params.versions` apply to a section: each
entry names its sections, and an untagged entry applies to all. This file
used to read `params.sections.<section>.versions` itself with a fallback to
the top-level list, which meant the priority rule lived here AND in the
sidebar AND in the navbar AND in version-root.html — and they drifted.

Each version entry needs `dropdown` for the label and `linkVersion` for the
URL slug. An entry whose `dropdown` is empty or whitespace is skipped,
matching the navbar's visibility rule.

Sets `hasManualCards` on the page store so the auto-section-cards partial in
`docs/list.html` does not also emit child-section cards underneath.

The example is marked `code-only`: this site registers no sections or
versions, so a live render would produce an empty grid.

---

Source: [`layouts/_shortcodes/version-cards.html`](https://github.com/solo-io/docs-theme-extras/blob/main/layouts/_shortcodes/version-cards.html)
