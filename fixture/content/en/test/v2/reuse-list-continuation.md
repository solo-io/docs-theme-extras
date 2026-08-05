---
title: Reuse inside a numbered step
weight: 380
description: Regression page for a multi-line reuse expansion breaking its parent ordered list.
# Direct-path fixture (see version-remap.md) so auto-cards.spec.ts's child count is unchanged.
build:
  list: never
  render: always
---

<!--
NOTE: no blank lines and no angle-bracketed tag names inside this comment.
Blank lines inside an HTML comment make the typographer mangle the closing
delimiter so the comment leaks into the page, and literal tag names in the
leaked text then trip the built-html-integrity scanner. Both were hit while
writing this page.
.
Hugo substitutes a shortcode's rendered HTML at the call's SOURCE POSITION. For
a percent-form reuse used as `2. reuse(...)`, the first line lands at the
list-item content column but every following newline-separated line lands at
column 0 -- and Goldmark's list-item continuation rule then terminates the list
there, closing the item and list early and hoisting the snippet's tail out of
the list as an ordered-list fragment carrying a start attribute.
.
reuse.html therefore flattens its output to one logical line via
utils/flatten-rendered (newlines to the numeric entity for LF, which Goldmark
does not decode). This page is the guard for that. The flatten lived only in
the docs hub's local reuse.html override until v0.1.27; angle form is immune
(its output is placeholder-substituted after Goldmark), which is why the gap
went unnoticed -- the fixture only ever exercised angle form.
.
KNOWN LIMITATION, deliberately not fixtured: a snippet containing a fenced code
block takes utils/flatten-rendered's bypass for preformatted content and gets
real newlines back, so the percent-form list still splits and the fence emits a
paragraph inside the preformatted block. That matches the docs hub exactly, so
upstreaming is behaviour-preserving, but a fixture case would put invalid HTML
in the build and permanently fail built-html-integrity. It is tracked in the
plan's consumer-cleanup backlog with a reproduction recipe instead.
-->

## Angle form

Angle output is placeholder-substituted AFTER Goldmark, so multi-line output
cannot break the list regardless of flattening. Control case.

1. MARKER_LISTCONT_STEP1. First step.

2. {{< reuse "conrefs/test/list-continuation.md" >}}

3. MARKER_LISTCONT_STEP3. Third step — must still be item 3 of the SAME list.

## Percent form, snippet without a fenced code block

1. MARKER_LISTCONT_NF_STEP1. First step.

2. {{% reuse "conrefs/test/list-continuation-nofence.md" %}}

3. MARKER_LISTCONT_NF_STEP3. Third step — must still be item 3 of the SAME list.
