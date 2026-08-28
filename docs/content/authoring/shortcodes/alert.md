---
# GENERATED FILE — DO NOT EDIT.
#
# Written by scripts/gen-docs.mjs from layouts/_shortcodes/alert.html.
# Edit that instead and re-run `npm run gen:docs`; CI runs
# `npm run gen:docs -- --check` and fails on any diff.
title: alert
description: "Alias for callout, accepting the legacy context parameter name"
weight: 10
---

Either call form works, and both produce identical HTML.

## Parameters

| Name | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `context` | string | no | — | Admonition type. Mapped onto callout's type. |
| `type` | string | no | — | Admonition type, accepted directly. |
| `text` | string | no | — | Body text, for a self-closing call. Use the inner content instead in block form. |

## Example

```markdown
{{</* alert context="warning" */>}}
Rotating the signing key invalidates every existing session.
{{</* /alert */>}}
```

{{< details title="Rendered output" >}}

{{< alert context="warning" >}}
Rotating the signing key invalidates every existing session.
{{< /alert >}}

{{< /details >}}

## Notes

Prefer `callout` in new content. This name exists so existing call sites
keep working.

There is a single implementation, in `callout.html`. This file calls that
shortcode rather than sharing a partial with it, which means `alert`
inherits callout's behavior wholesale — including the translation-snapshot
output, where an alert reduces to a callout shortcode and so matches the JA
convention, and including the list-safety handling.

The only mapping is `context` onto callout's `type`. The body comes from
either a self-closing `text="..."` attribute or the inner content, and is
handed to callout as its inner content.

The call is always emitted in block form — open, body, close — rather than
as a self-closing `text=""` attribute, so a body containing quotes or
Markdown cannot break the attribute.

Two legacy parameters are deliberately NOT read: `icon`, because callout
derives the icon from the type and no content passes one, and `role`.

---

Source: [`layouts/_shortcodes/alert.html`](https://github.com/solo-io/docs-theme-extras/blob/main/layouts/_shortcodes/alert.html)
