---
# GENERATED FILE — DO NOT EDIT.
#
# Written by scripts/gen-docs.mjs from layouts/_shortcodes/openapi.html.
# Edit that instead and re-run `npm run gen:docs`; CI runs
# `npm run gen:docs -- --check` and fails on any diff.
title: openapi
description: "Embeds an interactive viewer (Swagger UI or Scalar) for an OpenAPI spec"
weight: 250
---

Either call form works, and both produce identical HTML.

## Parameters

| Name | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `src` | path | no | — | An OpenAPI spec in assets/. Takes precedence over url. |
| `url` | url | no | — | A remote OpenAPI spec URL. |
| `deepLinking` | bool | no | `false` | Pass deepLinking="true" to let Swagger UI write the expanded operation into the page URL. Swagger only. |
| `renderer` | string | no | `swagger` | The viewer to render the spec with: `swagger` or `scalar`. |
| `tryItOut` | bool | no | `true` | Pass tryItOut="false" to remove the controls that send requests from the browser. Use it for a spec with no `servers`, which would otherwise send requests to the docs host. |
| `hideInfo` | bool | no | `false` | Pass hideInfo="true" to drop the spec's title and description from the viewer, when the page already shows them. |
| `serverUrl` | url | no | — | A placeholder server for Scalar's request examples, used instead of the spec's `servers`. Pair it with tryItOut="false", so that readers cannot send requests to the placeholder. Scalar only. |

## Example

> [!NOTE]
> There is no live example on this page: this shortcode cannot be rendered safely in isolation. See [Notes](#notes) for why.

## Notes

To render a spec with Scalar instead of Swagger UI, set the renderer:

```markdown
{{</* openapi src="api/openapi.json" renderer="scalar" tryItOut="false" */>}}
```

Both renderers load from the site's own origin when the build-time fetch
of their assets succeeds, because the assets are fingerprinted at build
time. They then run under a CSP that allows only 'self' and cdnjs for
scripts and has no 'unsafe-eval'. When the fetch fails, Scalar loads its
bundle from cdnjs without SRI, and Swagger UI loses its stylesheet. Scalar
probes for eval support through zod, which logs a CSP violation even though
the probe is caught. The shortcode sets zod's `jitless` flag before Scalar
loads, so the probe never runs.

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
fall back to loading directly from cdnjs when their build-time fetch fails,
so the page works even when the build cannot reach the network. The docs
CSP allows cdnjs for scripts but not for styles, so a fallback render works
but loses Swagger's stylesheet. The fallback also loads without SRI.

Swagger UI's own assets are already minified upstream and are deliberately
NOT run through `resources.Minify`. Re-minifying webpack-bundled JS can
rename internal identifiers and leave `SwaggerUIBundle` undefined at
runtime.

The example is marked `code-only`: a live render would fetch a spec over the
network on every site build.

---

Source: [`layouts/_shortcodes/openapi.html`](https://github.com/solo-io/docs-theme-extras/blob/main/layouts/_shortcodes/openapi.html)
