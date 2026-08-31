"""Prepare a stitched book.html for SINGLE-DOCUMENT PDF rendering.

Companion to scripts/render-pdf.mjs, and distributed the same way: `module.mounts`
covers only layouts/assets/data, so this file cannot ride into a consumer as a
Hugo import. It lives here as fetchable content, curled straight from GitHub and
pinned to whatever version the consumer's go.mod already requires:

    RENDER_PDF_VERSION := $(shell awk '/solo-io\\/docs-theme-extras/ {print $$3}' go.mod)
    curl -fsSL https://raw.githubusercontent.com/solo-io/docs-theme-extras/$(RENDER_PDF_VERSION)/scripts/prepare_book.py -o .pdf-tools/prepare_book-$(RENDER_PDF_VERSION).py

That keeps the go.mod bump the ONLY version pin, so the `book` layout templates
and the tooling that post-processes their output can never drift apart.

WHY THIS EXISTS
---------------
render-pdf.mjs drives Paged.js in Chromium and renders one book per top-level
section, merging the results. Chunking forces four compromises: no table of
contents (each chunk's own TOC lists only its descendants, so none is complete),
page numbers that restart per chunk, a hand-built bookmark tree, and
cross-section links that fall back to the live website because the target
chapter is not in the chunk being rendered.

Rendering the whole tree as ONE document removes all four at once. What it
requires is globally unique ids, and that is the entire job of this script.

Hugo guarantees heading ids unique only within their own source page. Stitched,
kgateway.dev's tree carries 78 duplicated ids ("before-you-begin" alone appears
112 times) and gloo-mesh-enterprise's carries 148. Chunked, that was survivable
because render-pdf.mjs scoped every fragment lookup to the target chapter. In a
single document there is nothing to scope to: a reader clicking a cross-reference
would land on whichever copy came first.

So, in order:

1. Prefix every id with the id of the chapter that owns it, tracking assignments
   so two identical ids on the SAME page still come out distinct.
2. Rewrite every link, resolving it the way render-pdf.mjs does, against the page
   it actually came from rather than against book.html's own location.
3. Validate: zero duplicate ids, zero jumps pointing at ids that do not exist.

Run it between Hugo and the renderer:

    python3 prepare_book.py public/docs/book.html public/docs/book.html https://example.com --strict
    weasyprint public/docs/book.html public/downloads/docs.pdf

Requires lxml and cssselect. WeasyPrint itself is not imported here — this script
only rewrites HTML, so it stays useful whichever renderer consumes the result.
"""

import argparse
import copy
import os
import re
import sys
from urllib.parse import unquote, urljoin, urlparse

from lxml import etree
from lxml import html as lxml_html

# Separator between a chapter id and the id it owns. Two hyphens rather than
# one, so a rewritten id stays visually distinguishable from a heading whose
# own slug contains hyphens (nearly all of them do).
SEP = "--"

# Scheme for a jump that has to survive being written into one part and landing
# in another. WeasyPrint DROPS `<a href="#x">` when x is not in the document it
# is rendering ("ERROR: No anchor #x for internal URI reference"), so a split
# document would silently lose every cross-part link. An unknown scheme is kept
# as an ordinary link annotation instead, and merge_book.py turns it back into
# a real jump once every part is in the same file.
JUMP_SCHEME = "pdfjump:"

# Default ceiling for one part, in bytes of serialized HTML.
#
# Peak renderer memory tracks OUTPUT PAGES, not input bytes: measured across
# gloo-mesh-enterprise it is a steady ~1.6 MB per page from 347 pages up to
# 3,481. Input bytes are only a proxy for pages, and a leaky one — ordinary
# prose yields ~250 pages/MB while a table-dense reference page yields ~620,
# because table rows expand vertically far more than paragraphs do. So the
# ceiling is set for the table-dense case: 2 MB is ~1,240 pages ~= 2 GB there,
# and ~500 pages ~= 0.8 GB for prose. Both leave real headroom on a 16 GB
# runner, which is the point — the whole 15.8 MB document is ~6,800 pages and
# ~11 GB, and it does not survive.
DEFAULT_MAX_PART_BYTES = 2_000_000

