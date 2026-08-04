---
title: Version remap (v3)
weight: 900
description: The v3 half of the keepVersion collision probe for reuse.html's OSS-to-enterprise remap.
# Kept out of sidebar/section-card listings so it doesn't disturb the tab
# navigation this version exists to demo; render:always keeps the page built so
# reuse-version-remap.spec.ts can read it. Sits at the version root rather than
# inside a tab directory, so it belongs to no tab.
build:
  list: never
  render: always
---

The v1 version entry sets `ossVersion = "v3"`, so reuse.html's OSS→enterprise
remap rewrites the token `v3` to `v1` inside `include-if`. This page is the
positive half of the collision probe: the `keepVersion="true"` row in the reused
table carries the token `v3` and must survive that remap to render HERE, while
the plain row carrying the same token is remapped and renders on v1 instead.

{{< reuse "conrefs/test/version-remap.md" "v3" "test" >}}
