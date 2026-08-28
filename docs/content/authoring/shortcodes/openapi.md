---
# GENERATED FILE — DO NOT EDIT.
#
# Written by scripts/gen-docs.mjs from layouts/_shortcodes/openapi.html.
# Edit that instead and re-run `npm run gen:docs`; CI runs
# `npm run gen:docs -- --check` and fails on any diff.
title: openapi
description: "Embeds a Swagger UI viewer for an OpenAPI spec"
weight: 240
---

Either call form works, and both produce identical HTML.

## Parameters

| Name | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `src` | path | no | — | An OpenAPI spec in assets/. Takes precedence over url. |
| `url` | url | no | — | A remote OpenAPI spec URL. |
| `deepLinking` | bool | no | `false` | Pass deepLinking="true" to let Swagger UI write the expanded operation into the page URL. |

## Example

> [!NOTE]
> There is no live example on this page: this shortcode cannot be rendered safely in isolation. See [Notes](#notes) for why.

## Notes

Give either `src` or `url`. `src` wins when both are set, and resolves
through `resources.Get`, so the spec is served from the site's own origin.

The spec is ALSO fetched and parsed at build time, purely so the page can
carry a plain-text summary of the API. Swagger UI renders client-side, so
`transform.HTMLToMarkdown` would otherwise see an empty placeholder div and
the Copy-as-Markdown output would lose the API content entirely.

### Network behavior

Every build-time remote fetch is capped with a timeout and wrapped in `try`,
so an unreachable remote on a cold CI build warns and moves on instead of
hanging. Swagger UI still renders client-side from `url`, and the CDN assets
fall back to loading directly from unpkg when their build-time fetch fails,
so the page works even when the build cannot reach the network. The cost of
that fallback is that the assets load without SRI.

Swagger UI's own assets are already minified upstream and are deliberately
NOT run through `resources.Minify`. Re-minifying webpack-bundled JS can
rename internal identifiers and leave `SwaggerUIBundle` undefined at
runtime.

The example is marked `code-only`: a live render would fetch a spec over the
network on every site build.

---

Source: [`layouts/_shortcodes/openapi.html`](https://github.com/solo-io/docs-theme-extras/blob/main/layouts/_shortcodes/openapi.html)
