---
title: v1
weight: 20
# A SECOND book, and it exists for one reason: v1 is not the version any
# site-wide lookup would pick. site.Params.versions lists v2 first and flags no
# entry `linkVersion: "latest"`, so the old site-wide resolution answered "v2"
# for every book in the build. With only v2 opted in, that wrong answer was
# indistinguishable from the right one and the bug shipped — the istio 1.30.x
# manual went out labelled 1.31.x.
#
# So this tree proves two things v2 alone cannot: that the cover and footer
# version come from the book's OWN version root
# (utils/book-version.html), and that two books in one build get separate
# print-book.css resources rather than sharing whichever Hugo cached first.
# Asserted by tests/book-document.spec.ts.
# NOTE the full list. Hugo's `outputs` front matter REPLACES the page's default
# outputs rather than adding to them, so naming only ["html", "book"] silently
# drops this section's .md, RSS and llms.txt — the version root, and only the
# version root, stops serving Copy-as-Markdown and llms discovery. Keep this in
# sync with `[outputs] section` in the config.
outputs: ["html", "rss", "markdown", "book"]
---

The v1 version of the test fixture. Open [Everything](everything/) to see version-conditional rendering for v1.
