---
title: link-hextra path shapes
weight: 400
description: Every path shape link-hextra accepts, and what each one emits. Backs tests/link-hextra-shapes.spec.ts.
# Direct-path fixture (see version-remap.md / gate-transparency.md) so
# auto-cards.spec.ts's expected child count is unchanged; render:always keeps the
# page built so link-hextra-shapes.spec.ts can read it.
build:
  list: never
  render: always
---

# link-hextra path shapes

Behavioral coverage for the `path` argument. Every call passes `version="v2"`
explicitly, because the fixture's URL pattern (`/test/v2/`) has no segment that
looks like a version, so auto-detection would warn. Version inference itself is
covered by `tests/link-hextra-lts-version.spec.ts`.

Each marker's `href` is asserted in `tests/link-hextra-shapes.spec.ts`.

## Supported shapes

Absolute path with both slashes, the canonical form:

- [SHAPE_CANONICAL]({{< link-hextra path="/everything/" version="v2" >}})

No trailing slash — one is appended, so the link does not eat a redirect:

- [SHAPE_NO_TRAILING]({{< link-hextra path="/everything" version="v2" >}})

Nested path:

- [SHAPE_NESTED]({{< link-hextra path="/reference/api-kubespec/policies/" version="v2" >}})

With a fragment — no trailing slash is appended, or the anchor would break:

- [SHAPE_FRAGMENT]({{< link-hextra path="/everything/#a-heading" version="v2" >}})

Fragment on a path that has no trailing slash of its own:

- [SHAPE_FRAGMENT_BARE]({{< link-hextra path="/everything#a-heading" version="v2" >}})

An explicit `version` overrides inference, which is how `rebase` retargets a
link into another version tree:

- [SHAPE_EXPLICIT_V1]({{< link-hextra path="/everything/" version="v1" >}})

## Shapes that are BROKEN

`path` must start with a slash. Without one the version segment and the path
fuse — `version="v2"` plus `everything/` emits `/test/v2everything/`, which is
not a page. Nothing warns, so this fails silently:

- [SHAPE_NO_LEADING]({{< link-hextra path="everything/" version="v2" >}})

A doubled slash IS collapsed, so that one is harmless:

- [SHAPE_DOUBLE_SLASH]({{< link-hextra path="//everything//" version="v2" >}})
