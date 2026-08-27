---
title: Section gating (no section)
weight: 95
description: The same conditional-text gates on a page that sits outside any section tree.
---

The control for `/test/nested/v2/cond-section/`. This page is at
`/test/v2/cond-section/` — a version tree hanging directly off the product, with
no section segment — so `utils/section-segment.html` returns "" and
`conditional-text` has only the site-wide `buildCondition` (`test`) to match on.

The section-gated marker must NOT appear here. If it does, a section name is
matching somewhere it does not apply, which is the bug
`utils/section-segment.html`'s positional rule exists to prevent. (Markers are
never spelled out in this page's prose — the spec greps the rendered HTML, so a
literal mention would be a guaranteed false positive.)

{{< conditional-text include-if="nested" >}}COND_SEC_SECTION{{< /conditional-text >}}

{{< conditional-text include-if="test" >}}COND_SEC_PRODUCT{{< /conditional-text >}}

{{< conditional-text exclude-if="nested" >}}COND_SEC_EXCLUDE_SECTION{{< /conditional-text >}}
