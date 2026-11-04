---
title: Cond Reuse Table
weight: 350
description: conditional-text wrapping a table or a list-with-a-table, with a nested reuse, must not escape the reuse's inline HTML.
---

Regression guard for the docs-hub escaping bug (retry-timeout / api-key). When a
`conditional-text` block contains a markdown table and a nested `reuse`, the
reuse's rendered inline code must stay a real code element, not leak as escaped
text, and the table must still render.

## Case 1 list with a table then a reuse

{{% conditional-text include-if="test" %}}
1. First step.
2. Configure the table.

   | Setting | Description |
   | ------- | ----------- |
   | `field` | A field. |
3. Run the command. {{< reuse "conrefs/test/cond-reuse-code.md" >}}
{{% /conditional-text %}}

## Case 2 conditional table row that reuses a snippet

| Setting | Description |
| ------- | ----------- |
{{% conditional-text include-if="test" %}}| `selector` | {{< reuse "conrefs/test/cond-reuse-code.md" >}} |{{% /conditional-text %}}
| `other` | A plain row. |

## Case 3 reused conditional-text wrapping a full table with HTML list cells

{{< reuse "conrefs/test/cond-table-htmllist.md" >}}

## Case 4 conditional-text wrapping a full table with HTML list cells inline

<!--
This case was authored in ANGLE form on purpose, back when the gate rendered
its body with RenderString: angle form was the only way to prove the
$isFullTable path emitted real HTML instead of leaking pipes.
.
The gate refactor deleted that path. gate-emit now emits .Inner untouched, which
is transparent only in PERCENT form - angle output is substituted after Goldmark
runs, so a raw markdown table would survive as literal pipe text. Left in angle
form this case leaked four table-pipe defects, which is the correct new
behaviour, not a regression.
.
Converted to percent, which is what the gate-form lint now requires of every
gate in content. The angle-form-is-wrong assertion did not disappear with it:
it moved into tests/gate-form.spec.ts as a unit test, where it belongs, since
it is a source-shape rule rather than a rendering one.
-->

{{% conditional-text include-if="test" %}}
| Tier | MARKER_ANGLETABLE Notes |
| --- | --- |
| Small | Needs:<ul><li>one CPU</li><li>two GB</li></ul> |
| Large | Plenty of capacity. |
{{% /conditional-text %}}

## Case 5 reused conditional-text wrapping an indented fence in a numbered list

{{< reuse "conrefs/test/cond-reuse-fence.md" >}}
