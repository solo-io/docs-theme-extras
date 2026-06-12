---
title: Nav group
# linkTitle is deliberately different from title so sidebar-linktitle.spec.ts
# can prove the left nav (and the collapsible branch's toggle aria-label) uses
# linkTitle, not title. The auto-section-card on the version index still reads
# .Title, so it keeps showing "Nav group" — auto-cards.spec.ts is unaffected.
linkTitle: Nav grp
weight: 400
description: A section WITH child pages so the sidebar renders it as a collapsible branch (data-sidebar-item + sidebar-toggle). Exercised by sidebar-rail.spec.ts for the expand-state and scroll-restore behavior.
---

This section exists only to give the left nav a collapsible branch. The
`everything`/`rebased` fixture pages are leaf pages, so without a child-bearing
section the sidebar tree has no expandable item to test the chevron toggle and
its sessionStorage persistence against.
