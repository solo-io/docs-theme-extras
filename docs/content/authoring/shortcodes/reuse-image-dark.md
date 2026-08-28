---
# GENERATED FILE — DO NOT EDIT.
#
# Written by scripts/gen-docs.mjs from layouts/_shortcodes/reuse-image-dark.html.
# Edit that instead and re-run `npm run gen:docs`; CI runs
# `npm run gen:docs -- --check` and fails on any diff.
title: reuse-image-dark
description: "Renders an image in dark mode only, hidden entirely in light mode"
weight: 180
---

Either call form works, and both produce identical HTML.

## Parameters

| Name | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `srcDark` | path | yes | — | Path to the dark-mode image under assets/. |
| `alt` | string | no | — | Alt text. |
| `caption` | string | no | — | Caption rendered below the image. |
| `width` | string | no | — | CSS width for the figure. |

## Example

> [!NOTE]
> There is no live example on this page: this shortcode cannot be rendered safely in isolation. See [Notes](#notes) for why.

## Notes

The mirror of `reuse-image-light`: wraps a single image in `.toggle-light`,
which CSS shows in dark mode and hides in light mode. Note the parameter is
`srcDark`, not `src`, matching the name it takes on a paired `reuse-image`
call.

Prefer passing `srcDark` to `reuse-image` over pairing a lone `reuse-image`
with a sibling `reuse-image-dark` for the same figure. The legacy pattern
stacks both images, because a lone `reuse-image` renders in both modes.

The example is marked `code-only`: this needs a real asset tree.

---

Source: [`layouts/_shortcodes/reuse-image-dark.html`](https://github.com/solo-io/docs-theme-extras/blob/main/layouts/_shortcodes/reuse-image-dark.html)
