---
title: Gating
weight: 10
description: Exercises version gating on a tree whose URL slug differs from its canonical version.
---

This page lives at `/test/v4-link/` while its canonical version is `v4`. Each
block below is gated on a different token, so the built HTML shows exactly which
tokens `version` accepts. Asserted by `tests/version-linkversion.spec.ts`.

The markers use the `MARKER_` prefix on purpose: that is the prefix
`tests/gate-containment.spec.ts` scans for, so each rendered block is also
snapshotted by its DOM ancestor path. Gated content being *ejected* out of
`div.content` (and so rendering unstyled) is a separate failure from being
gated wrongly, and the ancestor-path snapshot is what catches it.

## Canonical version token

The production case: an author writes the release number, but the page is served
under a stable slug (gloo-mesh serves canonical `2.13.x` at `/latest/`).

{{% version include-if="v4" %}}
MARKER_GATE_CANONICAL_INCLUDED
{{% /version %}}

## linkVersion token

The slug itself must keep working, so `include-if="main"` never needs a
per-release bump.

{{% version include-if="v4-link" %}}
MARKER_GATE_LINKVERSION_INCLUDED
{{% /version %}}

## Excluded by canonical version

{{% version exclude-if="v4" %}}
MARKER_GATE_CANONICAL_EXCLUDED_LEAK
{{% /version %}}

## Excluded by linkVersion

{{% version exclude-if="v4-link" %}}
MARKER_GATE_LINKVERSION_EXCLUDED_LEAK
{{% /version %}}

## Another version's token

Gating on a version this page is not must emit nothing, or the whole mechanism
is decorative.

{{% version include-if="v2" %}}
MARKER_GATE_OTHER_VERSION_LEAK
{{% /version %}}

## Excluding another version's token

Inverse of the above: excluding a version this page is NOT should still emit.

{{% version exclude-if="v2" %}}
MARKER_GATE_EXCLUDE_OTHER_INCLUDED
{{% /version %}}