# Emoji whose meaning IS a colour, and the colour to draw each one in.
#
# WHY THIS EXISTS. WeasyPrint cannot draw a colour font at all. Not badly — at
# all: rendered side by side, Noto Color Emoji (CBDT bitmap), Noto COLRv1 and
# Twemoji Mozilla (COLRv0) each embed into the PDF and each leave the glyph box
# completely blank. So the book is rendered with the MONOCHROME Noto Emoji
# outline font, which draws real shapes, and this pass puts the colour back by
# tinting them with CSS — an outline glyph honours `color`, a bitmap one does
# not, which is the whole reason the monochrome font is the one installed.
#
# Tinting rather than substituting a shape keeps the character itself in the
# PDF's text layer, so the emoji still copies, searches and reads out. It also
# keeps Noto Emoji's per-emoji hatching (🟡 is dotted, 🟢 is diagonally hatched,
# 🔴 is vertically striped), which means the distinction survives for a
# colour-blind reader too, instead of resting on hue alone.
#
# Colours are GitHub Primer values, so a table of status dots in the PDF reads
# the same way as the same table on the website.
EMOJI_COLOURS = {
    # Coloured circles and squares. Nothing but the colour distinguishes these
    # from each other, which is exactly why the monochrome render was reported
    # as "the yellow and green dots are grey now".
    "\U0001f534": "#cf222e",  # red circle
    "\U0001f7e0": "#bc4c00",  # orange circle
    "\U0001f7e1": "#d4a72c",  # yellow circle
    "\U0001f7e2": "#2da44e",  # green circle
    "\U0001f535": "#0969da",  # blue circle
    "\U0001f7e3": "#8250df",  # purple circle
    "\U0001f7e4": "#8b5a2b",  # brown circle
    "⚫": "#24292f",  # black circle
    "\U0001f7e5": "#cf222e",  # red square
    "\U0001f7e7": "#bc4c00",  # orange square
    "\U0001f7e8": "#d4a72c",  # yellow square
    "\U0001f7e9": "#2da44e",  # green square
    "\U0001f7e6": "#0969da",  # blue square
    "\U0001f7ea": "#8250df",  # purple square
    "\U0001f7eb": "#8b5a2b",  # brown square
    "⬛": "#24292f",  # black square
    # White circle and square are deliberately GREY, not white: the page is
    # white, so the honest colour would be an invisible one.
    "⚪": "#afb8c1",  # white circle
    "⬜": "#afb8c1",  # white square
    # Status marks. These stay legible in monochrome, so the tint is a
    # readability gain rather than a rescue — but a support matrix of 582 green
    # ticks and 148 red crosses is a great deal faster to scan in colour.
    "✅": "#1a7f37",  # white heavy check mark
    "✔": "#1a7f37",  # heavy check mark
    "❌": "#cf222e",  # cross mark
    "❎": "#cf222e",  # negative squared cross mark
    "✖": "#cf222e",  # heavy multiplication x
    "❗": "#cf222e",  # heavy exclamation mark
    "⛔": "#cf222e",  # no entry
    "\U0001f6ab": "#cf222e",  # prohibited
    "⚠": "#bf8700",  # warning sign
    "❓": "#0969da",  # question mark
    "ℹ": "#0969da",  # information source
}

# Each mapped character, optionally followed by VARIATION SELECTOR-16, which is
# what turns a dual-use dingbat into its emoji presentation ("⚠️" is U+26A0
# U+FE0F, two codepoints). The selector has to be inside the span with the
# character it modifies, or it becomes a stray codepoint in the text layer.
EMOJI_RE = re.compile("([" + "".join(EMOJI_COLOURS) + "])\\uFE0F?")


def normalize(path):
    """Trailing-slash-insensitive form, for matching a link against a chapter."""
    return path.rstrip("/") or "/"


