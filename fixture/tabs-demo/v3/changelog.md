---
title: Changelog
weight: 40
tab: Changelog
description: Release notes for recent versions.
---

<!-- Demo content for the tab-navigation prototype (solo-io/docs#3164). A single
     top-level leaf pinned to the Changelog tab via `tab: Changelog`. Because it
     is a leaf, clicking the Changelog tab lands directly here. -->

Release notes for recent versions, newest first.

## 3.0.0

- Added the tab-navigation band, which groups top-level sections into tabs.
- Introduced the `Route` resource as the successor to the legacy mapping API.
- Improved control-plane startup time on large clusters.

> [!IMPORTANT]
> The legacy mapping API is removed in this release. Migrate to `Route` before
> you upgrade.

## 2.9.0

- Added least-request load balancing.
- Fixed a reconciliation loop that could delay config updates.
- Updated the bundled proxy to the latest patch release.
