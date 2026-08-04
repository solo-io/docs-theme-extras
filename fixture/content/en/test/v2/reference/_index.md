---
title: Reference
weight: 500
description: Parent section for the generated-API-reference stand-in pages that the link-hextra reference/api markers resolve to.
# Kept out of sidebar and section-card listings (the same `list: never` pattern
# version-remap.md uses) so adding this subtree doesn't change the expected card
# count in auto-cards.spec.ts or the sidebar trees sidebar-rail.spec.ts walks.
# `render: always` is the point of the subtree: the MARKER_APIREF_* links on the
# Everything and Rebased pages have to land on files that exist, and the link
# checker verifies their `#TypeA` anchors once they do.
build:
  list: never
  render: always
---

This section stands in for a product's generated API reference. It carries no
shortcode coverage of its own. The pages under [API](api/) exist as link targets
for the `MARKER_APIREF_*` links on the Everything and Rebased pages, which
`link-hextra` routes to a different path per brand.
