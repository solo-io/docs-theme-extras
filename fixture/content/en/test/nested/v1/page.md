---
title: Nested page
weight: 10
description: The v1 counterpart of the nested leaf page.
---

The `v1` counterpart of `/test/nested/v2/page/`, at the same path below the
version segment.

Both trees carrying the same path is what makes the version dropdown's
"preserve the current page across a version switch" behavior observable in a
section-nested shape: with only one tree, falling back to the version root and
correctly preserving the path look identical.
