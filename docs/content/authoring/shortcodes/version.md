---
# GENERATED FILE — DO NOT EDIT.
#
# Written by scripts/gen-docs.mjs from layouts/_shortcodes/version.html.
# Edit that instead and re-run `npm run gen:docs`; CI runs
# `npm run gen:docs -- --check` and fails on any diff.
title: version
description: "Renders its body only on the versions the author names"
weight: 130
---

Either call form works, and both produce identical HTML.

## Parameters

| Name | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `version` | string | no | — | Version string to import, for a self-closing call. |
| `include-if` | string | no | — | Render the body only on versions matching this token. |
| `exclude-if` | string | no | — | Render the body on every version EXCEPT those matching. |

## Example

```markdown
{{%/* version include-if="v2" */%}}
This paragraph appears only on v2 pages.
{{%/* /version */%}}
```

{{< details title="Rendered output" >}}

{{% version include-if="v2" %}}
This paragraph appears only on v2 pages.
{{% /version %}}

{{< /details >}}

## Notes

`include-if` and `exclude-if` are read inside `utils/gate-decide.html`, the
condition evaluator shared with `conditional-text`. They are documented here
because a reader writing the call should not need to know that.

The bulk of the template is condition resolution: derive the current version
from the URL, match it against `params.versions`, and handle the
`keepVersion` landing zone. There is one emit site,
`utils/gate-emit.html`, which emits `.Inner` untouched.

### Interaction with rebase

The rebase pipeline remaps OSS version tokens to their enterprise
equivalents through each `params.versions` entry's `ossVersion`. A
`keepVersion` block opts out of that remap. Getting the two confused is a
known source of bugs: an enterprise token that collides with another entry's
`ossVersion` is the shape that once broke kgateway's github-branch page.

A `version` block inside a numbered list must wrap the WHOLE list item,
including its `1.` marker. Wrapping only part of the item detaches the
remainder from the list.

---

Source: [`layouts/_shortcodes/version.html`](https://github.com/solo-io/docs-theme-extras/blob/main/layouts/_shortcodes/version.html)
