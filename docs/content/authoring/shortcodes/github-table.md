---
# GENERATED FILE — DO NOT EDIT.
#
# Written by scripts/gen-docs.mjs from layouts/_shortcodes/github-table.html.
# Edit that instead and re-run `npm run gen:docs`; CI runs
# `npm run gen:docs -- --check` and fails on any diff.
title: github-table
description: "Fetches a remote Markdown file and inlines one section of it by heading"
weight: 220
---

Either call form works, and both produce identical HTML.

## Parameters

| Name | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `url` | url | yes | — | The remote URL of the Markdown file to fetch. |
| `section` | string | yes | — | The heading name of the section to extract. |
| `exclude` | string | no | — | A regex matching lines to remove from the extracted section. |
| `timeout` | string | no | `15s` | A Go duration capping how long the fetch may take before it is abandoned. Raise it only for a genuinely large remote file. |

## Example

> [!NOTE]
> There is no live example on this page: this shortcode cannot be rendered safely in isolation. See [Notes](#notes) for why.

## Notes

The section is rendered through the page's Markdown renderer, so headings,
tables and links inside it render correctly.

Both call forms produce the same HTML, because the render goes through
`RenderString`. That matters rather than being tidy: the rebase pipeline
rewrites percent-form shortcodes to angle form, so anything relying on
percent-form splice-back semantics breaks on a rebased page.

### Network behavior

`timeout` caps how long a slow or unreachable remote can block the build and
`try` turns a fetch error into a warning plus a link-checker-visible
fallback. This is the "cel.md GetRemote stall": a cold CI build fetches
`schema/cel.md` from raw.githubusercontent.com, and without a cap a
throttled runner connection hangs the entire build.

The 15s default suits the schema files this shortcode was built for, which
are tens of kilobytes. A few remotes are far larger — agentgateway's
`schema/config.md` passed 16 MB in August 2026 and grows with every commit —
and 15s is not enough to pull one over a throttled CI connection, so the
fetch fails and the docs-hub warnings test goes red. The `timeout` parameter
exists for those pages. Treat it as a pressure valve rather than a fix: a
page that needs a raised timeout is downloading megabytes to render a few
rows on every build of every consumer, and the durable answer is a smaller
remote or a checked-in table.

Three outcomes, deliberately different. A transient fetch error or timeout
is recoverable — warn, emit a fallback link, build stays green, with the
docs-hub warnings test escalating a persistent one and the link checker
reporting the dead URL. A dead or 404 URL, and a section name that is not in
the file, are both real reference bugs and fail loudly with `errorf`.

The example is marked `code-only`: a live render would hit the network on
every site build.

---

Source: [`layouts/_shortcodes/github-table.html`](https://github.com/solo-io/docs-theme-extras/blob/main/layouts/_shortcodes/github-table.html)