def uniquify_ids(chapters):
    """Prefix every id inside a chapter with that chapter's own id.

    Returns {chapter id: {old id: new id}}. Prefixing alone is not sufficient:
    Hugo uniquifies heading ids within a page, but a `reuse`/conref block
    carries its ids along pre-baked, so one page really can contain the same id
    twice (gloo-mesh-enterprise has four such collisions). Every assigned id is
    tracked so those still come out distinct.
    """
    id_maps = {}
    renamed = 0
    taken = {ch.get("id") for ch in chapters if ch.get("id")}

    for ch in chapters:
        ch_id = ch.get("id")
        if not ch_id:
            continue
        local = {}
        for el in ch.iter():
            if el is ch:
                continue
            old = el.get("id")
            if not old:
                continue
            new = f"{ch_id}{SEP}{old}"
            if new in taken:
                n = 2
                while f"{new}-{n}" in taken:
                    n += 1
                new = f"{new}-{n}"
            taken.add(new)
            el.set("id", new)
            # First occurrence wins for link resolution: a link to "#about"
            # from inside this chapter means the first "about", which is how a
            # browser resolves it too.
            local.setdefault(old, new)
            renamed += 1
        id_maps[ch_id] = local

    return id_maps, renamed


def enclosing_chapter(el):
    """Nearest ancestor .pdf-chapter, or None for the cover and the TOC."""
    node = el
    while node is not None:
        if node.tag == "section" and "pdf-chapter" in (node.get("class") or ""):
            return node
        node = node.getparent()
    return None


def rewrite_links(doc, chapters, id_maps, prod_host):
    """Turn every link into either an in-document jump or an absolute URL.

    Each link's RAW href is resolved against the page it came from (the
    enclosing chapter's data-source-path), NOT against book.html's own
    location, which sits one directory shallower than most of the pages it
    stitched together. A dot-relative link like "../observability/" is authored
    to work from its originating directory; resolved against book.html's
    instead, the same ".." climbs one level too far.
    """
    by_source = {
        normalize(ch.get("data-source-path")): ch
        for ch in chapters
        if ch.get("data-source-path")
    }
    parsed_host = urlparse(prod_host)
    prod_origin = f"{parsed_host.scheme}://{parsed_host.netloc}"
    stats = {"internal": 0, "external": 0, "intra": 0, "untouched": 0}

    for a in doc.iter("a"):
        href = a.get("href")
        if not href:
            continue
        chapter = enclosing_chapter(a)

        if href.startswith("#"):
            # Already a same-document jump. Inside a chapter it points at a
            # heading whose id just changed; in the book's own TOC it points at
            # a chapter id, which did not. Fragments arrive percent-encoded
            # when the heading text was non-ASCII, so try the decoded form too
            # ("#%e2%84%b9-low" is the id "ℹ-low").
            if chapter is None:
                stats["untouched"] += 1
                continue
            local = id_maps.get(chapter.get("id"), {})
            frag = href[1:]
            target = local.get(frag) or local.get(unquote(frag))
            if target:
                a.set("href", f"#{target}")
                stats["intra"] += 1
                continue
            # Resolves nowhere in its own chapter, which means it was already
            # broken on the live site. Point it at the real page rather than
            # leaving a jump that dead-ends inside the PDF.
            a.set("href", prod_host + chapter.get("data-source-path") + href)
            stats["external"] += 1
            continue

        source_path = chapter.get("data-source-path") if chapter is not None else "/"
        try:
            resolved = urljoin(prod_host + source_path, href)
        except ValueError:
            stats["untouched"] += 1
            continue
        parsed = urlparse(resolved)
        if f"{parsed.scheme}://{parsed.netloc}" != prod_origin:
            stats["untouched"] += 1
            continue

        target_ch = by_source.get(normalize(parsed.path))
        if target_ch is None:
            # Same origin but not in the book. Keep it ABSOLUTE: a
            # root-relative path gets baked into the PDF relative to wherever
            # the renderer loaded the file from, which is a throwaway local
            # server that is gone by the time anyone clicks.
            a.set("href", resolved)
            stats["external"] += 1
            continue

        ch_id = target_ch.get("id")
        frag = parsed.fragment
        if frag:
            local = id_maps.get(ch_id, {})
            new_frag = local.get(frag) or local.get(unquote(frag))
            a.set("href", f"#{new_frag or ch_id}")
        else:
            a.set("href", f"#{ch_id}")
        stats["internal"] += 1

    return stats


