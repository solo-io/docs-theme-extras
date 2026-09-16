---
title: Authoring
description: >-
  The shortcodes and render behavior this module adds on top of, or changes
  from, stock Hugo and Hextra.
weight: 30
---

This section covers what changes for a content author when a site imports
`docs-theme-extras`. For anything not listed here, the Hugo and Hextra defaults
apply unchanged.

Start with [resolving links](links/) if you are writing content rather than
building a site. Links are the one thing on this list that every page uses, and
the wrong call resolves to a real page instead of a 404, so nothing reports it.

Bookmark the upstream references. When something behaves the way you expect, it
is probably stock Hugo or Hextra, and their docs are the right place to look
first.

- Hugo, [using shortcodes](https://gohugo.io/content-management/shortcodes/)
- Hugo, [built-in shortcodes](https://gohugo.io/shortcodes/)
- Hugo, [markup render hooks](https://gohugo.io/render-hooks/)
- Hugo, [the `RenderString` method](https://gohugo.io/methods/page/renderstring/),
  which is why [call form](call-form/) matters
- Hextra, [shortcodes guide](https://imfing.github.io/hextra/docs/guide/shortcodes/)
