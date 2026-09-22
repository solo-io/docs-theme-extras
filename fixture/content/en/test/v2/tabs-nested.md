---
title: Nested tabs
weight: 370
description: Regression page for a tabs group nested inside a tab panel.
# Kept out of sidebar/section-card listings (like ol-split.md) so it doesn't
# change auto-cards.spec.ts's expected child count; render:always keeps the
# page built so tabs-nested.spec.ts can load it by direct path.
build:
  list: never
  render: always
---

<!--
Regression fixture for TABS INSIDE TABS. Hextra's tab.html pushes each tab's
body onto `.Parent.Store`, so an inner group has to keep its own store, and
`shortcodes/tabs.html` derives every DOM id from the tabs shortcode's
`.Ordinal` — which Hugo numbers RELATIVE TO THE PARENT shortcode, not the page.
So a nested group can collide with an outer one, and the ids are what
utils/unhide-tabs.html resolves panel names through.

Shapes below, each with its own markers:
  1. inner group in the FIRST outer panel only
  2. inner groups in BOTH outer panels (independent switching, distinct ids)
  3. a code fence with a blank line at depth 2 (the double-markdownify hazard)
-->

## Shape 1 — inner group in the first outer panel

MARKER_NESTTABS_S1_INTRO. One inner group, one level down.

{{< tabs >}}
{{% tab name="Kubernetes" %}}
MARKER_NESTTABS_S1_OUTER_A. Body of the first outer tab, before the inner group.

{{< tabs >}}
{{% tab name="Helm" %}}
MARKER_NESTTABS_S1_INNER_A1. Inner tab one.
{{% /tab %}}
{{% tab name="kubectl" %}}
MARKER_NESTTABS_S1_INNER_A2. Inner tab two.
{{% /tab %}}
{{< /tabs >}}

MARKER_NESTTABS_S1_OUTER_A_TAIL. Body of the first outer tab, after the inner group.
{{% /tab %}}
{{% tab name="Standalone" %}}
MARKER_NESTTABS_S1_OUTER_B. Body of the second outer tab, which has no inner group.
{{% /tab %}}
{{< /tabs >}}

## Shape 2 — inner groups in both outer panels

MARKER_NESTTABS_S2_INTRO. Two inner groups under one outer group.

{{< tabs >}}
{{% tab name="Linux" %}}
MARKER_NESTTABS_S2_OUTER_A. First outer tab.

{{< tabs >}}
{{% tab name="amd64" %}}
MARKER_NESTTABS_S2_INNER_A1. Inner tab in the first outer panel.
{{% /tab %}}
{{% tab name="arm64" %}}
MARKER_NESTTABS_S2_INNER_A2. Second inner tab in the first outer panel.
{{% /tab %}}
{{< /tabs >}}
{{% /tab %}}
{{% tab name="macOS" %}}
MARKER_NESTTABS_S2_OUTER_B. Second outer tab.

{{< tabs >}}
{{% tab name="Apple silicon" %}}
MARKER_NESTTABS_S2_INNER_B1. Inner tab in the second outer panel.
{{% /tab %}}
{{% tab name="Intel" %}}
MARKER_NESTTABS_S2_INNER_B2. Second inner tab in the second outer panel.
{{% /tab %}}
{{< /tabs >}}
{{% /tab %}}
{{< /tabs >}}

## Shape 3 — code fence with a blank line at depth 2

MARKER_NESTTABS_S3_INTRO. The tab-code-fences hazard, one level deeper: a
blank line inside a fence must not terminate the `<pre>` and inject a `<p>`.

{{< tabs >}}
{{% tab name="Install" %}}
{{< tabs >}}
{{% tab name="Shell session" %}}
MARKER_NESTTABS_S3_PROSE. Prose in the inner panel, above the fence.

```console
$ kubectl get pods
MARKER_NESTTABS_S3_BEFORE   Running

MARKER_NESTTABS_S3_AFTER    Running
```
{{% /tab %}}
{{% tab name="Plain" %}}
MARKER_NESTTABS_S3_INNER_B. Second inner tab.
{{% /tab %}}
{{< /tabs >}}
{{% /tab %}}
{{% tab name="Uninstall" %}}
MARKER_NESTTABS_S3_OUTER_B. Second outer tab.
{{% /tab %}}
{{< /tabs >}}
