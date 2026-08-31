---
title: v2 (current)
weight: 10
description: The current version of the nested-section tree.
# A book on a SECTION-NESTED tree, which no other fixture book covers. Its URL
# is /test/nested/v2/, and its version segment (`v2`) is the SAME as the
# top-level /test/v2/ tree's — so the two are indistinguishable by version
# alone. That is precisely agentgateway's shape (kubernetes/latest and
# standalone/latest), and it pins two things that used to be silently wrong for
# it: the download URL has to carry the section segment or both trees resolve to
# one release asset, and the cover has to name the section or both manuals look
# identical. Asserted by tests/book-document.spec.ts.
# NOTE the full list. Hugo's `outputs` front matter REPLACES the page's default
# outputs rather than adding to them, so naming only ["html", "book"] silently
# drops this section's .md, RSS and llms.txt — the version root, and only the
# version root, stops serving Copy-as-Markdown and llms discovery. Keep this in
# sync with `[outputs] section` in the config.
outputs: ["html", "rss", "markdown", "book"]
---

The `v2` tree of the `nested` section. Its URL is `/test/nested/v2/`, so the
version segment sits at index 3 rather than index 2, and
`utils/version-root.html` has to find it via `utils/section-segment.html`
instead of by fixed position.

Open [Nested page](page/) to see the child that the left nav must list.
