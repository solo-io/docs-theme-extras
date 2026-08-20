---
title: Callout with a fenced body
weight: 370
description: Regression page for fenced code blocks inside a callout or alert body.
# Kept out of sidebar/section-card listings (like version-remap.md) so it
# doesn't change auto-cards.spec.ts's expected child count; render:always keeps
# the page built so callout-fence.spec.ts can read it by direct path.
build:
  list: never
  render: always
---

<!--
callout.html flattens its body's newlines to &#10; so a callout nested in a list
item can't trip Goldmark's content-continuation column rule. It did that with a
bare `replace "\n" "&#10;"`, which has none of utils/flatten-rendered.html's
protections — so a fenced code block in the body got &#10; injected INTO the
Hextra copy-button start tag (where entities are not decoded, yielding garbage
attributes) and into Chroma's inter-line <span>s.

No fixture covered a callout with a fenced body: callout-in-table-cell.spec.ts
uses an inline code SPAN, and callout-in-reuse-tab.spec.ts goes through
_partials/components/github-style-alert.html, not callout.html.
-->

## Angle-form callout, column 0

{{< callout type="info" >}}
MARKER_CALLOUTFENCE_ANGLE_PROSE. A fenced block follows inside this callout.

```sh
helm upgrade --install my-release my-repo/my-chart \
  --namespace MARKER_CALLOUTFENCE_ANGLE_CODE \
  --set some.value=true
```
{{< /callout >}}

## Percent-form callout, column 0

{{% callout type="warning" %}}
MARKER_CALLOUTFENCE_PCT_PROSE. A fenced block follows inside this callout.

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: MARKER_CALLOUTFENCE_PCT_CODE
```
{{% /callout %}}

## Alert shortcode (delegates to callout), column 0

{{< alert context="warning" >}}
MARKER_CALLOUTFENCE_ALERT_PROSE. The alert shortcode builds a callout call and re-renders it.

```sh
kubectl get pods -n MARKER_CALLOUTFENCE_ALERT_CODE
```
{{< /alert >}}

## Callout with a fenced body inside a numbered step

1. MARKER_CALLOUTFENCE_STEP_ONE. First step.

   {{% callout type="info" %}}
   MARKER_CALLOUTFENCE_STEP_PROSE. Indented callout continuing the step.

   ```sh
   echo MARKER_CALLOUTFENCE_STEP_CODE
   ```
   {{% /callout %}}

2. MARKER_CALLOUTFENCE_STEP_TWO. The list must survive the callout.
