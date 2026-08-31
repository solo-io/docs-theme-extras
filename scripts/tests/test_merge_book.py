"""Unit tests for scripts/merge_book.py.

WHY THESE EXIST. merge_book.py is what makes splitting a book invisible: it
turns every deferred `pdfjump:` URI back into a real in-PDF jump, and it now
also reports where each destination landed so the table of contents can be
numbered. Both are silent when wrong — a jump that fails to rewire stays a
link to an unknown URI scheme, which most readers see as a link that simply
does nothing, and a bad page map produces a contents page of plausible but
wrong numbers.

The fixtures are synthetic PDFs built with pypdf rather than rendered ones, so
these run anywhere with no WeasyPrint, no fonts and no network.
"""

import os
import sys

import pytest
from pypdf import PdfReader, PdfWriter
from pypdf.annotations import Link
from pypdf.generic import NameObject

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import merge_book as mb  # noqa: E402


def make_part(path, pages, dests=(), jumps=()):
    """A part PDF with `pages` blank pages, named destinations and jump links.

    dests: (name, page_index). jumps: (page_index, target_name) — written as a
    `pdfjump:` URI action, exactly as prepare_book.py's rewrite survives a
    WeasyPrint render.
    """
    w = PdfWriter()
    for _ in range(pages):
        w.add_blank_page(200, 200)
    for name, idx in dests:
        w.add_named_destination(name, idx)
    for idx, target in jumps:
        w.add_annotation(
            page_number=idx,
            annotation=Link(rect=(0, 0, 10, 10), url=mb.JUMP_SCHEME + target),
        )
    with open(path, "wb") as fh:
        w.write(fh)
    return path


class TestPageNumbers:
    def test_maps_destinations_to_one_based_printed_pages(self, tmp_path):
        # Printed number is index + 1 because the caller renders parts in order
        # and hands each one `counter-reset: page N` picking up where the last
        # stopped, so the counter never diverges from physical position.
        p = make_part(tmp_path / "a.pdf", 3, dests=[("top", 0), ("mid", 1), ("end", 2)])
        w = PdfWriter()
        w.append(str(p))
        got = mb.page_numbers(w, dict(w.named_destinations))
        assert got == {"top": 1, "mid": 2, "end": 3}

    def test_numbering_continues_across_a_part_boundary(self, tmp_path):
        # The property that makes the split invisible in the finished contents.
        a = make_part(tmp_path / "a.pdf", 3, dests=[("a1", 0)])
        b = make_part(tmp_path / "b.pdf", 2, dests=[("b1", 0), ("b2", 1)])
        w = PdfWriter()
        w.append(str(a))
        w.append(str(b))
        got = mb.page_numbers(w, dict(w.named_destinations))
        assert got["a1"] == 1
        assert got["b1"] == 4
        assert got["b2"] == 5

    def test_no_destinations_is_an_empty_map_not_a_crash(self, tmp_path):
        p = make_part(tmp_path / "a.pdf", 1)
        w = PdfWriter()
        w.append(str(p))
        assert mb.page_numbers(w, dict(w.named_destinations)) == {}


class TestMerge:
    def test_pages_are_concatenated_in_order(self, tmp_path):
        a = make_part(tmp_path / "a.pdf", 3)
        b = make_part(tmp_path / "b.pdf", 2)
        out = tmp_path / "out.pdf"
        pages, *_ = mb.merge([str(a), str(b)], str(out))
        assert pages == 5
        assert len(PdfReader(str(out)).pages) == 5

    def test_a_cross_part_jump_is_rewired_to_a_real_destination(self, tmp_path):
        # The whole reason this script exists: WeasyPrint DROPS <a href="#x">
        # when x is not in the part being rendered, so the jump is deferred as
        # a `pdfjump:` URI and resolved here.
        a = make_part(tmp_path / "a.pdf", 1, jumps=[(0, "target")])
        b = make_part(tmp_path / "b.pdf", 2, dests=[("target", 1)])
        out = tmp_path / "out.pdf"
        _, _, fixed, _, unresolved = mb.merge([str(a), str(b)], str(out))
        assert fixed == 1 and unresolved == []

        annot = PdfReader(str(out)).pages[0]["/Annots"][0].get_object()
        assert "/A" not in annot, "the URI action should be gone"
        assert "/Dest" in annot, "a real in-PDF jump should have replaced it"

    def test_a_jump_to_nothing_is_reported_rather_than_silently_dropped(self, tmp_path):
        # This is what a missing or stale part looks like, and shipping it
        # means a manual with dead cross-references.
        a = make_part(tmp_path / "a.pdf", 1, jumps=[(0, "gone")])
        out = tmp_path / "out.pdf"
        *_, unresolved = mb.merge([str(a)], str(out))
        assert unresolved == ["gone"]

    def test_percent_encoded_target_still_resolves(self, tmp_path):
        # WeasyPrint percent-encodes non-ASCII when it writes a URI action, so
        # the id "ℹ-low" comes back out as "%E2%84%B9-low" and no longer
        # matches the destination name taken from the id itself.
        a = make_part(tmp_path / "a.pdf", 1, jumps=[(0, "%E2%84%B9-low")])
        b = make_part(tmp_path / "b.pdf", 1, dests=[("ℹ-low", 0)])
        out = tmp_path / "out.pdf"
        _, _, fixed, _, unresolved = mb.merge([str(a), str(b)], str(out))
        assert fixed == 1 and unresolved == []

    def test_page_map_is_written_when_asked(self, tmp_path):
        import json

        a = make_part(tmp_path / "a.pdf", 2, dests=[("x", 1)])
        out = tmp_path / "out.pdf"
        pm = tmp_path / "pages.json"
        mb.merge([str(a)], str(out), str(pm))
        assert json.loads(pm.read_text())["x"] == 2

    def test_no_page_map_is_written_unless_asked(self, tmp_path):
        a = make_part(tmp_path / "a.pdf", 1)
        out = tmp_path / "out.pdf"
        mb.merge([str(a)], str(out))
        assert not (tmp_path / "pages.json").exists()

    def test_a_single_part_merge_is_effectively_a_copy(self, tmp_path):
        # Splitting is unconditional, so a small book takes this path on every
        # build and must come out unchanged.
        a = make_part(tmp_path / "a.pdf", 4, dests=[("x", 2)])
        out = tmp_path / "out.pdf"
        pages, dests, _, _, unresolved = mb.merge([str(a)], str(out))
        assert pages == 4 and dests == 1 and unresolved == []


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__]))
