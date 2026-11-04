---
title: Test status badge (passed, with test types)
weight: 397
description: Renders the doc-test badge with the kinds of test that ran listed in its tooltip.
test_status: passed
test_types:
- schema
- functional
- not-a-kind
# Direct-path fixture (see gate-transparency.md) so auto-cards.spec.ts's child
# count is unchanged; render:always keeps the page built for the spec to load.
build:
  list: never
  render: always
---

The badge, if any, renders under the page title.
