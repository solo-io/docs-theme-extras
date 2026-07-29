---
title: Changelog
weight: 40
description: Release notes for recent versions.
---

<!-- Demo content for the tab-navigation prototype (solo-io/docs#3164).
     Directory model: this dir is the "Changelog" tab (docTabs id =
     "changelog"). It holds a single page, so clicking the Changelog tab lands
     on this section index. -->

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
