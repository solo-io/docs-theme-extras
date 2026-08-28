---
title: Section gating
weight: 20
description: conditional-text gated on the section segment, inside a section-nested version tree.
---

This page sits at `/test/nested/v2/cond-section/`, so `utils/section-segment.html`
resolves its section to `nested`. `conditional-text` passes BOTH that segment and
the site-wide `buildCondition` (`test`) to `utils/gate-decide.html`, so a gate
naming either one fires.

Its twin at `/test/v2/cond-section/` has no section segment at all, and asserts
that the segment tokens do not leak onto pages outside a section tree.

Each gate below carries a lead-in sentence rather than sitting flush against its
neighbour. That is not decoration: `tests/gate-axis-collision.spec.ts` reads an
adjacent run of `include-if` gates as an either/or PAIR and reports it when more
than one of them fires. These are independent assertions that are each supposed
to resolve on their own, so they must not read as a pair.

Matching the section segment — renders:

{{% conditional-text include-if="nested" %}}COND_SEC_SECTION{{% /conditional-text %}}

Matching the site-wide build condition — renders, and must keep doing so:

{{% conditional-text include-if="test" %}}COND_SEC_PRODUCT{{% /conditional-text %}}

Naming a different registered section — dropped:

{{% conditional-text include-if="demo" %}}COND_SEC_OTHER_SECTION{{% /conditional-text %}}

Excluding this page's own section — dropped:

{{% conditional-text exclude-if="nested" %}}COND_SEC_EXCLUDE_SECTION{{% /conditional-text %}}

Excluding an unrelated section — renders. This is the direction in which an
over-matching segment DELETES content rather than adding it:

{{% conditional-text exclude-if="demo" %}}COND_SEC_EXCLUDE_OTHER{{% /conditional-text %}}

A comma list matching on its second entry, with the space after the comma
trimmed — renders:

{{% conditional-text include-if="demo, test" %}}COND_SEC_LIST_WITH_PRODUCT{{% /conditional-text %}}
