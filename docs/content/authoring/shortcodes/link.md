---
# GENERATED FILE — DO NOT EDIT.
#
# Written by scripts/gen-docs.mjs from layouts/_shortcodes/link.html.
# Edit that instead and re-run `npm run gen:docs`; CI runs
# `npm run gen:docs -- --check` and fails on any diff.
title: link
description: "Alias for link-hextra, kept so existing call sites keep working"
weight: 260
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

Forwards to `utils/resolve-link.html`, the canonical version- and
product-aware implementation shared with `link-hextra`. All three parameters
are read there rather than in this file; they are documented here because a
reader writing the call should not have to know that.

Prefer `link-hextra` in new content. This name exists so existing call sites
keep working without a repo-wide sweep.

Implemented as a shared partial call rather than the alert-to-callout trick
of building a shortcode string and running it through `RenderString`. The
output is a bare URL string, not Markdown, so there is nothing for
`RenderString` to reprocess, and routing through it anyway broke version
inference in deeply nested contexts.

### Why forwarding matters beyond the name

The old implementation resolved `path` against
`.Page.FirstSection.RelPermalink`, which has no notion of version or
product. That happens to produce correct URLs on the docs hub, where a
product's own Hugo build treats the version as the true top-level section.
It does NOT hold on a standalone OSS site, where one build serves several
doc flavors under real path segments such as `/docs/envoy/2.1.x/`, and the
version is several segments deep. The old code also had no equivalent of the
product-aware cross-flavor routing, so a `link` call inside content pulled
across products by `rebase` had no way to land on the right page.

The example is marked `code-only`: resolution needs a version and product
context this site does not have.

---

Source: [`layouts/_shortcodes/link.html`](https://github.com/solo-io/docs-theme-extras/blob/main/layouts/_shortcodes/link.html)
