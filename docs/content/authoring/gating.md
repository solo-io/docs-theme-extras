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
made from. `upstream` and `downstream` depend only on **which render path the
file took**, so they are one bit and cannot express anything finer.
`conditional-text` and `version` take an **explicit condition**, which the page's
own context is matched against.

Prefer the explicit ones. A condition written in the content says what it means;
a `downstream` block only says "not here", and a reader has to know how the file
got there to work out why.

## upstream and downstream

These are a pair, and each is a one-line template with no condition in it:
`upstream` emits its body, `downstream` discards it, always. That is correct for
a **direct render** — the OSS site building its own content.

The inversion is done by **filtering the source text** before either template
runs — stripping `upstream` blocks and unwrapping `downstream` ones. That
filtering lives in two places, which between them cover every way content
crosses the boundary:

- [`rebase`](../shortcodes/rebase/) Stage 3b, for a file the downstream repo
  rebases directly.
- [`reuse`](../shortcodes/reuse/), for a file that arrives one or more levels
  down through a `reuse` call.

| Render path | `upstream` body | `downstream` body |
| --- | --- | --- |
| Direct (OSS site renders its own file) | rendered | dropped |
| Through `{{%/* rebase */%}}` | stripped | rendered |
| Through `{{%/* rebase */%}}` → `{{%/* reuse */%}}` | stripped | rendered |
| Through `{{%/* reuse */%}}` on the OSS site | rendered | dropped |

The reuse half is the one that matters in practice, and it did not exist before
0.3.5. A downstream repo often does not rebase the content file at all: the docs
hub rebases a one-line `content/docs/<section>/<ver>/…` stub whose entire body is
a single `reuse` call, so Stage 3b only ever sees the stub and everything under
`assets/agw-docs/pages/` arrives one level down. Until reuse gained the same
filters, every `upstream` block in that tree rendered on **both** sides.

> [!NOTE]
> `reuse` decides which answer to give from the version that `rebase` injects
> into its call, so a native OSS render — where nothing injects a version — keeps
> the direct-render behavior. Writing that version argument by hand in content is
> the one way to confuse it, which is why the [`reuse`](../shortcodes/reuse/)
> parameters are documented as belonging to the rebase pipeline rather than to
> authors.

Use **percent form** — `{{%/* upstream */%}}`, not `{{</* upstream */>}}`. These
templates emit `.Inner` untouched, so in angle form the body is substituted after
Goldmark has run and any headings, lists, or fences in it survive as literal
text. Percent form re-enters the Markdown stream. Rebase converts percent to
angle before Stage 3b runs, so percent-form tags are still stripped downstream.

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
