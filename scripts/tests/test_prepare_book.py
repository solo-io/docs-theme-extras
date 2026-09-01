"""Unit tests for scripts/prepare_book.py.

WHY THESE EXIST. prepare_book.py is ~570 lines that rewrite every id and every
link in a book before it is rendered, and it had no tests at all. The failures
it can produce are silent by construction: a link that lands on the wrong
chapter, an id collision that makes two headings share a destination, a slice
boundary that cuts a table in half. None of those raise, and none of them are
visible without opening the finished PDF and clicking things.

Everything here is a pure function over an lxml tree — no Hugo, no renderer, no
network.
"""

import os
import sys

import pytest
from lxml import html as H

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import prepare_book as pb  # noqa: E402


def doc(body):
    return H.fromstring(f"<html><body>{body}</body></html>")


def chapter(cid, source, inner=""):
    return (
        f'<section class="pdf-chapter" id="{cid}" data-source-path="{source}">'
        f'<span class="pdf-breadcrumb-source">Trail</span>{inner}</section>'
    )


class TestNormalize:
    def test_trailing_slash_insensitive(self):
        assert pb.normalize("/a/b/") == pb.normalize("/a/b")

    def test_root_survives(self):
        # "/" would rstrip to "" and stop matching anything at all.
        assert pb.normalize("/") == "/"


class TestUniquifyIds:
    def test_prefixes_descendant_ids_with_the_chapter(self):
        d = doc(chapter("ch1", "/a/", '<h2 id="setup">S</h2>'))
        chapters = d.cssselect("section.pdf-chapter")
        maps, renamed = pb.uniquify_ids(chapters)
        assert renamed == 1
        assert maps["ch1"]["setup"] == f"ch1{pb.SEP}setup"
        assert d.cssselect("h2")[0].get("id") == f"ch1{pb.SEP}setup"

    def test_same_id_in_two_chapters_stays_distinct(self):
        # The ordinary case: Hugo only guarantees ids unique WITHIN a page.
        d = doc(
            chapter("ch1", "/a/", '<h2 id="before-you-begin">x</h2>')
            + chapter("ch2", "/b/", '<h2 id="before-you-begin">y</h2>')
        )
        pb.uniquify_ids(d.cssselect("section.pdf-chapter"))
        ids = [h.get("id") for h in d.cssselect("h2")]
        assert len(set(ids)) == 2

    def test_duplicate_id_within_ONE_page_still_comes_out_distinct(self):
        # A reuse/conref block carries its ids pre-baked, so one page really
        # can contain the same id twice. Prefixing alone would map both to the
        # same new id and silently merge two destinations.
        d = doc(chapter("ch1", "/a/", '<h2 id="dup">a</h2><h2 id="dup">b</h2>'))
        pb.uniquify_ids(d.cssselect("section.pdf-chapter"))
        ids = [h.get("id") for h in d.cssselect("h2")]
        assert len(set(ids)) == 2, ids

    def test_first_occurrence_wins_for_link_resolution(self):
        # Matches how a browser resolves "#dup" on the live page.
        d = doc(chapter("ch1", "/a/", '<h2 id="dup">a</h2><h2 id="dup">b</h2>'))
        maps, _ = pb.uniquify_ids(d.cssselect("section.pdf-chapter"))
        first = d.cssselect("h2")[0].get("id")
        assert maps["ch1"]["dup"] == first

    def test_chapter_ids_themselves_are_untouched(self):
        d = doc(chapter("ch1", "/a/", '<h2 id="x">x</h2>'))
        pb.uniquify_ids(d.cssselect("section.pdf-chapter"))
        assert d.cssselect("section")[0].get("id") == "ch1"


