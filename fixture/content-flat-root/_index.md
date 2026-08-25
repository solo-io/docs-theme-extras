---
title: "Flat root home"
linkTitle: "Home"
description: Marketing-style home page of the root-shape version-less fixture. The doc sets live under the docs/ content directory, not under the baseURL.
cascade:
  type: docs
---

The marketing home page. The `cascade: type: docs` is deliberate — it is the
configuration that makes `site.Home` look like a docs page and historically
made the sidebar root at the merged whole-site tree. The orphan-suppression
assertions in tests/section-versionless.spec.ts depend on this page keeping it.
