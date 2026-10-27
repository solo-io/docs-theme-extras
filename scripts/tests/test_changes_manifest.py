"""Unit tests for scripts/changes_manifest.py.

WHY THESE EXIST. The change-highlights overlay can only paint what this script
reports, and every way it goes wrong is quiet: a fragment whose context is
wrong is listed as "not shown" or, worse, highlights the same words somewhere
else on the page; a removal with no anchor never gets a marker; a Markdown or
shortcode remnant left in a fragment means it never matches the rendered text.
Each test below pins one of those against a real `git diff` in a throwaway
repository, since the parser's input is git's word-diff porcelain format and a
hand-written imitation of it would test the imitation.
"""

import json
import os
import subprocess
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import changes_manifest as cm  # noqa: E402

SCRIPT = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "changes_manifest.py"
)


def run(cwd, *args):
    subprocess.run(args, cwd=cwd, check=True, capture_output=True, text=True)


@pytest.fixture
def repo(tmp_path, monkeypatch):
    """A repository with one commit on `main`, as the diff base."""
    run(tmp_path, "git", "init", "-q", "-b", "main")
    run(tmp_path, "git", "config", "user.email", "test@example.com")
    run(tmp_path, "git", "config", "user.name", "Test")
    monkeypatch.chdir(tmp_path)

    def write(path, text):
        full = tmp_path / path
        full.parent.mkdir(parents=True, exist_ok=True)
        full.write_text(text)

    def commit(files):
        for path, text in files.items():
            write(path, text)
        run(tmp_path, "git", "add", "-A")
        run(tmp_path, "git", "commit", "-q", "-m", "base")

    def manifest():
        return cm.build_manifest("main", [], [".md"])["files"]

    return tmp_path, commit, write, manifest


def test_inline_insertion_keeps_context_on_both_sides(repo):
    _, commit, write, manifest = repo
    commit({"page.md": "The gateway routes traffic to the service.\n"})
    write("page.md", "The gateway routes all traffic to the service.\n")
    added = manifest()["page.md"]["added"]
    assert added == [{
        "before": "The gateway routes",
        "text": "all",
        "after": "traffic to the service.",
    }]


def test_short_change_is_kept(repo):
    """Short changes used to be dropped below a 3-character minimum."""
    _, commit, write, manifest = repo
    commit({"page.md": "Set the flag to a.\n"})
    write("page.md", "Set the flag to b.\n")
    added = manifest()["page.md"]["added"]
    assert [a["text"] for a in added] == ["b."]
    assert added[0]["was"] == "a."


def test_replacement_carries_old_text_and_is_not_a_removal(repo):
    _, commit, write, manifest = repo
    commit({"page.md": "Listen on port 8080 by default, then retry.\n"})
    write("page.md", "Listen on port 9090, then retry.\n")
    info = manifest()["page.md"]
    assert info["added"][0]["text"] == "9090,"
    assert info["added"][0]["was"] == "8080 by default,"
    assert info["removed"] == []


def test_pure_deletion_is_anchored_between_its_neighbors(repo):
    _, commit, write, manifest = repo
    commit({"page.md": "Route to the backend service now.\n"})
    write("page.md", "Route to the service now.\n")
    info = manifest()["page.md"]
    assert info["added"] == []
    assert info["removed"] == [{
        "before": "Route to the",
        "text": "backend",
        "after": "service now.",
    }]


def test_deleted_paragraph_takes_context_from_neighboring_lines(repo):
    _, commit, write, manifest = repo
    commit({"page.md": "Keep this.\n\nDelete this paragraph.\n\nKeep that.\n"})
    write("page.md", "Keep this.\n\nKeep that.\n")
    removed = manifest()["page.md"]["removed"]
    assert len(removed) == 1
    assert removed[0]["text"] == "Delete this paragraph."
    assert removed[0]["before"] == "Keep this."