class TestRewriteLinks:
    HOST = "https://docs.example.com"

    def _run(self, body):
        d = doc(body)
        chapters = d.cssselect("section.pdf-chapter")
        maps, _ = pb.uniquify_ids(chapters)
        stats = pb.rewrite_links(d, chapters, maps, self.HOST)
        return d, stats

    def test_link_to_another_chapter_becomes_a_jump(self):
        d, stats = self._run(
            chapter("ch1", "/a/", '<a href="/b/">go</a>') + chapter("ch2", "/b/")
        )
        assert d.cssselect("a")[0].get("href") == "#ch2"
        assert stats["internal"] == 1

    def test_relative_link_resolves_against_its_OWN_page_not_the_book(self):
        # book.html sits shallower than the pages it stitched, so resolving
        # "../c/" against the book's location climbs one level too far and
        # silently lands on the wrong chapter (or none).
        d, _ = self._run(
            chapter("ch1", "/guides/a/", '<a href="../b/">go</a>')
            + chapter("ch2", "/guides/b/")
        )
        assert d.cssselect("a")[0].get("href") == "#ch2"

    def test_link_to_a_heading_in_another_chapter_targets_the_renamed_id(self):
        d, _ = self._run(
            chapter("ch1", "/a/", '<a href="/b/#setup">go</a>')
            + chapter("ch2", "/b/", '<h2 id="setup">S</h2>')
        )
        assert d.cssselect("a")[0].get("href") == f"#ch2{pb.SEP}setup"

    def test_same_page_jump_follows_its_own_renamed_id(self):
        d, stats = self._run(
            chapter("ch1", "/a/", '<a href="#setup">go</a><h2 id="setup">S</h2>')
        )
        assert d.cssselect("a")[0].get("href") == f"#ch1{pb.SEP}setup"
        assert stats["intra"] == 1

    def test_percent_encoded_fragment_still_resolves(self):
        # A non-ASCII heading id arrives percent-encoded in the href.
        d, _ = self._run(chapter("ch1", "/a/", '<a href="#%E2%84%B9-low">x</a>'
                                 '<h2 id="ℹ-low">i</h2>'))
        assert d.cssselect("a")[0].get("href").startswith("#ch1")

    def test_same_origin_page_NOT_in_the_book_stays_absolute(self):
        # A root-relative href would be baked relative to the throwaway local
        # server the renderer used, which is gone by the time anyone clicks.
        d, stats = self._run(chapter("ch1", "/a/", '<a href="/elsewhere/">x</a>'))
        assert d.cssselect("a")[0].get("href") == f"{self.HOST}/elsewhere/"
        assert stats["external"] == 1

    def test_offsite_link_is_left_alone(self):
        d, stats = self._run(
            chapter("ch1", "/a/", '<a href="https://other.example/x">x</a>')
        )
        assert d.cssselect("a")[0].get("href") == "https://other.example/x"
        assert stats["untouched"] == 1

    def test_jump_that_resolves_nowhere_points_back_at_the_live_page(self):
        # Already broken on the live site; a dead-end jump inside the PDF is
        # worse than a link out to the real page.
        d, _ = self._run(chapter("ch1", "/a/", '<a href="#gone">x</a>'))
        assert d.cssselect("a")[0].get("href") == f"{self.HOST}/a/#gone"

    def test_toc_links_outside_any_chapter_are_untouched(self):
        # The book's own TOC points at chapter ids, which never get renamed.
        d, stats = self._run(
            '<nav class="pdf-toc"><a href="#ch1">t</a></nav>' + chapter("ch1", "/a/")
        )
        assert d.cssselect("nav a")[0].get("href") == "#ch1"
        assert stats["untouched"] == 1


class TestToJumpScheme:
    def test_rewrites_same_document_jumps(self):
        d = doc('<a href="#x">a</a>')
        assert pb.to_jump_scheme(d) == 1
        assert d.cssselect("a")[0].get("href") == pb.JUMP_SCHEME + "x"

    def test_leaves_absolute_links_alone(self):
        d = doc('<a href="https://e.com/#x">a</a>')
        assert pb.to_jump_scheme(d) == 0

    def test_is_idempotent(self):
        # The pipeline can re-run prepare_book on an already-prepared file;
        # double-prefixing would make every jump unresolvable at merge time.
        d = doc('<a href="#x">a</a>')
        pb.to_jump_scheme(d)
        assert pb.to_jump_scheme(d) == 0
        assert d.cssselect("a")[0].get("href") == pb.JUMP_SCHEME + "x"


class TestValidate:
    def test_reports_duplicate_ids(self):
        d = doc('<p id="a"></p><p id="a"></p>')
        _, dupes, _, _ = pb.validate(d)
        assert dupes == {"a": 2}

    def test_reports_dangling_jumps(self):
        d = doc('<a href="#nope">x</a>')
        _, _, jumps, dangling = pb.validate(d)
        assert jumps == 1 and dangling == ["#nope"]

    def test_clean_document_is_clean(self):
        d = doc('<h2 id="a">A</h2><a href="#a">x</a>')
        _, dupes, jumps, dangling = pb.validate(d)
        assert dupes == {} and jumps == 1 and dangling == []


