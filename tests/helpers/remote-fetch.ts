// Source-level helpers for the v0.1.20 build-resilience invariants.
//
// The release capped every build-time `resources.GetRemote` with a
// `(dict "timeout" "15s")` so a slow/unreachable remote can't hang the build
// (the ~20-minute cold-CI stall it fixed). That behavior is impractical to
// exercise at runtime — it needs a black-holed network and would trip the
// `hugo-warnings` gate — so instead we pin the INVARIANT at the source: every
// GetRemote in the theme's own templates must pass a timeout. A future edit
// that adds an uncapped fetch, or drops the cap on an existing one, fails the
// scan here instead of in a cold consumer CI build.

export type GetRemoteCall = {
  file: string;
  line: number;
  action: string; // the enclosing {{ ... }} template action
  capped: boolean; // whether the enclosing action passes a `timeout`
};

// Blank out Hugo template comments ({{/* ... */}} / {{- /* ... */ -}}) so a
// GetRemote mentioned in prose (e.g. search.html's header comment explaining
// the override) is not mistaken for a real call. Newlines are preserved so
// reported line numbers still match the original source.
export function blankHugoComments(src: string): string {
  return src.replace(/\{\{-?\s*\/\*[\s\S]*?\*\/\s*-?\}\}/g, (m) =>
    m.replace(/[^\n]/g, " "),
  );
}

// Every real `resources.GetRemote` call in `src`, each tagged with whether the
// enclosing template action passes a `timeout`. Assumes the options dict is
// inline in the same action (true for all current call sites) — a call whose
// options are built in a separate variable would read as uncapped here, which
// is the safe direction to fail.
export function getRemoteCalls(src: string, file: string): GetRemoteCall[] {
  const cleaned = blankHugoComments(src);
  const needle = "resources.GetRemote";
  const out: GetRemoteCall[] = [];
  let idx = cleaned.indexOf(needle);
  while (idx !== -1) {
    const open = cleaned.lastIndexOf("{{", idx);
    const closeRaw = cleaned.indexOf("}}", idx);
    const start = open === -1 ? idx : open;
    const end = closeRaw === -1 ? cleaned.length : closeRaw + 2;
    const action = cleaned.slice(start, end);
    out.push({
      file,
      line: cleaned.slice(0, idx).split("\n").length,
      action: action.trim(),
      capped: /\btimeout\b/.test(action),
    });
    idx = cleaned.indexOf(needle, idx + needle.length);
  }
  return out;
}

// Uncapped GetRemote calls only.
export function findUncappedGetRemote(
  src: string,
  file: string,
): GetRemoteCall[] {
  return getRemoteCalls(src, file).filter((c) => !c.capped);
}

// Guards the rebase missing-resource fix: rebase.html must not dereference
// `$doc.Content` unguarded (the pre-fix form crashed with a confusing
// "nil pointer evaluating resource.Resource.Content" that masked the real
// errorf). The fix reads `.Content` inside `{{ with $doc }}`, so `$doc.Content`
// no longer appears. Returns the offending line numbers (empty = fix in place).
export function findUnguardedDocContent(src: string): number[] {
  const cleaned = blankHugoComments(src);
  const lines = cleaned.split("\n");
  const hits: number[] = [];
  lines.forEach((l, i) => {
    if (l.includes("$doc.Content")) hits.push(i + 1);
  });
  return hits;
}
