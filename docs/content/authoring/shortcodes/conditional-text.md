---
# GENERATED FILE — DO NOT EDIT.
#
# Written by scripts/gen-docs.mjs from layouts/_shortcodes/conditional-text.html.
# Edit that instead and re-run `npm run gen:docs`; CI runs
# `npm run gen:docs -- --check` and fails on any diff.
title: conditional-text
description: "Includes or excludes its body based on the page's build condition"
weight: 100
---

Either call form works, and both produce identical HTML.

## Parameters

| Name | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `include-if` | string | no | — | Render the body only when the page's condition matches. |
| `exclude-if` | string | no | — | Render the body only when the page's condition does NOT match. |

## Example

```markdown
{{%/* conditional-text include-if="kubernetes" */%}}
This paragraph appears only in the Kubernetes flavor of the docs.
{{%/* /conditional-text */%}}
```

{{< details title="Rendered output" >}}

{{% conditional-text include-if="kubernetes" %}}
This paragraph appears only in the Kubernetes flavor of the docs.
{{% /conditional-text %}}

{{< /details >}}

## Notes

Give exactly one of `include-if` or `exclude-if`.

Both parameters are read inside `utils/gate-decide.html`, which this
shortcode hands its context to as a dict value. They are documented here
anyway, because a reader writing the call should not have to know which
partial resolves the value.

The build condition is resolved through `utils/page-context.html`, so this
works under both the multi-product-hub and single-site URL conventions.
Prefer this over `upstream` and `downstream` whenever the split is finer
than which repo is building.

### Why this file is short

It used to be 211 lines: six shape heuristics choosing between four emit
strategies, because Hugo does not expose whether a shortcode was called in
percent or angle form and the template was guessing. Every one of those
strategies existed to undo damage caused by another — the trailing-step and
table-row paths raw-emitted to escape RenderString, the full-table path
rendered to escape raw emit, and the fenced-block path raw-emitted to escape
a double render. Emitting `.Inner` untouched removed the reason all four
existed. See `utils/gate-emit.html` for the verification behind that.

---

Source: [`layouts/_shortcodes/conditional-text.html`](https://github.com/solo-io/docs-theme-extras/blob/main/layouts/_shortcodes/conditional-text.html)
