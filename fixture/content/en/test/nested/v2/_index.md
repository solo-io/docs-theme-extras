---
title: v2 (current)
weight: 10
description: The current version of the nested-section tree.
---

The `v2` tree of the `nested` section. Its URL is `/test/nested/v2/`, so the
version segment sits at index 3 rather than index 2, and
`utils/version-root.html` has to find it via `utils/section-segment.html`
instead of by fixed position.

Open [Nested page](page/) to see the child that the left nav must list.
