---
title: Source filters via rebase into reuse
weight: 393
description: The docs-hub shape - rebase a one-line stub whose body is a single reuse call.
# Direct-path fixture (see version-remap.md) so auto-cards.spec.ts's child count is unchanged.
build:
  list: never
  render: always
---

The shape that motivated the fix, reproduced exactly: the downstream repo does
not rebase the content file, it rebases a ONE-LINE STUB whose entire body is a
`reuse` call. rebase's own Stage 3b therefore only ever sees the stub, and the
gated content arrives one level down through reuse. This is how every page under
agentgateway's `assets/agw-docs/pages/` reaches the docs hub.

Before reuse.html gained the same filters, both blocks rendered here.

{{< rebase file="conrefs/test/source-filters-stub.md" >}}
