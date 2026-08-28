---
title: Collision leaf
weight: 10
description: A leaf page under a content directory named after a registered section.
---

At `/test/v2/nested/collision/`. The `nested` segment here is content, not a
section: the segment after it is `collision`, not a version, and a version
(`v2`) already precedes it.

Its left nav must be the `v2` tree — the same nav any other `/test/v2/` page
gets.

## Gating

`conditional-text` resolves the section segment as a second gate token, so this
page is also the control for the positional rule on the GATING side: a
registered section name appearing at a content position must not satisfy a gate
that names it. This is the only fixture page that can prove it — a page whose
URL happens to contain no registered name at all proves nothing, because the
gate could not fire there under any implementation.

The first gate below must be dropped and the second must render. See
`tests/conditional-section.spec.ts`. (The marker strings are never spelled out
in this page's prose: the spec greps the rendered HTML, so a literal mention
would be a guaranteed false positive.)

Naming the section — dropped, because `nested` sits at a content position here:

{{% conditional-text include-if="nested" %}}COND_SEC_COLLISION_SECTION{{% /conditional-text %}}

Naming the build condition — renders, so the assertion above is not vacuous:

{{% conditional-text include-if="test" %}}COND_SEC_COLLISION_PRODUCT{{% /conditional-text %}}