class TestFixSvgFonts:
    def test_strips_the_broken_fallback(self, tmp_path):
        # WeasyPrint resolves the SPACE character through the non-existent
        # second family and gives it a wrong advance, so legends overlap.
        p = tmp_path / "d.svg"
        p.write_text('<svg><text font-family="Helvetica, Segoe UI Emoji">a b</text></svg>')
        assert pb.fix_svgs(str(tmp_path))["defallbacked"] == 1
        assert 'font-family="Helvetica"' in p.read_text()

    def test_leaves_other_svgs_alone(self, tmp_path):
        p = tmp_path / "d.svg"
        p.write_text('<svg><text font-family="Arial">a</text></svg>')
        assert pb.fix_svgs(str(tmp_path))["defallbacked"] == 0
        assert "Arial" in p.read_text()

    def test_ignores_non_svg_files(self, tmp_path):
        p = tmp_path / "notes.txt"
        p.write_text("Helvetica, Segoe UI Emoji")
        assert pb.fix_svgs(str(tmp_path))["defallbacked"] == 0
        assert "Segoe UI Emoji" in p.read_text()


# An Excalidraw connector and its label: a two-rect luminance mask that hides
# the line where the text sits. WeasyPrint 69 renders the masked group as very
# nearly nothing, so the connector and its label both vanish from the PDF.
EXCALIDRAW_MASKED = (
    '<svg><!-- svg-source:excalidraw -->'
    '<mask id="mask-abc" maskUnits="userSpaceOnUse" x="0" y="0" width="10" height="10">'
    '<rect fill="#fff" width="10" height="10"></rect>'
    '<rect fill="#000" x="2" y="2" width="3" height="3"></rect></mask>'
    '<g mask="url(#mask-abc)" stroke-linecap="round"><path d="M0 0 L9 9"></path></g>'
    "</svg>"
)


class TestFixSvgMasks:
    def test_drops_the_mask_reference_from_an_excalidraw_export(self, tmp_path):
        p = tmp_path / "arch.svg"
        p.write_text(EXCALIDRAW_MASKED)
        assert pb.fix_svgs(str(tmp_path))["unmasked"] == 1
        out = p.read_text()
        assert "mask=" not in out.replace("<mask ", "")
        # Only the reference goes. The <mask> element itself is inert once
        # nothing points at it, and leaving it keeps the diff to one attribute.
        assert '<mask id="mask-abc"' in out
        # The group and its other attributes survive intact.
        assert '<g stroke-linecap="round">' in out

    def test_keeps_masks_on_svgs_from_other_tools(self, tmp_path):
        # A hand-authored mask is load-bearing: stripping it would reveal
        # content the author meant to hide, a worse failure than the one being
        # fixed. Only the Excalidraw marker opts a file in.
        p = tmp_path / "logo.svg"
        p.write_text(EXCALIDRAW_MASKED.replace("<!-- svg-source:excalidraw -->", ""))
        assert pb.fix_svgs(str(tmp_path))["unmasked"] == 0
        assert 'mask="url(#mask-abc)"' in p.read_text()

    def test_fixes_fonts_and_masks_in_one_pass(self, tmp_path):
        p = tmp_path / "arch.svg"
        p.write_text(
            EXCALIDRAW_MASKED.replace(
                "</svg>", '<text font-family="Helvetica, Segoe UI Emoji">a b</text></svg>'
            )
        )
        assert pb.fix_svgs(str(tmp_path)) == {"defallbacked": 1, "unmasked": 1}
        out = p.read_text()
        assert 'font-family="Helvetica"' in out and 'mask="url(' not in out


class TestEmptyBookIsRejected:
    """A zero-chapter book is a build that produced no book, not a small one.

    This was already enforced; the tests exist because the theme now defaults
    books OFF, which makes "cover and contents, no chapters" the shape an
    ordinary build produces, so the guard went from theoretical to load-bearing.
    Deliberately NOT gated on --strict, and deliberately covered without it:
    nothing downstream notices an empty book, so there is no safe way to let one
    through. Goes through prepare() rather than main() because that is where the
    check lives.
    """

    def _prepare(self, tmp_path, body):
        src = tmp_path / "book.html"
        src.write_text(f"<html><body>{body}</body></html>")
        return pb.prepare(str(src), str(src), "https://docs.solo.io")

    def test_a_book_with_only_a_cover_and_contents_is_fatal(self, tmp_path):
        with pytest.raises(SystemExit) as e:
            self._prepare(tmp_path, "<h1>Contents</h1>")
        # The message has to name the cause, because the most likely one is now
        # a missing environment variable rather than a malformed document.
        assert "HUGO_PARAMS_BUILDBOOK" in str(e.value)

    def test_one_chapter_is_enough(self, tmp_path):
        body = chapter("c1", "/kagent/latest/install/", "<h2>Install</h2>")
        chapters, _, _, _, _ = self._prepare(tmp_path, body)
        assert chapters == 1


