---
title: "Alpha first page"
description: An ordinary topic page one level below the alpha section landing.
weight: 1
---

Alpha content.

## Gating

The control for the empty-condition guard on this section's landing page. At
`/docs/alpha/first/` the path carries a section and a following segment, so
`utils/page-context.html` in `url` mode resolves the condition to the section
itself (`alpha`) — the OSS convention where the two axes are one. The section
segment resolves to `alpha` as well and is a harmless duplicate.

So the first gate must render and the second must not. Without the first, the
landing page's "must not appear" assertion would pass on a build where gating is
simply broken everywhere. Asserted by `tests/section-versionless.spec.ts`.

Naming this page's own doc set — renders:

{{% conditional-text include-if="alpha" %}}COND_SEC_FLAT_SECTION{{% /conditional-text %}}

Naming the other doc set — dropped:

{{% conditional-text include-if="beta" %}}COND_SEC_FLAT_OTHER{{% /conditional-text %}}

## The only `link` call on a version-less site

Until this line, nothing in this fixture called `link` or `link-hextra` at all,
so the version-less branch of `utils/resolve-link.html` — the one that derives
`$versionRoot` from `.Page.FirstSection.RelPermalink` — emitted nothing any
test could read, on any of the four flat builds. That branch was doubling this
site's `/docs` baseURL path into every href it produced, in production as well
as in dev, and no build here could show it.

The target is a real page (`alpha/beta/`, the name-collision directory above),
so this stays a working link. Asserted by `tests/dev-subpath-baseurl.spec.ts`,
which pins the PREFIX only — that the href starts with the baseURL path once
and not twice. What sits between that prefix and the target is FirstSection
semantics and belongs to whatever spec wants to pin it next.

[PROBE_FLAT_LINK]({{< link path="/beta/" >}})
