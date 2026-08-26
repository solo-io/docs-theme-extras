---
# GENERATED FILE — DO NOT EDIT.
#
# Written by scripts/gen-docs.mjs from layouts/_shortcodes/gloss.html.
# Edit that instead and re-run `npm run gen:docs`; CI runs
# `npm run gen:docs -- --check` and fails on any diff.
title: gloss
description: "Renders an inline glossary term with a tooltip carrying its definition"
weight: 70
---

Either call form works, and both produce identical HTML.

## Parameters

### Positional

| Name | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `0` | string | yes | — | The glossary key to look up, for example MCP. |

## Example

```markdown
{{</* gloss "MCP" */>}}custom display text{{</* /gloss */>}}
```

{{< details title="Rendered output" >}}

{{< gloss "MCP" >}}custom display text{{< /gloss >}}

{{< /details >}}

## Notes

Looks the key up in the consumer's `data/glossary.yaml`. The tooltip shows
the definition and an optional "Learn more" link.

The inner content is optional. When present it becomes the display text,
overriding the key itself — useful when the prose needs "the Model Context
Protocol" but the glossary key is `MCP`.

Tooltip positioning and behavior come from this module's `glossary.js`,
which uses `position: fixed` so a tooltip escapes an `overflow: auto`
ancestor such as `.table-wrapper`. Styling lives in `glossary.css`. Both are
loaded by `themeExtras/head-end.html`, so a consumer that wires the module
bootstrap gets them with no extra configuration.

---

Source: [`layouts/_shortcodes/gloss.html`](https://github.com/solo-io/docs-theme-extras/blob/main/layouts/_shortcodes/gloss.html)