def validate(doc):
    """Duplicate ids and jumps that point at nothing. Both must be zero."""
    ids = {}
    for el in doc.iter():
        i = el.get("id")
        if i:
            ids[i] = ids.get(i, 0) + 1

    dupes = {k: v for k, v in ids.items() if v > 1}
    dangling = []
    jumps = 0
    for a in doc.iter("a"):
        href = a.get("href") or ""
        if href.startswith("#"):
            jumps += 1
            if href[1:] not in ids:
                dangling.append(href)
    return ids, dupes, jumps, dangling


def fix_svg_fonts(root):
    """Drop the "Segoe UI Emoji" fallback from diagram SVGs under `root`.

    Excalidraw exports every text run as font-family="Helvetica, Segoe UI Emoji".
    That second family does not exist on Linux, and WeasyPrint resolves the
    SPACE character through the broken fallback, giving it a wildly wrong
    advance: "Gloo Mesh resources" renders as "Gloo    Mesh    resources", and
    a diagram legend turns into overlapping words. Helvetica alone resolves to
    Liberation Sans (Arial metrics) and lays out correctly.

    Rewrites the BUILT copies under public/, never the sources in assets/ —
    the website wants the fallback, only this renderer is confused by it.
    """
    changed = 0
    for dirpath, _, names in os.walk(root):
        for name in names:
            if not name.endswith(".svg"):
                continue
            path = os.path.join(dirpath, name)
            try:
                with open(path, encoding="utf-8", errors="ignore") as fh:
                    svg = fh.read()
            except OSError:
                continue
            if "Helvetica, Segoe UI Emoji" not in svg:
                continue
            with open(path, "w", encoding="utf-8") as fh:
                fh.write(svg.replace("Helvetica, Segoe UI Emoji", "Helvetica"))
            changed += 1
    return changed


def replace_iframes(doc):
    """Turn each embedded player into a link.

    An <iframe> has no meaning in a PDF — WeasyPrint draws it as a thin empty
    box, which reads as a broken image right after a sentence promising a
    video. A link at least tells the reader what was there and how to reach it.
    """
    n = 0
    for frame in list(doc.iter("iframe")):
        src = frame.get("src") or ""
        parent = frame.getparent()
        if parent is None or not src:
            continue
        if src.startswith("//"):
            src = "https:" + src
        # A YouTube embed URL is not the page a human can open.
        watch = src.replace("/embed/", "/watch?v=") if "/embed/" in src else src
        title = frame.get("title") or "Video"
        p = etree.Element("p")
        p.set("class", "pdf-embed-link")
        p.text = f"{title}: "
        a = etree.SubElement(p, "a")
        a.set("href", watch)
        a.text = watch
        parent.replace(frame, p)
        n += 1
    return n


def _tint_run(parent, index, text):
    """Wrap every mapped emoji in one text run, returning how many were wrapped.

    `index` is None for parent.text, otherwise the position of the child whose
    .tail holds the run. Every match in the run is handled in this one call, so
    no tail this creates can still contain an emoji — which is what keeps the
    caller from having to re-scan its own output.
    """
    pieces, pos = [], 0
    for m in EMOJI_RE.finditer(text):
        pieces.append((text[pos:m.start()], m.group(0)))
        pos = m.end()
    if not pieces:
        return 0
    trailing = text[pos:]

    spans = []
    for before, emoji in pieces:
        span = etree.Element("span")
        span.set("class", "pdf-emoji")
        span.set("style", f"color:{EMOJI_COLOURS[emoji[0]]}")
        span.text = emoji
        spans.append((before, span))

    # The text before the FIRST emoji stays where the run started; every later
    # literal becomes the tail of the span that precedes it.
    if index is None:
        parent.text = spans[0][0]
        at = 0
    else:
        parent[index].tail = spans[0][0]
        at = index + 1

    for k, (_, span) in enumerate(spans):
        parent.insert(at + k, span)
        span.tail = spans[k + 1][0] if k + 1 < len(spans) else trailing
    return len(spans)


