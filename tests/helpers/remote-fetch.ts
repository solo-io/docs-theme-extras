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

// Companion to the cap scan, for the case where the timeout is not a literal.
// `github-table` takes an author-supplied `timeout=` so a page fetching a very
// large remote can raise it, which means its cap reads `(dict "timeout"
// $timeout)`. The cap scan above only looks for the word `timeout`, so it would
// keep passing if that variable resolved to "" — an empty timeout is an
// UNCAPPED fetch wearing the shape of a capped one, exactly the hang the cap
// exists to prevent. So: whenever a GetRemote's timeout value is a template
// variable, that variable must be assigned through `default` in the same file,
// which is what pins the fallback when the parameter is absent.
//
// Returns a message per offending call; empty means every variable timeout has
// a literal fallback.
export function findUndefaultedTimeoutVar(src: string, file: string): string[] {
  const cleaned = blankHugoComments(src);
  const out: string[] = [];
  for (const call of getRemoteCalls(src, file)) {
    const m = /"timeout"\s+(\$[A-Za-z0-9_]+)/.exec(call.action);
    if (!m) continue;
    const varName = m[1];
    // `{{- $timeout := default "15s" (.Get "timeout") -}}` — the assignment must
    // both bind this variable and route through `default` with a literal.
    const assigned = new RegExp(
      `\\${varName}\\s*:?=\\s*default\\s+"[^"]+"`,
    ).test(cleaned);
    if (!assigned) {
      out.push(
        `${call.file}:${call.line}: timeout is ${varName}, but ${varName} is never assigned via \`default "<literal>"\` — an absent parameter would make the fetch uncapped`,
      );
    }
  }
  return out;
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
