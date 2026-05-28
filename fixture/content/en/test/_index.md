---
title: Docs framework test fixture
weight: 1
description: A fixture product used to functionally test the Hugo + Hextra theme docs framework.
type: "docs"
cascade:
  - type: "docs"
---

The fixture root is also the section landing — analogous to agentgateway's
`/docs/kubernetes/` and kgateway's `/docs/envoy/`. Two `version-cards`
invocations exercise both lookup paths the shortcode supports, and the spec
at `tests/version-cards.spec.ts` reads this page's HTML directly.

## Top-level fallback

{{< version-cards desc="Use the framework in a fallback environment." >}}

## Section-keyed lookup

{{< version-cards section="demo" desc="Use the framework with the demo section config." >}}
