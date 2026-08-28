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

The version you name must still be present in `params.versions`. Retiring a
version means removing its content and hiding it from the picker with a blank
`dropdown`, not deleting its entry — the entry is what makes the value
recognizable. An unrecognized value renders nothing at all.

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
