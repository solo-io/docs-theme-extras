---
# GENERATED FILE — DO NOT EDIT.
#
# Written by scripts/gen-docs.mjs from layouts/_shortcodes/render.html.
# Edit that instead and re-run `npm run gen:docs`; CI runs
# `npm run gen:docs -- --check` and fails on any diff.
title: render
description: "Embeds the interactive changelog browser on a page"
weight: 80
---

Either call form works, and both produce identical HTML.

## Parameters

| Name | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `path` | path | yes | — | Path to the changelog data, appended to params.productPath. |
| `enterprise` | bool | no | `false` | Pass enterprise="true" to add the "Show Open Source Notes" checkbox. |

## Example

> [!NOTE]
> There is no live example on this page: this shortcode cannot be rendered safely in isolation. See [Notes](#notes) for why.

## Notes

Emits a type selector (by release, chronological, or compare versions), an
empty container, and the scripts that populate it. The rendering happens
entirely client-side.

`enterprise="true"` adds a checkbox that toggles OSS notes inside an
enterprise changelog. It is absent by default, so an OSS changelog gets the
selector alone.

This shortcode is only usable in a consumer that ships the changelog
JavaScript at `<productPath>/changelog/`: `Renderers.js`,
`changelog_utils.js` and `render_changelog.js`. Those files are NOT part of
this module. It also pulls showdown and jQuery from public CDNs at page
load, so it is the one shortcode here that depends on third-party hosts at
runtime rather than at build time.

The example is marked `code-only` for that reason: with none of those assets
present, a live render would produce an empty box and three failed requests.

---

Source: [`layouts/_shortcodes/render.html`](https://github.com/solo-io/docs-theme-extras/blob/main/layouts/_shortcodes/render.html)
