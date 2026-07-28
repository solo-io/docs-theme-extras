---
title: Version remap
weight: 300
description: Exercises reuse.html's OSS-to-enterprise remap on a percent-form version block.
# Kept out of sidebar/section-card listings (like hextra-include-target.md) so
# it doesn't change auto-cards.spec.ts's expected child count; render:always
# keeps the page built so reuse-version-remap.spec.ts can read it.
build:
  list: never
  render: always
---

The same reused table as the v2 page. The remap still rewrites the OSS-gated
row's `include-if` from `v2oss` to `v2`, so on this v1 page the row is correctly
excluded — proving version filtering still works after the remap.

{{< reuse "conrefs/test/version-remap.md" "v1" "test" >}}
