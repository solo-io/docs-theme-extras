---
# GENERATED FILE — DO NOT EDIT.
#
# Written by scripts/gen-docs.mjs from layouts/_shortcodes/changelog-compare.html.
# Edit that instead and re-run `npm run gen:docs`; CI runs
# `npm run gen:docs -- --check` and fails on any diff.
title: changelog-compare
description: "Adds \"changes from / through\" version dropdowns that filter a Markdown changelog page"
weight: 50
---

Either call form works, and both produce identical HTML.

## Parameters

This shortcode takes no parameters.

## Example

> [!NOTE]
> There is no live example on this page: this shortcode cannot be rendered safely in isolation. See [Notes](#notes) for why.

## Notes

Place it above the changelog's version headings. The versions in both
dropdowns are read from the page's own headings in the browser on every
load, so nobody maintains a list: publish a new release heading and it
shows up.

A version heading is any h2 to h5 on the page whose whole text is a
version. If version headings sit above the shortcode, for example because
a sync script inserted a new minor section right after the front matter,
they are still included, and the toolbar moves above the first of them.
Three numeric parts (`2.4.1`, `v2026.11.0`, `1.0.0-rc2`) make a release;
two (`v2.4`, `v2026.11`) make a group heading, hidden when none of its
releases is in range. Other headings are left alone.

Choosing "Changes from A through B" shows A, B, and every release between
them, in page order. The dropdowns default to the oldest and newest
version on the page. The choice is written to `?from=&to=` so the
filtered view can be shared as a link.

For the `render` shortcode's JSON changelogs (Gloo Gateway, GME), use that
shortcode's own "Compare versions" view instead.

The shortcode itself outputs only an empty, hidden placeholder, so the
`.md` export and Copy as Markdown are unaffected. With JavaScript off, or
with fewer than two version headings, the page renders unfiltered.

---

Source: [`layouts/_shortcodes/changelog-compare.html`](https://github.com/solo-io/docs-theme-extras/blob/main/layouts/_shortcodes/changelog-compare.html)
