---
# GENERATED FILE — DO NOT EDIT.
#
# Written by scripts/gen-docs.mjs from layouts/_shortcodes/tabs.html.
# Edit that instead and re-run `npm run gen:docs`; CI runs
# `npm run gen:docs -- --check` and fails on any diff.
title: tabs
description: "Groups tab shortcodes into one tabbed block, with page-unique DOM ids"
weight: 100
---

**Angle-bracket form only** (`{{</* … */>}}`). The percent form would re-render the output as Markdown.

> [!NOTE]
> This shortcode shadows Hextra's `tabs`, so its behavior differs from the upstream one of the same name. See the [Hextra shortcodes guide](https://imfing.github.io/hextra/docs/guide/shortcodes/) for the baseline.

## Parameters

| Name | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `items` | string | no | — | Deprecated comma-separated label list. Put a name= on each tab instead. |
| `defaultIndex` | int | no | — | Deprecated. Put selected=true on the tab that should open. |

## Example

```markdown
{{</* tabs */>}}
{{%/* tab name="Helm" */%}}
Install with Helm.
{{%/* /tab */%}}
{{%/* tab name="kubectl" */%}}
Install with kubectl.
{{%/* /tab */%}}
{{</* /tabs */>}}
```

{{< details title="Rendered output" >}}

{{< tabs >}}
{{% tab name="Helm" %}}
Install with Helm.
{{% /tab %}}
{{% tab name="kubectl" %}}
Install with kubectl.
{{% /tab %}}
{{< /tabs >}}

{{< /details >}}

## Notes

Wraps a set of `tab` shortcodes into one tabbed block. Authoring is exactly
Hextra's — this shortcode shadows it only to give each group DOM ids that
are unique on the page.

### Labelling and opening state

The labels come from each `tab`, not from this shortcode: `name=` sets the
button text, and `selected=true` on one tab opens that tab instead of the
first. The two parameters listed above are Hextra's deprecated forms of the
same two things, kept working for content that still uses them. `items=` on
the group and `tabName=` on a tab are both dead ends — a tab with neither
`name=` nor `items=` renders as "Tab 0", "Tab 1", with no build warning, so
`tests/tab-syntax.spec.ts` lints for them in source.

### Nesting

A whole `tabs` group may live inside a `tab` panel — the shape a "pick your
platform, then pick your install method" procedure takes:

- An inner group switches independently of the group it sits in.
- An inner group is hidden and shown with its parent panel, and keeps its
  own selection when the parent is switched away and back.
- Nesting survives `reuse` and `rebase`, so a conref may carry the whole
  construction.

Two levels is the practical limit. Deeper renders, but it asks the reader to
hold two choices in mind before any prose applies to them; prefer a second
step, or a page per platform.

### Syncing groups

Set `tabs.sync` in a page's front matter, or `page.tabs.sync` in site
params, and groups move together — pick Helm once and every Helm/kubectl
group on the page follows.

**The key is the tab NAMES**, comma-joined, and nothing else. Not the
position, not the nesting depth, not the containing panel. So two groups
labelled the same are ONE control even when they are nested under different
outer panels, and an inner group pairs with a top-level one across the
nesting boundary. "Helm / kubectl" under both a Linux panel and a macOS
panel is a single choice, not two. That is usually what a reader wants; when
it is not, give the groups different labels. Pinned by
`tests/tabs-sync.spec.ts`.

### Flattening for PDF and Copy as Markdown

None of the JS runs in a PDF, the `markdown` output format, or the
Copy-as-Markdown payload, so `utils/unhide-tabs.html` rewrites each group
there: the button bar becomes "You can choose from the following options."
and every panel is unhidden under an `Option:` label carrying the name the
reader would have clicked, nested groups included. Nothing is dropped —
write tab content that still reads when every option is stacked in source
order, and avoid "as shown in the tab above".

### Difference from Hextra's `tabs`

The DOM ids only. Hextra derives them from the shortcode's `.Ordinal`, which
Hugo numbers relative to the parent shortcode, so every nested group
collides with the page's first group; this numbers them per page instead.
Authors never see the ids, and no other behavior differs. The implementation
comment in the source file has the full account.

---

Source: [`layouts/_shortcodes/tabs.html`](https://github.com/solo-io/docs-theme-extras/blob/main/layouts/_shortcodes/tabs.html)
