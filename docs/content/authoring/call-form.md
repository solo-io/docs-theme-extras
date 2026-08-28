---
title: "Call form: percent versus angle brackets"
linkTitle: Call form
description: >-
  Why this module's shortcodes accept either call form interchangeably, when
  that stops being true, and what to do when you are not sure.
weight: 10
---

This trips up more people than any single shortcode, so it comes first.

## The stock Hugo rule

In stock Hugo the two call forms are not interchangeable. Percent form sends the
inner content back through the markdown renderer; angle-bracket form does not.

```markdown
{{%/* name */%}}**bold** becomes <strong>{{%/* /name */%}}

{{</* name */>}}**bold** stays literal{{</* /name */>}}
```

The [Hugo shortcodes guide](https://gohugo.io/content-management/shortcodes/) has
the upstream rule in full.

## What this module changes

Several shortcodes here — `table`, `github-table`, and the `reuse` and `rebase`
family among them — deliberately render their inner content through
`.Page.RenderString`, so **both call forms produce identical HTML**.

That is not cosmetic. The `rebase` pipeline rewrites percent-form shortcodes to
angle-bracket form *before* rendering, so a shortcode that relied on percent
form's splice-back-into-the-source behavior would break the moment its page was
rebased. Making both forms equivalent is what keeps a rebased page rendering the
same as its source.

{{< callout type="info" >}}
Writing a new shortcode in this module? Prefer the `RenderString` approach, for
the same reason. A shortcode that behaves differently in the two forms is a
shortcode that behaves differently before and after a rebase.
{{< /callout >}}

## Guidance

Use whichever form the content around you already uses, and assume the two are
equivalent for this module's shortcodes unless the shortcode says otherwise.

Where a shortcode is form-sensitive, it says so in its own reference page. The
one to know about is `github-yaml`, which is **percent form only**: it returns a
markdown fence, so the angle form would put literal backticks on the page.

## Two places the forms are genuinely not interchangeable

Both of these are about the surrounding Markdown rather than the shortcode.

**A blank line inside a fence inside a percent-form call.** Percent form re-runs
the body through Goldmark, which treats the blank line as a paragraph break and
injects a stray `<p>` into what should be a code block. Angle form does not.
Either drop the blank line or switch that call to angle form.

**A shortcode inside a numbered list.** A percent-form block that starts partway
through a list item breaks the list, because the re-rendered fragment is no
longer part of the item's Markdown. The fix is to wrap the *whole* item,
including its `1.` marker, rather than just the part you meant to gate.
