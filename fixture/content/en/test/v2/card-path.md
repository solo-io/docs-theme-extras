---
title: Card path
weight: 950
description: Exercises the card shortcode's path= branch, which resolves against the current version root.
---

`{{</* card path="…" */>}}` resolves its href against the page's own version
root, unlike `link=`, which is used verbatim. That branch had no fixture at all
until this page: every other fixture card passes `link=`.

The href these must produce is `/test/v2/<path>` — **with** the version segment.
Dropping it is a real, shipped failure mode: the docs hub's own `card.html`
override derived the prefix straight from `.Page.FirstSection.RelPermalink`,
which returns the *section* rather than the version once a product nests its
version trees under a section segment, and it emitted 178 version-less hrefs
across the agentgateway docs. Asserted by `tests/card-path.spec.ts`.

{{< cards >}}
  {{< card path="/rebased/" title="MARKER_CARD_PATH_ABS Absolute path" subtitle="Leading slash; must resolve under the current version root." icon="document" >}}
  {{< card path="rebased/" title="MARKER_CARD_PATH_REL Slashless path" subtitle="No leading slash; must not fuse with the version segment." icon="document" >}}
  {{< card path="/reference/" title="MARKER_CARD_PATH_NESTED Nested path" subtitle="A child section, to confirm deeper paths keep their structure." icon="document" >}}
  {{< card path="/rebased/#companion" title="MARKER_CARD_PATH_FRAGMENT Path with fragment" subtitle="A fragment must survive and must not gain a trailing slash." icon="document" >}}
{{< /cards >}}
