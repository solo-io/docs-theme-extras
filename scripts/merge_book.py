"""Merge the part PDFs from a split book back into one document.

Companion to prepare_book.py --max-part-bytes, and distributed the same way:
curled from GitHub, pinned to the docs-theme-extras version the consumer's
go.mod already requires, so the book layout and the tooling that post-processes
its output can never drift apart.

WHY A SPLIT EXISTS AT ALL
-------------------------
Peak renderer memory tracks OUTPUT PAGES at a steady ~1.6 MB per page. The
gloo-mesh-enterprise book is ~6,800 pages, so a single-document render needs
~11 GB before overhead and is killed on a 16 GB runner — with no diagnosis: the
runner is torn down and the job reports only "the runner has received a
shutdown signal" and exit 143. Rendering bounded parts and merging keeps peak
memory proportional to the largest part instead of the whole book.

WHAT THIS SCRIPT RESTORES
-------------------------
Only one property of a single-document render does not survive splitting on its
own: links whose target sits in a different part. WeasyPrint writes an internal
link as a jump to a NAMED destination and emits one named destination for every
element with an id, whether or not anything links to it. Because prepare_book.py
already made ids unique document-wide, the merged file has a single global
namespace with no collisions, so a name written in part 1 resolves to a page in
part 7 for free.

The gap is that WeasyPrint DROPS `<a href="#x">` when x is absent from the part
being rendered, logging "No anchor #x for internal URI reference". So
prepare_book.py rewrites every jump to `pdfjump:<id>`, an unknown scheme that
survives as an ordinary link annotation, and this script turns those back into
real jumps once every part is in the same file.

The BOOKMARK TREE is the second thing the split breaks, and it is repaired here
too — see html_outline. Both repairs have the same shape: a property that is
obvious in one document has to be recomputed once every part is back together.

Page numbering is NOT handled here — it is baked into each page during layout,
so the caller renders parts in order and passes each one a stylesheet setting
`@page :first { counter-reset: page N }`. That is also why parts must render
sequentially rather than in parallel.

    python3 merge_book.py out.pdf part01.pdf part02.pdf ...

Requires pypdf, and lxml as well when --outline-from is used.
"""

import argparse
import json
import sys
from urllib.parse import unquote

from pypdf import PdfWriter
from pypdf.generic import IndirectObject, NameObject

JUMP_SCHEME = "pdfjump:"


def page_numbers(writer, dests, first_page=1):
    """Map each named destination to the printed page number it lands on.

    Used to fill in the printed table of contents (see number_toc.py): once
    every part is in one file, a destination's page is finally knowable.

    The reverse index is built ONCE. pypdf's get_page_number() scans the page
    list per call, so resolving ~2,900 destinations against a ~6,500-page book
    that way is ~19 million comparisons; this is two linear passes.

    `first_page` is the number PRINTED on the merged document's first physical
    page, and it is whatever the caller passed the first part as
    `@page :first { counter-reset: page N }`. It is 1 for a book that numbers
    its cover, and 0 for one that does not — with the cover unnumbered, the
    contents page is printed "1" while sitting at physical page 2, and a table
    of contents full of physical numbers would be off by one on every line.
    """
    index = {}
    for i, page in enumerate(writer.pages):
        ref = page.indirect_reference
        if ref is not None:
            index[(ref.idnum, ref.generation)] = i + first_page

    out = {}
    for name, dest in dests.items():
        target = dest.dest_array[0] if dest.dest_array else None
        if isinstance(target, IndirectObject):
            n = index.get((target.idnum, target.generation))
            if n is not None:
                out[str(name)] = n
    return out


HEADINGS = ("h1", "h2", "h3", "h4", "h5", "h6")


def html_outline(manifest_path):
    """Every heading in the book, as (level, title, anchor) in reading order.

    WHY THE OUTLINE HAS TO BE REBUILT
    ---------------------------------
    WeasyPrint derives the PDF bookmark tree from heading levels, and it does
    that PER DOCUMENT. Each part is its own document, so each part's tree is
    nested against the shallowest heading that part happens to contain — not
    against the book. Concatenating those trees gives a bookmark panel that is
    correct until the first part boundary and flat afterwards: in the
    gloo-mesh-enterprise manual, "Get started", "About" and "Setup" nest
    properly and then 56 more entries appear at the top level, most of them
    third- and fourth-level headings whose parents are in an earlier part.

    The part HTML still knows the real answer, because the levels there are
    absolute: the book layout emits a chapter at h2 + its depth, and
    utils/shift-headings.html pushes each page's own headings down to match. So
    the tree is read back from the HTML and rebuilt over the merged file.

    A chapter's title heading carries no id of its own — the <section> around
    it does — so the first id-less heading in a chapter borrows the section's
    id. Any later one is skipped rather than pointed at the same place twice.

    Requires lxml, imported here rather than at module scope so that merging
    without --outline-from keeps its single pypdf dependency.
    """
    from lxml import html as lxml_html

    with open(manifest_path, encoding="utf-8") as fh:
        parts = [line.strip() for line in fh if line.strip()]

    entries = []
    for path in parts:
        doc = lxml_html.parse(path).getroot()
        borrowed = set()
        for el in doc.iter(*HEADINGS):
            title = " ".join(el.text_content().split())
            if not title:
                continue
            anchor = el.get("id")
            if not anchor:
                section = el.getparent()
                while section is not None and "pdf-chapter" not in (
                    section.get("class") or ""
                ):
                    section = section.getparent()
                if section is None:
                    continue
                anchor = section.get("id")
                if not anchor or anchor in borrowed:
                    continue
                borrowed.add(anchor)
            entries.append((int(el.tag[1]), title, anchor))
    return entries


