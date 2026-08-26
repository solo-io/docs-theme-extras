---
# GENERATED FILE — DO NOT EDIT.
#
# Written by scripts/gen-docs.mjs from layouts/_shortcodes/callout.html.
# Edit that instead and re-run `npm run gen:docs`; CI runs
# `npm run gen:docs -- --check` and fails on any diff.
title: callout
description: "Renders an admonition box whose icon is derived from its type"
weight: 20
---

Either call form works, and both produce identical HTML.

> [!NOTE]
> This shortcode shadows Hextra's `callout`, so its behavior differs from the upstream one of the same name. See the [Hextra shortcodes guide](https://imfing.github.io/hextra/docs/guide/shortcodes/) for the baseline.

## Parameters

| Name | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `type` | string | no | — | Admonition type. Drives the icon and colour. |
| `context` | string | no | — | Alias for type, accepted for compatibility with the alert shortcode. |
| `text` | string | no | — | Body text, for a self-closing call. Use the inner content instead in block form. |
| `icon` | string | no | — | Read only in translation-export builds; the icon is otherwise derived from type. |

## Example

```markdown
{{</* callout type="warning" */>}}
Rotating the signing key invalidates every existing session.
{{</* /callout */>}}
```

{{< details title="Rendered output" >}}

{{< callout type="warning" >}}
Rotating the signing key invalidates every existing session.
{{< /callout >}}

{{< /details >}}

## Notes

Uses the Material Icons font and derives the icon from `type`, where
Hextra's stock callout instead does an SVG lookup via its own `icon`
parameter.

This is the single implementation behind both `callout` and `alert`. A
consumer's alert shortcode can call this one — solo-io/docs maps alert's
`context` onto `type` and renders through `RenderString` — so the two stay
identical rather than drifting.

The body comes from either the inner content in block form or a
self-closing `text="..."` attribute.

### Two rendering modes

In a `translation` environment, the callout emits itself as open and close
placeholders, restored verbatim by `copy-markdown.html` after
`transform.HTMLToMarkdown`, with the body flowing between them. That keeps
the shortcode in the translation-export snapshot while leaving the prose
translatable. The store is re-read between the open and close registrations
so a placeholder registered by a nested shortcode keeps its order. This is a
no-op for normal, preview and production builds.

Otherwise it renders the `solo-alert` div on ONE logical line, encoding body
newlines as `&#10;`, so a callout nested in a list item does not trip
Goldmark's content-continuation column rule and break the list.

### Accessibility

`role="note"` marks the box as ancillary content. That is the correct ARIA
role for a static admonition, and deliberately not `role="alert"`, which is
an assertive live region meant for dynamically injected messages. The icon
is `aria-hidden`: it is decorative, and the body text carries the meaning.

---

Source: [`layouts/_shortcodes/callout.html`](https://github.com/solo-io/docs-theme-extras/blob/main/layouts/_shortcodes/callout.html)
