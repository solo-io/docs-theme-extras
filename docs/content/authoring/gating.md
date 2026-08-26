---
title: Gating content
description: >-
  Choosing between upstream, downstream, conditional-text and version when the
  same source has to produce different pages.
weight: 50
---

Four shortcodes hide or show content depending on where the page is being built.
They overlap enough that picking the wrong one is easy, and the failure is
usually silent — content simply does not appear, and nothing reports it.

## Which one to reach for

| Situation | Use |
| --- | --- |
| Content belongs to the OSS repo only | [`upstream`](../shortcodes/upstream/) |
| Content belongs to the enterprise repo only | [`downstream`](../shortcodes/downstream/) |
| Content belongs to one product or flavor | [`conditional-text`](../shortcodes/conditional-text/) |
| Content belongs to one version | [`version`](../shortcodes/version/) |

The dividing line between the first two and the last two is what the decision is
made from. `upstream` and `downstream` depend only on **which repo is building**,
so they are one bit and cannot express anything finer. `conditional-text` and
`version` take an **explicit condition**, which the page's own context is matched
against.

Prefer the explicit ones. A condition written in the content says what it means;
a `downstream` block only says "not here", and a reader has to know which repo
they are looking at to work out why.

## upstream and downstream

These are a pair, and each is a one-line template. This module ships the
**upstream** behavior, so here `upstream` emits its body and `downstream`
discards it. A downstream repo shadows both files to invert that.

> [!IMPORTANT]
> Content inside a `downstream` block is removed from the upstream build
> entirely. A link that appears only there is not a broken link upstream — it is
> absent. A link checker that flags it is reading the source rather than the
> output.

## conditional-text and version

Both take `include-if` or `exclude-if`, and both resolve their condition through
the same evaluator, `utils/gate-decide.html`. Give exactly one of the two on any
call.

`conditional-text` matches against the page's build condition, resolved through
`utils/page-context.html`, so it works under both the multi-product-hub and the
single-site URL conventions. `version` matches against the version the page is
being served at.

## Two failure modes worth knowing

**A gate inside a numbered list must wrap the whole list item**, including the
`1.` marker. Wrapping only part of an item detaches the remainder from the list,
and the result renders as a stray paragraph rather than as a step.

**A gate whose condition never matches is indistinguishable from a gate whose
body is empty.** Neither produces a warning. If content is missing from one
flavor and present in another, check the condition spelling before checking
anything else.
