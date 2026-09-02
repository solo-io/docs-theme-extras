---
title: CEL YAML and examples
weight: 20
description: OSS CEL subpage stand-in for the second split page. The rebased pages reach it, because the rebase pipeline overrides the author-supplied product and the yaml-and-examples segment survives.
build:
  list: never
  render: always
---

MARKER_CELREF_PAGE_YAML. This page stands in for the agentgateway OSS
`/reference/cel/yaml-and-examples/` subpage, the second half of the split that
`link-hextra` collapses onto the [single page](../). The Rebased pages reach
this path in every version: the rebase pipeline supplies its own `product`, so
`MARKER_CELREF_AGW_YAML` keeps the subpage segment there while the reuse-based
Everything pages have it collapsed.

Back to the [CEL reference](../).

## Examples {#examples}

| Expression | Result |
|-|-|
| `request.headers["x-user"] == "alice"` | `true` when the header matches. |
| `has(response.body)` | `true` when the upstream returned a body. |
