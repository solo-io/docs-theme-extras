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

## Excluded heading (negative control)

The same heading shape under an `exclude-if` that matches the build condition. It must produce no output at all.

{{% conditional-text exclude-if="test" %}}
## COND_DIRECT_EXCLUDED heading that must never render
{{% /conditional-text %}}
