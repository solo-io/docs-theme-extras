---
title: Nav group
weight: 400
description: A section WITH child pages so the sidebar renders it as a collapsible branch (data-sidebar-item + sidebar-toggle). Exercised by sidebar-rail.spec.ts for the expand-state and scroll-restore behavior.
---

This section exists only to give the left nav a collapsible branch. The
`everything`/`rebased` fixture pages are leaf pages, so without a child-bearing
section the sidebar tree has no expandable item to test the chevron toggle and
its sessionStorage persistence against.
