---
title: Resolving links
description: >-
  The link and link-hextra contract: what they resolve, and the calls that fail silently.
weight: 40
---

`link-hextra` is the canonical link resolver and `link` is an alias for it.
Both are easy to call wrongly, and a wrong call usually produces a real page
rather than a 404, so nothing catches it.

## Which one to write

A plain Markdown link is the default. The shortcode is the exception, for one
case.

| Where the link goes | Write |
| --- | --- |
| A page in the same product and version tree as the page you are editing | `[text]({{</* link-hextra path="/guides/gateway/" */>}})` |
| Another product, another flavor, or a fixed version | `[text](/docs/kubernetes/guides/gateway/)` |
| Anywhere off this site | `[text](https://example.com)` |

The test for the first row is whether the target moves when the page does. A
link between two pages in the same tree has to follow that tree into every
version and every product the content is reused into, and the version segment it
needs is different in each one. That is the whole reason the shortcode exists. A
link to a different product is not going to move, so writing it out is both
shorter and more honest about what it is.

## What the shortcode does to your path

It prepends the current product and version prefix to the path you give it, and
emits the finished URL as bare text. Nothing more.

```md
[the quickstart]({{</* link-hextra path="/quickstart/" */>}})
```

```
path="/quickstart/"                 ← what you write
/docs/envoy/2.1.x/                  ← inferred from the page being built
/docs/envoy/2.1.x/quickstart/       ← what lands in the href
```

Two consequences are worth holding on to, because most confused calls come from
missing one of them:

- **The output is a URL, not a link.** The shortcode goes inside the parentheses
  of an ordinary Markdown link, and you still write the link text yourself.
  Calling it on its own line prints a raw URL on the page.
- **The prefix is inferred, not passed.** The product and version come from the
  page being built, which is why the same source file can be reused across
  versions and land on the right page in each. It is also why there is no
  sensible way to point the shortcode outside that tree.

Plain Markdown links are not left alone either, though what happens to them is
much smaller: a [render hook](../render-hooks/) resolves internal ones with
`relURL`. It does not know about versions, so it will not rewrite a path for
you.

## `link` / `link-hextra` contract

It resolves an **internal path within the current product and version tree** into
an absolute URL. That is the whole job. If there is no version to resolve, this
is the wrong tool.

**Parameters — these three, and no others:**

| Param | Required | Meaning |
|---|---|---|
| `path` | yes | Site path **within the version tree**. A leading `/` is added if missing. Not a full URL. |
| `version` | no | Overrides inference. This is what `rebase` injects to retarget a link into another version tree. |
| `product` | no | Enables the enterprise `reference/api` and `reference/cel` routing. Injected by `rebase`. |

```md
{{</* link-hextra path="/quickstart/" */>}}                 → /docs/envoy/2.1.x/quickstart/
{{</* link-hextra path="/reference/api/#TypeA" */>}}        → …/reference/api/#TypeA
{{</* link-hextra path="/quickstart/" version="2.0.x" */>}} → …/2.0.x/quickstart/
```

**What does NOT work:**

| You write | What happens |
|---|---|
| `link=`, `url=`, `href=` | **Not read.** `path` is empty, so it emits the bare version root — usually a real page, so nothing 404s and the wrong link ships. Warns since v0.2.0. |
| An external URL in `path=` | There is nothing to resolve. Use a plain markdown link. |
| A cross-product or cross-flavor path | It only moves *within* one version tree. Use a plain absolute link, e.g. `[Kubernetes](/docs/kubernetes/)`. |
| `path="/page#anchor"` (no slash before `#`) | Emits `/page#anchor`, which takes a 301 before scrolling. Write `/page/#anchor`. |

A missing **leading** slash is added for you (`path="quickstart/"` resolves the
same as `path="/quickstart/"`), a missing **trailing** slash is added for you,
and doubled slashes are collapsed.

Behavior is pinned by `tests/link-hextra-shapes.spec.ts` against
`fixture/content/en/test/v2/link-hextra-shapes.md`, which includes the broken
shapes above so they stay documented rather than rediscovered.
