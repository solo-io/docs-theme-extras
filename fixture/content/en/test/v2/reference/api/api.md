---
title: Agentgateway API
weight: 20
description: Agentgateway reference subpage stand-in. MARKER_APIREF_AGW resolves here, because link-hextra routes reference/api to reference/api/api when product=agentgateway.
build:
  list: never
  render: always
---

MARKER_APIREF_PAGE_AGW. This page stands in for the agentgateway `api` reference
subpage. `link-hextra` rewrites a bare `reference/api/#anchor` to this path when
`product=agentgateway` is passed, so `MARKER_APIREF_AGW` lands here. Only the
reuse-based Everything pages reach it: on a rebased page the pipeline overrides
the author-supplied product with `envoy`, so those links route to the kgateway
subpage instead. The page is kept in all three versions anyway, so a future
change to which product branch the Rebased pages exercise can't reintroduce the
missing-file error this subtree was added to fix (solo-io/docs#3349).

Back to the [API reference index](../).

## TypeA {#TypeA}

| Field | Type | Description |
|-|-|-|
| `name` | string | Name of the resource. |
| `enabled` | bool | Whether this type is enabled. |