class TestReplaceIframes:
    def test_youtube_embed_becomes_a_watch_link(self):
        d = doc('<iframe src="https://www.youtube.com/embed/abc" title="Demo"></iframe>')
        assert pb.replace_iframes(d) == 1
        a = d.cssselect("p.pdf-embed-link a")[0]
        assert a.get("href") == "https://www.youtube.com/watch?v=abc"
        assert d.cssselect("iframe") == []

    def test_protocol_relative_src_is_made_absolute(self):
        d = doc('<iframe src="//example.com/embed/x"></iframe>')
        pb.replace_iframes(d)
        assert d.cssselect("a")[0].get("href").startswith("https://")

    def test_srcless_iframe_is_skipped_rather_than_crashing(self):
        d = doc("<iframe></iframe>")
        assert pb.replace_iframes(d) == 0


class TestColorizeEmoji:
    """Putting colour back into emoji that WeasyPrint will not draw in colour.

    The failure this guards against is not a crash — it is text quietly going
    missing. These wrap characters mid-sentence, and lxml keeps the text after
    an element in that element's `.tail`, so a wrapper that forgets one deletes
    the rest of the paragraph.
    """

    def text(self, d):
        return d.text_content()

    def test_a_mapped_emoji_is_wrapped_and_tinted(self):
        d = doc("<p>Status \U0001f7e2 here</p>")
        assert pb.colorize_emoji(d) == 1
        span = d.cssselect("span.pdf-emoji")[0]
        assert span.text == "\U0001f7e2"
        assert span.get("style") == "color:#2da44e"

    def test_surrounding_text_is_preserved_exactly(self):
        d = doc("<p>before ✅ middle ❌ after</p>")
        assert pb.colorize_emoji(d) == 2
        assert self.text(d) == "before ✅ middle ❌ after"

    def test_the_variation_selector_travels_with_its_character(self):
        # "⚠️" is U+26A0 U+FE0F. Leaving the selector behind puts a stray
        # codepoint in the text layer and can change how the glyph resolves.
        d = doc("<p>⚠️ careful</p>")
        pb.colorize_emoji(d)
        assert d.cssselect("span.pdf-emoji")[0].text == "⚠️"
        assert self.text(d) == "⚠️ careful"

    def test_an_emoji_in_a_tail_is_found_too(self):
        # Text after an inline element is a `.tail`, not `.text`, and a table
        # cell like "<code>x</code> ✅" is exactly that shape.
        d = doc("<p><code>flag</code> ✅ supported</p>")
        assert pb.colorize_emoji(d) == 1
        assert self.text(d) == "flag ✅ supported"

    def test_several_emoji_in_one_run_all_survive(self):
        d = doc("<p>a \U0001f7e1 b \U0001f7e2 c \U0001f534 d</p>")
        assert pb.colorize_emoji(d) == 3
        assert self.text(d) == "a \U0001f7e1 b \U0001f7e2 c \U0001f534 d"
        colours = [s.get("style") for s in d.cssselect("span.pdf-emoji")]
        assert colours == ["color:#d4a72c", "color:#2da44e", "color:#cf222e"]

    def test_an_unmapped_emoji_is_left_alone(self):
        # The monochrome font still draws it; this pass only claims the set it
        # knows a meaningful colour for.
        d = doc("<p>ship it \U0001f680</p>")
        assert pb.colorize_emoji(d) == 0
        assert d.cssselect("span.pdf-emoji") == []

    def test_running_it_twice_does_not_double_wrap(self):
        # prepare() runs once, but the book is written back over its own source
        # in the workflow, so a re-run on an already-prepared file is one typo
        # away and must not nest spans.
        d = doc("<p>✅ yes</p>")
        pb.colorize_emoji(d)
        assert pb.colorize_emoji(d) == 0
        assert len(d.cssselect("span.pdf-emoji")) == 1

    def test_white_circle_is_grey_not_white(self):
        # White on a white page is an invisible glyph, which is worse than the
        # monochrome one it replaced.
        assert pb.EMOJI_COLOURS["⚪"] != "#ffffff"

    def test_emoji_inside_a_heading_still_gets_tinted(self):
        d = doc("<h2>Support ✅</h2>")
        assert pb.colorize_emoji(d) == 1


