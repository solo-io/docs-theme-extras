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

Page numbering is NOT handled here — it is baked into each page during layout,
so the caller renders parts in order and passes each one a stylesheet setting
`@page :first { counter-reset: page N }`. That is also why parts must render
sequentially rather than in parallel.

    python3 merge_book.py out.pdf part01.pdf part02.pdf ...

Requires pypdf.
"""

import argparse
import json
import sys
from urllib.parse import unquote

from pypdf import PdfWriter
from pypdf.generic import IndirectObject, NameObject

JUMP_SCHEME = "pdfjump:"


def page_numbers(writer, dests):
    """Map each named destination to the printed page number it lands on.

    Used to fill in the printed table of contents (see number_toc.py): once
    every part is in one file, a destination's page is finally knowable.

    The reverse index is built ONCE. pypdf's get_page_number() scans the page
    list per call, so resolving ~2,900 destinations against a ~6,500-page book
    that way is ~19 million comparisons; this is two linear passes.

    "Printed page number" is index + 1 because the caller renders parts in
    order and hands each one `@page :first { counter-reset: page N }` with N
    picking up exactly where the previous part stopped — so the counter never
    diverges from the physical position. There is no front matter numbered
    separately and no page-label dictionary to consult.
    """
    index = {}
    for i, page in enumerate(writer.pages):
        ref = page.indirect_reference
        if ref is not None:
            index[(ref.idnum, ref.generation)] = i + 1

    out = {}
    for name, dest in dests.items():
        target = dest.dest_array[0] if dest.dest_array else None
        if isinstance(target, IndirectObject):
            n = index.get((target.idnum, target.generation))
            if n is not None:
                out[str(name)] = n
    return out


def merge(parts, out_path, page_map_path=None):
    writer = PdfWriter()
    for p in parts:
        # append (not add_page) so each part's outline entries and named
        # destinations come with it; the merged bookmark tree keeps its
        # nesting and its order.
        writer.append(p)

    dests = dict(writer.named_destinations)

    if page_map_path:
        with open(page_map_path, "w", encoding="utf-8") as fh:
            json.dump(page_numbers(writer, dests), fh)

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
    return len(writer.pages), len(dests), fixed, kept, unresolved


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
    args = ap.parse_args()

    pages, dests, fixed, kept, unresolved = merge(
        args.parts, args.output, args.page_map
    )

    print(f"parts merged:             {len(args.parts)}")
    print(f"pages:                    {pages}")
    print(f"named destinations:       {dests}")
    print(f"cross-part jumps rewired: {fixed}")
    print(f"same-part jumps kept:     {kept}")
    print(f"unresolved jumps:         {len(unresolved)}")

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
