---
# GENERATED FILE — DO NOT EDIT.
#
# Written by scripts/gen-docs.mjs from layouts/_shortcodes/prism.html.
# Edit that instead and re-run `npm run gen:docs`; CI runs
# `npm run gen:docs -- --check` and fails on any diff.
title: prism
description: "Deprecated compatibility stub for the lotus prism shortcode; use a fenced code block"
weight: 290
---

Either call form works, and both produce identical HTML.

## Parameters

### Named

| Name | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `lang` | string | no | — | Language for syntax highlighting. |
| `line` | string | no | — | Lines to highlight. |

### Positional

| Name | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `0` | string | no | — | Positional alias for lang. |

## Example

> [!NOTE]
> There is no live example on this page: this shortcode cannot be rendered safely in isolation. See [Notes](#notes) for why.

## Notes

**Deprecated. Do not use in new content, and remove it from old content.**
This is a docs-theme-lotus compatibility stub that maps onto Hugo's built-in
Chroma highlighting. It will be deleted once no consumer references it;
solo-io/docs has already migrated every usage.

Use a fenced code block instead, which does the same thing:

    ```yaml {hl_lines=[2,3]}
    ...
    ```

Beyond being redundant it is actively worse: `prism` emits already-rendered
`<pre>` HTML, so a `prism` block inside a reused list item breaks list
continuation — the fragmented-code-block failure that a native fenced block
does not have.

The example is marked `code-only` so this page does not read as an
invitation to copy the call.

---

Source: [`layouts/_shortcodes/prism.html`](https://github.com/solo-io/docs-theme-extras/blob/main/layouts/_shortcodes/prism.html)
