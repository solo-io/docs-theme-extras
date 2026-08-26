---
# GENERATED FILE — DO NOT EDIT.
#
# Written by scripts/gen-docs.mjs from layouts/_shortcodes/github.html.
# Edit that instead and re-run `npm run gen:docs`; CI runs
# `npm run gen:docs -- --check` and fails on any diff.
title: github
description: "Fetches a remote file by URL and inlines its contents"
weight: 210
---

Either call form works, and both produce identical HTML.

## Parameters

| Name | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `url` | url | yes | — | The remote URL of the file to fetch and display. |

## Example

> [!NOTE]
> There is no live example on this page: this shortcode cannot be rendered safely in isolation. See [Notes](#notes) for why.

## Notes

Behavior depends on the URL's file extension. A `.md` URL is rendered
through the page's Markdown renderer, so headings, tables and links inside
the fetched file render correctly. Anything else — YAML, JSON, plain text —
is passed through with `safeHTML`, and callers typically wrap the call in a
code fence so it renders as a code block.

For a YAML file specifically, prefer `github-yaml`: it writes the fence for
you, strips the editor schema directive, captions the block and uses a
date-stamped cache key.

### Network behavior

`timeout` caps a slow or unreachable remote so a cold CI build with no
getresource cache fails fast instead of hanging, and `try` (required since
Hugo v0.141 removed `resource.Err`) turns a transient fetch error into a
warning plus a link-checker-visible fallback rather than a crash.

A dead or 404 URL is different: it produces a nil resource with no error,
which is treated as a real reference bug and fails the build with `errorf`.
The distinction is deliberate — a flaky network should not break a build,
and a wrong URL should.

The example is marked `code-only`: a live render would hit the network on
every site build.

---

Source: [`layouts/_shortcodes/github.html`](https://github.com/solo-io/docs-theme-extras/blob/main/layouts/_shortcodes/github.html)
