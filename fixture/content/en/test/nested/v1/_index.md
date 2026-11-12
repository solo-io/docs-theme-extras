---
title: Nested guide
# The title leaves out the version on purpose. Many hub version roots share one
# title ("Solo Enterprise for Istio"), and tests/llms-index.spec.ts checks that
# llms.txt adds the version label to the link text in that case.
weight: 20
description: An older version of the nested-section tree.
---

The `v1` tree of the `nested` section.

`v1` is tagged `sections = ["demo", "nested"]` and therefore does NOT belong to
`alt`. From a page in this tree, a link to `alt` cannot reuse `v1` — there is no
`/test/alt/v1/` — so the section resolver has to remap to a version that exists
there. That is the remap probe.
