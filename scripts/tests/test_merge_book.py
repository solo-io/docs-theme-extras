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

    def test_an_unnumbered_cover_shifts_every_printed_number_down(self, tmp_path):
        # The book blanks the cover's footer (print-book.css @page pdf-cover)
        # and starts the counter at 0, so the contents page prints "1" from
        # physical page 2. A contents page numbered from physical positions
        # would be one out on every single line.
        p = make_part(tmp_path / "a.pdf", 3, dests=[("cover", 0), ("toc", 1), ("ch", 2)])
        w = PdfWriter()
        w.append(str(p))
        got = mb.page_numbers(w, dict(w.named_destinations), first_page=0)
        assert got == {"cover": 0, "toc": 1, "ch": 2}


class TestHtmlOutline:
    """Reading absolute heading levels back out of the split part HTML.

    This is the half of the bookmark repair that cannot be tested through PDFs:
    WeasyPrint nests bookmarks per DOCUMENT, so the levels have to come from
    the HTML, where they are absolute across the whole book.
    """

    def write(self, tmp_path, *parts):
        manifest = tmp_path / "book.parts.txt"
        paths = []
        for i, body in enumerate(parts, 1):
            path = tmp_path / f"book.part{i:02d}.html"
            path.write_text(f"<html><body>{body}</body></html>", encoding="utf-8")
            paths.append(str(path))
        manifest.write_text("".join(p + "\n" for p in paths), encoding="utf-8")
        return str(manifest)

    def test_levels_are_absolute_across_a_part_boundary(self, tmp_path):
        # The actual bug: part 2 opens on a deep heading, and WeasyPrint made it
        # a TOP-level bookmark because it was the shallowest thing in that
        # document. Read from the HTML, it is still a level-4 heading.
        m = self.write(
            tmp_path,
            '<section class="pdf-chapter" id="setup"><h2>Setup</h2></section>',
            '<section class="pdf-chapter" id="vault"><h4>Integrate with Vault</h4></section>',
        )
        assert mb.html_outline(m) == [(2, "Setup", "setup"), (4, "Integrate with Vault", "vault")]

    def test_a_chapter_title_borrows_its_section_id(self, tmp_path):
        # The layout puts the id on the <section>, not on the <h2> inside it.
        m = self.write(tmp_path, '<section class="pdf-chapter" id="about"><h2>About</h2></section>')
        assert mb.html_outline(m) == [(2, "About", "about")]

    def test_a_body_heading_keeps_its_own_id(self, tmp_path):
        m = self.write(
            tmp_path,
            '<section class="pdf-chapter" id="about"><h2>About</h2>'
            '<h3 id="about--arch">Architecture</h3></section>',
        )
        assert mb.html_outline(m) == [
            (2, "About", "about"),
            (3, "Architecture", "about--arch"),
        ]

    def test_only_the_first_id_less_heading_borrows_the_section_id(self, tmp_path):
        # Two bookmarks pointing at the same destination is worse than one
        # bookmark and a reported skip.
        m = self.write(
            tmp_path,
            '<section class="pdf-chapter" id="about"><h2>About</h2><h3>Stray</h3></section>',
        )
        assert mb.html_outline(m) == [(2, "About", "about")]

    def test_a_heading_outside_any_chapter_needs_its_own_id(self, tmp_path):
        # The table of contents lives in a <nav>, which is why the layout gives
        # its heading an explicit id.
        m = self.write(
            tmp_path,
            '<nav class="pdf-toc"><h2 id="pdf-contents">Contents</h2></nav>'
            '<nav class="pdf-toc"><h2>Orphan</h2></nav>',
        )
        assert mb.html_outline(m) == [(2, "Contents", "pdf-contents")]

    def test_an_empty_heading_is_skipped(self, tmp_path):
        m = self.write(tmp_path, '<section class="pdf-chapter" id="x"><h2>  </h2></section>')
        assert mb.html_outline(m) == []

    def test_title_whitespace_is_collapsed(self, tmp_path):
        m = self.write(
            tmp_path,
            '<section class="pdf-chapter" id="x"><h2>Set up\n   Gloo <code>Mesh</code></h2></section>',
        )
        assert mb.html_outline(m) == [(2, "Set up Gloo Mesh", "x")]


