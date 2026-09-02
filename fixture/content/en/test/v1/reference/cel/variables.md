---
title: CEL variables
weight: 10
description: OSS CEL subpage stand-in. MARKER_CELREF_OSS resolves here, because link-hextra leaves a reference/cel subpage alone when no agentgateway signal is present.
build:
  list: never
  render: always
---

MARKER_CELREF_PAGE_VARIABLES. This page stands in for the agentgateway OSS
`/reference/cel/variables/` subpage. Without an agentgateway signal
`link-hextra` leaves the subpage segment alone, so `MARKER_CELREF_OSS` on the
[Everything](../../../everything/) page lands here rather than on the collapsed
[single page](../).

Back to the [CEL reference](../).

## Functions: policy.all {#functions-policy-all}

The same explicit id as the collapsed page carries, so a link that is rewritten
and a link that is left alone both resolve.

| Variable | Type | Description |
|-|-|-|
| `request` | map | The inbound request. |
| `response` | map | The upstream response. |
