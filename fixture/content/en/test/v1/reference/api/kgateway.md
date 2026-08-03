---
title: kgateway API
weight: 10
description: Enterprise reference subpage stand-in. MARKER_APIREF_ENT and MARKER_APIREF_NODOUBLE resolve here, and so does every rebased page's reference/api link.
build:
  list: never
  render: always
---

MARKER_APIREF_PAGE_KGATEWAY. This page stands in for the enterprise `kgateway`
reference subpage. `link-hextra` rewrites a bare `reference/api/#anchor` to this
path when the build carries an enterprise signal (`product=envoy`, injected by
`rebase`, or `currentProduct=kgateway`), so both `MARKER_APIREF_ENT` and the
already-subpaged `MARKER_APIREF_NODOUBLE` land here. The Rebased pages resolve
here in every version, because the rebase pipeline supplies the `envoy` product.

Back to the [API reference index](../).

## TypeA {#TypeA}

| Field | Type | Description |
|-|-|-|
| `name` | string | Name of the resource. |
| `enabled` | bool | Whether this type is enabled. |