class TestWriteOutline:
    def tree(self, writer):
        """(depth, title) for every bookmark, in order."""
        out = []

        def walk(items, depth=0):
            for it in items:
                if isinstance(it, list):
                    walk(it, depth + 1)
                else:
                    out.append((depth, it["/Title"]))

        walk(writer.outline)
        return out

    def test_deeper_headings_nest_under_shallower_ones(self, tmp_path):
        w = PdfWriter()
        for _ in range(4):
            w.add_blank_page(200, 200)
        entries = [(2, "Setup", "a"), (3, "Install", "b"), (4, "Helm", "c"), (2, "Reference", "d")]
        added, skipped = mb.write_outline(w, entries, {"a": 0, "b": 1, "c": 2, "d": 3})
        assert (added, skipped) == (4, 0)
        assert self.tree(w) == [
            (0, "Setup"),
            (1, "Install"),
            (2, "Helm"),
            (0, "Reference"),
        ]

    def test_a_level_jump_does_not_orphan_the_rest_of_the_tree(self, tmp_path):
        # h2 then h4 with no h3: the h4 still belongs under the h2, and
        # everything after it must keep nesting from there.
        w = PdfWriter()
        for _ in range(3):
            w.add_blank_page(200, 200)
        entries = [(2, "Setup", "a"), (4, "Vault", "b"), (2, "Reference", "c")]
        mb.write_outline(w, entries, {"a": 0, "b": 1, "c": 2})
        assert self.tree(w) == [(0, "Setup"), (1, "Vault"), (0, "Reference")]

    def test_a_heading_with_no_destination_is_counted_not_fatal(self, tmp_path):
        w = PdfWriter()
        w.add_blank_page(200, 200)
        added, skipped = mb.write_outline(w, [(2, "Here", "a"), (2, "Gone", "b")], {"a": 0})
        assert (added, skipped) == (1, 1)
        assert self.tree(w) == [(0, "Here")]


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
        _, _, fixed, _, unresolved, _ = mb.merge([str(a), str(b)], str(out))
        assert fixed == 1 and unresolved == []

        annot = PdfReader(str(out)).pages[0]["/Annots"][0].get_object()
        assert "/A" not in annot, "the URI action should be gone"
        assert "/Dest" in annot, "a real in-PDF jump should have replaced it"

    def test_a_jump_to_nothing_is_reported_rather_than_silently_dropped(self, tmp_path):
        # This is what a missing or stale part looks like, and shipping it
        # means a manual with dead cross-references.
        a = make_part(tmp_path / "a.pdf", 1, jumps=[(0, "gone")])
        out = tmp_path / "out.pdf"
        _, _, _, _, unresolved, _ = mb.merge([str(a)], str(out))
        assert unresolved == ["gone"]

    def test_percent_encoded_target_still_resolves(self, tmp_path):
        # WeasyPrint percent-encodes non-ASCII when it writes a URI action, so
        # the id "ℹ-low" comes back out as "%E2%84%B9-low" and no longer
        # matches the destination name taken from the id itself.
        a = make_part(tmp_path / "a.pdf", 1, jumps=[(0, "%E2%84%B9-low")])
        b = make_part(tmp_path / "b.pdf", 1, dests=[("ℹ-low", 0)])
        out = tmp_path / "out.pdf"
        _, _, fixed, _, unresolved, _ = mb.merge([str(a), str(b)], str(out))
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
        pages, dests, _, _, unresolved, _ = mb.merge([str(a)], str(out))
        assert pages == 4 and dests == 1 and unresolved == []

    def test_rebuilding_the_outline_still_rewires_cross_part_jumps(self, tmp_path):
        # --outline-from drops each part's imported outline. Named destinations
        # are what the jump rewiring resolves against, and they must survive
        # that: if they did not, every cross-reference in the book would break
        # the moment the bookmark tree was repaired.
        a = make_part(tmp_path / "a.pdf", 1, jumps=[(0, "chapter")])
        b = make_part(tmp_path / "b.pdf", 1, dests=[("chapter", 0)])
        html = tmp_path / "book.part01.html"
        html.write_text(
            '<html><body><section class="pdf-chapter" id="chapter">'
            "<h2>Chapter</h2></section></body></html>",
            encoding="utf-8",
        )
        manifest = tmp_path / "book.parts.txt"
        manifest.write_text(str(html) + "\n", encoding="utf-8")

        out = tmp_path / "out.pdf"
        _, _, fixed, _, unresolved, outline = mb.merge(
            [str(a), str(b)], str(out), outline_manifest=str(manifest)
        )
        assert fixed == 1 and unresolved == []
        assert outline == (1, 0)

    def test_bookmarks_land_on_physical_pages_not_printed_ones(self, tmp_path):
        # A bookmark is a jump to a page INDEX; the printed number is a
        # different thing entirely once the cover is unnumbered. Getting these
        # confused sends every bookmark one page early.
        a = make_part(tmp_path / "a.pdf", 3, dests=[("ch", 2)])
        html = tmp_path / "book.part01.html"
        html.write_text(
            '<html><body><section class="pdf-chapter" id="ch">'
            "<h2>Chapter</h2></section></body></html>",
            encoding="utf-8",
        )
        manifest = tmp_path / "book.parts.txt"
        manifest.write_text(str(html) + "\n", encoding="utf-8")

        out = tmp_path / "out.pdf"
        mb.merge(
            [str(a)], str(out), first_page=0, outline_manifest=str(manifest)
        )
        reader = PdfReader(str(out))
        assert reader.get_destination_page_number(reader.outline[0]) == 2


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__]))
