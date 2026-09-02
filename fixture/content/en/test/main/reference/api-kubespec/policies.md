---
title: Policies
weight: 10
description: Kubespec sibling page stand-in. MARKER_APIREF_SIBLING and SHAPE_NESTED both resolve here, so the path link-hextra is required to leave untouched is a real one.
build:
  list: never
  render: always
---

MARKER_APIREF_PAGE_KUBESPEC. Two links land here. `MARKER_APIREF_SIBLING` on the
[Everything](../../../everything/) page asserts that `link-hextra` leaves a
`reference/api-*` sibling alone instead of folding it under `reference/api/`,
and `SHAPE_NESTED` on the v2 link-hextra path shapes page uses the same path as
its multi-segment example. That second page is v2-only, so it is named rather
than linked: this page is mirrored into all three version trees, and a link to
it would dangle on v1 and main.

Back to the [reference index](../../).

## TypeA {#TypeA}

The anchor matches the one on the [API reference](../../api/) page, so the
sibling link and the single-page link differ only in the path that
`link-hextra` was asked not to rewrite.

| Field | Type | Description |
|-|-|-|
| `name` | string | Name of the resource. |
| `enabled` | bool | Whether this type is enabled. |
