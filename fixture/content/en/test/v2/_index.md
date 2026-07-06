---
title: v2 (current)
weight: 10
---

The current version of the test fixture. Open [Everything](everything/) to see every shortcode pattern rendered, or [Rebased](rebased/) to see the same content rendered through the `rebase` shortcode.

This section index carries a footnote[^order] so footnotes-after-cards.spec.ts can assert the footnote block renders after the auto-generated section cards, not wedged between the body and the grid.

[^order]: Goldmark appends this block to the end of `.Content`; docs/list.html splits it out so it renders below the section cards.
