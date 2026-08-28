---
# GENERATED FILE — DO NOT EDIT.
#
# Written by scripts/gen-docs.mjs from layouts/_shortcodes/link-hextra.html.
# Edit that instead and re-run `npm run gen:docs`; CI runs
# `npm run gen:docs -- --check` and fails on any diff.
title: link-hextra
description: "Resolves a docs-relative path into a version- and product-aware URL"
weight: 270
---

Either call form works, and both produce identical HTML.

## Parameters

| Name | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `path` | path | yes | — | Docs-relative path to resolve into a URL. |
| `version` | string | no | `the page's version` | Version to resolve against, injected by rebase and reuse. |
| `product` | string | no | `site currentProduct` | Product to resolve against, injected by rebase and reuse. |

## Example

> [!NOTE]
> There is no live example on this page: this shortcode cannot be rendered safely in isolation. See [Notes](#notes) for why.

## Notes

The canonical link resolver, and the one to use in new content. `link` is an
alias for it.

Emits a bare URL string rather than an anchor, so it is written inside an
ordinary Markdown link:

    [the gateway guide]({{</* link-hextra path="/guides/gateway/" */>}})

All three parameters are read in `utils/resolve-link.html`, which this
four-line file hands its context to. They are documented here because a
reader writing the call should not have to know which partial resolves them
— and because a documentation check that only looked at this file would find
no parameters at all and pass while documenting nothing.

`version` and `product` are injected by the `rebase` and `reuse` pipelines
so a link inside content pulled from another version or product resolves
against the tree it came from. Writing them by hand in content is almost
always a mistake.

The example is marked `code-only`: resolution needs a version and product
context this site does not have.

---

Source: [`layouts/_shortcodes/link-hextra.html`](https://github.com/solo-io/docs-theme-extras/blob/main/layouts/_shortcodes/link-hextra.html)
