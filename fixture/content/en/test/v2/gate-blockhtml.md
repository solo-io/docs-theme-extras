---
title: Gate wrapping a rendered body
weight: 397
description: Whether a gate whose body is an already-rendered reuse expansion can be spliced back into markdown.
build:
  list: never
  render: always
---

Authored directly in content/ so nothing rewrites the shortcode form.

## Percent, body is only a reuse

1. Step one.
2. {{% conditional-text include-if="test" %}}{{< reuse "conrefs/test/blockhtml-snippet.md" >}}{{% /conditional-text %}}
3. CASE_A_STEP_THREE third step.

## Angle, body is only a reuse

1. Step one.
2. {{< conditional-text include-if="test" >}}{{< reuse "conrefs/test/blockhtml-snippet.md" >}}{{< /conditional-text >}}
3. CASE_B_STEP_THREE third step.

## Percent, leading text before the reuse

1. Step one.
2. Leading text. {{% conditional-text include-if="test" %}}{{< reuse "conrefs/test/blockhtml-snippet.md" >}}{{% /conditional-text %}}
3. CASE_C_STEP_THREE third step.

## No gate at all, bare reuse

1. Step one.
2. {{< reuse "conrefs/test/blockhtml-snippet.md" >}}
3. CASE_D_STEP_THREE third step.

## version: percent, body is only a reuse

1. Step one.
2. {{% version include-if="v2" %}}{{< reuse "conrefs/test/blockhtml-snippet.md" >}}{{% /version %}}
3. CASE_E_STEP_THREE third step.

## version: angle, body is only a reuse

1. Step one.
2. {{< version include-if="v2" >}}{{< reuse "conrefs/test/blockhtml-snippet.md" >}}{{< /version >}}
3. CASE_F_STEP_THREE third step.

## Control: percent REUSE with a block body, no gate at all

1. Step one.
2. {{% reuse "conrefs/test/blockhtml-snippet.md" %}}
3. CASE_G_STEP_THREE third step.

## Percent gate whose reuse target is INLINE

1. Step one.
2. {{% conditional-text include-if="test" %}}Uses {{< reuse "conrefs/test/inline-snippet.md" >}} here.{{% /conditional-text %}}
3. CASE_H_STEP_THREE third step.

## Percent gate, table row containing an inline reuse

| Col | Value |
| --- | --- |
{{% version include-if="v2" %}}| CASE_I_ROW | {{< reuse "conrefs/test/inline-snippet.md" >}} |{{% /version %}}

## Control: percent gate, BLOCK reuse, at document top level (not in a list)

Some prose before.

{{% conditional-text include-if="test" %}}{{< reuse "conrefs/test/blockhtml-snippet.md" >}}{{% /conditional-text %}}

CASE_J_AFTER paragraph after.