def write_outline(writer, entries, index):
    """Add `entries` to `writer` as one nested bookmark tree.

    `index` maps an anchor to its 0-based physical page. A heading whose anchor
    has no destination is skipped and counted: that means the id never reached
    the PDF, which is worth reporting but is not worth losing the rest of the
    tree over.

    is_open=False so a viewer opens the panel collapsed. A gloo-mesh-sized book
    has ~2,900 bookmarks, and expanding all of them by default buries the
    top-level sections the panel exists to show.
    """
    stack = []
    added = skipped = 0
    for level, title, anchor in entries:
        page = index.get(anchor)
        if page is None:
            skipped += 1
            continue
        while stack and stack[-1][0] >= level:
            stack.pop()
        parent = stack[-1][1] if stack else None
        ref = writer.add_outline_item(title, page, parent=parent, is_open=False)
        stack.append((level, ref))
        added += 1
    return added, skipped


def merge(parts, out_path, page_map_path=None, first_page=1, outline_manifest=None):
    writer = PdfWriter()
    for p in parts:
        # append (not add_page) so each part's named destinations come with it.
        # Its OUTLINE is deliberately dropped when this run is going to rebuild
        # one: the per-part trees cannot be stitched into a correct book tree,
        # only replaced. See html_outline.
        writer.append(p, import_outline=outline_manifest is None)

    dests = dict(writer.named_destinations)

    if page_map_path:
        with open(page_map_path, "w", encoding="utf-8") as fh:
            json.dump(page_numbers(writer, dests, first_page), fh)

    outline = None
    if outline_manifest:
        # 0-based physical pages, which is what add_outline_item indexes by,
        # regardless of what the pages are PRINTED as.
        physical = page_numbers(writer, dests, first_page=0)
        outline = write_outline(writer, html_outline(outline_manifest), physical)

    fixed = kept = 0
    unresolved = []
    for page in writer.pages:
        for annot in page.get("/Annots") or []:
            annot = annot.get_object()
            action = annot.get("/A")
            uri = action.get("/URI") if action else None
            if uri and str(uri).startswith(JUMP_SCHEME):
                target = str(uri)[len(JUMP_SCHEME):]
                # WeasyPrint percent-encodes non-ASCII when it writes a URI
                # action, so a heading id like "ℹ-low" comes back out of the
                # PDF as "%E2%84%B9-low" and no longer matches the destination
                # name taken from the id itself. prepare_book.py does the same
                # decode on the HTML side for the same reason.
                dest = dests.get(target) or dests.get(unquote(target))
                if dest is None:
                    unresolved.append(target)
                    continue
                del annot[NameObject("/A")]
                annot[NameObject("/Dest")] = dest.dest_array
                fixed += 1
            elif annot.get("/Dest") is not None:
                kept += 1

    writer.write(out_path)
    return len(writer.pages), len(dests), fixed, kept, unresolved, outline


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("output", help="merged PDF to write")
    ap.add_argument("parts", nargs="+", help="part PDFs, in reading order")
    ap.add_argument(
        "--allow-unresolved",
        action="store_true",
        help="warn instead of failing when a jump points at no destination",
    )
    ap.add_argument(
        "--page-map",
        metavar="PATH",
        help="also write a JSON map of destination name -> printed page number, "
        "for number_toc.py to fill the table of contents from",
    )
    ap.add_argument(
        "--first-page",
        type=int,
        default=1,
        metavar="N",
        help="the number PRINTED on the first physical page — the same N the "
        "first part was rendered with. 1 when the cover is numbered, 0 when it "
        "is not. Only affects --page-map.",
    )
    ap.add_argument(
        "--outline-from",
        metavar="MANIFEST",
        help="rebuild the PDF bookmark tree from the part HTML listed in "
        "MANIFEST (book.parts.txt), replacing the per-part trees WeasyPrint "
        "wrote. Without this the bookmark panel goes flat at every part "
        "boundary. Requires lxml.",
    )
    args = ap.parse_args()

    pages, dests, fixed, kept, unresolved, outline = merge(
        args.parts,
        args.output,
        args.page_map,
        first_page=args.first_page,
        outline_manifest=args.outline_from,
    )

    print(f"parts merged:             {len(args.parts)}")
    print(f"pages:                    {pages}")
    print(f"named destinations:       {dests}")
    print(f"cross-part jumps rewired: {fixed}")
    print(f"same-part jumps kept:     {kept}")
    print(f"unresolved jumps:         {len(unresolved)}")
    if outline:
        added, skipped = outline
        print(f"bookmarks rebuilt:        {added}")
        print(f"headings without a page:  {skipped}")

    for t in sorted(set(unresolved))[:10]:
        print(f"  unresolved: {t}", file=sys.stderr)

    if unresolved and not args.allow_unresolved:
        # The PDF-side counterpart of prepare_book.py --strict. An unresolved
        # jump is a dead cross-reference in a shipped manual, and it means a
        # part was rendered from stale HTML or omitted from the merge.
        print(
            f"FAILED: {len(unresolved)} jumps point at destinations that are not "
            "in the merged document. Were all parts rendered and passed in?",
            file=sys.stderr,
        )
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
