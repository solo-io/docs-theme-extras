---
title: Resolving links
description: >-
  The link and link-hextra contract: what they resolve, and the calls that fail silently.
weight: 40
---

`link-hextra` is the canonical link resolver and `link` is an alias for it.
Both are easy to call wrongly, and a wrong call usually produces a real page
rather than a 404, so nothing catches it.

#### `link` / `link-hextra` contract

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
