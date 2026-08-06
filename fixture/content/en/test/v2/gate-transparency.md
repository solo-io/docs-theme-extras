---
title: Gate transparency
weight: 390
description: Paired gated/baseline sections asserting a gate renders identically to no gate.
# Direct-path fixture (see version-remap.md) so auto-cards.spec.ts's child count is unchanged.
build:
  list: never
  render: always
---

<!--
NOTE: no blank lines and no angle-bracketed tag names inside this comment.
Blank lines make the typographer mangle the closing delimiter so the comment
leaks into the page; literal tag names in the leaked text then trip the
built-html-integrity scanner. Both were hit while writing a sibling fixture.
.
CONTRACT OF THIS PAGE. Every shape appears twice: once wrapped in a version
gate whose condition is TRUE on this page, and once with the gate tags simply
deleted. A gate that is transparent produces identical HTML for the pair. Any
difference is a rendering defect, and tests/gate-transparency.spec.ts reports
it as one.
.
The pairs are matched by the numeric prefix in the heading, so keep the
"Shape NN gated" / "Shape NN baseline" wording. Body text is deliberately
IDENTICAL within a pair - the comparison is on rendered HTML, so differing
prose would produce a false failure.
.
Shapes marked EXPECTED-FAIL in the spec are the current bug inventory. Do not
"fix" them by weakening the fixture.
-->

## Shape 01 gated

The link {{% version include-if="v2" %}}[whole link](../everything/){{% /version %}} sits mid-sentence.

## Shape 01 baseline

The link [whole link](../everything/) sits mid-sentence.

## Shape 02 gated

A [link whose text]({{% version include-if="v2" %}}../everything/{{% /version %}}) has a gated URL.

## Shape 02 baseline

A [link whose text](../everything/) has a gated URL.

## Shape 03 gated

A [{{% version include-if="v2" %}}gated link text{{% /version %}}](../everything/) inside brackets.

## Shape 03 baseline

A [gated link text](../everything/) inside brackets.

## Shape 04 gated

A path-fragment link: [see the page](../{{% version include-if="v2" %}}everything{{% /version %}}/).

## Shape 04 baseline

A path-fragment link: [see the page](../everything/).

## Shape 05 gated

{{% version include-if="v2" %}}
| Column A | Column B |
|----------|----------|
| a1       | b1       |
| a2       | b2       |
{{% /version %}}

## Shape 05 baseline

| Column A | Column B |
|----------|----------|
| a1       | b1       |
| a2       | b2       |

## Shape 06 gated

{{% version include-if="v2" %}}
* first bullet
* second bullet
{{% /version %}}

## Shape 06 baseline

* first bullet
* second bullet

## Shape 07 gated

1. step one
{{% version include-if="v2" %}}
2. gated step two
{{% /version %}}
3. step three

## Shape 07 baseline

1. step one
2. gated step two
3. step three

## Shape 08 gated

{{% version include-if="v2" %}}
Paragraph before an indented fence.

    preformatted line one
    preformatted line two
{{% /version %}}

## Shape 08 baseline

Paragraph before an indented fence.

    preformatted line one
    preformatted line two

## Shape 09 gated

{{% version include-if="v2" %}}
Prose, then a fenced block.

```yaml
key: value
```
{{% /version %}}

## Shape 09 baseline

Prose, then a fenced block.

```yaml
key: value
```

## Shape 10 gated

{{% version include-if="v2" %}}{{% conditional-text include-if="test" %}}Both gates wrap this sentence.{{% /conditional-text %}}{{% /version %}}

## Shape 10 baseline

Both gates wrap this sentence.

## Shape 11 gated

Emphasis {{% version include-if="v2" %}}**around bold text**{{% /version %}} stays bold.

## Shape 11 baseline

Emphasis **around bold text** stays bold.

## Shape 12 gated

Inline code {{% version include-if="v2" %}}`--flag value`{{% /version %}} survives.

## Shape 12 baseline

Inline code `--flag value` survives.

## Shape 13 gated

{{% version include-if="v2" %}}
{{< tabs >}}
{{% tab name="Alpha" %}}Alpha panel body.{{% /tab %}}
{{% tab name="Beta" %}}Beta panel body.{{% /tab %}}
{{< /tabs >}}
{{% /version %}}

## Shape 13 baseline

{{< tabs >}}
{{% tab name="Alpha" %}}Alpha panel body.{{% /tab %}}
{{% tab name="Beta" %}}Beta panel body.{{% /tab %}}
{{< /tabs >}}

## Shape 14 gated

{{% version include-if="v2" %}}
### Heading inside a gate

Body text under the gated heading.
{{% /version %}}

## Shape 14 baseline

### Heading inside a gate

Body text under the gated heading.
