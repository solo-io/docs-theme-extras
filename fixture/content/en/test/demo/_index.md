---
title: Demo section landing
weight: 900
description: >-
  A SECTION landing page, used to pin that the left nav is suppressed on the
  splash pages that sit above the version trees.
---

`demo` is a registered section (`[params.sections.demo]`), and this page's URL
ends at it, so this is a section **landing** page: a "pick your version" splash
that sits ABOVE the version trees and therefore has no single tree to show a
nav for.

The left nav must be suppressed here. That suppression already existed, but it
tested for the literal OSS shape `/docs/<section>/`, so it never fired for the
docs hub, which serves the same page at `/<product>/<section>/` in production
and `/<section>/` under `hugo server` — leaving agentgateway's `/kubernetes/`
and `/standalone/` splash pages with a full left nav for a version tree that
does not exist at that level.

This page is the enterprise-shaped probe (`/test/demo/`). Asserted by
`tests/section-landing.spec.ts`.

It deliberately carries NO `version-cards`. The real landing pages do, but this
fixture's versions live at `/test/<version>/`, not `/test/demo/<version>/`, so
the cards would emit four hrefs to pages that do not exist — broken links added
to the fixture for no gain. `version-cards` is already covered on `/test/` by
`tests/version-cards.spec.ts`, including the section-scoped form.
