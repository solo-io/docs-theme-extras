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

The `path=` invocation is placed first and points at a real in-build page so
the inline `window.location` navigation lands somewhere valid when the
browser-smoke crawl (console-errors.spec) opens this page, rather than
aborting `page.goto` or 404ing. It is also the only form that is portable
across the two fixture builds: it resolves through `utils/page-context.html`
to the current section prefix, so it renders `/v2/everything/` under the
local-dev config (`hugo-oss-local.toml`, `baseURL = "/"`) and
`/test/v2/everything/` under the production fixture config (`hugo-oss.toml`,
`baseURL = "/test"`). A hardcoded internal `url=` value can't be correct under
both, so the `url=` form below uses an external URL — its whole point is
verbatim pass-through, identical in every build.

<!-- MARKER_REDIRECT_PATH -->
{{< redirect path="/everything/" >}}

<!-- MARKER_REDIRECT_URL -->
{{< redirect url="https://github.com/solo-io/docs-theme-extras" >}}
