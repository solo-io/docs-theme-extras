---
title: Ordered list split
weight: 360
description: Regression page for ordered-list numbering across a list split by a tabs or code block.
# Kept out of sidebar/section-card listings (like version-remap.md) so it
# doesn't change auto-cards.spec.ts's expected child count; render:always keeps
# the page built so ordered-list-numbering.spec.ts can load it by direct path.
build:
  list: never
  render: always
---

<!--
Regression fixture for solo-io/docs#3280 §2. A numbered list interrupted by a
block Goldmark renders outside the parent <li> (a tabs block, a fenced code
block) is emitted as TWO <ol>s, with start="N" on the second. The theme draws
markers with ::before + counters, so the second fragment must continue the
count rather than restart.

Numbers are authored literally — Goldmark derives the `start` attribute from
the first item of each fragment, so `3.` is what produces <ol start="3">.
-->

## Shape 1 — nested split across different parent list items

This is the reported bug: the two nested fragments live under *different*
top-level `<li>`s, so a custom counter's scope never reaches the second one.

1. MARKER_OLSPLIT_S1_TOP1. First top-level step.

   1. MARKER_OLSPLIT_S1_SUB_A. Expect "a".
   2. MARKER_OLSPLIT_S1_SUB_B. Expect "b".

{{< tabs >}}
{{% tab name="First" %}}
MARKER_OLSPLIT_S1_TABBODY. Tab body between the two list fragments.
{{% /tab %}}
{{% tab name="Second" %}}
Second tab body.
{{% /tab %}}
{{< /tabs >}}

2. MARKER_OLSPLIT_S1_TOP2. Second top-level step.

   3. MARKER_OLSPLIT_S1_SUB_C. Expect "c", not "a".
   4. MARKER_OLSPLIT_S1_SUB_D. Expect "d", not "b".

## Shape 2 — top-level split (non-regression)

The top-level rule already uses `counter(list-item)`, so this works today and
must keep working.

1. MARKER_OLSPLIT_S2_ONE. Expect "1".
2. MARKER_OLSPLIT_S2_TWO. Expect "2".

{{< tabs >}}
{{% tab name="Only" %}}
MARKER_OLSPLIT_S2_TABBODY. Tab body.
{{% /tab %}}
{{< /tabs >}}

3. MARKER_OLSPLIT_S2_THREE. Expect "3", not "1".

## Shape 3 — nested split as direct siblings (non-regression)

This is what the old `:not([start])` rule bought. The fenced block splits the
nested list into two *sibling* `<ol>`s under the same parent `<li>`.

1. MARKER_OLSPLIT_S3_TOP. Top-level step.

   1. MARKER_OLSPLIT_S3_SUB_A. Expect "a".
   2. MARKER_OLSPLIT_S3_SUB_B. Expect "b".

   ```sh
   echo MARKER_OLSPLIT_S3_FENCE
   ```

   3. MARKER_OLSPLIT_S3_SUB_C. Expect "c".

## Shape 4 — doubly-nested split, and a legitimate restart

1. MARKER_OLSPLIT_S4_TOP. Top-level step.

   1. MARKER_OLSPLIT_S4_SUB_A. Expect "a".

      1. MARKER_OLSPLIT_S4_DEEP_I. Expect "i".

      ```sh
      echo MARKER_OLSPLIT_S4_FENCE
      ```

      2. MARKER_OLSPLIT_S4_DEEP_II. Expect "ii".

2. MARKER_OLSPLIT_S4_TOP2. A fresh step whose nested list has no `start`.

   1. MARKER_OLSPLIT_S4_RESTART. Expect "a" — a nested list with no `start` restarts.
