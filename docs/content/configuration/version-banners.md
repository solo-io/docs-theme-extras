---
title: Version banners
description: >-
  Per-version and per-section banners, and how to translate their text.
weight: 15
---

A banner is the notice strip above the page content — "you are viewing the 2.3.x
version", "this section is in preview". Set `banner` on a version entry and it
renders on every page in that version:

```toml
[[params.versions]]
  version = "2.3.x"
  banner  = "You are viewing the 2.3.x version of the docs."
```

**That is the whole feature if your site is English-only.** Three of the five
products that use banners on the docs hub (`kgateway`, `gateway`, `istio`) set
nothing else. Skip to "Per-section banners" unless you translate.

## Translating a banner: `bannerID`

`banner` is always the English text, and there is no way to translate it in
place. To translate, add `bannerID` — a name you choose — and then define that
same name in the translation file. **Both halves are required**; the name is what
joins them.

The two halves live in different files, in the CONSUMING repo (this module ships
no banner translations):

```toml
# hugo-<product>.toml — English text, plus the name
[[params.versions]]
  version  = "2.3.x"
  banner   = "You are viewing the 2.3.x version of the docs."
  bannerID = "version_banner_review"        # <-- the name
```

```yaml
# i18n/ja.yaml — Japanese text, under that same name
version_banner_review: "{{ .productName }} の {{ .version }} バージョンのドキュメントを参照しています。"
```

What each reader gets:

| page | renders | why |
|---|---|---|
| `/<product>/2.3.x/…` | the TOML `banner` string | there is no `i18n/en.yaml`, so the lookup finds nothing and falls back to the literal |
| `/<product>/ja/2.3.x/…` | the `ja.yaml` string | the name matched |
| `/<product>/ja/…` with `bannerID` set but **no** matching `ja.yaml` entry | the English `banner` string | missing translations fall back silently — nothing errors |

English deliberately defines no keys: release automation updates the TOML
`banner`, so putting English in `i18n` too would create a second copy that goes
stale.

**One name can serve many entries**, and that is the point of `bannerID` rather
than a per-version string. The i18n value is rendered with the version entry as
its context, so `{{ .version }}` and `{{ .productName }}` fill themselves in.
On the docs hub, `version_banner_review` is a single `ja.yaml` line covering
**four** agentgateway version entries (`2026.7.1`, `2.3.x`, `2.2.x`, `2.1.x`):

- Same sentence for several versions → **one** name, interpolate the difference.
- Genuinely different sentence → a new name, and a new `ja.yaml` line.

Pick a name that describes the **message** ("this version is under review"), not
the version or section it happens to sit on. Naming it after a version defeats
the sharing above — you would need one translation per release, forever.

## Per-section banners

`banner`/`bannerID` on a version entry apply to every section that version ships.
When one version's sections sit at **different maturities**, override per section
on that same entry.

The example below uses two different `bannerID` names because the two banners say
different things, and a preview notice cannot reuse a "this is the latest version"
translation. The names are unrelated to the `latest` version segment above them.

```toml
[[params.versions]]
  version     = "latest"
  linkVersion = "latest"
  sections    = ["kubernetes", "standalone"]
  banner      = "This is the latest version of the docs."
  bannerID    = "version_banner_latest"

  # Applies only under /<product>/standalone/latest/…
  [params.versions.sectionBanners.standalone]
    banner   = "PREVIEW ONLY. This section describes an upcoming release."
    bannerID = "version_banner_preview"
```

```yaml
- version: "latest"
  linkVersion: "latest"
  sections: ["kubernetes", "standalone"]
  banner: "This is the latest version of the docs."
  bannerID: "version_banner_latest"
  sectionBanners:
    standalone:
      banner: "PREVIEW ONLY. This section describes an upcoming release."
      bannerID: "version_banner_preview"
```

- A section that declares an override gets it **instead of** the entry-level
  banner, not stacked with it. "Under development" beside "this is the latest
  version" reads as a contradiction, and the maturity notice is the one that
  matters.
- A section with no override falls back to the entry-level banner.
- An entry with no `sectionBanners` behaves exactly as before, so this changes
  nothing for a consumer that does not set it.
- An override that sets `banner` but no `bannerID` renders **untranslated**. It
  does not inherit the entry's `bannerID`, deliberately: that would show the
  preview text under the "this is the latest version" translation — wrong in
  Japanese, and invisible in English.
- An override that sets only `bannerID` and no `banner` is ignored, rather than
  applying a translation to the entry-level text.
- `bannerID` works the same way here as above, with one addition: the i18n
  context also carries `.section`, so a single name can cover several sections
  ("the {{ .section }} docs are in preview") instead of one name each.

**Do not split a version into two entries to give its sections different
banners.** It builds clean and then misroutes: the enterprise resolver matches
against the unfiltered version list, so both sections receive whichever duplicate
`linkVersion` is listed first. That put a `standalone` preview banner on 327
Kubernetes pages on the docs hub. Rule 1 below is the invariant this respects.
