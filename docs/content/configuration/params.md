---
# GENERATED FILE — DO NOT EDIT.
#
# Written by scripts/gen-docs.mjs from reads of themeExtras.* across layouts/ and assets/.
# Edit that instead and re-run `npm run gen:docs`; CI runs
# `npm run gen:docs -- --check` and fails on any diff.
title: themeExtras parameters
description: "Every themeExtras config key the module reads."
weight: 50
---

Every `themeExtras.*` key this module reads, discovered by scanning `layouts/` and `assets/` rather than from a hand-kept list, so a key added to a template shows up here whether or not anyone remembered to document it.

```toml
[params.themeExtras]
  brand = "oss"   # or "enterprise"
```

## `themeExtras.alertTypes`

Custom GitHub-style alert types, beyond the built-in set plus this module's own `[!SOLO]` and `[!SUCCESS]`. An unknown type still warns and falls back to the default style, so a typo is visible rather than silent.

Read in [`assets/css/print-book.css`](https://github.com/solo-io/docs-theme-extras/blob/main/assets/css/print-book.css), [`layouts/_markup/render-blockquote-alert.html`](https://github.com/solo-io/docs-theme-extras/blob/main/layouts/_markup/render-blockquote-alert.html), [`layouts/_partials/components/github-style-alert.html`](https://github.com/solo-io/docs-theme-extras/blob/main/layouts/_partials/components/github-style-alert.html).

## `themeExtras.brand`

Selects the brand CSS layer loaded on top of the component baseline: `oss` loads `brand-oss.css`, `enterprise` loads `brand-enterprise.css`. Omit it entirely to get the neutral defaults with no brand layer. This is the only key most consumers set.

Read in [`assets/css/docs-theme-extras.css`](https://github.com/solo-io/docs-theme-extras/blob/main/assets/css/docs-theme-extras.css), [`layouts/_partials/breadcrumb.html`](https://github.com/solo-io/docs-theme-extras/blob/main/layouts/_partials/breadcrumb.html), [`layouts/partials/themeExtras/head-end.html`](https://github.com/solo-io/docs-theme-extras/blob/main/layouts/partials/themeExtras/head-end.html).

## `themeExtras.logo`

Logo used in the schema.org `Organization` block. Falls back to the navbar logo, and is left empty when neither is set. This is metadata only — it does not affect what renders in the navbar.

Read in [`layouts/_partials/schema.html`](https://github.com/solo-io/docs-theme-extras/blob/main/layouts/_partials/schema.html).

## `themeExtras.outputs`

**A table, not a scalar.** Its `markdown` key gates half of the llms.txt directive, so the directive never advertises a URL that would 404. Set `outputs.markdown = false` when the site does not publish the Markdown output format.

Read in [`layouts/_partials/docs-llms-directive.html`](https://github.com/solo-io/docs-theme-extras/blob/main/layouts/_partials/docs-llms-directive.html).

## `themeExtras.prodHost`

Production host used when rewriting links for the Copy-as-Markdown output. Resolution order is this key, then the host from `baseURL`, then empty — so a site whose `baseURL` already carries a scheme and host does not need to set it.

Read in [`layouts/_partials/page-to-markdown.html`](https://github.com/solo-io/docs-theme-extras/blob/main/layouts/_partials/page-to-markdown.html), [`layouts/partials/copy-markdown.html`](https://github.com/solo-io/docs-theme-extras/blob/main/layouts/partials/copy-markdown.html), [`layouts/partials/utils/prod-host.html`](https://github.com/solo-io/docs-theme-extras/blob/main/layouts/partials/utils/prod-host.html).

## `themeExtras.schemaOrgName`

Organization name in the schema.org JSON-LD block. Defaults to `site.Title`, which is usually right; set it when the legal or brand name differs from the site title.

Read in [`layouts/_partials/schema.html`](https://github.com/solo-io/docs-theme-extras/blob/main/layouts/_partials/schema.html).

## `themeExtras.twitterSite`

Value for the `twitter:site` meta tag, for example `@soloio_inc`. Omitted from the page entirely when unset.

Read in [`layouts/_partials/twitter_cards.html`](https://github.com/solo-io/docs-theme-extras/blob/main/layouts/_partials/twitter_cards.html).

## `themeExtras.warnMissingDescription`

Set to `false` to silence the per-page warning for a page with no front-matter `description`. Leave it on: without a description, the description meta tag, OpenGraph, Twitter card and JSON-LD all fall back to the raw page summary. Treat any opt-out as temporary, held only while a backlog of missing descriptions is worked through.

Read in [`layouts/partials/themeExtras/head-end.html`](https://github.com/solo-io/docs-theme-extras/blob/main/layouts/partials/themeExtras/head-end.html), [`layouts/partials/utils/warn-missing-description.html`](https://github.com/solo-io/docs-theme-extras/blob/main/layouts/partials/utils/warn-missing-description.html).
