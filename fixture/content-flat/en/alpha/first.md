---
title: "Alpha first page"
description: An ordinary topic page one level below the alpha section landing.
weight: 1
---

Alpha content.

## Gating

The control for the empty-condition guard on this section's landing page. At
`/docs/alpha/first/` the path carries a section and a following segment, so
`utils/page-context.html` in `url` mode resolves the condition to the section
itself (`alpha`) — the OSS convention where the two axes are one. The section
segment resolves to `alpha` as well and is a harmless duplicate.

So the first gate must render and the second must not. Without the first, the
landing page's "must not appear" assertion would pass on a build where gating is
simply broken everywhere. Asserted by `tests/section-versionless.spec.ts`.

Naming this page's own doc set — renders:

{{% conditional-text include-if="alpha" %}}COND_SEC_FLAT_SECTION{{% /conditional-text %}}

Naming the other doc set — dropped:

{{% conditional-text include-if="beta" %}}COND_SEC_FLAT_OTHER{{% /conditional-text %}}
