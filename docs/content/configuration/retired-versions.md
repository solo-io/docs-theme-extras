---
title: Retired versions
description: >-
  Telling a reader that the version they asked for is gone, after a hosting
  redirect has already moved them.
weight: 17
---

When a version is retired, the usual handling is a path-preserving 301 in the
hosting config. That is the right mechanism, and it is silent: the reader clicks
a link to 2.1.x, the address bar says something else, and nothing on the page
accounts for the difference.

This module renders a notice that explains the move, but **it does nothing until
your hosting config opts in.** Bumping the module pin alone changes no page.

## What you have to add

Append `?fromversion=` to the redirect destination, naming the version that was
retired:

```json
{
  "source":      "/agentgateway/2.1.x/:path*",
  "destination": "/agentgateway/kubernetes/latest/:path*?fromversion=2.1.x"
}
```

Firebase merges that with any query string the reader already had, so
`?fromversion=2.1.x&foo=bar` works and the reader's own parameters survive.

Cloudflare Pages and Netlify take the same idea in their own format:

```
/docs/1.0.x/*  /docs/latest/:splat?fromversion=1.0.x  301
```

**That is the whole opt-in.** Nothing else to configure, and in particular
nothing to keep in `params.versions` — see below.

## Where the recognized versions come from

`fromversion` arrives in a URL, so it is reader-controlled. It is matched
against a list and used to select a known string; it is never written into the
page. That list is built by `utils/retired-versions.html` from three sources,
unioned:

| Source | For |
|---|---|
| `static/_redirects` | Cloudflare Pages / Netlify. Read from the project root. |
| `firebase.json` | Firebase Hosting. Every target's `redirects` array is walked. |
| `params.retiredVersions` | An explicit list, when your redirects live somewhere a template cannot read — an edge worker, an ingress rule. |

In all three the version comes from `fromversion=` in the **destination**, never
from the source pattern. A redirect exists for plenty of reasons that are not a
retirement, so only the rules that appended the parameter are claiming the
version is gone.

Both files are read from the project root, and a missing one costs an empty read
and contributes nothing. A file that cannot be parsed also contributes nothing
rather than failing the build.

> [!NOTE]
> This used to read `params.versions` instead, which meant a retired version's
> entry had to stay in that table forever — rendering nothing, hidden from the
> picker with a whitespace `dropdown`, present only to be matched against.
> Nothing enforced that and nothing announced it, so deleting the entry along
> with the content silently turned the notice off. Reading the redirects
> themselves makes the two impossible to separate: the rule that moves the
> reader is the rule that explains the move.

`retiredVersionsFiles` overrides which paths are read. It exists so this
module's own fixture can point at an on-disk path, because a `_redirects` in
the module's top-level `static/` would be mounted into every consumer's site
root. You should not need it.

## What the reader sees

Two different pages consume the parameter:

| the topic still exists at the new path | the topic is gone too |
|---|---|
| the notice, above the content: "You followed a link to version 2.1.x, which is no longer published. This page is from the latest version." | the 404's lede is replaced: "The documentation for version 2.1.x is no longer published, so you were sent to latest. This topic does not exist in latest — it was renamed or removed." |

Both then strip the parameter with `history.replaceState`, so the URL a reader
copies is the canonical one and a crawler does not see two URLs for one page.
The notice is dismissible, and deliberately does not remember the dismissal: it
is tied to one arrival from one stale link, not to a site-wide preference.

## Translating it

Both string sets fall back to English and are overridden by an i18n key in the
consuming repo, the same way [`bannerID`](../version-banners/) works.

```yaml
# i18n/ja.yaml
retired_version_notice: "リンク先のバージョン {from} は公開を終了しました。このページは {current} のものです。"
not_found_heading: "ページが見つかりません。"
not_found_lede_retired: "バージョン {from} のドキュメントは公開を終了したため、{current} に移動しました。このトピックは {current} には存在しません。"
```

`{from}`, `{current}`, `{latest}` and `{productName}` are **literal braces**, not
Go template actions. Neither version is known when the page is built — `from`
arrives in the query string at read time — so the substitution happens in the
browser. Write the braces exactly as shown; a translation that drops one loses
that value from the sentence.

The 404's keys are all prefixed `not_found_`: `title`, `code`, `heading`,
`lede`, `status`, `try_instead`, `home`, `noscript`, `lede_retired`,
`note_latest`, `note_ancestor_current`, `note_ancestor_latest`,
`note_home_current`, `note_home_latest`. A missing key falls back to English
silently and logs no warning.

## What it does not do

- **No notice on a site with no `params.versions`.** The partial emits nothing
  at all — no markup, no script — so a version-less site is unaffected.
- **No automatic redirect from the 404.** Every destination is offered as a
  link. A reader is already at a broken URL, and bouncing them somewhere they
  did not ask for hides that.
- **The value is never echoed.** `fromversion` arrives in a URL and is
  reader-controlled, so it is matched against your configured versions and used
  to select a known string. It is never written into the page.
