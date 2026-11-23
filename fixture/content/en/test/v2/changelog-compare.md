---
title: Changelog compare
weight: 400
description: Filters a Markdown changelog by version range, with the versions read from the headings.
# Direct-path fixture (see gate-transparency.md) so auto-cards.spec.ts's child
# count is unchanged; render:always keeps the page built for the spec to load.
build:
  list: never
  render: always
---

## Changelog entry types

This heading is not a version, so the compare filter must never hide it.

<!-- v2.5 sits ABOVE the shortcode on purpose: the agentregistry sync script
     inserts each new minor section straight after the front matter. The
     script must still list 2.5.0 and move the toolbar above this heading. -->

## v2.5

### 2.5.0

* The 2.5.0 release, inserted above the shortcode.

{{< changelog-compare >}}

## v2.4

### 2.4.1

#### Bug Fixes

* Fixed the 2.4.1 bug.

### 2.4.0

#### New Features

* Added the 2.4.0 feature.

| Field | Change |
| ----- | ------ |
| `spec.a` | Added in 2.4.0 |

### 2.4.0-beta.1

* The 2.4.0-beta.1 prerelease.

## v2.3

### 2.3.2

* The 2.3.2 patch.

### 2.3.1

* The 2.3.1 patch.

### 2.3.0

* The 2.3.0 release.
