---
title: v3 (tabs demo)
weight: 5
description: Prototype version for the tab-navigation band (issue solo-io/docs#3164). Its top-level sections are grouped into Documentation, API Reference, and Changelog tabs.
# A book on the docTabs tree, so the tab-navigation band and the PDF pipeline
# are exercised TOGETHER. They interact by accident of layout rather than by
# design: a docTabs `id` is a top-level content directory under the version
# root, and the book walks the version root's children recursively, so each tab
# becomes a top-level chapter with its own subtree nested below it. That works
# with no book-specific handling at all, which is exactly the kind of thing that
# quietly stops working — the sidebar scopes itself to ONE tab, and a change
# that taught the book to do the same would silently drop every non-default
# tab's content from the manual with no error.
#
# NOTE the ordering caveat: the band orders tabs by the [[params.docTabs]] array
# while the book orders chapters by Hugo page weight. They agree here only
# because this tree's weights (10/30/40) happen to match the config order.
# Asserted by tests/book-document.spec.ts.
# NOTE the full list. Hugo's `outputs` front matter REPLACES the page's default
# outputs rather than adding to them, so naming only ["html", "book"] silently
# drops this section's .md, RSS and llms.txt — the version root, and only the
# version root, stops serving Copy-as-Markdown and llms discovery. Keep this in
# sync with `[outputs] section` in the config.
outputs: ["html", "rss", "markdown", "book"]
---

This version exists only to demo the tab-navigation band. Its top-level
sections are grouped into three tabs so the left nav shows one group at a
time. Compare it with v2, which has no tab grouping and renders its full left
nav as before.
