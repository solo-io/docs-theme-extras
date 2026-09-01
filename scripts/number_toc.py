"""Fill printed page numbers into a book's table of contents.

Companion to prepare_book.py and merge_book.py, and distributed the same way:
curled from GitHub, pinned to the docs-theme-extras version the consumer's
go.mod already requires, so the book layout and the tooling that post-processes
its output can never drift apart.

WHY THIS IS A SEPARATE PASS
---------------------------
CSS Paged Media can do this in one shot: `target-counter(attr(href url), page)`
on a TOC link prints the page its target landed on, and WeasyPrint supports it.
That works only while the whole book is ONE document — and a book long enough
to want a printed TOC is exactly the book prepare_book.py has to cut into parts
to keep the renderer inside a 16 GB runner. Once it is cut, every chapter the
TOC points at is in a different document than the TOC, and target-counter has
nothing to count.

So the page numbers come from the finished article instead. merge_book.py
--page-map writes out where every named destination actually landed, this
script writes those numbers into the TOC's empty spans, and the caller
re-renders just the part that holds the TOC and merges once more.

WHY THE SECOND RENDER DOES NOT INVALIDATE THE NUMBERS
-----------------------------------------------------
It would, if writing the numbers could reflow anything. `.pdf-toc-page` in
print-book.css is `flex: 0 0 3em`, a fixed width, so an empty box and a "1234"
box occupy identical space: no title rewraps, the TOC keeps the same number of
pages, and every chapter after it stays where it was. That is an invariant, not
a hope, so this script asserts it — pass --expect-pages with the page count the
TOC part had on the first render and it fails rather than shipping a TOC whose
numbers are quietly off by the amount it grew.

    python3 number_toc.py pages.json --manifest public/<product>/<v>/book.parts.txt

Prints the path of the part it rewrote (nothing, if no part holds a TOC), so
the caller can re-render exactly that one.

Requires lxml.
"""

import argparse
import json
import sys
from urllib.parse import unquote

from lxml import html as lxml_html

JUMP_SCHEME = "pdfjump:"


def target_of(href):
    """The destination name a TOC link points at, or None.

    Handles both forms because prepare_book.py rewrites `#x` to `pdfjump:x`
    before splitting, but a caller that skipped that step still has plain
    fragments. The unquote mirrors merge_book.py: WeasyPrint percent-encodes
    non-ASCII when it writes a URI action, so an id like "ℹ-low" comes back
    as "%E2%84%B9-low".
    """
    if not href:
        return None
    if href.startswith(JUMP_SCHEME):
        return unquote(href[len(JUMP_SCHEME):])
    if href.startswith("#"):
        return unquote(href[1:])
    return None


def number(path, pages):
    """Write page numbers into one part's TOC. Returns (filled, missing)."""
    doc = lxml_html.parse(path).getroot()

    filled = 0
    missing = []
    for a in doc.cssselect("nav.pdf-toc a"):
        slots = a.cssselect("span.pdf-toc-page")
        if not slots:
            continue
        target = target_of(a.get("href"))
        n = pages.get(target) if target else None
        if n is None:
            missing.append(target or "(no href)")
            continue
        slots[0].text = str(n)
        filled += 1

    if filled:
        with open(path, "wb") as fh:
            fh.write(lxml_html.tostring(doc, doctype="<!DOCTYPE html>"))
    return filled, missing


def find_toc_part(manifest):
    """The part that holds the TOC — normally the first, but not assumed.

    Scanning for the marker rather than taking parts[0] keeps this working if
    the split ever puts the front matter somewhere else, and makes "no TOC in
    this book" a clean no-op instead of a silent mis-edit of part 1.

    Matched WITHOUT the surrounding `class="` because a production Hugo build
    runs --minify, which strips attribute quotes: an anchored `class="pdf-toc"`
    would find nothing and silently skip numbering. Anything this over-matches
    is caught below, where a part with no TOC entries is treated as no TOC.
    """
    with open(manifest, encoding="utf-8") as fh:
        parts = [line.strip() for line in fh if line.strip()]
    for p in parts:
        with open(p, encoding="utf-8") as fh:
            if "pdf-toc" in fh.read():
                return p
    return None


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("page_map", help="JSON from merge_book.py --page-map")
    ap.add_argument("--manifest", required=True, help="book.parts.txt")
    ap.add_argument(
        "--expect-pages",
        type=int,
        help="page count the TOC part had on the first render; the caller "
        "re-renders and passes it to --assert-pages to prove nothing moved",
    )
    ap.add_argument(
        "--assert-pages",
        type=int,
        help="page count of the TOC part AFTER re-rendering; must equal "
        "--expect-pages or the numbers just written are stale",
    )
    ap.add_argument(
        "--allow-missing",
        action="store_true",
        help="warn instead of failing when a TOC entry has no destination",
    )
    args = ap.parse_args()

    # Assertion mode: called a second time, after the re-render, purely to
    # check that filling the numbers in did not change the part's length.
    if args.assert_pages is not None:
        if args.expect_pages is None:
            print("--assert-pages needs --expect-pages", file=sys.stderr)
            return 2
        if args.assert_pages != args.expect_pages:
            print(
                f"FAILED: the TOC part was {args.expect_pages} pages before the "
                f"page numbers were written and {args.assert_pages} after, so "
                "every number in it is off by "
                f"{args.assert_pages - args.expect_pages}. The number column is "
                "supposed to be a fixed width (.pdf-toc-page in print-book.css) "
                "precisely so this cannot happen — check that the book's "
                "stylesheet is the one this script's version expects.",
                file=sys.stderr,
            )
            return 1
        print(f"TOC part unchanged at {args.assert_pages} pages.")
        return 0

    part = find_toc_part(args.manifest)
    if part is None:
        print("No part holds a table of contents; nothing to number.")
        return 0

    with open(args.page_map, encoding="utf-8") as fh:
        pages = json.load(fh)

    filled, missing = number(part, pages)

    if not filled and not missing:
        # find_toc_part matched the marker somewhere that is not a real TOC.
        print(f"{part} holds no table-of-contents entries; nothing to number.")
        return 0

    print(f"TOC part:                 {part}")
    print(f"destinations available:   {len(pages)}")
    print(f"entries numbered:         {filled}")
    print(f"entries without a page:   {len(missing)}")

    for t in sorted(set(missing))[:10]:
        print(f"  no page for: {t}", file=sys.stderr)

    if missing and not args.allow_missing:
        # A TOC line with no page number is a visibly broken TOC, and it means
        # the page map and the HTML disagree — a stale map, or a part rendered
        # from different HTML than the one being numbered.
        print(
            f"FAILED: {len(missing)} table-of-contents entries resolve to no page.",
            file=sys.stderr,
        )
        return 1

    # Read by the caller to decide which part to re-render.
    print(f"::toc-part::{part}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
