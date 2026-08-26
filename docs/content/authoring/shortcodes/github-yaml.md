---
# GENERATED FILE — DO NOT EDIT.
#
# Written by scripts/gen-docs.mjs from layouts/_shortcodes/github-yaml.html.
# Edit that instead and re-run `npm run gen:docs`; CI runs
# `npm run gen:docs -- --check` and fails on any diff.
title: github-yaml
description: "Fetches a remote YAML file and renders it as a captioned code block"
weight: 230
---

**Percent form only** (`{{%/* … */%}}`). The angle form would put the raw output on the page.

## Parameters

| Name | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `url` | url | yes | — | The remote URL of the YAML file to fetch and display. |

## Example

> [!NOTE]
> There is no live example on this page: this shortcode cannot be rendered safely in isolation. See [Notes](#notes) for why.

## Notes

**Percent form only.** This shortcode emits a Markdown code fence rather
than HTML, so its output has to re-enter the Markdown renderer. Hugo
inserts angle-bracket shortcode output verbatim without re-parsing it, so
the angle form puts literal backticks on the page instead of a code block.

Because of that it is also registered in `rebase.html`'s convert-back-to-
percent-form list. Rebase's bulk percent-to-angle conversion would
otherwise force it into the broken form on every rebased page. If you
rename this shortcode, update that list too.

The example is marked `code-only` because a live render would make a
network request on every site build.

### Why this and not `github` inside a fence

`github` can already inline a YAML file that the caller wraps in a fence,
and for a one-off that is the simpler call. This shortcode exists for three
things wrapping does not give you:

1. It strips the `yaml-language-server` schema directive from the first
   line. That line is an editor hint for the file's authors, is noise in
   published docs, and makes the rendered snippet differ from what a reader
   would paste.
2. It sets Hextra's `filename` and `base_url` codeblock attributes from the
   URL, so the block is captioned with the real file name and links back to
   its directory. See Hextra's `_markup/render-codeblock.html`.
3. It uses a date-stamped cache key, so a moving ref such as
   `refs/heads/main` refreshes at least daily instead of being pinned to
   whenever the getresource cache was last cold. `github` has no cache key,
   so Hugo's default keying applies.

---

Source: [`layouts/_shortcodes/github-yaml.html`](https://github.com/solo-io/docs-theme-extras/blob/main/layouts/_shortcodes/github-yaml.html)
