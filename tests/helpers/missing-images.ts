// Scanner for image references in rendered HTML that point at a file the
// build did NOT publish — a "missing image" (the reader sees a broken-image
// icon, and the docs link checker, if run, reports a 404). It is the image
// analogue of markdown-leaks: a pure, unit-testable extractor plus a
// built-HTML scan across every page.
//
// Why a dedicated check when a link checker (lychee) also catches 404s:
//   • Not every consumer runs a link checker, and the ones that do run it
//     less often than these fast file-read scans.
//   • The theme resolves image sources through several indirections
//     (reuse-image / reuse-image-dark, the auto version-resolved-image
//     splice, cards' `image=`). A typo or a missing per-version override
//     silently falls through to a path that was never published. This scan
//     catches that at the exact <img>/<source> that broke, with the tag as
//     context, before the page ships.
//
// Scope: local `src` on <img>, and every candidate URL in a `srcset` on
// <img>/<source> (the light/dark <picture> variants the theme emits). Remote
// (`http:`, `https:`, protocol-relative `//`), inline (`data:`), and empty
// references are skipped — only same-origin files, which are the ones this
// build is responsible for having published.

export type MissingImage = {
  attr: "src" | "srcset"; // which attribute the reference came from
  src: string; // the offending URL as authored (query/hash preserved)
  resolved: string; // absolute file path the URL resolved to on disk
  context: string; // the <img>/<source> tag, clamped, for grep guidance
};

export type ImageRef = {
  attr: "src" | "srcset";
  src: string;
  context: string;
};

function clamp(s: string, n: number): string {
  const collapsed = s.replace(/\s+/g, " ").trim();
  if (collapsed.length <= n) return collapsed;
  return collapsed.slice(0, n - 1) + "…";
}

// Blank out regions whose contents are not real page markup: <script>
// (copy-as-markdown embeds the page's raw markdown source, which can mention
// image syntax), <style>, and HTML comments (authors tuck commented-out
// <img> tags in as TODOs). Same-length replacement keeps tag offsets stable.
function stripUnscanned(html: string): string {
  const blanks = (input: string, re: RegExp) =>
    input.replace(re, (m) => " ".repeat(m.length));
  let out = html;
  out = blanks(out, /<!--[\s\S]*?-->/g);
  out = blanks(out, /<script[\s\S]*?<\/script>/gi);
  out = blanks(out, /<style[\s\S]*?<\/style>/gi);
  return out;
}

// A reference this build is responsible for publishing. Remote and inline
// forms are someone else's problem (or not a file at all).
export function isLocalImage(src: string): boolean {
  const s = src.trim();
  if (s === "") return false;
  if (s.startsWith("#")) return false; // in-page fragment, not a file
  if (s.startsWith("//")) return false; // protocol-relative → remote
  if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return false; // http:, https:, data:, mailto:, …
  return true;
}

// Split a srcset attribute into its candidate URLs. `srcset` is a
// comma-separated list of `<url> [descriptor]`; the URL is the first
// whitespace-delimited token of each candidate. Data URIs (which can contain
// commas) are excluded upstream by isLocalImage, so a naive comma split is
// safe for the file URLs we care about.
export function srcsetUrls(srcset: string): string[] {
  return srcset
    .split(",")
    .map((c) => c.trim().split(/\s+/)[0])
    .filter((u) => u.length > 0);
}

