---
# GENERATED FILE — DO NOT EDIT.
#
# Written by scripts/gen-docs.mjs from layouts/_shortcodes/checklist.html.
# Edit that instead and re-run `npm run gen:docs`; CI runs
# `npm run gen:docs -- --check` and fails on any diff.
title: checklist
description: "Renders its body as a checklist whose ticks persist in the browser"
weight: 50
---

Either call form works, and both produce identical HTML.

## Parameters

This shortcode takes no parameters.

## Example

```markdown
{{</* checklist */>}}
- [ ] Create the gateway
- [ ] Apply the route
- [ ] Verify traffic reaches the backend
{{</* /checklist */>}}
```

{{< details title="Rendered output" >}}

{{< checklist >}}
- [ ] Create the gateway
- [ ] Apply the route
- [ ] Verify traffic reaches the backend
{{< /checklist >}}

{{< /details >}}

## Notes

Each non-empty line of the body becomes one item. A leading `- [ ]` or `- `
is stripped, so the body can be written as ordinary Markdown task-list or
bullet syntax and still render as a checklist rather than as a list.

Item text is run through `markdownify`, so inline formatting and links work.

Ticks are stored in `localStorage`, keyed on the page path plus the
checklist's index on that page plus the item's index. Two consequences worth
knowing: reordering or inserting items shifts every later item's key, so
existing readers see their ticks move; and the state is per-browser, so it
is a convenience for one reader working through a guide, not a record of
anything.

The supporting script is emitted once per page, guarded by a page-scoped
flag, so a page with several checklists does not repeat it.

---

Source: [`layouts/_shortcodes/checklist.html`](https://github.com/solo-io/docs-theme-extras/blob/main/layouts/_shortcodes/checklist.html)
