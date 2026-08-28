---
# GENERATED FILE — DO NOT EDIT.
#
# Written by scripts/gen-docs.mjs from layouts/_shortcodes/reuse-image-light.html.
# Edit that instead and re-run `npm run gen:docs`; CI runs
# `npm run gen:docs -- --check` and fails on any diff.
title: reuse-image-light
description: "Renders an image in light mode only, hidden entirely in dark mode"
weight: 190
---

Either call form works, and both produce identical HTML.

## Parameters

| Name | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `src` | path | yes | — | Path to the light-mode image under assets/. |
| `alt` | string | no | — | Alt text. |
| `caption` | string | no | — | Caption rendered below the image. |
| `width` | string | no | — | CSS width for the figure. |

## Example

> [!NOTE]
> There is no live example on this page: this shortcode cannot be rendered safely in isolation. See [Notes](#notes) for why.

## Notes

Wraps a single image in `.toggle-dark`, which CSS shows in light mode and
hides in dark mode.

Reach for this only when the asset must NOT appear in dark mode: a
screenshot whose dark counterpart is not ready and whose white card would
look wrong, or a diagram with reference-specific colours. For the common
"show this in both modes" case use `reuse-image`; for dark-only use
`reuse-image-dark`.

The symmetric counterpart is `reuse-image-dark`. Both preserve their source
form in a `translation` build via a placeholder — without it the snapshot
would bake a resolved absolute `.RelPermalink` into the translated page.

The example is marked `code-only`: this needs a real asset tree.

---

Source: [`layouts/_shortcodes/reuse-image-light.html`](https://github.com/solo-io/docs-theme-extras/blob/main/layouts/_shortcodes/reuse-image-light.html)
