---
# GENERATED FILE — DO NOT EDIT.
#
# Written by scripts/gen-docs.mjs from layouts/_shortcodes/reuse-image.html.
# Edit that instead and re-run `npm run gen:docs`; CI runs
# `npm run gen:docs -- --check` and fails on any diff.
title: reuse-image
description: "Renders a shared image, optionally with a separate dark-mode variant"
weight: 170
---

Either call form works, and both produce identical HTML.

## Parameters

| Name | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `src` | path | yes | — | Path to the image under assets/. |
| `srcDark` | path | no | — | Dark-mode variant. Supplying it switches to the paired rendering mode. |
| `alt` | string | no | — | Alt text. |
| `caption` | string | no | — | Caption rendered below the image. |
| `width` | string | no | — | CSS width for the figure. |

## Example

> [!NOTE]
> There is no live example on this page: this shortcode cannot be rendered safely in isolation. See [Notes](#notes) for why.

## Notes

Each src resolves through `utils/resolve-versioned-image.html`, which
prefers a version-specific override at `assets/<dir>/<version>/<file>`, then
the bare shared path, then the legacy per-product tree.

### Two rendering modes

**Paired**, when `srcDark` is given and resolves: the light variant is
emitted inside `.toggle-dark` and the dark variant inside `.toggle-light`,
which CSS shows and hides by mode.

**Single**, when only `src` is given: ONE figure with no toggle wrapper, so
it shows in both modes. That is the least-surprising default for a lone
image with no dark counterpart — a diagram or a screenshot that reads fine
either way stays visible in dark mode instead of silently disappearing.

For an asset that must be hidden in the other mode, use the dedicated
`reuse-image-light` or `reuse-image-dark`. Prefer passing `srcDark` on THIS
call over the legacy pattern of a lone `reuse-image` followed by a sibling
`reuse-image-dark` for the same figure, which stacks both images.

In a `translation` build the call is replaced by a placeholder that restores
to the source `reuse-image` form after `HTMLToMarkdown`, so the snapshot
keeps the shortcode instead of a resolved img.

The example is marked `code-only`: this needs a real asset tree.

---

Source: [`layouts/_shortcodes/reuse-image.html`](https://github.com/solo-io/docs-theme-extras/blob/main/layouts/_shortcodes/reuse-image.html)
