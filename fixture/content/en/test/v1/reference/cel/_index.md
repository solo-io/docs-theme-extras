---
title: CEL reference
weight: 20
description: Single-page CEL reference stand-in. The agentgateway branch of link-hextra collapses the OSS subpages onto this page, so MARKER_CELREF_AGW, MARKER_CELREF_AGW_YAML, and MARKER_CELREF_AGW_PLAIN all resolve here.
# Same `list: never` / `render: always` pattern as the sibling reference/api
# subtree: kept out of the sidebar and the section-card listings so the subtree
# does not change the expected counts in auto-cards.spec.ts or the trees
# sidebar-rail.spec.ts walks, but still built, because the whole point is that
# the MARKER_CELREF_* links land on files that exist and the link checker can
# resolve their fragments.
build:
  list: never
  render: always
---

MARKER_CELREF_PAGE_SINGLE. This page stands in for the single CEL reference page
the enterprise docs publish at `/reference/cel/`. The agentgateway OSS site
splits the same material across `variables/` and `yaml-and-examples/` subpages,
and `link-hextra` collapses those subpage segments onto this path when the
`product` is `agentgateway`. Both anchors below therefore have to exist here as
well as on the subpage they came from.

Back to the [reference index](../).

## Functions: policy.all {#functions-policy-all}

The id is an explicit `{#functions-policy-all}` attribute rather than a Goldmark
slug, because the inbound links carry the dotted function name from the real
agentgateway reference (`policy.all`), which slugifies to `policyall`.

| Function | Returns | Description |
|-|-|-|
| `policy.all` | bool | True when every policy in the list matches. |
| `policy.any` | bool | True when at least one policy in the list matches. |

## Examples {#examples}

| Expression | Result |
|-|-|
| `policy.all([true, true])` | `true` |
| `policy.any([false, true])` | `true` |
