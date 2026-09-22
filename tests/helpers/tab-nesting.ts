// tab-nesting — reconstruct the TREE of tab groups on a built page.
//
// WHY A TREE, AND WHY A REAL PARSER
//
// The existing tab specs count things: tab-flatten.spec.ts counts groups and
// panels, tab-code-fences.spec.ts counts <code> opens before a marker. Counting
// is blind to NESTING, which is the one thing a tabs-inside-tabs page is about.
// A page with an inner group hoisted out of its outer panel — or an outer panel
// that swallowed the following group — has exactly the same group and panel
// counts as the correct page. Only the parent/child relation differs.
//
// parse5 (already used by helpers/ancestor-path.ts) applies the HTML
// tree-construction algorithm, so what this reads back is where the PARSER
// decided each element lives, not where the markdown source put it. That
// distinction is the whole point: Goldmark and the HTML parser both relocate
// blocks, and a nested group is exactly the shape that gets relocated.
//
// MARKUP RECOGNIZED. Stock Hextra v0.12 (variant B in utils/unhide-tabs.html),
// which is what this module's own fixture builds:
//
//   <div class="hextra-scrollbar …">            <- button-bar wrapper
//     <div … role="tablist"><button role="tab" id="tabs-tab-tabs-00-0">
//       <span …><span>Kubernetes</span></span></button>…</div></div>
//   <div>                                        <- panels wrapper, a SIBLING
//     <div class="hextra-tabs-panel …" id="tabs-panel-tabs-00-0"
//          aria-labelledby="tabs-tab-tabs-00-0" aria-hidden="false">…</div>
//
// The bar and the panels are siblings, not parent/child, so a group is found by
// locating a tablist and taking the NEXT ELEMENT SIBLING of the wrapper that
// holds it. A consumer with its own tabs override emits variant A (a <nav>
// inside .hextra-tabs, panels carrying data-tab-name) and is NOT parsed here —
// the specs that use this helper are fixture-gated, since the nested-tabs
// fixture page exists only in this module.

import { parse } from "parse5";

const MARKER = /\bMARKER_[A-Z0-9_]+\b/g;

type Node = {
  nodeName: string;
  tagName?: string;
  value?: string;
  childNodes?: Node[];
  attrs?: { name: string; value: string }[];
};

export type TabPanel = {
  /** Panel `id`. Duplicated ids across groups are reported verbatim, not deduped. */
  id: string;
  /** The `aria-labelledby` target, i.e. the id of the button naming this panel. */
  labelledBy: string;
  /** `aria-hidden="false"` — the panel a reader sees before touching anything. */
  visible: boolean;
  /** MARKER_* sentinels in this panel's own text, EXCLUDING nested groups' panels. */
  markers: string[];
  /** Tab groups nested directly inside this panel. */
  groups: TabGroup[];
};

export type TabGroup = {
  /** Button labels, in the order a reader sees them. */
  names: string[];
  /** Button ids, in the same order. */
  buttonIds: string[];
  /** Panels, in the order they appear in the panels wrapper. */
  panels: TabPanel[];
  /** 0 for a top-level group, 1 for a group inside a panel, and so on. */
  depth: number;
};

function attr(node: Node, name: string): string {
  return node.attrs?.find((a) => a.name === name)?.value ?? "";
}

function classes(node: Node): string[] {
  return attr(node, "class").split(/\s+/).filter(Boolean);
}

function elementChildren(node: Node): Node[] {
  return (node.childNodes ?? []).filter((c) => !!c.tagName);
}

/**
 * The tablist `node` IS or directly holds — never one further down.
 *
 * Hextra emits `<div class="hextra-scrollbar …"><div role="tablist">`, so a
 * group's bar is at most one level inside its wrapper. The depth limit is the
 * whole point and was learned the hard way: an unbounded search reports the
 * tablist for every ANCESTOR too, so scanning the children of a container whose
 * grandchild is a bar (a tab group inside a list item, which is what real
 * procedures look like) treats the `<li>` itself as the bar wrapper and takes
 * the NEXT `<li>` as the panels wrapper. The group then comes back with zero
 * panels, and every group nested inside those panels is never visited at all.
 *
 * Measured against a real consumer page — the docs hub's agentregistry install
 * guide, whose provider tabs sit inside `<ol><li>` — where the unbounded
 * version reported 4 groups and 0 nested for a page that has 5 and 1. The
 * module's own fixture could not catch it: every group there is a direct child
 * of `.content`, so the wrapper happened to be the right element.
 */