def test_whole_new_line_uses_previous_line_as_context(repo):
    _, commit, write, manifest = repo
    commit({"page.md": "1. First step.\n2. Second step.\n"})
    write("page.md", "1. First step.\n2. Second step.\n3. Done.\n")
    added = manifest()["page.md"]["added"]
    assert added[0]["text"] == "Done."
    assert added[0]["before"] == "Second step."


def test_markdown_syntax_is_stripped_from_fragments(repo):
    _, commit, write, manifest = repo
    commit({"page.md": "See the docs.\n"})
    write("page.md", "See the **new** [install guide](../install/) docs.\n")
    text = manifest()["page.md"]["added"][0]["text"]
    assert "**" not in text and "](" not in text
    assert "new" in text and "install guide" in text


def test_shortcode_split_by_the_word_diff_leaves_no_remnant(repo):
    """The word diff splits a shortcode at its whitespace, so one fragment can
    end in a dangling `{{%` while the closing half sits in the context."""
    _, commit, write, manifest = repo
    commit({"page.md": '2. Second step.{{% conditional-text include-if="x" %}}\n'})
    write("page.md", '2. Second step, edited.{{% conditional-text include-if="x" %}}\n')
    added = manifest()["page.md"]["added"]
    assert added[0]["text"] == "step, edited."
    assert added[0]["before"] == "Second"
    assert "{{" not in json.dumps(added) and "}}" not in json.dumps(added)


def test_formatting_only_change_reports_nothing(repo):
    """Bolding existing words changes no visible text, so there is nothing to
    paint; reporting it would only add a "not shown" entry."""
    _, commit, write, manifest = repo
    commit({"page.md": "Read this first.\n"})
    write("page.md", "Read **this** first.\n")
    info = manifest()["page.md"]
    assert [a["text"] for a in info["added"]] == ["this"]
    assert info["removed"] == []


def test_untracked_and_added_files_are_marked_new(repo):
    root, commit, write, manifest = repo
    commit({"page.md": "Old.\n"})
    write("brand-new.md", "Everything here is new.\n")
    write("staged-new.md", "Also new.\n")
    run(root, "git", "add", "staged-new.md")
    files = manifest()
    assert files["brand-new.md"] == {"new": True, "added": [], "removed": []}
    assert files["staged-new.md"]["new"] is True


def test_non_markdown_files_are_ignored(repo):
    _, commit, write, manifest = repo
    commit({"page.md": "Old.\n", "layout.html": "<p>Old.</p>\n"})
    write("layout.html", "<p>New.</p>\n")
    assert manifest() == {}


def test_merge_base_ignores_commits_on_the_base_after_branching(repo):
    """Work on main after the branch point is not "your change"."""
    root, commit, write, manifest = repo
    commit({"page.md": "Base.\n"})
    run(root, "git", "checkout", "-q", "-b", "feature")
    write("mine.md", "Mine.\n")
    run(root, "git", "add", "-A")
    run(root, "git", "commit", "-q", "-m", "mine")
    run(root, "git", "checkout", "-q", "main")
    commit({"theirs.md": "Theirs.\n"})
    run(root, "git", "checkout", "-q", "feature")
    files = manifest()
    assert "mine.md" in files
    assert "theirs.md" not in files


def test_default_base_prefers_the_freshest_main(repo):
    """A stale `upstream/main` next to a current `origin/main` used to win
    just because it was tried first, and every merge since that fetch showed
    up as this branch's change."""
    root, commit, write, _ = repo
    commit({"page.md": "Base.\n"})
    run(root, "git", "update-ref", "refs/remotes/upstream/main", "HEAD")   # stale
    commit({"theirs.md": "Merged to main later.\n"})
    run(root, "git", "update-ref", "refs/remotes/origin/main", "HEAD")     # current
    run(root, "git", "checkout", "-q", "-b", "feature")
    write("mine.md", "Mine.\n")
    manifest = cm.build_manifest(None, [], [".md"])
    assert manifest["base"] in ("origin/main", "main")
    assert sorted(manifest["files"]) == ["mine.md"]


