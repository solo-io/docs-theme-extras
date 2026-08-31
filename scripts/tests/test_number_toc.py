"""Unit tests for scripts/number_toc.py.

WHY THESE EXIST. This script writes the page numbers into a printed table of
contents, and every way it can go wrong is quiet: a slot that never gets filled
prints as a blank column, a target that fails to match prints nothing, and a
TOC part that grew when the numbers were written makes every number in it wrong
by the same amount while still looking perfectly plausible.

The last one is the reason --expect-pages/--assert-pages exists, so it is
tested here rather than trusted.
"""

import json
import os
import subprocess
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import number_toc as nt  # noqa: E402

SCRIPT = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "number_toc.py"
)


def toc_html(entries, minified=False, prefix=nt.JUMP_SCHEME):
    """A part document holding a TOC, shaped like book-document.html's output."""
    lis = "".join(
        f'<li><a href="{prefix}{t}"><span class="pdf-toc-title">{t}</span>'
        f'<span class="pdf-toc-dots"></span>'
        f'<span class="pdf-toc-page"></span></a></li>'
        for t in entries
    )
    cls = 'class=pdf-toc' if minified else 'class="pdf-toc"'
    return f"<html><body><nav {cls}><ul>{lis}</ul></nav></body></html>"


def write_part(tmp_path, entries, **kw):
    p = tmp_path / "book.part01.html"
    p.write_text(toc_html(entries, **kw), encoding="utf-8")
    m = tmp_path / "manifest.txt"
    m.write_text(str(p) + "\n", encoding="utf-8")
    return p, m


class TestTargetOf:
    def test_reads_the_deferred_jump_scheme(self):
        assert nt.target_of(nt.JUMP_SCHEME + "ch1") == "ch1"

    def test_reads_a_plain_fragment(self):
        # A caller that skipped prepare_book's rewrite still has "#id".
        assert nt.target_of("#ch1") == "ch1"

    def test_decodes_percent_encoding(self):
        assert nt.target_of(nt.JUMP_SCHEME + "%E2%84%B9-low") == "ℹ-low"

    def test_ignores_an_external_link(self):
        assert nt.target_of("https://example.com/") is None

    def test_ignores_a_missing_href(self):
        assert nt.target_of(None) is None
        assert nt.target_of("") is None


class TestNumber:
    def test_fills_every_slot(self, tmp_path):
        p, _ = write_part(tmp_path, ["a", "b", "c"])
        filled, missing = nt.number(str(p), {"a": 4, "b": 9, "c": 12})
        assert filled == 3 and missing == []
        assert '<span class="pdf-toc-page">4</span>' in p.read_text()
        assert '<span class="pdf-toc-page">12</span>' in p.read_text()

    def test_reports_an_entry_with_no_page(self, tmp_path):
        # A blank column in a shipped contents page; must not pass silently.
        p, _ = write_part(tmp_path, ["a", "b"])
        filled, missing = nt.number(str(p), {"a": 4})
        assert filled == 1 and missing == ["b"]

    def test_is_idempotent(self, tmp_path):
        # The pipeline can re-run the numbering pass; a second run must
        # overwrite rather than append or double up.
        p, _ = write_part(tmp_path, ["a"])
        nt.number(str(p), {"a": 4})
        nt.number(str(p), {"a": 7})
        assert '<span class="pdf-toc-page">7</span>' in p.read_text()
        assert "47" not in p.read_text()

    def test_leaves_the_document_otherwise_intact(self, tmp_path):
        p, _ = write_part(tmp_path, ["a"])
        nt.number(str(p), {"a": 1})
        out = p.read_text()
        # The href has to survive: it is what the reader clicks.
        assert nt.JUMP_SCHEME + "a" in out
        assert "pdf-toc-dots" in out


