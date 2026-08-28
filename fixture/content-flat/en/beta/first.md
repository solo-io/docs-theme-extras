---
title: "Beta first page"
description: An ordinary topic page one level below the beta section landing.
weight: 1
---

Beta content.

## Gating with no sections registered

This page is also mounted by `hugo-nosections.toml` and `hugo-nosections-bare.toml`,
two builds of this same tree that register NO `[params.sections]`. That is the
shape agentregistry.dev and ambientmesh.io ship, and it is the one place
`utils/page-context.html`'s `url` branch can never resolve a section — so the
build condition is whatever `params.buildCondition` provides, or nothing at all.

The `nosections` build sets it and both gates below resolve normally. The
`nosections-bare` build sets neither, so they stay inert and
`layouts/_shortcodes/conditional-text.html` must WARN instead of dropping them
silently. Note the second one especially: an `exclude-if` naming a token nobody
uses should always emit, so a build where it disappears is deleting content, not
gating it.

In the versioned and version-less fixtures this page has sections registered, so
neither path applies and both gates resolve through the ordinary section axis.

Matching the build condition — renders wherever one is resolved:

{{% conditional-text include-if="agentregistry" %}}COND_NOSEC_INCLUDE{{% /conditional-text %}}

Excluding a token nothing uses — must render wherever gating works at all:

{{% conditional-text exclude-if="no-such-token" %}}COND_NOSEC_EXCLUDE{{% /conditional-text %}}