def colorize_emoji(doc):
    """Tint every mapped emoji so it prints in colour instead of black.

    See EMOJI_COLOURS for why this is needed at all: WeasyPrint draws nothing
    whatsoever for a colour font, so the book is rendered with a monochrome
    outline font and the colour is reapplied here, as CSS on the character.

    Opt-in (--color-emoji), because it is a WeasyPrint workaround: a Paged.js
    consumer renders in Chromium, which draws the real colour font, and there
    the tint would repaint emoji that are already correct.
    """
    n = 0
    # A snapshot, not a live walk: this inserts elements, and iterating the
    # document while adding to it would hand the loop its own new spans.
    for parent in list(doc.iter()):
        if parent.tag in ("script", "style") or not isinstance(parent.tag, str):
            continue
        # A span this pass already made. Without this the function is not
        # idempotent: run it twice and every emoji ends up wrapped in a wrapped
        # wrapper, since the second run's snapshot DOES include the spans the
        # first run added.
        if "pdf-emoji" in (parent.get("class") or ""):
            continue
        if parent.text:
            n += _tint_run(parent, None, parent.text)
        # Right to left, so inserting after child i cannot shift a child this
        # loop has yet to reach.
        for i in range(len(parent) - 1, -1, -1):
            tail = parent[i].tail
            if tail:
                n += _tint_run(parent, i, tail)
    return n


def to_jump_scheme(doc):
    """Rewrite every same-document jump to the JUMP_SCHEME form.

    Applied to the WHOLE document before splitting, not just to the links that
    happen to cross a part boundary. Uniform rewriting means the splitter never
    has to know which part a target landed in, which removes the entire class
    of off-by-one boundary bugs — and costs nothing, because the intermediate
    part PDFs are never shipped.
    """
    n = 0
    for a in doc.iter("a"):
        href = a.get("href") or ""
        if href.startswith("#"):
            a.set("href", JUMP_SCHEME + href[1:])
            n += 1
    return n


def _size(el):
    return len(lxml_html.tostring(el))


def slice_oversized(ch, max_bytes):
    """Cut one chapter into slices, each at most max_bytes where possible.

    Boundaries fall BETWEEN direct children, so no table, list or `details`
    block is ever cut in half. Heading boundaries are not used: the element
    that forces this path in gloo-mesh-enterprise (the CVE scan reference, 5.4
    MB and a third of the whole book) has 306 direct children and just two
    headings, so heading-splitting would not divide it at all.

    The first slice keeps the chapter's id; continuations must not, since ids
    have to stay unique document-wide. Descendant ids are untouched, and those
    are what links actually target. Each continuation carries a copy of the
    breadcrumb source element so the running header stays right, and is marked
    `pdf-chapter-cont` so the stylesheet does not start a fresh page for it.
    """
    kids = list(ch)
    if not kids:
        return [ch]

    sizes = [_size(k) for k in kids]
    runs, cur, cur_size = [], [], 0
    for k, n in zip(kids, sizes):
        if cur and cur_size + n > max_bytes:
            runs.append(cur)
            cur, cur_size = [], 0
        cur.append(k)
        cur_size += n
    if cur:
        runs.append(cur)

    if len(runs) == 1:
        return [ch]

    # The breadcrumb source is emitted as the chapter's first child; copy it
    # into each continuation so @top-left keeps resolving string(pdf-breadcrumb).
    crumb = None
    if kids and "pdf-breadcrumb-source" in (kids[0].get("class") or ""):
        crumb = kids[0]

    slices = []
    for i, run in enumerate(runs):
        if i == 0:
            for k in list(ch):
                if k not in run:
                    ch.remove(k)
            slices.append(ch)
            continue
        cont = etree.Element(ch.tag)
        for key, val in ch.attrib.items():
            cont.set(key, val)
        cont.set("class", (ch.get("class") or "") + " pdf-chapter-cont")
        if "id" in cont.attrib:
            del cont.attrib["id"]
        if crumb is not None:
            cont.append(copy.deepcopy(crumb))
        for k in run:
            cont.append(k)  # moves it out of ch
        slices.append(cont)
    return slices


