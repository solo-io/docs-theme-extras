---
title: Synced tabs scroll
weight: 381
description: Regression page for the scroll position after a synced tab switch.
# Kept out of sidebar/section-card listings (like tabs-sync.md) so it doesn't
# change auto-cards.spec.ts's expected child count; render:always keeps the
# page built so tabs-sync-scroll.spec.ts can load it by direct path.
build:
  list: never
  render: always
tabs:
  sync: true
---

<!--
Regression fixture for assets/js/core/tabs-sync-scroll.js. Two groups share the
names "UI / Config file". The FIRST group's UI panel is very tall and its
Config file panel is short, so a click on the SECOND group's "Config file"
shrinks the page above the clicked button by well over a viewport. Without the
fix the button jumps off screen; with it the button stays where it was.
-->

## Group above, tall UI panel

MARKER_SYNCSCROLL_INTRO. The group below this line changes height a lot when
it switches.

{{< tabs >}}
{{% tab name="UI" %}}
MARKER_SYNCSCROLL_A_UI. First group, UI. The fence below stands in for a run
of screenshots.

```text
UI step 1
UI step 2
UI step 3
UI step 4
UI step 5
UI step 6
UI step 7
UI step 8
UI step 9
UI step 10
UI step 11
UI step 12
UI step 13
UI step 14
UI step 15
UI step 16
UI step 17
UI step 18
UI step 19
UI step 20
UI step 21
UI step 22
UI step 23
UI step 24
UI step 25
UI step 26
UI step 27
UI step 28
UI step 29
UI step 30
UI step 31
UI step 32
UI step 33
UI step 34
UI step 35
UI step 36
UI step 37
UI step 38
UI step 39
UI step 40
UI step 41
UI step 42
UI step 43
UI step 44
UI step 45
UI step 46
UI step 47
UI step 48
UI step 49
UI step 50
UI step 51
UI step 52
UI step 53
UI step 54
UI step 55
UI step 56
UI step 57
UI step 58
UI step 59
UI step 60
UI step 61
UI step 62
UI step 63
UI step 64
UI step 65
UI step 66
UI step 67
UI step 68
UI step 69
UI step 70
UI step 71
UI step 72
UI step 73
UI step 74
UI step 75
UI step 76
UI step 77
UI step 78
UI step 79
UI step 80
```
{{% /tab %}}
{{% tab name="Config file" %}}
MARKER_SYNCSCROLL_A_CONFIG. First group, Config file.
{{% /tab %}}
{{< /tabs >}}

## Group below, the one the reader clicks

MARKER_SYNCSCROLL_BETWEEN. Prose between the two groups.

{{< tabs >}}
{{% tab name="UI" %}}
MARKER_SYNCSCROLL_B_UI. Second group, UI.
{{% /tab %}}
{{% tab name="Config file" %}}
MARKER_SYNCSCROLL_B_CONFIG. Second group, Config file.
{{% /tab %}}
{{< /tabs >}}

MARKER_SYNCSCROLL_AFTER. Prose after the clicked group, so the page is tall
enough to keep the clicked button in place after the switch.

Filler paragraph 1, so the page can still scroll after the group above shrinks.

Filler paragraph 2, so the page can still scroll after the group above shrinks.

Filler paragraph 3, so the page can still scroll after the group above shrinks.

Filler paragraph 4, so the page can still scroll after the group above shrinks.

Filler paragraph 5, so the page can still scroll after the group above shrinks.

Filler paragraph 6, so the page can still scroll after the group above shrinks.

Filler paragraph 7, so the page can still scroll after the group above shrinks.

Filler paragraph 8, so the page can still scroll after the group above shrinks.

Filler paragraph 9, so the page can still scroll after the group above shrinks.

Filler paragraph 10, so the page can still scroll after the group above shrinks.

Filler paragraph 11, so the page can still scroll after the group above shrinks.

Filler paragraph 12, so the page can still scroll after the group above shrinks.

Filler paragraph 13, so the page can still scroll after the group above shrinks.

Filler paragraph 14, so the page can still scroll after the group above shrinks.

Filler paragraph 15, so the page can still scroll after the group above shrinks.

Filler paragraph 16, so the page can still scroll after the group above shrinks.

Filler paragraph 17, so the page can still scroll after the group above shrinks.

Filler paragraph 18, so the page can still scroll after the group above shrinks.

Filler paragraph 19, so the page can still scroll after the group above shrinks.

Filler paragraph 20, so the page can still scroll after the group above shrinks.

Filler paragraph 21, so the page can still scroll after the group above shrinks.

Filler paragraph 22, so the page can still scroll after the group above shrinks.

Filler paragraph 23, so the page can still scroll after the group above shrinks.

Filler paragraph 24, so the page can still scroll after the group above shrinks.

Filler paragraph 25, so the page can still scroll after the group above shrinks.

Filler paragraph 26, so the page can still scroll after the group above shrinks.

Filler paragraph 27, so the page can still scroll after the group above shrinks.

Filler paragraph 28, so the page can still scroll after the group above shrinks.

Filler paragraph 29, so the page can still scroll after the group above shrinks.

Filler paragraph 30, so the page can still scroll after the group above shrinks.

