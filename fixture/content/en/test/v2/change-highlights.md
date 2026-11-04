---
title: Change highlights
weight: 399
description: Target page for the change-highlights overlay specs, with one of each kind of content a change can land in.
# Kept out of sidebar/section-card listings so it does not change
# auto-cards.spec.ts's expected child count; render:always keeps the page built
# so the change-highlights specs can load it by direct path.
build:
  list: never
  render: always
---

<!--
Target page for tests/change-highlights.spec.ts (built HTML) and
tests/change-highlights-overlay.spec.ts (browser). The overlay only renders in
the public-oss-changes build (`make build-changes`), and the browser spec feeds
it tests/helpers/change-highlights-manifest.json instead of a git diff, so
every marker below is pinned by that file. Change the text here and the
manifest together.
Each block carries one kind of content a change can land in. The snippet is
reused twice to pin "every copy of a snippet is marked", and the versioned
snippet resolves to fixture/assets/test/v2/... to pin that `reuse` records the
resolved path as well as the written one.
-->

CH_PARA. The gateway routes all traffic to the service on port 9090, then retries twice.

> [!NOTE]
> CH_ALERT. Policies on a tunnel bind are never applied to the CONNECT request.

| Setting | Value |
| ------- | ----- |
| CH_TABLE_KEY | CH_TABLE_VALUE enabled by default |

```sh
kubectl apply -f gateway.yaml --namespace prod
```

{{< tabs >}}
{{% tab name="First" %}}
CH_TAB. The first tab has a freshly added clause.
{{% /tab %}}
{{% tab name="Second" %}}
CH_TAB_SECOND. The second tab is unchanged.
{{% /tab %}}
{{< /tabs >}}

1. CH_LIST_ONE. First step.
2. CH_LIST_TWO. Second step with a new ending.

{{< reuse "conrefs/test/change-highlights-snippet.md" >}}

{{< reuse "conrefs/test/change-highlights-snippet.md" >}}

{{< reuse "conrefs/test/change-highlights-versioned.md" >}}