def split_body(doc, max_bytes):
    """Group the body's children into parts of at most max_bytes.

    Returns a list of lists of elements, in document order. Elements are still
    attached to the source tree; write_parts moves them out one part at a time
    so the whole document is never duplicated in memory.
    """
    units, oversized = [], 0
    for child in list(doc.body):
        n = _size(child)
        if n > max_bytes and "pdf-chapter" in (child.get("class") or ""):
            pieces = slice_oversized(child, max_bytes)
            if len(pieces) > 1:
                oversized += 1
            units.extend(pieces)
        else:
            units.append(child)

    parts, cur, cur_size = [], [], 0
    for u in units:
        n = _size(u)
        if cur and cur_size + n > max_bytes:
            parts.append(cur)
            cur, cur_size = [], 0
        cur.append(u)
        cur_size += n
    if cur:
        parts.append(cur)
    return parts, oversized


def write_parts(doc, parts, stem):
    """Write each part as a standalone document sharing the original <head>."""
    head = doc.find("head")
    body_attrib = dict(doc.body.attrib)
    written = []

    for i, part in enumerate(parts, 1):
        root = etree.Element("html")
        for k, v in doc.attrib.items():
            root.set(k, v)
        if head is not None:
            root.append(copy.deepcopy(head))
        body = etree.SubElement(root, "body")
        for k, v in body_attrib.items():
            body.set(k, v)
        for el in part:
            body.append(el)  # moves it out of the source tree

        path = f"{stem}.part{i:02d}.html"
        with open(path, "wb") as fh:
            fh.write(lxml_html.tostring(root, doctype="<!DOCTYPE html>"))
        written.append((path, os.path.getsize(path)))
        root.clear()

    return written


