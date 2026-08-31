---
title: v2 (current)
weight: 10
# Builds a book document at v2/book.html alongside index.html, so the PDF
# layouts and print-book.css are executed by the test build. v2 is the right
# section to opt in because it is the deep one — nested subsections give the
# book a multi-level table of contents and chapter tree, and everything.md
# drags tabs, callouts, tables and code fences through the same render.
# Asserted by tests/book-document.spec.ts.
# NOTE the full list. Hugo's `outputs` front matter REPLACES the page's default
# outputs rather than adding to them, so naming only ["html", "book"] silently
# drops this section's .md, RSS and llms.txt — the version root, and only the
# version root, stops serving Copy-as-Markdown and llms discovery. Keep this in
# sync with `[outputs] section` in the config.
outputs: ["html", "rss", "markdown", "book"]
---

The current version of the test fixture. Open [Everything](everything/) to see every shortcode pattern rendered, or [Rebased](rebased/) to see the same content rendered through the `rebase` shortcode.

This section index carries a footnote[^order] so footnotes-after-cards.spec.ts can assert the footnote block renders after the auto-generated section cards, not wedged between the body and the grid.

[^order]: Goldmark appends this block to the end of `.Content`; docs/list.html splits it out so it renders below the section cards.
