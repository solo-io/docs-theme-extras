import { test, expect } from "@playwright/test";
import { target } from "./helpers/target";

// The floating back-to-top arrow (#solo-back-to-top, emitted by footer.html on
// every page) shares the bottom-right corner with a product's AI chat launcher.
// The arrow always keeps the corner (flush right); when a chat widget (wrapped
// in #chatbot-widget, launcher class .chatbot-trigger) is present,
// `#chatbot-widget .chatbot-trigger { right: 4.75rem !important }` in
// docs-theme-extras.css shifts the launcher left so the two sit side by side
// instead of overlapping. The bundled fixture has no chat widget of its own, so
// this test synthesizes one and asserts (a) the launcher shifts left, overriding
// its inline `right`, and (b) the arrow stays pinned in the corner. This guards
// the contract that any product adding an AI chat wraps it in #chatbot-widget
// with a .chatbot-trigger launcher. Pure CSS behavior → a real browser.
const PAGE =
  target.pages.filter((p) => target.versionOf(p.url) !== null)[0]?.url ??
  target.pages[0]?.url ??
  null;

test.describe("back-to-top stays in the corner; chat launcher shifts left", () => {
  test.skip(!target.shouldRun("viewport"), "viewport check disabled in CONFIG");
  test.skip(PAGE === null, "no pages configured");
  test.use({ viewport: { width: 1280, height: 800 } });

  test("a #chatbot-widget launcher is pushed left of the corner-pinned arrow", async ({
    page,
  }) => {
    await page.goto(PAGE!);

    const result = await page.evaluate(() => {
      const btn = document.getElementById("solo-back-to-top");
      if (!btn) return null;
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      // Synthesize a chat widget whose launcher pins to the same corner the
      // arrow uses (inline right:1.5rem, exactly like agw's chatbot.html).
      document.body.insertAdjacentHTML(
        "beforeend",
        '<div id="chatbot-widget">' +
          '<button class="chatbot-trigger" style="position:fixed;bottom:1.5rem;right:1.5rem;width:120px;height:48px"></button>' +
          "</div>",
      );
      void document.body.offsetHeight; // force a style recalc
      const trigger = document.querySelector(
        "#chatbot-widget .chatbot-trigger",
      ) as HTMLElement;
      const out = {
        rem,
        // The arrow keeps the corner regardless of the chat widget.
        arrowRight: parseFloat(getComputedStyle(btn).right),
        arrowBottom: parseFloat(getComputedStyle(btn).bottom),
        // The launcher is shifted left, overriding its inline right:1.5rem.
        triggerRight: parseFloat(getComputedStyle(trigger).right),
      };
      document.getElementById("chatbot-widget")?.remove();
      return out;
    });

    test.skip(result === null, "#solo-back-to-top not present in this build");

    // The arrow stays flush in the bottom-right corner (1.5rem / 1.5rem).
    expect(
      result!.arrowRight,
      `#solo-back-to-top should stay flush right at 1.5rem (${1.5 * result!.rem}px), ` +
        `got ${result!.arrowRight}px`,
    ).toBeCloseTo(1.5 * result!.rem, 0);
    expect(result!.arrowBottom, "#solo-back-to-top should stay at bottom:1.5rem").toBeCloseTo(
      1.5 * result!.rem,
      0,
    );
    // The launcher is shifted left to 4.75rem to clear the arrow — proving the
    // `#chatbot-widget .chatbot-trigger` rule fired and beat the inline `right`.
    expect(
      result!.triggerRight,
      `the chat launcher should shift left to 4.75rem (${4.75 * result!.rem}px) so it sits ` +
        `to the left of the corner arrow, got ${result!.triggerRight}px — the ` +
        `#chatbot-widget .chatbot-trigger rule did not fire`,
    ).toBeCloseTo(4.75 * result!.rem, 0);
  });
});