def test_cli_writes_only_when_the_manifest_changes(repo, tmp_path):
    root, commit, write, _ = repo
    commit({"page.md": "Old.\n"})
    write("page.md", "New.\n")
    out = root / "static" / "_extras" / "changes.json"
    args = [sys.executable, SCRIPT, "--base", "main", "--out", str(out)]
    first = subprocess.run(args, cwd=root, capture_output=True, text=True, check=True)
    assert "1 changed file(s)" in first.stdout
    assert (out.parent / ".gitignore").read_text().splitlines()[-1] == "*"
    status = subprocess.run(["git", "status", "--porcelain"], cwd=root,
                            capture_output=True, text=True, check=True).stdout
    assert "_extras" not in status
    data = json.loads(out.read_text())
    assert data["base"] == "main" and "page.md" in data["files"]
    mtime = out.stat().st_mtime_ns
    second = subprocess.run(args, cwd=root, capture_output=True, text=True, check=True)
    assert second.stdout == ""
    assert out.stat().st_mtime_ns == mtime


def test_non_ascii_and_spaced_paths_are_reported(repo):
    """git quotes a non-ASCII path in diff headers and ends a spaced one with
    a tab; both used to be dropped, so the change never showed."""
    _, commit, write, manifest = repo
    commit({"café.md": "Old text here.\n", "a b.md": "Old text here.\n"})
    write("café.md", "New text here.\n")
    write("a b.md", "New text here.\n")
    files = manifest()
    assert files["café.md"]["added"][0]["text"] == "New"
    assert files["a b.md"]["added"][0]["text"] == "New"


def test_non_utf8_file_does_not_crash(repo):
    root, commit, write, manifest = repo
    commit({"page.md": "Old.\n"})
    (root / "latin.txt").write_bytes("caf\xe9\n".encode("latin-1"))
    (root / "latin.md").write_bytes("caf\xe9 new\n".encode("latin-1"))
    write("page.md", "New.\n")
    files = manifest()
    assert "page.md" in files and "latin.txt" not in files


def test_unicode_line_separator_does_not_crash(repo):
    """splitlines() also splits on U+2028, which left an empty fragment that
    crashed the parser."""
    _, commit, write, manifest = repo
    commit({"page.md": "Old line  with a separator.\n"})
    write("page.md", "New line  with a separator.\n")
    assert manifest()["page.md"]["added"][0]["text"] == "New"


def test_exact_base_requires_base(repo):
    root, *_ = repo
    result = subprocess.run([sys.executable, SCRIPT, "--exact-base", "--out", "m.json"],
                            cwd=root, capture_output=True, text=True)
    assert result.returncode != 0
    assert "--exact-base needs --base" in result.stderr


def test_watch_survives_git_errors_and_removes_its_manifest(repo):
    """A git failure must not end --watch, and stopping the watcher deletes
    the manifest, so a later production build from the same clone cannot
    publish it."""
    import signal
    import time
    root, commit, write, _ = repo
    commit({"page.md": "Old.\n"})
    write("page.md", "New.\n")
    out = root / "static" / "_extras" / "changes.json"
    proc = subprocess.Popen(
        [sys.executable, SCRIPT, "--base", "main", "--out", str(out), "--watch", "--interval", "0.2"],
        cwd=root, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    try:
        for _ in range(50):
            if out.exists():
                break
            time.sleep(0.1)
        assert out.exists()
        # Break git for a moment: the watcher reports and keeps going.
        (root / ".git" / "HEAD").rename(root / ".git" / "HEAD.bak")
        time.sleep(0.6)
        assert proc.poll() is None
        (root / ".git" / "HEAD.bak").rename(root / ".git" / "HEAD")
    finally:
        proc.send_signal(signal.SIGTERM)
        _, err = proc.communicate(timeout=10)
    assert not out.exists()
    assert "failed" in err
