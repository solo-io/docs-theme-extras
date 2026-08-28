---
title: "Alpha"
description: Landing page for the alpha doc set, whose title is the label source for its section chip.
weight: 1
---

The alpha doc set.

## The empty-condition guard

`conditional-text` gates on two tokens, the build condition and the section
segment, but only ever *inside* a `condition != ""` guard. This page is the one
place in the fixture where those two disagree, and it is the reason the guard
is written that way.

`utils/section-segment.html` resolves `alpha` here through its positional
condition (c) — a registered key one segment below the docs root on a site with
no versions at all. `utils/page-context.html` in `url` mode resolves nothing:
it assigns a condition only when the path carries a section AND a version, and
`/docs/alpha/` has no version because this site has none. So the segment is
live and the condition is `""`.

Drop the guard and the gate below starts firing, which would mean a version-less
site suddenly rendering content it has never rendered. It must not appear. The
non-vacuous control is `first.md` one level down, where the same gate DOES fire.
Asserted by `tests/section-versionless.spec.ts`.

{{% conditional-text include-if="alpha" %}}COND_SEC_FLAT_GUARD{{% /conditional-text %}}
