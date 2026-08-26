---
title: Render hooks
description: >-
  How this module changes the way ordinary Markdown renders, without you calling anything.
weight: 30
---

These are not shortcodes. They change how ordinary markdown renders across every
page, by overriding Hugo/Hextra [render hooks](https://gohugo.io/render-hooks/).
You do not call them; they just change the default output.

| Hook | What changes | Reference |
|---|---|---|
| Table render hook ([`render-table.html`](https://github.com/solo-io/docs-theme-extras/blob/main/layouts/_markup/render-table.html)) | Caps per-cell column width only on wide reference tables (a 3+ column header is the signal, for example `Key \| Type \| Default \| Description`). Two-column narrative tables render uncapped and fill the content width. See `.table-capped` in `docs-theme-extras.css`. Use the `table` shortcode below to override this per table. | [Hugo table hooks](https://gohugo.io/render-hooks/tables/) |
| Link render hook ([`render-link.html`](https://github.com/solo-io/docs-theme-extras/blob/main/layouts/_markup/render-link.html)) | Simplified so it works inside `RenderString` context (nested `reuse` shortcodes), where `.PageInner`/`.RelPermalink` would fail. Uses `relURL` for internal links instead of full page resolution. | [Hugo link hooks](https://gohugo.io/render-hooks/links/) |
| Blockquote alert hook ([`render-blockquote-alert.html`](https://github.com/solo-io/docs-theme-extras/blob/main/layouts/_markup/render-blockquote-alert.html)) | Same as Hextra's GitHub-style alert hook (`> [!NOTE]`), except it also ships two custom alert types that need no consumer config — `[!SOLO]` (branded, `solo` icon) and `[!SUCCESS]` (green check, the GitHub-syntax counterpart to `callout type="success"`) — and additionally accepts any custom types a consumer declares under `site.Params.themeExtras.alertTypes`. Unknown types still warn and fall back to the default style. | [Hugo blockquote hooks](https://gohugo.io/render-hooks/blockquotes/) |
