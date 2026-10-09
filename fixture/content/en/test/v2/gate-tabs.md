---
title: Gate wrapping tabs
weight: 398
description: Whether a tabs group inside a percent-form gate keeps the list and page content around it intact.
build:
  list: never
  render: always
---

Authored directly in content/ so nothing rewrites the shortcode form. Every gate is percent form, which is what `reuse` and `rebase` normalize an angle-form gate to before rendering, so this is the shape a consumer's angle-form `{{</* version */>}}` reaches.

## Heading-led gated section with tabs in a step

{{% version include-if="v2" %}}
### Gated section heading

GTAB_A_INTRO paragraph inside the gate.

1. GTAB_A_STEP_ONE first step.
2. Second step, with tabs directly under the step text.
   {{< tabs >}}
   {{% tab name="Cloud" %}}
   ```sh
   curl -vi http://$INGRESS_GW_ADDRESS:8080/status/200
   ```
   {{% /tab %}}
   {{% tab name="Local" %}}
   ```sh
   curl -vi localhost:8080/status/200
   ```
   {{% /tab %}}
   {{< /tabs >}}

   GTAB_A_STEP_TWO_TAIL text after the tabs, still in step two.
3. GTAB_A_STEP_THREE third step.
{{% /version %}}

## GTAB_B_HEADING heading after the gate

GTAB_B_AFTER paragraph after the gate.

## Gated list item with tabs, list continues after the gate

1. GTAB_C_STEP_ONE first step.
{{% version include-if="v2" %}}
2. Gated step with tabs.
   {{< tabs >}}
   {{% tab name="Cloud" %}}
   GTAB_C_TAB_BODY tab body.
   {{% /tab %}}
   {{% tab name="Local" %}}
   Other tab body.
   {{% /tab %}}
   {{< /tabs >}}
{{% /version %}}
3. GTAB_C_STEP_THREE third step.

## Top-level tabs in a gate

{{% conditional-text include-if="test" %}}
Prose before the tabs.

{{< tabs >}}
{{% tab name="Cloud" %}}
GTAB_D_TAB_BODY tab body.
{{% /tab %}}
{{% tab name="Local" %}}
Other tab body.
{{% /tab %}}
{{< /tabs >}}
{{% /conditional-text %}}

GTAB_D_AFTER paragraph after the gate.
