---
title: Gate form normalization
weight: 395
description: Raw output of the gate form normalizer for each nesting case it has to get right.
# Direct-path fixture (see gate-transparency.md) so auto-cards.spec.ts's child
# count is unchanged; render:always keeps the page built for the spec to load.
build:
  list: never
  render: always
---

Each block below is the raw output of `utils/gate-normalize-form.html` for one
case file under `fixture/assets/conrefs/test/gatenorm/`. Nothing here is meant
to be read as rendered documentation. `tests/gate-normalize.spec.ts` feeds the
same files through the TypeScript port in `tests/helpers/gate-normalize.ts` and
asserts the two produce identical text, which is what stops the port from
drifting away from the template it models.

{{< gate-normalize-probe case="01-toplevel-angle" >}}
{{< gate-normalize-probe case="02-toplevel-percent" >}}
{{< gate-normalize-probe case="03-nested-in-tab" >}}
{{< gate-normalize-probe case="04-selfclosing-then-gate" >}}
{{< gate-normalize-probe case="05-version-cards-untouched" >}}
{{< gate-normalize-probe case="06-escaped-display" >}}
{{< gate-normalize-probe case="07-gate-in-gate" >}}
{{< gate-normalize-probe case="08-sequential-siblings" >}}
{{< gate-normalize-probe case="09-inline-multiple" >}}
{{< gate-normalize-probe case="10-shell-brace-collision" >}}
{{< gate-normalize-probe case="11-slash-space-closer" >}}
{{< gate-normalize-probe case="12-gate-inside-fence" >}}
{{< gate-normalize-probe case="13-nested-percent-back" >}}
{{< gate-normalize-probe case="14-nested-percent-heading" >}}
{{< gate-normalize-probe case="16-rendered-body-only" >}}
{{< gate-normalize-probe case="17-rendered-body-with-markdown" >}}
{{< gate-normalize-probe case="18-shortcode-only-no-reuse" >}}
