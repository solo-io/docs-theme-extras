// ancestor-path — for every MARKER_*/COND_* sentinel in a built page, record the
// full chain of elements it sits inside.
//
// WHY A REAL HTML PARSER
//
// The existing `versioning.spec.ts` equivalence check counts tags: it asserts the
// `everything` and `rebased` pages contain the same number of `<li>`, `<td>`, and
// so on. That is blind to the exact failure this whole effort is about.
// CONTAINER EJECTION does not change the count of anything — the `<li>` still
// exists, the heading still exists, they have simply moved to a different parent.
// solo-io/docs#3280 comment 2 is precisely this: a heading ejected out of
// `.content` renders unstyled while every count stays equal.
//
// Counting also cannot distinguish "`<li>` inside the right `<ol>`" from "`<li>`
// inside a severed `<ol start=2>`", which is the ordered-list split. So the
// diagnostic has to be structural, and the issue says so explicitly: use a real
// HTML parser, not div-counting or byte comparison.
//
// parse5 is the right tool — spec-compliant, no browser, and it applies the HTML
// tree-construction algorithm, so it reproduces the same implied-end-tag and
// foster-parenting fixups a browser would. A regex could not: the whole point is
// to see where the parser DECIDED an element lives, which is often not where the
// source put it.

import fs from "node:fs";
import { parse, serialize } from "parse5";

const MARKER = /\b(?:MARKER|COND)_[A-Z0-9_]+\b/g;

// Elements whose tag name alone says nothing about position. For these, the
// first meaningful class is appended so the path stays diagnostic.
const NEEDS_CLASS = new Set(["div", "span", "section", "aside", "nav"]);

type Node = {
  nodeName: string;
  tagName?: string;
  value?: string;
  childNodes?: Node[];
  attrs?: { name: string; value: string }[];
};

/** First class that is not a Hextra/Tailwind utility, so paths do not churn when
    the CSS pipeline changes. */
function structuralClass(node: Node): string {
  const cls = node.attrs?.find((a) => a.name === "class")?.value ?? "";
  const first = cls
    .split(/\s+/)
    .find((c) => c && !c.startsWith("hx:") && !c.startsWith("hx-"));
  return first ? `.${first}` : "";
}

function label(node: Node): string {
  const tag = node.tagName!;
  return NEEDS_CLASS.has(tag) ? `${tag}${structuralClass(node)}` : tag;
}

/**
 * Map every marker on the page to its ancestor chain, e.g.
 *   MARKER_X -> "main > div.content > ol > li > p"
 *
 * Markers inside the copy-as-markdown source blob are skipped: that
 * `<script type="text/markdown">` carries a second copy of the whole page, so
 * including it would double every entry and couple the snapshot to markdown
 * serialization rather than to DOM structure.
 */
export function markerAncestorPaths(html: string): Map<string, string> {
  const doc = parse(html) as unknown as Node;
  const out = new Map<string, string>();

  const walk = (node: Node, path: string[]) => {
    if (node.nodeName === "#text") {
      const text = node.value ?? "";
      for (const m of text.match(MARKER) ?? []) {
        // First occurrence wins; a marker repeated in nav/TOC would otherwise
        // overwrite the content one with a less interesting path.
        if (!out.has(m)) out.set(m, path.join(" > "));
      }
      return;
    }
    if (node.tagName === "script" || node.tagName === "style") return;
    const next = node.tagName ? [...path, label(node)] : path;
    for (const child of node.childNodes ?? []) walk(child, next);
  };

  walk(doc, []);
  return out;
}

export function markerAncestorPathsForFile(file: string): Map<string, string> {
  return markerAncestorPaths(fs.readFileSync(file, "utf8"));
}

/** Stable, diffable object form for snapshotting. */
export function toSnapshot(m: Map<string, string>): Record<string, string> {
  return Object.fromEntries([...m].sort(([a], [b]) => a.localeCompare(b)));
}

/**
 * Serialize just the article's content region (`main > .content`).
 *
 * Whole-page comparisons between two DIFFERENT pages are not sound: the
 * sidebar, breadcrumb, prev/next pager and TOC all link to page-relative URLs,
 * so `<a>` and `<div>` counts differ for reasons that have nothing to do with
 * how markdown rendered. Scoping to the content region makes the comparison
 * about the content.
 *
 * Returns "" when no content region is found, so callers can skip rather than
 * silently compare two empty strings.
 */
export function extractContent(html: string): string {
  const doc = parse(html) as unknown as Node;
  let found: Node | null = null;

  const walk = (node: Node) => {
    if (found) return;
    const cls = node.attrs?.find((a) => a.name === "class")?.value ?? "";
    if (node.tagName === "div" && cls.split(/\s+/).includes("content")) {
      found = node;
      return;
    }
    for (const child of node.childNodes ?? []) walk(child);
  };
  walk(doc);

  if (!found) return "";
  return serialize(found as never);
}

/** Visible text of an element subtree, whitespace-collapsed. */
function textOf(node: Node): string {
  if (node.nodeName === "#text") return node.value ?? "";
  if (node.tagName === "script" || node.tagName === "style") return "";
  return (node.childNodes ?? []).map(textOf).join("");
}

/**
 * Split the content region into `<h2>`-delimited sections, keyed by heading
 * text and valued by the serialized HTML of everything between that heading and
 * the next one.
 *
 * The heading element itself is excluded: Hugo injects a unique `id` and a
 * permalink anchor into every heading, so including it would make two otherwise
 * identical sections always differ.
 */
export function sectionsByHeading(html: string): Map<string, string> {
  const doc = parse(html) as unknown as Node;
  let content: Node | null = null;
  const findContent = (node: Node) => {
    if (content) return;
    const cls = node.attrs?.find((a) => a.name === "class")?.value ?? "";
    if (node.tagName === "div" && cls.split(/\s+/).includes("content")) {
      content = node;
      return;
    }
    for (const child of node.childNodes ?? []) findContent(child);
  };
  findContent(doc);

  const out = new Map<string, string>();
  if (!content) return out;

  let current: string | null = null;
  let buf: string[] = [];
  const flush = () => {
    if (current !== null) out.set(current, buf.join(""));
    buf = [];
  };
  for (const child of (content as Node).childNodes ?? []) {
    if (child.tagName === "h2") {
      flush();
      current = textOf(child).replace(/\s+/g, " ").trim();
      continue;
    }
    if (current !== null) buf.push(serialize({ childNodes: [child] } as never));
  }
  flush();
  return out;
}
