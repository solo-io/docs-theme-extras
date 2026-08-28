---
# GENERATED FILE — DO NOT EDIT.
#
# Written by scripts/gen-docs.mjs from layouts/_shortcodes/redirect.html.
# Edit that instead and re-run `npm run gen:docs`; CI runs
# `npm run gen:docs -- --check` and fails on any diff.
title: redirect
description: "Emits a client-side redirect from a stub page to its canonical location"
weight: 280
---

Either call form works, and both produce identical HTML.

## Parameters

### Named

| Name | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `url` | url | no | — | A URL to redirect to, used as-is. |
| `path` | path | no | — | A section-relative path resolved to the current docs section, e.g. /tutorials/basic/. |

### Positional

| Name | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `0` | url | no | — | Positional alias for url. |

## Example

> [!NOTE]
> There is no live example on this page: this shortcode cannot be rendered safely in isolation. See [Notes](#notes) for why.

## Notes

Give exactly one of `url`, `path`, or the positional argument.

The example is `code-only` for a reason specific to this shortcode: it emits
a `window.location` assignment that fires on page load. A live example would
navigate the reader off the reference page the instant they opened it. This
is the only shortcode in the module whose rendered output acts on the page
that contains it.

Emits three things, so the redirect survives readers who do not run the
first one: a `<script>` that sets `window.location`, a `<noscript>`
meta-refresh fallback, and a visible "Redirecting to ..." link for anyone
(or any crawler) that follows neither.

`path` resolves through `utils/page-context.html`, the same prefix
`card.html` and the link shortcodes use, so it works for every section
layout that partial knows about (kubernetes, standalone, envoy,
agentgateway and so on) without hardcoding a regex here. Pages outside the
`/docs/<section>/<version>/` shape fall back to
`.FirstSection.RelPermalink`.

---

Source: [`layouts/_shortcodes/redirect.html`](https://github.com/solo-io/docs-theme-extras/blob/main/layouts/_shortcodes/redirect.html)
