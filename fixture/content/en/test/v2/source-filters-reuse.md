---
title: Source filters via reuse
weight: 392
description: Direct reuse of a snippet containing upstream and downstream blocks.
# Direct-path fixture (see version-remap.md) so auto-cards.spec.ts's child count is unchanged.
build:
  list: never
  render: always
---

The DIRECT render path. A plain `reuse` call passes no version, so reuse.html's
source filters are skipped and the two templates give their own answer:
`upstream` emits its body, `downstream` discards it.

{{< reuse "conrefs/test/source-filters.md" >}}
