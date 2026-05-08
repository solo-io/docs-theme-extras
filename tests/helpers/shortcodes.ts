// Registry mapping shortcode name → expected rendered HTML structure.
//
// The `shortcodeStructure` check uses this registry to find anchor patterns
// in built HTML and assert that the surrounding structure is intact. This
// replaces the marker-based assertions of the prior harness.
//
// Each entry declares:
//   - anchor: a regex that matches the rendered shortcode's outermost element
//             (e.g. `<div class="hextra-alert-...">` for alert)
//   - description: human-readable label for failure messages
//
// More-specific structural checks (children, attributes) live in the spec
// that owns that shortcode's behavior, not here. This file is intentionally
// just a "where do alerts live in HTML?" lookup.

export type ShortcodeAnchor = {
  name: string;
  description: string;
  // Regex that matches the rendered outer element. Must use the global flag
  // so `match` returns all occurrences.
  anchor: RegExp;
};

export const SHORTCODE_ANCHORS: ShortcodeAnchor[] = [
  {
    name: "alert",
    description: "alert shortcode renders <div class='hextra-alert-*'>",
    anchor: /<div class="hextra-alert-[a-z]+"[^>]*>/g,
  },
  {
    name: "callout",
    description: "callout shortcode renders <div class='hextra-callout-*'>",
    anchor: /<div class="hextra-callout-[a-z]+"[^>]*>/g,
  },
  {
    name: "cards",
    description: "cards shortcode renders a hextra-cards or section-cards container",
    anchor: /<div class="(?:hextra-cards|section-cards)[^"]*"[^>]*>/g,
  },
  {
    name: "card",
    description: "card shortcode renders a hextra-card or section-card link",
    anchor: /<a class="(?:hextra-card|section-card)[^"]*"[^>]*>/g,
  },
  {
    name: "checklist",
    description: "checklist shortcode renders a checklist container",
    anchor: /<(?:div|ul) class="hextra-checklist[^"]*"[^>]*>|<input type="checkbox"[^>]*data-checklist/g,
  },
  {
    name: "details",
    description: "details shortcode renders <details class='hextra-details'>",
    anchor: /<details class="hextra-details[^"]*"[^>]*>/g,
  },
  {
    name: "github",
    description: "github shortcode renders fetched remote content",
    // No structural anchor; this shortcode emits whatever the remote URL
    // contains. The github-shortcode.spec checks for non-empty body around
    // a marker passed by the caller.
    anchor: /<!--GITHUB_SHORTCODE_RENDERED-->/g,
  },
  {
    name: "openapi",
    description: "openapi shortcode renders Swagger UI mount or local viewer",
    anchor: /<div id="swagger-ui"[^>]*>|<div class="openapi-viewer"[^>]*>/g,
  },
  {
    name: "prism",
    description: "prism shortcode renders a code block with line targeting",
    anchor: /<pre[^>]*class="[^"]*language-[^"]*"[^>]*>/g,
  },
  {
    name: "steps",
    description: "steps shortcode renders <div class='hextra-steps'>",
    anchor: /<div class="hextra-steps[^"]*"[^>]*>/g,
  },
  {
    name: "tabs",
    description: "tabs shortcode renders a hextra-tabs container",
    anchor: /<div class="hextra-tabs[^"]*"[^>]*>/g,
  },
];

export function shortcodeAnchor(name: string): ShortcodeAnchor | undefined {
  return SHORTCODE_ANCHORS.find((s) => s.name === name);
}

// Count occurrences of a shortcode's rendered structure in HTML.
export function countShortcode(html: string, name: string): number {
  const entry = shortcodeAnchor(name);
  if (!entry) return 0;
  const matches = html.match(entry.anchor);
  return matches ? matches.length : 0;
}
