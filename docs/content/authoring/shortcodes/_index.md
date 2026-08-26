---
# GENERATED FILE — DO NOT EDIT.
#
# Written by scripts/gen-docs.mjs from layouts/_shortcodes/*.html.
# Edit that instead and re-run `npm run gen:docs`; CI runs
# `npm run gen:docs -- --check` and fails on any diff.
title: Shortcodes
description: "Every shortcode this module adds, grouped by what it does."
weight: 20
---

Every shortcode `docs-theme-extras` adds on top of Hextra, grouped by what it does. Each page is generated from the comment header of its source file, so the parameter tables cannot drift from the template that reads them.

## UI components

Render a visual component on the page.

| Shortcode | Summary |
| --- | --- |
| [`alert`](alert/) | Alias for callout, accepting the legacy context parameter name |
| [`callout`](callout/) | Renders an admonition box whose icon is derived from its type |
| [`card`](card/) | Renders a styled card link with an optional icon or image, title and subtitle |
| [`cards`](cards/) | Wraps inner card shortcodes in a responsive grid |
| [`checklist`](checklist/) | Renders its body as a checklist whose ticks persist in the browser |
| [`details`](details/) | Renders a collapsible details and summary block, closed by default |
| [`gloss`](gloss/) | Renders an inline glossary term with a tooltip carrying its definition |
| [`render`](render/) | Embeds the interactive changelog browser on a page |
| [`table`](table/) | Wraps a markdown table so the author picks how its columns size |

## Gating

Decide whether content appears at all.

| Shortcode | Summary |
| --- | --- |
| [`conditional-text`](conditional-text/) | Includes or excludes its body based on the page's build condition |
| [`downstream`](downstream/) | Drops its body in the upstream build and keeps it downstream |
| [`upstream`](upstream/) | Keeps its body in the upstream build and drops it downstream |
| [`version`](version/) | Renders its body only on the versions the author names |

## Reuse and versioning

Pull in shared content, or vary it by version.

| Shortcode | Summary |
| --- | --- |
| [`rebase`](rebase/) | Renders a page from another version's asset tree, rewriting its shortcodes to match |
| [`reuse`](reuse/) | Inlines a shared Markdown file from assets, resolving a version-specific copy first |
| [`reuse-append`](reuse-append/) | Concatenates a shared snippet with the inner content and renders them as one block |
| [`reuse-image`](reuse-image/) | Renders a shared image, optionally with a separate dark-mode variant |
| [`reuse-image-dark`](reuse-image-dark/) | Renders an image in dark mode only, hidden entirely in light mode |
| [`reuse-image-light`](reuse-image-light/) | Renders an image in light mode only, hidden entirely in dark mode |
| [`version-cards`](version-cards/) | Renders a card grid mirroring the navbar version dropdown |

## External content

Pull content from outside the page's own source.

| Shortcode | Summary |
| --- | --- |
| [`github`](github/) | Fetches a remote file by URL and inlines its contents |
| [`github-table`](github-table/) | Fetches a remote Markdown file and inlines one section of it by heading |
| [`github-yaml`](github-yaml/) | Fetches a remote YAML file and renders it as a captioned code block |
| [`openapi`](openapi/) | Embeds a Swagger UI viewer for an OpenAPI spec |
| [`readfile`](readfile/) | Inlines a file from the filesystem into the page |

## Links

Resolve or emit a URL.

| Shortcode | Summary |
| --- | --- |
| [`link`](link/) | Alias for link-hextra, kept so existing call sites keep working |
| [`link-hextra`](link-hextra/) | Resolves a docs-relative path into a version- and product-aware URL |
| [`redirect`](redirect/) | Emits a client-side redirect from a stub page to its canonical location |

## Deprecated

Superseded, kept for existing content.

| Shortcode | Summary |
| --- | --- |
| [`prism`](prism/) | Deprecated compatibility stub for the lotus prism shortcode; use a fenced code block |
