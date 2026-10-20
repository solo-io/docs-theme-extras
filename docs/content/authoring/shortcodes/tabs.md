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
Hextra's — this shortcode shadows it to give each group DOM ids that are
unique on the page, and to keep a group inside a gate from breaking the
page around it.

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

Prefer the site param. Turning sync on per page works, but only on the
pages that remember to set it. A reader who picks "Config file" on one page
is back on "UI" on the next page that forgot. One line in the site
config covers every page, current and future:

```yaml
params:
  page:
    tabs:
      sync: true
```

Page front matter wins over the site param in both directions, so
`tabs.sync: false` opts one page out, and `tabs.sync: true` on a page is
redundant once the site param is on. Remove it then, so that the site
config stays the one place to look.

### What a reader sees once sync is on

- **The choice follows the reader across pages, and across visits.**
  tabs.js saves the choice in `localStorage` under `hextra-tab-<names>`,
  and replays it on every page load. Any group with the same names on any
  page of the same site opens on that tab, until the reader picks another.
  The docs hub is one site, so a choice made in one product's docs carries
  into the others.
- **A saved choice beats `selected=true`.** The author's default applies
  only until the reader picks a tab in a group with those names.
- **The saved value is a POSITION, keyed by the names.** Keep the order
  the same everywhere a set of names is used. "UI, Config file" on one
  page and "Config file, UI" on another are two different controls, not
  one control in two orders.
- **The whole set of names must match, not one tab.** "Simplified (LLM) /
  Routing-based" and "Simplified (LLM) / Simplified (MCP) / Routing-based"
  are two controls, so picking "Routing-based" in one leaves the other
  alone. To make two groups one control, give them the same tabs.
- **Turning it on site-wide changes existing groups.** Every group that
  shares its names with another group, on the same page or a different
  one, now moves with it. Before you turn the site param on, list the name
  sets in use and check that each one means the same choice everywhere it
  appears. A set such as "Option A / Option B" that means different things
  on different pages needs distinct labels first.

### Inside a gate

A group may sit inside a `version` or `conditional-text` block, including
inside a numbered step, and the step, the list, and the headings after the
gate stay intact. There is no need to move the gated section into a snippet
and gate a one-line `reuse`; that workaround still works, but it was only
ever needed because of the bug this fixed. Pinned by
`tests/gate-tabs.spec.ts`.

### Flattening for PDF and Copy as Markdown

None of the JS runs in a PDF, the `markdown` output format, or the
Copy-as-Markdown payload, so `utils/unhide-tabs.html` rewrites each group
there: the button bar becomes "You can choose from the following options."
and every panel is unhidden under an `Option:` label carrying the name the
reader would have clicked, nested groups included. Nothing is dropped —
write tab content that still reads when every option is stacked in source
order, and avoid "as shown in the tab above".

### Difference from Hextra's `tabs`

Two things, neither of which changes how a group is written.

- **DOM ids.** Hextra derives them from the shortcode's `.Ordinal`, which
  Hugo numbers relative to the parent shortcode, so every nested group
  collides with the page's first group; this numbers them per page instead.
- **Nested output is one line.** A group inside another shortcode (a gate,
  `steps`, a `tab`, `details`) has its output flattened to a single line,
  the way `reuse` and `callout` already are. Hextra's markup spans several
  lines, and inside a gate it is parsed as markdown again, where a line at
  column 0 ends the list item it sits in. A top-level group is unchanged.

The implementation comments in the source file have the full account.

---

Source: [`layouts/_shortcodes/tabs.html`](https://github.com/solo-io/docs-theme-extras/blob/main/layouts/_shortcodes/tabs.html)
