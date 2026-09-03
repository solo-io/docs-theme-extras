---
title: Kubernetes spec reference
weight: 30
description: Sibling of the single-page API reference. Its whole job is to be a reference/api-* path that link-hextra must NOT mangle into reference/api/api-kubespec/.
# Same `list: never` / `render: always` pattern as the sibling reference/api
# subtree. See reference/_index.md for why the whole subtree is hidden but
# still built.
build:
  list: never
  render: always
---

This section is the negative case for `link-hextra`'s `reference/api` routing.
`api-kubespec` starts with `api` but is a sibling section, not the single-page
API reference, so the enterprise rewrite has to leave it alone. The regression
it guards is a shipped one: the rewrite used to produce
`/reference/api/api-kubespec/…`, a path that exists on no site.

The page under it is [Policies](policies/).
