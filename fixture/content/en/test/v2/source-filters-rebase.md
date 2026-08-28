---
title: Source filters via rebase
weight: 394
description: Direct rebase of the snippet, covering rebase's own Stage 3b filters.
# Direct-path fixture (see version-remap.md) so auto-cards.spec.ts's child count is unchanged.
build:
  list: never
  render: always
---

The pre-existing path: rebase reads the gated file itself, so its Stage 3b
filters do the work. Unchanged by the reuse fix, and asserted here so a future
edit to either filter cannot regress the other.

{{< rebase file="conrefs/test/source-filters.md" >}}
