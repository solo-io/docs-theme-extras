---
title: Everything
weight: 100
description: Every shortcode the framework cares about, in one page, with sentinel strings tests can grep for.
---

The page exists to exercise every shortcode pattern in a single place. Tests assert the rendered HTML, so sentinels of the form `MARKER_*` and `COND_*` are placed where each pattern's correctness can be verified. Sections are ordered alphabetically by heading. The body is shared across versions via the `reuse` shortcode; per-version content is gated by the `version` shortcode against the page's URL section.

{{< reuse "conrefs/test/everything.md" >}}
