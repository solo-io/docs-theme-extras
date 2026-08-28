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
{{%/* upstream */%}}
This paragraph appears in the OSS docs and nowhere else.
{{%/* /upstream */%}}
```

{{< details title="Rendered output" >}}

{{% upstream %}}
This paragraph appears in the OSS docs and nowhere else.
{{% /upstream %}}

{{< /details >}}

## Notes

One half of the OSS-versus-enterprise split, paired with `downstream`.

USE PERCENT FORM. This template emits `.Inner` untouched, so in angle form
the body is substituted after Goldmark has run and a block containing
headings, lists, or fences survives as literal text. Percent form re-enters
the Markdown stream, which is why every ambientmesh.io call site uses it.

THE POLARITY FLIP IS NOT DONE BY THIS FILE. Each template is a one-liner
with no condition in it: `upstream` emits `.Inner`, `downstream` discards
it, always. That is the DIRECT-render answer — the OSS site building its own
content. The inversion is done by filtering the source TEXT before either
template runs, in two places that must stay in step:

  - `rebase.html` Stage 3b, for a file the downstream repo rebases directly.
  - `reuse.html`, for a file that arrives one or more levels down through
    `reuse`, gated on the `$parentVersion` that rebase injects.

The reuse half was missing until 0.3.5, which made the pair silently inert
for most real content: the agentgateway hub does not rebase
`assets/agw-docs/pages/*` at all, it rebases a one-line
`content/docs/<section>/<ver>/…` stub whose whole body is a `reuse` call, so
Stage 3b only ever saw the stub. Both paths are now pinned by
`tests/source-filters-reuse.spec.ts`.

Content inside a `downstream` block is removed from the upstream build
entirely, so a link that only appears there is not a broken link upstream —
it is absent. Link checkers that flag it are reading the source, not the
output.

Prefer `conditional-text` when the split is finer than upstream/downstream:
it takes an explicit condition rather than depending on the render path.

---

Source: [`layouts/_shortcodes/upstream.html`](https://github.com/solo-io/docs-theme-extras/blob/main/layouts/_shortcodes/upstream.html)