class TestSliceOversized:
    def test_small_chapter_is_returned_whole(self):
        d = doc(chapter("ch1", "/a/", "<p>x</p>"))
        ch = d.cssselect("section")[0]
        assert pb.slice_oversized(ch, 10_000) == [ch]

    def test_boundaries_fall_between_direct_children(self):
        # A cut inside a table would split it across two documents and produce
        # two half-tables in the merged PDF.
        body = "".join(f"<table><tr><td>{'x' * 200}</td></tr></table>" for _ in range(6))
        d = doc(chapter("ch1", "/a/", body))
        ch = d.cssselect("section")[0]
        slices = pb.slice_oversized(ch, 500)
        assert len(slices) > 1
        for s in slices:
            for kid in s:
                # Every direct child is intact: a cut table would leave a <tr>
                # or <td> promoted to a slice's top level.
                assert kid.tag in ("table", "span"), kid.tag

    def test_continuations_are_marked_and_lose_the_id(self):
        body = "".join(f"<p>{'x' * 300}</p>" for _ in range(6))
        d = doc(chapter("ch1", "/a/", body))
        slices = pb.slice_oversized(d.cssselect("section")[0], 500)
        assert slices[0].get("id") == "ch1"
        for cont in slices[1:]:
            # Ids must stay unique document-wide once the parts are merged.
            assert cont.get("id") is None
            # .pdf-chapter sets break-before:page; a continuation must not,
            # or the split shows up as a break in the middle of a page.
            assert "pdf-chapter-cont" in cont.get("class")

    def test_every_continuation_keeps_a_breadcrumb_source(self):
        # @top-left reads string(pdf-breadcrumb); without a copy the running
        # header goes blank or shows the previous chapter's trail.
        body = "".join(f"<p>{'x' * 300}</p>" for _ in range(6))
        d = doc(chapter("ch1", "/a/", body))
        slices = pb.slice_oversized(d.cssselect("section")[0], 500)
        for s in slices:
            assert s.cssselect("span.pdf-breadcrumb-source")

    def test_no_content_is_lost_across_the_cut(self):
        body = "".join(f"<p>p{i}{'x' * 300}</p>" for i in range(6))
        d = doc(chapter("ch1", "/a/", body))
        slices = pb.slice_oversized(d.cssselect("section")[0], 500)
        seen = [p.text[:2] for s in slices for p in s.cssselect("p")]
        assert seen == [f"p{i}" for i in range(6)]

    def test_childless_chapter_does_not_crash(self):
        d = doc('<section class="pdf-chapter" id="ch1"></section>')
        ch = d.cssselect("section")[0]
        assert pb.slice_oversized(ch, 10) == [ch]


class TestSplitBody:
    def test_single_small_book_yields_one_part(self):
        d = doc(chapter("ch1", "/a/", "<p>x</p>"))
        parts, oversized = pb.split_body(d, 10_000)
        assert len(parts) == 1 and oversized == 0

    def test_splits_once_the_budget_is_exceeded(self):
        d = doc("".join(chapter(f"ch{i}", f"/{i}/", "<p>" + "x" * 400 + "</p>")
                         for i in range(6)))
        parts, _ = pb.split_body(d, 600)
        assert len(parts) > 1

    def test_every_chapter_appears_exactly_once(self):
        # The property that matters most: a dropped or duplicated chapter is a
        # missing or repeated section in a shipped manual.
        d = doc("".join(chapter(f"ch{i}", f"/{i}/", "<p>" + "x" * 400 + "</p>")
                         for i in range(6)))
        parts, _ = pb.split_body(d, 600)
        ids = [el.get("id") for part in parts for el in part]
        assert sorted(i for i in ids if i) == [f"ch{i}" for i in range(6)]

    def test_an_oversized_chapter_is_sliced_and_counted(self):
        big = chapter("ch1", "/a/", "".join(f"<p>{'x' * 400}</p>" for _ in range(6)))
        d = doc(big)
        parts, oversized = pb.split_body(d, 600)
        assert oversized == 1
        assert sum(len(p) for p in parts) > 1

    def test_document_order_is_preserved(self):
        d = doc("".join(chapter(f"ch{i}", f"/{i}/", "<p>" + "x" * 400 + "</p>")
                         for i in range(6)))
        parts, _ = pb.split_body(d, 600)
        ids = [el.get("id") for part in parts for el in part if el.get("id")]
        assert ids == sorted(ids, key=lambda s: int(s[2:]))


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__]))
