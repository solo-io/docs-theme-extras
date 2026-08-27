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
import sys
from urllib.parse import unquote, urljoin, urlparse

from lxml import html as lxml_html

# Separator between a chapter id and the id it owns. Two hyphens rather than
# one, so a rewritten id stays visually distinguishable from a heading whose
# own slug contains hyphens (nearly all of them do).
SEP = "--"


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


def prepare(src_path, out_path, prod_host):
    doc = lxml_html.parse(src_path).getroot()
    chapters = doc.cssselect("section.pdf-chapter[data-source-path]")
    if not chapters:
        raise SystemExit(
            f"{src_path}: no .pdf-chapter[data-source-path] elements found. "
            "Is this really a `book` output-format document?"
        )

    id_maps, renamed = uniquify_ids(chapters)
    stats = rewrite_links(doc, chapters, id_maps, prod_host)

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

    return len(chapters), renamed, stats, doc


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
    args = ap.parse_args()

    chapters, renamed, stats, doc = prepare(args.source, args.output, args.prod_host)
    ids, dupes, jumps, dangling = validate(doc)

    print(f"chapters:                 {chapters}")
    print(f"ids rewritten:            {renamed}")
    print(f"links to in-PDF chapters: {stats['internal']}")
    print(f"links within a chapter:   {stats['intra']}")
    print(f"links made absolute:      {stats['external']}")
    print(f"links left alone:         {stats['untouched']}")
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
    return 0


if __name__ == "__main__":
    sys.exit(main())
