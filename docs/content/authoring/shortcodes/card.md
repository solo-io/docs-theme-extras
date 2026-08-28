---
# GENERATED FILE — DO NOT EDIT.
#
# Written by scripts/gen-docs.mjs from layouts/_shortcodes/card.html.
# Edit that instead and re-run `npm run gen:docs`; CI runs
# `npm run gen:docs -- --check` and fails on any diff.
title: card
description: "Renders a styled card link with an optional icon or image, title and subtitle"
weight: 30
---

Either call form works, and both produce identical HTML.

> [!NOTE]
> This shortcode shadows Hextra's `card`, so its behavior differs from the upstream one of the same name. See the [Hextra shortcodes guide](https://imfing.github.io/hextra/docs/guide/shortcodes/) for the baseline.

## Parameters

| Name | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `title` | string | yes | — | The card title. |
| `header` | string | no | — | Alias for title. |
| `subtitle` | string | no | — | Short description below the title. Supports Markdown. |
| `description` | string | no | — | Alias for subtitle. |
| `link` | url | no | — | A direct URL for the card link, used as-is. |
| `path` | path | no | — | A section-relative path resolved to the current docs section, e.g. /tutorials/basic/. |
| `icon` | string | no | — | Name of an icon to render via utils/icon.html. |
| `image` | url | no | — | Image URL to display at the top of the card. |
| `alt` | string | no | `the title` | Alt text for the image. |

## Example

```markdown
{{</* card title="Shortcodes" subtitle="Every shortcode, grouped by what it does." path="/shortcodes/" icon="solo" */>}}
```

{{< details title="Rendered output" >}}

{{< card title="Shortcodes" subtitle="Every shortcode, grouped by what it does." path="/shortcodes/" icon="solo" >}}

{{< /details >}}

## Notes

Emits the same `.section-card` markup the parent-section auto-card grid
uses, so a hand-written card looks identical to an auto-generated child
card.

Give either `link` or `path`, not both. `link` is used verbatim; `path` is
resolved against the current docs section.

`icon` is passed to Hextra's `utils/icon.html` UNGUARDED, so a name that is
not a key in `data/icons.yaml` calls `errorf` and aborts the build rather
than degrading to a missing icon. `utils/render-icon.html` guards the same
call and notes this file as the exception. The example above uses `solo`
because that is the only key this module ships.

Title and subtitle are emitted as `<span>` with `display: block` from CSS,
deliberately not as `<p>`. A percent-form call wraps the output in
markdownify, and a nested `<p>` inside the `<p>` Goldmark adds triggers the
browser's auto-close-the-outer-paragraph behavior, which closes the `<a>`
early and orphans the description.

---

Source: [`layouts/_shortcodes/card.html`](https://github.com/solo-io/docs-theme-extras/blob/main/layouts/_shortcodes/card.html)
