---
# GENERATED FILE — DO NOT EDIT.
#
# Written by scripts/gen-docs.mjs from layouts/_shortcodes/table.html.
# Edit that instead and re-run `npm run gen:docs`; CI runs
# `npm run gen:docs -- --check` and fails on any diff.
title: table
description: "Wraps a markdown table so the author picks how its columns size"
weight: 90
---

Either call form works, and both produce identical HTML.

## Parameters

### Named

| Name | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `mode` | string | no | `wrap` | One of wrap, nowrap, or equal. See Notes. |

### Positional

| Name | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `0` | string | no | `wrap` | Positional alias for mode. |

## Example

```markdown
{{%/* table mode="nowrap" */%}}
| Command | Description |
| ------- | ----------- |
| `kubectl get pods -n agentgateway -o wide` | Lists pods. |
{{%/* /table */%}}
```

{{< details title="Rendered output" >}}

{{% table mode="nowrap" %}}
| Command | Description |
| ------- | ----------- |
| `kubectl get pods -n agentgateway -o wide` | Lists pods. |
{{% /table %}}

{{< /details >}}

## Notes

This is the REFERENCE IMPLEMENTATION of the header contract in
MAINTAINING.md. If the two disagree, the document is right and this file
needs updating.

The three modes:

- `wrap` (default) fills the body width and wraps content as needed, never
  scrolling horizontally. Best for prose and description tables, and for
  small two-column tables that should span the page.
- `nowrap` sizes each column to its content and never wraps, scrolling
  horizontally when the table is wider than the body. Best for code
  snippets and command tables, where wrapping hurts reading.
- `equal` gives equal-width columns via `table-layout: fixed`, and wraps
  content. Best when columns should be uniform regardless of content.

Without this shortcode the theme applies a column-count heuristic that caps
cell width only on reference tables of three or more columns. Reach for
`table` when that default does not suit a specific table.

The markdown table must start at column 0. `.InnerDeindent` strips a
uniform leading indent, but ragged indentation still breaks the table.

The inner markdown goes through `.Page.RenderString` so both call forms
produce identical HTML. That is not cosmetic: the rebase pipeline rewrites
percent-form shortcodes to angle-bracket form, so anything relying on
percent-form splice-back semantics breaks on a rebased page. Same reasoning
as github-table.html.

---

Source: [`layouts/_shortcodes/table.html`](https://github.com/solo-io/docs-theme-extras/blob/main/layouts/_shortcodes/table.html)
