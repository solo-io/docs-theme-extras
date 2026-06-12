---
title: Block Direct
weight: 300
description: Block-content conditional-text patterns placed directly on the page (no reuse/rebase).
---

This page drops `conditional-text` block bodies straight into the page rather than through the `reuse` or `rebase` shortcodes. That matters because a `{{%/* conditional-text */%}}` whose body's first line is a markdown heading cannot be surfaced through reuse/rebase: Hugo's shortcode lexer fails to extract it (`shortcode … must be closed or self-closed`) when the whole conref is re-rendered through `RenderString`. The lexer runs before any template logic, so this is a Hugo limitation, not a shortcode-template one. Used directly, the block bodies render correctly, which is what this page pins.

The site `buildCondition` is `test`, so the include-if blocks render and the exclude-if block does not.

## Heading body

A conditional body that is a standalone heading carrying inline markdown (`**emphasis**`). Inline-only emit never parsed a leading `#` as a heading, so the body used to render as literal `## …` text. With block detection it routes to `display:"block"` and renders as a real heading element.

{{% conditional-text include-if="test" %}}
## COND_DIRECT_HEADING block heading with **COND_DIRECT_EMPHASIS**
{{% /conditional-text %}}

## Table body

A conditional body that is a standalone pipe table. It must render as a real `<table>` with the marker in a cell, not as literal `|` text.

{{% conditional-text include-if="test" %}}
| Column A | Column B |
| --- | --- |
| COND_DIRECT_TABLE cell | second cell |
{{% /conditional-text %}}

## Inline control

An inline conditional body in the middle of a sentence must still render inline, with no surrounding block element and the leading/trailing space preserved: start {{% conditional-text include-if="test" %}}COND_DIRECT_INLINE inline body{{% /conditional-text %}} end.

## Fenced code block as a conditional-text list-step continuation

A `conditional-text` block whose body's first non-blank line is an INDENTED
fenced code block (a list-item continuation; the `2.` marker is on the
preceding line, outside the block). If the shortcode `RenderString`s the fence
it emits a `<div class="hextra-code-block"><pre>` into the page's markdown
stream; the page parser then treats that block-level `<div>` as a CommonMark
HTML block, closes the enclosing `<li>`/`<ol>` early, and the code block
fragments — an empty `hextra-code-block` orphans outside the list, or
`</li></ol>` sweeps inside the `<pre>` and the following step leaks as raw
`3. …` text. The `isFencedBlock` check (inline in `conditional-text.html`)
raw-emits the indented fence instead, so the single outer render builds a
well-formed `<li>…<pre></li>` and the list stays intact.

1. First step before the conditional fence.
2. Apply the manifest:
{{% conditional-text include-if="test" %}}
   ```sh
   # COND_FENCEBLOCK_CODE
   echo "fenced code inside a conditional-text list step"
   ```
{{% /conditional-text %}}
3. COND_FENCEBLOCK_AFTER. Final step, which must continue the same `<ol>` rather than leak as raw text.

## Excluded heading (negative control)

The same heading shape under an `exclude-if` that matches the build condition. It must produce no output at all.

{{% conditional-text exclude-if="test" %}}
## COND_DIRECT_EXCLUDED heading that must never render
{{% /conditional-text %}}
