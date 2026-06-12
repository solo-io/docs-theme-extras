---
title: Redirect
weight: 300
description: Exercises the redirect shortcode (url= and path= forms) on a direct page.
---

This fixture page exists solely to exercise the `redirect` shortcode. It is
NOT listed in the harness `[[pages]]` set, because static.spec treats those
as comprehensive marker pages and this focused page lacks their sentinels.
tests/redirect.spec.ts resolves it by direct path (the same pattern
conditional-block.spec uses for the block-direct page) and asserts the
emitted markup by reading this page's HTML from disk.

The redirect targets point at the real `/test/v2/everything/` fixture page so
the inline `window.location` navigation lands on a valid page when the
browser-smoke crawl (console-errors.spec) opens this page, rather than
aborting `page.goto` or 404ing.

<!-- MARKER_REDIRECT_URL -->
{{< redirect url="/test/v2/everything/" >}}

<!-- MARKER_REDIRECT_PATH -->
{{< redirect path="/everything/" >}}
