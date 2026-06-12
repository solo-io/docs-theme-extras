---
title: Nav group child
# linkTitle differs from title so sidebar-linktitle.spec.ts can assert the leaf
# nav label uses linkTitle. Its sibling fixture pages (everything, rebased, …)
# set no linkTitle, so they cover the .Title fallback in the same sidebar.
linkTitle: NG child
# `icon` is a Material Symbols glyph name. It makes this the fixture leaf that
# proves render-sidebar-tree emits <i class="material-icons sidebar-icon"> for a
# page with `icon` set. Its sibling `everything` sets the enterprise/oss badge
# flags but no icon, so the two pages are each other's negative case in the same
# v2 sidebar (icon-but-no-badge here, badges-but-no-icon there). Regression guard
# for the sidebar dropping icon/badge support (solo-io/docs#2727 follow-up).
icon: rocket_launch
weight: 10
description: Child page of nav-group. Its presence makes nav-group a collapsible branch in the left nav.
---

MARKER_NAVGROUP_CHILD. A child page so its parent section renders as an
expandable sidebar branch.
