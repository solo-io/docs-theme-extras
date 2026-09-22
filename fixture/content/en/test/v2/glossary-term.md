---
title: Glossary term
weight: 95
description: Exercises the gloss shortcode, on the web page and in the book document.
---

Every call here is the CLOSED form, which is not a style choice: `gloss.html`
reads `.Inner`, so Hugo rejects `{{</* gloss "MCP" */>}}` on its own with
"shortcode must be closed or self-closed". Every real call site in
kgateway-oss and agentgateway-oss-website writes it the same way.

## A term the glossary knows, with no custom display text

Traffic is routed through {{< gloss "MCP" >}}{{< /gloss >}} before it reaches
the model. Empty inner content falls back to the key itself.

## A term with custom display text

The {{< gloss "Data Plane" >}}proxy layer{{< /gloss >}} applies the policy.

## A term the glossary does not know

There is no entry for {{< gloss "Nonexistent Term" >}}Nonexistent Term{{< /gloss >}},
so this renders as plain text with no tooltip and no markup.

## Terms whose "Learn more" link goes through the slot

Three link shapes, one per entry, so `docs/glossary-link.html` is exercised on
every branch it has. The {{< gloss "Data Plane" >}}data plane{{< /gloss >}}
entry above carries an EXTERNAL link and is the only one that may open in a new
tab. The {{< gloss "Control Plane" >}}control plane{{< /gloss >}} entry carries
a site-absolute link naming an upstream version, which the slot must rewrite
onto this page's own tree. The {{< gloss "Sidecar" >}}sidecar{{< /gloss >}}
entry carries a site-absolute link that names no upstream version, and must
pass through untouched.

Asserted by `tests/gloss-link.spec.ts`.
