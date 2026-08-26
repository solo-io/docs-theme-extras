---
# GENERATED FILE — DO NOT EDIT.
#
# Written by scripts/gen-docs.mjs from layouts/_shortcodes/upstream.html.
# Edit that instead and re-run `npm run gen:docs`; CI runs
# `npm run gen:docs -- --check` and fails on any diff.
title: upstream
description: "Keeps its body in the upstream build and drops it downstream"
weight: 120
---

Either call form works, and both produce identical HTML.

## Parameters

This shortcode takes no parameters.

## Example

```markdown
{{</* upstream */>}}
This paragraph appears in the OSS docs and nowhere else.
{{</* /upstream */>}}
```

{{< details title="Rendered output" >}}

{{< upstream >}}
This paragraph appears in the OSS docs and nowhere else.
{{< /upstream >}}

{{< /details >}}

## Notes

One half of the OSS-versus-enterprise build split, paired with
`downstream`. This module ships the UPSTREAM behavior, so here `upstream`
emits its body and `downstream` discards it. A downstream repo shadows both
files to invert that, which is why each is a one-liner: the whole contract
is which of the two emits `.Inner`.

Content inside a `downstream` block is removed from the upstream build
entirely, so a link that only appears there is not a broken link upstream —
it is absent. Link checkers that flag it are reading the source, not the
output.

Prefer `conditional-text` when the split is finer than upstream/downstream:
it takes an explicit condition rather than depending on which repo is
building.

---

Source: [`layouts/_shortcodes/upstream.html`](https://github.com/solo-io/docs-theme-extras/blob/main/layouts/_shortcodes/upstream.html)
