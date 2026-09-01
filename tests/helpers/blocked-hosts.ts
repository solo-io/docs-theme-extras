// The webfont CDNs, blackholed for every browser project in
// playwright.config.ts, and the one filter that keeps that from turning into
// false console errors.
//
// WHY THE BLACKHOLE. Every fixture page links two fonts.googleapis.com
// stylesheets, which pull four fonts.gstatic.com files: SIX blocking requests
// per navigation. Playwright gives each test a fresh BrowserContext, so none of
// it is cached between tests — every navigation in the suite pays the cost
// again. Locally, against warm DNS and TLS, that is ~290 ms a page. On a CI
// runner it is cold every time, and the browser suite ran ~9x slower there than
// locally: an accent-contrast test that takes 3.0s here took 26-30s there,
// against a 30s timeout, which is what eventually made it flake.
//
// This was already known, in a narrower form — cross-browser.spec.ts carries a
// comment explaining that `networkidle` had to be dropped because "firefox
// counts in-flight Google Fonts + Material Symbols + Mermaid CDN requests in
// its idle calculation, which on CI runners can leave the network busy past
// 15s". That is the same cost, worked around one spec at a time.
//
// WHY A FILTER IS NEEDED. A blackholed request logs
// `net::ERR_NAME_NOT_RESOLVED` to the console, which the three
// console-error collectors would otherwise report as a page defect.
//
// This is not a new judgement call: console-errors.spec.ts (the crawl) has
// suppressed these two hosts in its BUILTIN_NOISE list all along, commented
// "may time out on restricted CI runners with no external network access".
// The other two collectors were simply inconsistent with it.
//
// The filter is deliberately narrow: it matches ONLY messages naming one of the
// hosts this config blackholes. A theme error, a 404 on a local asset, or any
// other failed request is still reported. Widening this to "ignore failed
// resource loads" would hide the crawl's real job.
export const BLOCKED_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com"];

/** True when a console message is just a blackholed webfont request. */
export function isBlockedHostNoise(text: string): boolean {
  return BLOCKED_HOSTS.some((h) => text.includes(h));
}