function tablistIn(node: Node): Node | null {
  if (attr(node, "role") === "tablist") return node;
  for (const child of elementChildren(node)) {
    if (attr(child, "role") === "tablist") return child;
  }
  return null;
}

/**
 * The visible label of a tab button: the innermost ATTRIBUTE-LESS <span>.
 *
 * Same rule utils/unhide-tabs.html uses, deliberately — a spec that read the
 * name a different way could pass while the partial's own extraction was
 * broken. The styled wrapper span carries classes; the text span carries none.
 */
function buttonName(button: Node): string {
  let name = "";
  const walk = (node: Node) => {
    if (node.tagName === "span" && (node.attrs ?? []).length === 0) {
      name = textOf(node).trim();
      return;
    }
    for (const child of elementChildren(node)) walk(child);
  };
  walk(button);
  return name;
}

function textOf(node: Node): string {
  if (node.nodeName === "#text") return node.value ?? "";
  if (node.tagName === "script" || node.tagName === "style") return "";
  return (node.childNodes ?? []).map(textOf).join("");
}

/** MARKER_* text under `node`, skipping any nested tab panel. */
function ownMarkers(node: Node): string[] {
  const out: string[] = [];
  const walk = (n: Node) => {
    if (n.nodeName === "#text") {
      out.push(...(n.value ?? "").match(MARKER) ?? []);
      return;
    }
    if (n.tagName === "script" || n.tagName === "style") return;
    if (classes(n).includes("hextra-tabs-panel")) return;
    for (const child of n.childNodes ?? []) walk(child);
  };
  for (const child of node.childNodes ?? []) walk(child);
  return out;
}

/**
 * Tab groups inside `container`, each with its panels and, recursively, the
 * groups inside those panels.
 *
 * Descends through non-group elements, because a group is routinely wrapped in
 * something else: a step, a list item, a callout body. It does NOT descend
 * through a group it has already reported — a nested group is reached via its
 * parent panel, so scanning the panels wrapper again would list it twice, once
 * as a child and once as a sibling of its own parent.
 */
function groupsIn(container: Node, depth: number): TabGroup[] {
  const out: TabGroup[] = [];
  const kids = elementChildren(container);

  for (let i = 0; i < kids.length; i++) {
    const tablist = tablistIn(kids[i]);
    if (!tablist) {
      out.push(...groupsIn(kids[i], depth));
      continue;
    }

    // Panels live in the next element sibling, never inside the bar's wrapper.
    // A missing sibling yields a group with zero panels rather than a throw, so
    // a spec asserting "two panels" reports the shape it found.
    const panelsWrapper = kids[i + 1];
    const panelNodes = panelsWrapper
      ? elementChildren(panelsWrapper).filter((n) =>
          classes(n).includes("hextra-tabs-panel"),
        )
      : [];

    const buttons = elementChildren(tablist).filter(
      (n) => attr(n, "role") === "tab",
    );

    out.push({
      names: buttons.map(buttonName),
      buttonIds: buttons.map((b) => attr(b, "id")),
      depth,
      panels: panelNodes.map((p) => ({
        id: attr(p, "id"),
        labelledBy: attr(p, "aria-labelledby"),
        visible: attr(p, "aria-hidden") === "false",
        markers: ownMarkers(p),
        groups: groupsIn(p, depth + 1),
      })),
    });

    // Skip the panels wrapper: its own children are panels, already walked.
    if (panelNodes.length) i++;
  }

  return out;
}

/** The article content region (`div.content`), or null. */
function contentRegion(html: string): Node | null {
  const doc = parse(html) as unknown as Node;
  let found: Node | null = null;
  const walk = (node: Node) => {
    if (found) return;
    if (node.tagName === "div" && classes(node).includes("content")) {
      found = node;
      return;
    }
    for (const child of elementChildren(node)) walk(child);
  };
  walk(doc);
  return found;
}

/**
 * Top-level tab groups on a built page, in document order, each carrying its
 * nested groups. Empty when the page has no content region or no tabs.
 *
 * Scoped to `div.content` so the sidebar and TOC can never contribute.
 */
export function tabGroups(html: string): TabGroup[] {
  const content = contentRegion(html);
  if (!content) return [];
  return groupsIn(content, 0);
}

/** Every group in the tree, flattened, parents before children. */
export function flattenGroups(groups: TabGroup[]): TabGroup[] {
  const out: TabGroup[] = [];
  for (const g of groups) {
    out.push(g);
    for (const p of g.panels) out.push(...flattenGroups(p.groups));
  }
  return out;
}
