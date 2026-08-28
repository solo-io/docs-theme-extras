---
# GENERATED FILE — DO NOT EDIT.
#
# Written by scripts/gen-docs.mjs from layouts/_shortcodes/readfile.html.
# Edit that instead and re-run `npm run gen:docs`; CI runs
# `npm run gen:docs -- --check` and fails on any diff.
title: readfile
description: "Inlines a file from the filesystem into the page"
weight: 250
---

Either call form works, and both produce identical HTML.

## Parameters

| Name | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `file` | path | yes | — | Path to the file to read, relative to the project root. |
| `markdown` | bool | no | `false` | Pass markdown="true" to render the file as Markdown instead of raw HTML. |
| `type` | string | no | — | Set to SECURITY_SCAN to make the include skippable. See Notes. |

## Example

> [!NOTE]
> There is no live example on this page: this shortcode cannot be rendered safely in isolation. See [Notes](#notes) for why.

## Notes

With `markdown="true"` the file goes through `markdownify`; otherwise it is
emitted with `safeHTML`. Either way the content is trusted and unescaped, so
do not point this at anything a reader can write to.

`type="SECURITY_SCAN"` is a build-time opt-out, not a content type. When the
consumer sets `params.noSecurityScan`, a call carrying that type emits a
short "skip reading security scan" placeholder instead of the file. That
lets a repo build its docs without the generated scan reports present, which
is otherwise a hard `readFile` failure. Any other `type` value is ignored.

The example is marked `code-only` because the shortcode needs a real file at
a real path, which the docs site does not have.

---

Source: [`layouts/_shortcodes/readfile.html`](https://github.com/solo-io/docs-theme-extras/blob/main/layouts/_shortcodes/readfile.html)