class TestFindTocPart:
    def test_finds_the_part_holding_the_toc(self, tmp_path):
        p, m = write_part(tmp_path, ["a"])
        assert nt.find_toc_part(str(m)) == str(p)

    def test_finds_it_in_a_MINIFIED_build(self, tmp_path):
        # --minify strips attribute quotes, so anchoring on `class="pdf-toc"`
        # would find nothing and skip numbering without saying so.
        p, m = write_part(tmp_path, ["a"], minified=True)
        assert nt.find_toc_part(str(m)) == str(p)

    def test_returns_none_when_no_part_has_a_toc(self, tmp_path):
        p = tmp_path / "book.part01.html"
        p.write_text("<html><body><p>no contents here</p></body></html>")
        m = tmp_path / "manifest.txt"
        m.write_text(str(p) + "\n")
        assert nt.find_toc_part(str(m)) is None

    def test_scans_past_parts_without_a_toc(self, tmp_path):
        # The TOC is normally in part 1, but the split decides that, not this
        # script — so it is searched for rather than assumed.
        a = tmp_path / "book.part01.html"
        a.write_text("<html><body><p>chapters</p></body></html>")
        b = tmp_path / "book.part02.html"
        b.write_text(toc_html(["x"]), encoding="utf-8")
        m = tmp_path / "manifest.txt"
        m.write_text(f"{a}\n{b}\n")
        assert nt.find_toc_part(str(m)) == str(b)


def run(*args):
    return subprocess.run(
        [sys.executable, SCRIPT, *args], capture_output=True, text=True
    )


class TestCli:
    def test_success_prints_the_part_for_the_caller_to_re_render(self, tmp_path):
        p, m = write_part(tmp_path, ["a", "b"])
        pm = tmp_path / "pages.json"
        pm.write_text(json.dumps({"a": 1, "b": 2}))
        r = run(str(pm), "--manifest", str(m))
        assert r.returncode == 0
        assert f"::toc-part::{p}" in r.stdout

    def test_a_missing_page_fails_the_run(self, tmp_path):
        p, m = write_part(tmp_path, ["a", "b"])
        pm = tmp_path / "pages.json"
        pm.write_text(json.dumps({"a": 1}))
        r = run(str(pm), "--manifest", str(m))
        assert r.returncode == 1
        assert "resolve to no page" in r.stderr

    def test_allow_missing_downgrades_it_to_a_warning(self, tmp_path):
        p, m = write_part(tmp_path, ["a", "b"])
        pm = tmp_path / "pages.json"
        pm.write_text(json.dumps({"a": 1}))
        assert run(str(pm), "--manifest", str(m), "--allow-missing").returncode == 0

    def test_no_toc_anywhere_is_a_clean_no_op(self, tmp_path):
        # A book with no printed contents is a valid book, not a failure.
        a = tmp_path / "book.part01.html"
        a.write_text("<html><body><p>x</p></body></html>")
        m = tmp_path / "manifest.txt"
        m.write_text(str(a) + "\n")
        pm = tmp_path / "pages.json"
        pm.write_text("{}")
        r = run(str(pm), "--manifest", str(m))
        assert r.returncode == 0
        assert "::toc-part::" not in r.stdout

    # The invariant the whole design rests on: .pdf-toc-page is a FIXED-width
    # column, so writing numbers into it cannot reflow the TOC, add a page, and
    # shift every chapter after it — which would make the numbers just written
    # wrong. Trusted nowhere; checked on every run.
    def test_assert_passes_when_the_part_did_not_move(self, tmp_path):
        p, m = write_part(tmp_path, ["a"])
        pm = tmp_path / "pages.json"
        pm.write_text("{}")
        r = run(str(pm), "--manifest", str(m), "--expect-pages", "12",
                "--assert-pages", "12")
        assert r.returncode == 0
        assert "unchanged at 12 pages" in r.stdout

    def test_assert_fails_when_the_part_grew(self, tmp_path):
        p, m = write_part(tmp_path, ["a"])
        pm = tmp_path / "pages.json"
        pm.write_text("{}")
        r = run(str(pm), "--manifest", str(m), "--expect-pages", "12",
                "--assert-pages", "13")
        assert r.returncode == 1
        # The message must say by how much, since that is the amount every
        # printed number is now wrong by.
        assert "off by 1" in r.stderr

    def test_assert_without_expect_is_a_usage_error(self, tmp_path):
        p, m = write_part(tmp_path, ["a"])
        pm = tmp_path / "pages.json"
        pm.write_text("{}")
        r = run(str(pm), "--manifest", str(m), "--assert-pages", "12")
        assert r.returncode == 2


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__]))
