---
title: llms.txt
description: >-
  How the module builds llms.txt as an index of per-version files, and the
  params that tune it.
weight: 32
---

The module publishes `llms.txt` as an index for AI agents, not as a dump of every page. The root file and every section above a version tree link to other `llms.txt` files. Only a version, a section inside a version, or a leaf section such as a blog lists its pages in full. The module does not publish `llms-full.txt`, because one version of a docs site is several megabytes of Markdown, which is more than most agents can read in one request.

## Turn it on

Add the `llms` output format to the home page and to sections.

```yaml
outputs:
  home: [HTML, RSS, llms]
  page: [HTML, markdown]
  section: [HTML, RSS, markdown, llms]
```

Without `llms` on `section`, the index still renders, but its links fall back to each section's `.md` page, or its HTML page when `markdown` is off too.

## What each file contains

| File | Contents |
|---|---|
| `/llms.txt` | One heading per top-level section. Each version is a single link to its own `llms.txt`. A leaf section lists its first few pages and links to its full list. |
| A section above a version tree, such as `/docs/` or `/docs/<product>/` | The same index shape, starting from that section. |
| A version root, such as `/docs/<product>/latest/` | Every page in the version, grouped under one heading per subsection. |
| A section inside a version tree | Every page in that section. |
| A leaf section with no subsections, such as `/blog/` | Every page in that section. |

Version detection uses the same resolver as the version banner and the sidebar, `utils/version-root.html`, so the OSS `/docs/<product>/<version>/` shape and the docs hub `/<product>/<version>/` shape behave the same way.

Within a list of versions, `latest` comes first and `main` comes last. The other versions keep their weight order. An agent that takes the first link reads the current release, not unreleased docs.

Each page entry links to the page's `.md` URL and uses its front matter `description` as the summary. A page without a description falls back to Hugo's auto-summary, cut before the first callout.

## Params

```yaml
params:
  llms:
    docsIntro: agentgateway is an open source proxy and gateway for agent traffic.
    leafPageLimit: 5
```

`llms.docsIntro`
: Summary line for a top-level `docs`-type section's `llms.txt` when that section has no `description`. Falls back to the site `description`.

`llms.leafPageLimit`
: How many pages of a leaf section, such as a blog, the index lists before the "All N pages" link. Defaults to `5`. The section's own `llms.txt` always lists every page.

## Leave a page or section out

Set `llms: false` in front matter. A section with `llms: false` drops out of every index along with everything under it.

```yaml
---
title: Internal notes
llms: false
---
```
