---
title: Synced tabs
weight: 380
description: Regression page for tabs.sync, including sync across nested groups.
# Kept out of sidebar/section-card listings (like ol-split.md and tabs-nested.md)
# so it doesn't change auto-cards.spec.ts's expected child count; render:always
# keeps the page built so tabs-sync.spec.ts can load it by direct path.
build:
  list: never
  render: always
# THE POINT OF THIS PAGE. Hextra keys tab syncing on the comma-joined list of a
# group's tab NAMES, so any two groups labelled the same move together. This is
# the only fixture page that turns it on.
tabs:
  sync: true
---

<!--
Regression fixture for `tabs.sync` and, specifically, for what syncing does
once a group is NESTED. The key is the tab names, not the position or the
nesting depth, so:

  1. two top-level groups with matching labels sync (the documented case)
  2. two INNER groups with matching labels, under different outer panels, also
     sync — they are separate groups in separate panels, and nothing about
     nesting scopes the key
  3. an inner group and a TOP-LEVEL group with matching labels sync across the
     nesting boundary too
  4. a group whose labels differ is untouched by all of it

Cases 2 and 3 are the ones nobody would predict from the docs, and they are
easy to hit by accident: "Helm / kubectl" under both a Linux and a macOS panel
is the natural way to write an install page.
-->

## Shape 1 — two top-level groups, matching labels

MARKER_SYNCTABS_S1_INTRO. The documented case: pick once, and every group with
the same labels follows.

{{< tabs >}}
{{% tab name="Helm" %}}
MARKER_SYNCTABS_S1_A_HELM. First group, Helm.
{{% /tab %}}
{{% tab name="kubectl" %}}
MARKER_SYNCTABS_S1_A_KUBECTL. First group, kubectl.
{{% /tab %}}
{{< /tabs >}}

MARKER_SYNCTABS_S1_BETWEEN. Prose between the two groups.

{{< tabs >}}
{{% tab name="Helm" %}}
MARKER_SYNCTABS_S1_B_HELM. Second group, Helm.
{{% /tab %}}
{{% tab name="kubectl" %}}
MARKER_SYNCTABS_S1_B_KUBECTL. Second group, kubectl.
{{% /tab %}}
{{< /tabs >}}

## Shape 2 — two inner groups with matching labels, under different outer panels

MARKER_SYNCTABS_S2_INTRO. The accidental case. Both inner groups are labelled
"Helm / kubectl", so they share a key with each other and with shape 1's pair.

{{< tabs >}}
{{% tab name="Linux" %}}
MARKER_SYNCTABS_S2_OUTER_A. First outer panel.

{{< tabs >}}
{{% tab name="Helm" %}}
MARKER_SYNCTABS_S2_INNER_A_HELM. Inner group under Linux, Helm.
{{% /tab %}}
{{% tab name="kubectl" %}}
MARKER_SYNCTABS_S2_INNER_A_KUBECTL. Inner group under Linux, kubectl.
{{% /tab %}}
{{< /tabs >}}
{{% /tab %}}
{{% tab name="macOS" %}}
MARKER_SYNCTABS_S2_OUTER_B. Second outer panel.

{{< tabs >}}
{{% tab name="Helm" %}}
MARKER_SYNCTABS_S2_INNER_B_HELM. Inner group under macOS, Helm.
{{% /tab %}}
{{% tab name="kubectl" %}}
MARKER_SYNCTABS_S2_INNER_B_KUBECTL. Inner group under macOS, kubectl.
{{% /tab %}}
{{< /tabs >}}
{{% /tab %}}
{{< /tabs >}}

## Shape 3 — a group whose labels match nothing

MARKER_SYNCTABS_S3_INTRO. The control. Nothing else on the page is labelled
"Terraform / Pulumi", so this group must never move when the others do.

{{< tabs >}}
{{% tab name="Terraform" %}}
MARKER_SYNCTABS_S3_TERRAFORM. Independent group, Terraform.
{{% /tab %}}
{{% tab name="Pulumi" %}}
MARKER_SYNCTABS_S3_PULUMI. Independent group, Pulumi.
{{% /tab %}}
{{< /tabs >}}
