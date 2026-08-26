---
# GENERATED FILE — DO NOT EDIT.
#
# Written by scripts/gen-docs.mjs from layouts/_shortcodes/reuse-append.html.
# Edit that instead and re-run `npm run gen:docs`; CI runs
# `npm run gen:docs -- --check` and fails on any diff.
title: reuse-append
description: "Concatenates a shared snippet with the inner content and renders them as one block"
weight: 160
---

Either call form works, and both produce identical HTML.

## Parameters

### Positional

| Name | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `0` | path | yes | — | Path to the base file in the assets tree. |
| `1` | string | no | `the page's version` | Version to resolve against, passed down by a calling shortcode. |

## Example

> [!NOTE]
> There is no live example on this page: this shortcode cannot be rendered safely in isolation. See [Notes](#notes) for why.

## Notes

### What it is for

A snippet that is a Markdown TABLE cannot be extended by calling `reuse` and
then writing more rows after it. `reuse` renders the snippet on its own, so
the table is already closed as HTML by the time the extra rows are parsed,
and they render as a stray paragraph of pipes. Concatenating the two as
SOURCE and rendering once keeps them a single Markdown block. The same
applies to any construct whose continuation depends on the preceding lines:
lists, definition blocks, a fenced block split across the boundary.

### It is NOT a variant of reuse

Despite the name, this does not apply the version- and product-aware
shortcode rewrites that `reuse` does. It is a plain resource lookup plus
concatenation. A base snippet containing a `version` shortcode,
`keepVersion` blocks, or `link-hextra` calls that rely on rebase-injected
params will behave differently here than under `reuse`. Keep base snippets
used with this shortcode free of version-dependent markup, or use `reuse`
and restructure so appending is not needed.

### Asset resolution

Both tree shapes are handled, and both are needed. An OSS site's assets tree
is flat; the docs hub assembles its tree per version at
`assets/<product>/<version>/`. So the versioned path is tried first and the
bare path second, and only if both miss is it an error. A single bare lookup
— what this file did when it was first adopted from
agentgateway-oss-website — resolves on the OSS site and misses on every
assembled hub page.

The version comes from `utils/version-root.html`, the module's canonical
detector, not from a private permalink scan here. The URL carries
`linkVersion` while the assembled asset path is named after `version`, and
on two hub products those differ.

Errors rather than warns on a missing positional parameter or a missing
asset. Both mean the call site names a file that is not there, which
silently renders nothing if allowed to pass.

The example is marked `code-only`: this needs a real asset tree.

---

Source: [`layouts/_shortcodes/reuse-append.html`](https://github.com/solo-io/docs-theme-extras/blob/main/layouts/_shortcodes/reuse-append.html)
