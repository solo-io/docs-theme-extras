---
# GENERATED FILE — DO NOT EDIT.
#
# Written by scripts/gen-docs.mjs from layouts/_shortcodes/rebase.html.
# Edit that instead and re-run `npm run gen:docs`; CI runs
# `npm run gen:docs -- --check` and fails on any diff.
title: rebase
description: "Renders a page from another version's asset tree, rewriting its shortcodes to match"
weight: 140
---

Either call form works, and both produce identical HTML.

## Parameters

| Name | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `file` | path | yes | — | Path to the source Markdown under assets/. |

## Example

> [!NOTE]
> There is no live example on this page: this shortcode cannot be rendered safely in isolation. See [Notes](#notes) for why.

## Notes

The heaviest shortcode in the module. It takes a whole page authored against
one version and renders it under another, rewriting the shortcodes inside so
they resolve against the version the reader is actually on.

The example is marked `code-only`: this cannot render without a real asset
tree and a version context.

### Pipeline

Each stage is a labelled block in the template. When adding a shortcode that
needs special treatment under rebase, find the right stage and add the rule
there.

1. **Setup** — resolve file path, page version and product, and look up the
   resource. Falls back to the bare path when the versioned path is not on
   disk.
2. **Content prep** — strip front matter; mark the page for Mermaid and
   manual-cards detection.
3. **Form conversion** — bulk-rewrite percent-form shortcodes to angle form
   so `RenderString` processes them, then revert specific shortcodes back to
   percent form where their inner content must re-flow through Markdown
   (`tab`, `steps`, `include`). `github-yaml` is on that revert list too.
4. **Source filters** — strip `upstream` blocks and unwrap `downstream`
   blocks, so a rebased page follows the same split as a native one.
5. **Argument injection** — pass the resolved version and product into the
   shortcodes that need them, `link-hextra` and `reuse`.
6. **Version remap** — handle `keepVersion` on the `version` shortcode, then
   do the two-pass OSS-to-enterprise version-string swap through indexed
   placeholders.
7. **Gate form** — normalize every TOP-LEVEL angle-form `version` and
   `conditional-text` gate to percent form, so `gate-emit`'s raw `.Inner`
   re-enters Markdown. Nested gates stay angle, because percent would
   pre-render them. Runs after the remap because the `keepVersion` guard is
   percent-only.
8. **Render** — hand the transformed Markdown to `RenderString`.

The structural-HTML parity test in `versioning.spec.ts` compares the
`everything` fixture page against its rebased twin. If you add a stage rule
and forget one, that test is what catches it.

---

Source: [`layouts/_shortcodes/rebase.html`](https://github.com/solo-io/docs-theme-extras/blob/main/layouts/_shortcodes/rebase.html)
