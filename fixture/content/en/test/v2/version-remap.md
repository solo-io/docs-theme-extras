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

The table below is reused with an explicit version (the 3-arg form), so
reuse.html's OSS→enterprise version remap runs. On v2 the OSS-gated row is
remapped from `v2oss` to `v2` and renders; see the v1 page for the excluded case.

{{< reuse "conrefs/test/version-remap.md" "v2" "test" >}}
