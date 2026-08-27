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

{{% conditional-text include-if="nested" %}}COND_SEC_SECTION{{% /conditional-text %}}

{{% conditional-text include-if="test" %}}COND_SEC_PRODUCT{{% /conditional-text %}}

{{% conditional-text include-if="demo" %}}COND_SEC_OTHER_SECTION{{% /conditional-text %}}

{{% conditional-text exclude-if="nested" %}}COND_SEC_EXCLUDE_SECTION{{% /conditional-text %}}

{{% conditional-text include-if="demo, test" %}}COND_SEC_LIST_WITH_PRODUCT{{% /conditional-text %}}
