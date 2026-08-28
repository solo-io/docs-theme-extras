---
# GENERATED FILE — DO NOT EDIT.
#
# Written by scripts/gen-docs.mjs from layouts/_shortcodes/details.html.
# Edit that instead and re-run `npm run gen:docs`; CI runs
# `npm run gen:docs -- --check` and fails on any diff.
title: details
description: "Renders a collapsible details and summary block, closed by default"
weight: 60
---

Either call form works, and both produce identical HTML.

> [!NOTE]
> This shortcode shadows Hextra's `details`, so its behavior differs from the upstream one of the same name. See the [Hextra shortcodes guide](https://imfing.github.io/hextra/docs/guide/shortcodes/) for the baseline.

## Parameters

| Name | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `title` | string | yes | — | The clickable summary heading. Supports Markdown. |
| `open` | bool | no | `false` | Pass open="true" to render the block expanded on page load. |

## Example

```markdown
{{</* details title="Show the full output" */>}}
The body appears only after the reader clicks the summary.
{{</* /details */>}}
```

{{< details title="Rendered output" >}}

{{< details title="Show the full output" >}}
The body appears only after the reader clicks the summary.
{{< /details >}}

{{< /details >}}

## Notes

The default state is **closed**, which deliberately inverts Hextra's
default-open behavior. Collapsed-by-default is the conservative choice for
docs: a details block means "click to reveal extra info", not "always
visible".

Hextra's upstream takes the inverted `closed="true"` to close. This
shortcode does not read that param. Existing consumer content uses
`open="true"` to open, and a stray `closed="true"` becomes a no-op that
still renders correctly, since closed is already the default.

---

Source: [`layouts/_shortcodes/details.html`](https://github.com/solo-io/docs-theme-extras/blob/main/layouts/_shortcodes/details.html)
