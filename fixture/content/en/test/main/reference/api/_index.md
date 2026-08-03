---
title: API
weight: 10
description: Single-page API reference stand-in. MARKER_APIREF_OSS resolves here, because link-hextra leaves a reference/api anchor untouched when no enterprise signal is present.
build:
  list: never
  render: always
---

MARKER_APIREF_PAGE_SINGLE. This page stands in for the single-page generated API
reference that the OSS sites publish at `/reference/api/`. On an OSS build
`link-hextra` leaves a `reference/api/#anchor` link alone, so this is where
`MARKER_APIREF_OSS` on the [Everything](../../everything/) page lands. The
enterprise and agentgateway branches are routed to the subpages instead.

## TypeA {#TypeA}

The anchor is an explicit `{#TypeA}` heading attribute rather than a Goldmark
slug (`typea`), because generated API references emit CamelCase type IDs and the
inbound links use that exact case.

| Field | Type | Description |
|-|-|-|
| `name` | string | Name of the resource. |
| `enabled` | bool | Whether this type is enabled. |
| `ref` | [TypeB](#TypeB) | Reference to another type on the same page. |

## TypeB {#TypeB}

A second type, so the `TypeA` table has a same-page anchor to point at.

| Field | Type | Description |
|-|-|-|
| `value` | string | An arbitrary value. |
