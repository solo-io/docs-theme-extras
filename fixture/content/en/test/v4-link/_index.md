---
title: V4 (linkVersion probe)
# Capital V on purpose: tests/llms-index.spec.ts checks that llms.txt treats this
# title as already naming its version (dropdown "v4 …") despite the case.
weight: 400
description: Version tree whose URL slug (v4-link) differs from its canonical version (v4).
---

This tree is served at `/test/v4-link/` but its canonical version is `v4`. It is
the fixture's only entry where `linkVersion` and `version` differ, which is what
makes the canonical-vs-slug distinction observable at all.
