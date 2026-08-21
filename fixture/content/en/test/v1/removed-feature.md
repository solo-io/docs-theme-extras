---
title: Removed feature
weight: 900
description: A page that exists ONLY in v1, to prove old-version history stays indexable.
---

This page deliberately has **no v2 equivalent**. It stands in for a feature that
was documented in an older release and then removed, so there is nothing in the
current version for it to duplicate.

`utils/version-noindex.html` must therefore leave it indexable — it emits
`noindex, follow` only for an old page whose current-version counterpart still
exists. Marking this one `noindex` would erase removed-feature documentation
from search, which is the failure mode the per-page check exists to avoid. Every
other page in `v1/` has a `v2/` counterpart, so without this file the
"leave history indexable" branch has nothing to exercise.

Asserted by `tests/version-noindex.spec.ts`.