// Pull every image reference out of the (script/style/comment-stripped) HTML:
// the `src` of each <img>, and each candidate URL in a `srcset` on an <img>
// or <source>. Only local references are returned.
export function extractImageRefs(html: string): ImageRef[] {
  const cleaned = stripUnscanned(html);
  const refs: ImageRef[] = [];

  const tagRe = /<(img|source)\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(cleaned)) !== null) {
    const tag = m[0];
    const name = m[1].toLowerCase();
    const context = clamp(tag, 160);

    if (name === "img") {
      const srcM = tag.match(/\bsrc\s*=\s*"([^"]*)"|\bsrc\s*=\s*'([^']*)'/i);
      const src = srcM ? (srcM[1] ?? srcM[2]) : null;
      if (src !== null && isLocalImage(src)) {
        refs.push({ attr: "src", src, context });
      }
    }

    const setM = tag.match(
      /\bsrcset\s*=\s*"([^"]*)"|\bsrcset\s*=\s*'([^']*)'/i,
    );
    const srcset = setM ? (setM[1] ?? setM[2]) : null;
    if (srcset) {
      for (const u of srcsetUrls(srcset)) {
        if (isLocalImage(u)) refs.push({ attr: "srcset", src: u, context });
      }
    }
  }
  return refs;
}

// Decode the HTML character references a serializer puts in an attribute value.
//
// This is not optional politeness — an attribute value is ENCODED text, and the
// URL a browser requests is its DECODED form. Hugo emits `+` in a filename as
// `&#43;`, so `ui-clusters-2.10+.png` reaches the HTML as
// `ui-clusters-2.10&#43;.png`. Without decoding, the scanner looks for a file
// whose name literally contains "&#43;", finds nothing, and reports a missing
// image that in fact loads fine in a browser. That was 242 false positives on
// the gloo-mesh-enterprise build, every one of them a real file on disk.
//
// Numeric (decimal and hex) plus the five predefined named entities, which is
// everything a serializer will produce inside an attribute value.
export function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_m, d) => String.fromCodePoint(Number(d)))
    .replace(/&#[xX]([0-9a-fA-F]+);/g, (_m, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    // &amp; LAST, so "&amp;#43;" decodes to the literal text "&#43;" rather
    // than being double-decoded into "+".
    .replace(/&amp;/g, "&");
}

// Resolve an image URL to the file path a static server rooted at `builtRoot`
// would serve for a page at `pageFile`. Absolute URLs (`/img/x.svg`) resolve
// against builtRoot; relative URLs resolve against the page's own directory,
// matching how a browser resolves them from the page URL. HTML character
// references are decoded first (the attribute is encoded text), then the query
// string and fragment are stripped, then percent-encoding is decoded. Returns
// null when nothing is left to resolve (e.g. a bare `?query`).
export function resolveImagePath(
  src: string,
  pageFile: string,
  builtRoot: string,
  pathMod: typeof import("node:path"),
): string | null {
  let clean = decodeHtmlEntities(src).split(/[?#]/)[0];
  try {
    clean = decodeURIComponent(clean);
  } catch {
    // leave as-is if it isn't valid percent-encoding
  }
  clean = clean.trim();
  if (clean === "") return null;
  if (clean.startsWith("/")) {
    return pathMod.join(builtRoot, clean.replace(/^\/+/, ""));
  }
  return pathMod.resolve(pathMod.dirname(pageFile), clean);
}

// Find every local image reference on a page that doesn't resolve to a
// published file. `exists` and `pathMod` are injected so the resolution logic
// is unit-testable without touching the real filesystem.
export function findMissingImages(
  html: string,
  opts: {
    pageFile: string;
    builtRoot: string;
    exists: (p: string) => boolean;
    pathMod: typeof import("node:path");
    allowlist?: RegExp[];
  },
): MissingImage[] {
  const allowlist = opts.allowlist ?? [];
  const out: MissingImage[] = [];
  for (const ref of extractImageRefs(html)) {
    if (allowlist.some((re) => re.test(ref.src))) continue;
    const resolved = resolveImagePath(
      ref.src,
      opts.pageFile,
      opts.builtRoot,
      opts.pathMod,
    );
    if (resolved === null) continue;
    if (!opts.exists(resolved)) {
      out.push({
        attr: ref.attr,
        src: ref.src,
        resolved,
        context: ref.context,
      });
    }
  }
  return out;
}

export const __test = { stripUnscanned };
