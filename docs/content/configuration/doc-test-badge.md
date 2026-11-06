---
title: Doc-test badge
description: >-
  Showing readers a "Verified" badge on pages whose code examples passed
  automated doc tests.
weight: 35
---

A page whose code examples passed the automated doc tests in
[solo-io/docs-tests](https://github.com/solo-io/docs-tests) can show a green
"Verified" badge under its title. Hovering over or focusing the badge shows a
tooltip that explains what it means. Pressing the Escape key closes the
tooltip, and screen readers read the explanation without needing the tooltip.

The badge is built into this module's docs page layout, so a consumer site needs
no layout file for it. **Bumping the module pin alone changes no page.** The
badge appears only on a page whose front matter says `test_status: passed`, and
no committed page carries that field.

## What turns it on

Your CI writes `test_status` into page front matter just before the production
build, with `scripts/doc_test_inject_status.py` from docs-tests. The script reads
the latest doc-test results and writes one of three values:

| Value | Meaning | Badge |
|---|---|---|
| `passed` | Every test scenario on the page ran and passed. | Yes |
| `failed` | At least one scenario failed. | No |
| `partial` | No scenario failed, but at least one was skipped because its test annotations no longer match the page. | No |

For a `passed` page, the script also writes `test_types`, the kinds of test
that ran on it, such as `[kubernetes, helm, functional]`. The tooltip lists each
kind with a short description. A kind the module has no wording for is skipped,
and a page without `test_types` shows the generic sentence.

The schema check reports what it validated on the page itself: `kubernetes` for
Kubernetes resources, `config` for configuration files, and `helm` for Helm
values. A standalone page with only configuration files therefore never
mentions Kubernetes. Older results report only the generic `schema` kind.

A page without the field shows no badge. A site that never runs the inject step
therefore renders exactly what it rendered before the badge existed.

Don't commit `test_status` to a page. The value goes stale the moment the page
or the product changes, and a stale `passed` claims the examples work when
nothing checked them.

## Preview it locally

Add `test_status: passed` to one page's front matter, build or serve the site,
and remove the field before you commit.

## Where it renders

The badge renders on docs detail pages, inside the heading column, under the
`<h1>` and any release badges. When the title area stacks on a narrow screen,
the badge stays before the copy and context buttons. The
`docs/under-heading.html` slot renders directly after it.

The styles are the `.test-status-*` rules in `assets/css/docs-theme-extras.css`,
including a dark mode variant.

A custom layout, such as an API reference page, might not use this module's
docs page layout. It can show the badge by calling the partial itself:

```go-html-template
{{ partial "components/test-status-badge.html" . }}
```

## Change the wording

The label and the tooltip text come from the module's i18n files, with English
and Japanese built in. To change them, or to add another language, set these
keys in your site's `i18n/<lang>.yaml`:

| Key | Default (English) |
|---|---|
| `testStatusVerified` | Verified |
| `testStatusVerifiedTooltip` | Code examples on this page have been automatically tested and verified. |
| `testStatusTypesIntro` | Automated tests passed for: |
| `testTypeKubernetes`, `testTypeKubernetesDescription` | Kubernetes resources; The Kubernetes resources on this page were checked against their API schemas. |
| `testTypeConfig`, `testTypeConfigDescription` | Configuration files; The configuration files on this page were checked against their schema. |
| `testTypeSchema`, `testTypeSchemaDescription` | Code examples; The code examples on this page were checked against their schemas. |
| `testTypeHelm`, `testTypeHelmDescription` | Helm values; The Helm values on this page were checked against the values the chart accepts. |
| `testTypeFunctional`, `testTypeFunctionalDescription` | End-to-end run; Every step ran in a fresh test environment and the results were checked. |
| `testTypeLive`, `testTypeLiveDescription` | Live services; Requests went to a real external endpoint. |
| `testTypeCredentialed`, `testTypeCredentialedDescription` | Real provider account; The steps ran against the real provider with a test account. |

## Upgrading from a site-local badge

Before v0.3.18, a site showed the badge by overriding the
`docs/under-heading.html` slot. Bumping to v0.3.18 or later does not show two
badges. If your override's output already contains `test-status-badge`, the
docs page layout skips its own. However, your page then keeps your older badge,
without the module's screen reader, keyboard, and translation fixes. Delete the
following in the same pull request as the bump:

- Your `layouts/partials/docs/under-heading.html` override, if all it does is
  call a badge partial.
- Any site-local copy of the badge partial, such as
  `layouts/partials/test-status-badge.html`.
- Any site-local `.test-status-*` CSS rules.

The class names match the original agentgateway.dev badge, so nothing else
changes.
