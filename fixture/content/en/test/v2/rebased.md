---
title: Rebased
weight: 200
description: The same content as the Everything page, rendered through the rebase shortcode.
---

The page below is rendered by the `rebase` shortcode reading from `assets/conrefs/test/everything.md`. It exercises the rebase pipeline: percent-shortcode rewriting, link rewriting, and the two-pass OSS-to-enterprise version remap. Tests assert the rendered HTML on this page contains the same `MARKER_*` and `COND_*` sentinels as the [Everything](../everything/) page when the version filter matches.

{{< rebase file="conrefs/test/everything.md" >}}
