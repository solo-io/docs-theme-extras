---
# GENERATED FILE — DO NOT EDIT.
#
# Written by scripts/gen-docs.mjs from layouts/_shortcodes/cards.html.
# Edit that instead and re-run `npm run gen:docs`; CI runs
# `npm run gen:docs -- --check` and fails on any diff.
title: cards
description: "Wraps inner card shortcodes in a responsive grid"
weight: 40
---

Either call form works, and both produce identical HTML.

> [!NOTE]
> This shortcode shadows Hextra's `cards`, so its behavior differs from the upstream one of the same name. See the [Hextra shortcodes guide](https://imfing.github.io/hextra/docs/guide/shortcodes/) for the baseline.

## Parameters

| Name | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `cols` | int | no | `3` | Number of grid columns at the lg breakpoint and up. |

## Example

```markdown
{{</* cards cols="2" */>}}
  {{</* card title="First card" link="/docs/first/" subtitle="A first card." */>}}
  {{</* card title="Second card" link="/docs/second/" subtitle="A second card." */>}}
{{</* /cards */>}}
```

{{< details title="Rendered output" >}}

{{< cards cols="2" >}}
  {{< card title="First card" link="/docs/first/" subtitle="A first card." >}}
  {{< card title="Second card" link="/docs/second/" subtitle="A second card." >}}
{{< /cards >}}

{{< /details >}}

## Notes

Emits the same `.section-cards` container the parent-section auto-card grid
uses, so a hand-written grid renders identically to an auto-generated one.
The default of 3 matches that container's own default.

---

Source: [`layouts/_shortcodes/cards.html`](https://github.com/solo-io/docs-theme-extras/blob/main/layouts/_shortcodes/cards.html)
