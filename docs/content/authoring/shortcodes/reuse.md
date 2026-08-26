---
# GENERATED FILE — DO NOT EDIT.
#
# Written by scripts/gen-docs.mjs from layouts/_shortcodes/reuse.html.
# Edit that instead and re-run `npm run gen:docs`; CI runs
# `npm run gen:docs -- --check` and fails on any diff.
title: reuse
description: "Inlines a shared Markdown file from assets, resolving a version-specific copy first"
weight: 150
---

Either call form works, and both produce identical HTML.

## Parameters

### Positional

| Name | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `0` | path | yes | — | Path to a file under assets/, relative to that directory. |
| `1` | string | no | `the page's version` | Version to resolve against, passed down by a calling shortcode. |
| `2` | string | no | `site currentProduct` | Product to resolve against, passed down by a calling shortcode. |

## Example

> [!NOTE]
> There is no live example on this page: this shortcode cannot be rendered safely in isolation. See [Notes](#notes) for why.

## Notes

The reuse mechanism for shared prose. One source file, included wherever it
is needed, so a correction lands everywhere at once.

### Path resolution

For an assembled product the versioned path `<product>/<version>/<asset>` is
tried first, falling back to the bare path. That fallback is what lets a
product with versions but no per-version asset tree, such as gloo-mesh, use
the same call. In a repo with neither `currentProduct` nor
`params.versions`, the path is used exactly as given.

When no version is passed in, it is derived by walking the page's URL
segments and matching each against `params.versions`.

### The second and third parameters

Both exist for the `rebase` pipeline rather than for authors. Rebase injects
the resolved version and product so a page rendered from another version's
tree resolves its includes against THAT version, not the page it landed on.
Writing them by hand in content is almost always a mistake.

The example is marked `code-only`: this shortcode cannot render without a
real asset tree and a version context.

---

Source: [`layouts/_shortcodes/reuse.html`](https://github.com/solo-io/docs-theme-extras/blob/main/layouts/_shortcodes/reuse.html)
