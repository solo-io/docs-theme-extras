---
title: Nav group child
# linkTitle differs from title so sidebar-linktitle.spec.ts can assert the leaf
# nav label uses linkTitle. Its sibling fixture pages (everything, rebased, …)
# set no linkTitle, so they cover the .Title fallback in the same sidebar.
linkTitle: NG child
weight: 10
description: Child page of nav-group. Its presence makes nav-group a collapsible branch in the left nav.
---

MARKER_NAVGROUP_CHILD. A child page so its parent section renders as an
expandable sidebar branch.
