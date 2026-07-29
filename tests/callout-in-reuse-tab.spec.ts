import { test, expect } from "@playwright/test";
import path from "node:path";
import { TEST_PRODUCT_ROOT, readFixture } from "./helpers/fixture";
import { target } from "./helpers/target";

// Regression guard for a GitHub-style callout (`> [!TIP]`) that lives in a
// reuse snippet and is pulled into a `{{% tab %}}` which itself sits indented
// inside a numbered list item (the real shape in agentgateway's
// agentgateway-setup.md / prereq.md → kind-loadbalancer-tip.md).
//
// The reuse pre-renders the callout to HTML, then the percent-form tab runs
// that HTML through a SECOND markdown pass. If the alert partial emits a blank
// line between its tags (terminating the HTML block) and indents its inner
// <div>s, those inner lines hit CommonMark's "4 spaces = code" rule on the
// re-render — offset by the list item's indent — and the callout markup leaks
// into a literal <pre><code> block (the box renders but its body shows raw
// HTML). github-style-alert.html keeps the whole <div> on one contiguous line
// so it survives the re-render. The reused body mixes a paragraph, a list, and
// a fenced code block, so this also proves multi-block bodies survive.
//
// Fixture source: the "Reused inside a tab in a numbered list" subsection of
// fixture/assets/conrefs/test/everything.md (reused by the v2/everything page,
// which supplies the outer render), reusing
// fixture/assets/conrefs/test/callout-reuse-tab.md.

const IS_FIXTURE_TARGET = target.name.startsWith("docs-theme-extras-fixture");

const PAGE = path.join(TEST_PRODUCT_ROOT, "v2/everything/index.html");

// The rendered article body only, minus the copy-as-markdown <script> embed
// (raw markdown that would false-positive on the leak scan).
function bodyHtml(): string {
  const doc = readFixture(PAGE);
  const start = doc.indexOf('<main id="content"');
  const end = doc.indexOf("</main>", start);
  return doc
    .slice(start, end)
    .replace(/<script[^>]*type=["']text\/markdown["'][^>]*>[\s\S]*?<\/script>/gi, "");
}

// The rendered body of the reused-in-tab alert: from the data-alert-type div
// that carries MARKER_REUSE_TAB_LEAD up to its copy-md body-end sentinel.
function reuseTabAlert(html: string): string {
  const m = html.match(/<div data-alert-type[\s\S]*?MARKER_REUSE_TAB_LEAD[\s\S]*?data-alert-md-end/);
  return m ? m[0] : "";
}

test.describe("GH-style callout reused inside a tab", () => {
  test.skip(!IS_FIXTURE_TARGET, "fixture-only: lives in the extras everything page");

  test("the callout renders as a real alert box, complete, inside the tab", () => {
    const alert = reuseTabAlert(bodyHtml());
    expect(alert, "no alert box wraps MARKER_REUSE_TAB_LEAD — the reuse-in-tab callout may have broken").not.toBe("");

    // A real TIP box (not a raw div dump), with its copy-md sentinel.
    expect(alert).toMatch(/data-alert-type="TIP"/);

    // The multi-block body renders in full, INSIDE the box: lead paragraph, a
    // real <ul> with both items, and the fenced code block.
    expect(alert).toContain("MARKER_REUSE_TAB_LEAD");
    expect(alert).toMatch(/<ul\b/);
    expect(alert).toContain("MARKER_REUSE_TAB_LIST1");
    expect(alert).toContain("MARKER_REUSE_TAB_LIST2");
    expect(alert).toMatch(/<pre\b/);
    expect(alert).toContain("MARKER_REUSE_TAB_FENCE");
  });

  test("the callout wrapper never leaks into a literal code block", () => {
    const body = bodyHtml();
    for (const m of body.matchAll(/<pre[^>]*>([\s\S]*?)<\/pre>/g)) {
      // The callout's OWN fenced code is a legitimate <pre>; only the wrapper
      // markup leaking (hx:w-full / data-alert-type / hx:mt-6) is the bug.
      expect(m[1], "alert wrapper rendered as literal code — the tab re-render leaked it").not.toMatch(
        /hx:w-full|data-alert-type|hx:mt-6/,
      );
    }
  });

  test("the tab content around the callout still renders", () => {
    const body = bodyHtml();
    // Trailing sentence inside the tab, the other tab, and the surrounding
    // numbered steps all survive the reuse-in-tab render.
    for (const marker of [
      "MARKER_REUSE_TAB_BEFORE",
      "MARKER_REUSE_TAB_TRAILING",
      "MARKER_REUSE_TAB_OTHER",
      "MARKER_REUSE_TAB_AFTER",
    ]) {
      expect(body, `${marker} missing — tab/list structure broke`).toContain(marker);
    }
  });
});
