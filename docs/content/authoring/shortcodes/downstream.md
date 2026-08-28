---
# GENERATED FILE — DO NOT EDIT.
#
# Written by scripts/gen-docs.mjs from layouts/_shortcodes/downstream.html.
# Edit that instead and re-run `npm run gen:docs`; CI runs
# `npm run gen:docs -- --check` and fails on any diff.
title: downstream
description: "Drops its body in the upstream build and keeps it downstream"
weight: 110
---

Either call form works, and both produce identical HTML.

## Parameters

This shortcode takes no parameters.

## Example

```markdown
{{%/* downstream */%}}
This paragraph appears in the enterprise docs and nowhere else.
{{%/* /downstream */%}}
```

{{< details title="Rendered output" >}}

{{% downstream %}}
This paragraph appears in the enterprise docs and nowhere else.
{{% /downstream %}}

{{< /details >}}

## Notes

The mirror of `upstream`; see that file for the full description of the
split and the percent-form requirement. This template always discards its
body. It becomes visible downstream because the source filters UNWRAP the
block textually — removing the tags and keeping the inner content — before
this template would ever run. Those filters live in rebase.html (Stage 3b)
and reuse.html, covering both the directly-rebased file and one reached
through any depth of `reuse`.

`.Inner` is assigned to a throwaway variable rather than simply left
unreferenced. Touching it forces Hugo to parse the body, so a malformed
shortcode call inside a downstream block still fails the upstream build
instead of being silently skipped until someone builds downstream.

---

Source: [`layouts/_shortcodes/downstream.html`](https://github.com/solo-io/docs-theme-extras/blob/main/layouts/_shortcodes/downstream.html)
