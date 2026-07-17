---
title: Hextra include target
description: Fixture page whose body is pulled into another page via Hextra's include shortcode.
build:
  list: never
  render: always
---

MARKER_INCLUDE. This paragraph lives on a separate page and is rendered into `everything.md` via Hextra's `include` shortcode. Hidden from sidebar/section listings via `_build.list: never` so it doesn't pollute nav.
