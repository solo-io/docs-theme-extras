---
title: v8 (hidden version)
weight: 800
description: A version whose dropdown label is whitespace, so it is published but never advertised.
---

This version's `dropdown` is whitespace-only, which is the "published but not
advertised" signal. It still has content, and that is the production shape:
agentgateway's `2.2.x` and `2.1.x` entries are configured exactly this way —
hidden from the picker, but fully built and reachable by direct link.

Two consequences are asserted elsewhere:

- `tests/search-visible-versions.spec.ts` — it must NOT appear in flexsearch's
  `visibleVersions`, so it never surfaces under "Other versions" in search.
- `tests/static.spec.ts` — neither the navbar version dropdown nor the mobile
  version chips emit an entry for it at all.

This page exists because the navbar used to emit a hidden entry rather than skip
it, as an empty row that was still clickable and still announced as a
`menuitem`. A content-less hidden version therefore put a broken link in every
version dropdown on the site. Real content here keeps that regression visible as
a bad link instead of a silently-different DOM.