def prepare(src_path, out_path, prod_host, color_emoji=False):
    doc = lxml_html.parse(src_path).getroot()
    chapters = doc.cssselect("section.pdf-chapter[data-source-path]")
    if not chapters:
        raise SystemExit(
            f"{src_path}: no .pdf-chapter[data-source-path] elements found. "
            "Is this really a `book` output-format document?"
        )

    id_maps, renamed = uniquify_ids(chapters)
    stats = rewrite_links(doc, chapters, id_maps, prod_host)

    iframes = replace_iframes(doc)
    stats["emoji"] = colorize_emoji(doc) if color_emoji else 0

    # The `details` shortcode defaults to closed, which is right for a
    # browsable page and wrong for a PDF, where there is no click affordance
    # and a closed block would just hide its content permanently.
    for d in doc.iter("details"):
        d.set("open", "open")

    # Paged.js has no role in a WeasyPrint render, and a renderer that ignores
    # scripts still pays to fetch them.
    for s in list(doc.iter("script")):
        s.getparent().remove(s)

    with open(out_path, "wb") as fh:
        fh.write(lxml_html.tostring(doc, doctype="<!DOCTYPE html>"))

    return len(chapters), renamed, stats, iframes, doc


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("source", help="stitched book.html from the `book` output format")
    ap.add_argument("output", help="where to write the prepared HTML (may equal source)")
    ap.add_argument("prod_host", help="site origin, e.g. https://kgateway.dev")
    ap.add_argument(
        "--strict",
        action="store_true",
        help="exit non-zero if any duplicate id or dangling jump survives",
    )
    ap.add_argument(
        "--fix-svg-fonts",
        metavar="DIR",
        help=(
            "rewrite built SVGs under DIR to drop the non-existent "
            "\"Segoe UI Emoji\" font fallback, which makes WeasyPrint render "
            "spaces in diagram text at the wrong width. Point it at the build "
            "output (e.g. public), never at the sources."
        ),
    )
    ap.add_argument(
        "--color-emoji",
        action="store_true",
        help=(
            "tint the emoji this script knows a colour for, so they print in "
            "colour under WeasyPrint. Needed because WeasyPrint draws nothing "
            "at all for a colour font, so the book is rendered with a "
            "monochrome outline font instead. Leave it off for a Paged.js "
            "consumer, which renders the real colour font in Chromium."
        ),
    )
    ap.add_argument(
        "--max-part-bytes",
        type=int,
        default=DEFAULT_MAX_PART_BYTES,
        metavar="N",
        help=(
            "split the prepared document into parts of at most N bytes, written "
            "next to OUTPUT as <stem>.partNN.html and listed in <stem>.parts.txt. "
            "0 disables splitting. Rendering one part at a time is what keeps "
            "peak memory bounded; merge_book.py reassembles the PDFs."
        ),
    )
    args = ap.parse_args()

    if args.fix_svg_fonts:
        print(f"SVGs de-fallbacked:       {fix_svg_fonts(args.fix_svg_fonts)}")

    chapters, renamed, stats, iframes, doc = prepare(
        args.source, args.output, args.prod_host, color_emoji=args.color_emoji
    )
    ids, dupes, jumps, dangling = validate(doc)

    print(f"chapters:                 {chapters}")
    print(f"ids rewritten:            {renamed}")
    print(f"links to in-PDF chapters: {stats['internal']}")
    print(f"links within a chapter:   {stats['intra']}")
    print(f"links made absolute:      {stats['external']}")
    print(f"links left alone:         {stats['untouched']}")
    print(f"iframes made links:       {iframes}")
    print(f"emoji tinted:             {stats['emoji']}")
    print(f"total ids:                {len(ids)}")
    print(f"same-document jumps:      {jumps}")
    print(f"duplicate ids:            {len(dupes)}")
    print(f"dangling jumps:           {len(dangling)}")

    for k, v in sorted(dupes.items(), key=lambda kv: -kv[1])[:10]:
        print(f"  duplicate: {k} x{v}", file=sys.stderr)
    for d in dangling[:10]:
        print(f"  dangling:  {d}", file=sys.stderr)

    if args.strict and (dupes or dangling):
        print(
            f"FAILED: {len(dupes)} duplicate ids, {len(dangling)} dangling jumps.",
            file=sys.stderr,
        )
        return 1

    # Split AFTER validating: validate() checks "#id" jumps against the ids in
    # one document, which is exactly the invariant the split relies on and the
    # last moment it can be checked on a whole document.
    if args.max_part_bytes > 0:
        converted = to_jump_scheme(doc)
        parts, oversized = split_body(doc, args.max_part_bytes)
        stem = args.output[:-5] if args.output.endswith(".html") else args.output
        written = write_parts(doc, parts, stem)

        manifest = f"{stem}.parts.txt"
        with open(manifest, "w") as fh:
            fh.write("".join(f"{p}\n" for p, _ in written))

        print(f"jumps deferred to merge:  {converted}")
        print(f"chapters sliced:          {oversized}")
        print(f"parts written:            {len(written)} -> {manifest}")
        for p, n in written:
            print(f"  {os.path.basename(p)}  {n / 1024 / 1024:.1f} MB")
        big = [(p, n) for p, n in written if n > args.max_part_bytes * 1.5]
        for p, n in big:
            print(
                f"  NOTE: {os.path.basename(p)} is {n / 1024 / 1024:.1f} MB, past the "
                f"{args.max_part_bytes / 1024 / 1024:.1f} MB target — it holds a single "
                "child element that cannot be divided further.",
                file=sys.stderr,
            )
    return 0


if __name__ == "__main__":
    sys.exit(main())
