---
title: Nested page
weight: 10
description: A leaf page inside a section-nested version tree.
---

A leaf page at `/test/nested/v2/page/`.

This page exists so the left nav on a section-nested version tree has something
to list. An empty nav is the silent failure mode when
`version-root.html` builds its `lookupPath` without the section segment: the
page still renders, the breadcrumb still works, and only the tree is missing.

It also gives the version dropdown a path to preserve. Switching to `v1` from
here must land on `/test/nested/v1/page/` — same section, same path below the
version — rather than dropping to a version root or crossing into another
section's tree.
