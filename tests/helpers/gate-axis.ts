// gate-axis — find `conditional-text` either/or pairs where BOTH branches fire.
//
// WHY THIS EXISTS
//
// `conditional-text` gates on two tokens, and they come from two different
// axes: the build condition (a PRODUCT id in a multi-product hub) and the
// page's section segment. They share ONE namespace — `include-if="X"` means
// "fire if X is the product OR X is the section" — so a token that names both
// is true twice over.
//
// The failure that produced this lint: agentgateway ships `kubernetes` and
// `standalone` SECTIONS on the hub, and `kubernetes` is also the buildCondition
// of the OSS build of the same shared content. Five files wrote the idiom
//
//   {{% conditional-text include-if="kubernetes" %}}[API docs](/ref/){{% /conditional-text %}}
//   {{% conditional-text include-if="agentgateway" %}}[API docs](https://…){{% /conditional-text %}}
//
// meaning "OSS gets the relative link, hub gets the absolute one". On the hub's
// enterprise Kubernetes pages both meanings are true at once, so BOTH links
// render and the relative one 404s.
//
// WHY THIS IS EXACT RATHER THAN HEURISTIC
//
// The tempting checks all misfire. "Flag any gate naming a section" flags every
// legitimate section gate. "Flag a section name that is also a build condition"
// flags all of `url` mode, where the two axes are deliberately one value. The
// ambiguity is semantic — did the author mean the product or the section? — and
// no amount of staring at one gate recovers the answer.
//
// What IS decidable is the consequence. Take an adjacent pair of `include-if`
// gates, which is the either/or idiom and means the author expects exactly one
// to render. Enumerate every (condition, section) combination the corpus is
// actually built under; that set is small and comes from config. If some
// combination fires BOTH gates, the pair is broken on that combination — not
// "suspicious", broken, with a name for the page it breaks on. If no
// combination does, the pair is fine and is never reported.
//
// So a legitimate section pair — include-if="kubernetes" beside
// include-if="standalone" — is silent: no combination has a page in two
// sections at once. An include-if/exclude-if pair is silent by construction,
// since exactly one side of it fires. Only the overloaded token reports.

import fs from "node:fs";
import { scanSource, walkMarkdown, type Gate } from "./gate-scan";

/** One build the corpus is rendered under: a single buildCondition, plus every
 *  section a page in that build can sit in. "" is always implicitly included as
 *  a section — most pages sit in none. */
export type AxisCombo = {
  /** Label for the message, e.g. "docs hub / agentgateway". */
  name: string;
  /** site.Params.buildCondition for this build ("" in `url` mode, where the
   *  condition IS the section and is enumerated through `sections`). */
  condition: string;
  /** Keys registered under [params.sections], or [] if the build has none. */
  sections: string[];
};

export type AxisViolation = {
  file: string;
  line: number;
  /** The two gates' token lists, in source order. */
  tokens: [string[], string[]];
  /** The combination on which both fire. */
  combo: string;
  /** The (condition, section) pair, for the message. */
  condition: string;
  section: string;
};

/** Tokens of an `include-if`, or null when the gate is not an include gate.
 *  Mirrors utils/gate-decide.html: comma-split, entries trimmed, empties
 *  dropped. A gate carrying BOTH attributes is a hard error in the template, so
 *  it is not this lint's business and is skipped. */
export function includeTokens(args: string): string[] | null {
  if (/\bexclude-if\s*=/.test(args)) return null;
  const m = args.match(/\binclude-if\s*=\s*"([^"]*)"/);
  if (!m) return null;
  const tokens = m[1]
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  return tokens.length ? tokens : null;
}

/** Which axis (if either) makes a gate with these tokens fire. */
function axes(
  tokens: string[],
  condition: string,
  section: string,
): { viaCondition: boolean; viaSection: boolean } {
  // The template's outer guard: no build condition, no emit, whatever the
  // section resolved to. See layouts/_shortcodes/conditional-text.html.
  if (condition === "") return { viaCondition: false, viaSection: false };
  return {
    viaCondition: tokens.includes(condition),
    viaSection: section !== "" && tokens.includes(section),
  };
}

/** The collision this lint is about: the two gates fire through DIFFERENT axes,
 *  one matching the section and the other the build condition.
 *
 *  WHY "BOTH FIRE" IS NOT ENOUGH, and this was measured on real content. A file
 *  can hold a CHAIN of adjacent gates that is a sequence of blocks rather than an
 *  either/or — solo-io/docs' `security/extauth-about.md` runs six back to back,
 *  `gme,gmg` then `gme` then `gmg` then `gme,gmg` … , shared prose alternating
 *  with product-specific prose. Several fire together on any given build, and
 *  that is the intent. Reporting "both fire" flagged four such blocks.
 *
 *  Those overlap on ONE axis: every token there is a product id, and a superset
 *  list legitimately covers a subset one. The bug this lint exists for is the
 *  overload ACROSS axes — `kubernetes` naming a section while `agentgateway`
 *  names the product, so a single page satisfies both readings at once. Keying on
 *  "different axes" keeps every real instance and drops the same-axis chains.
 *
 *  A corollary worth knowing: with no sections configured for a build, nothing on
 *  that build can ever report. That is correct. This is the section-axis lint. */
function collides(
  ta: string[],
  tb: string[],
  condition: string,
  section: string,
): boolean {
  const a = axes(ta, condition, section);
  const b = axes(tb, condition, section);
  return (
    (a.viaSection && !a.viaCondition && b.viaCondition) ||
    (b.viaSection && !b.viaCondition && a.viaCondition)
  );
}

/** Gates are an either/or pair when NOTHING BUT WHITESPACE separates the close
 *  of one from the open of the next, with at most one blank line in that gap.
 *  Two gates with prose between them are two independent decisions, and both
 *  firing is ordinary; it is adjacency that says the author meant "one or the
 *  other".
 *
 *  WHY ONE BLANK LINE IS ALLOWED, measured rather than guessed. Requiring the
 *  two to be flush — same line, or consecutive lines — catches the inline idiom
 *  but misses the block-level one, where each branch is a multi-line block and
 *  markdown demands a blank line between them. On the agentgateway corpus that
 *  cost exactly one file, `snippets/debug-gateway.md`, a real either/or pair
 *  that renders both branches on the hub.
 *
 *  Allowing one blank line finds all five files in that corpus — the same five
 *  a hand audit found, no more — and still reports ZERO on the solo-io/docs
 *  assets tree, which is far larger and holds 504 `exclude-if` gates. Allowing
 *  two changes nothing on either corpus, so the boundary is not delicate.
 *
 *  The residual false positive this admits is two standalone gate paragraphs
 *  that are BOTH meant to render — a section-specific note followed by a
 *  product-wide one. Neither corpus contains an instance, and there is no
 *  syntactic way to tell that apart from a block-level either/or, so the lint
 *  prefers the reading that catches real bugs. Put a sentence between them if
 *  you hit it. */
function isAdjacent(src: string, a: Gate, b: Gate): boolean {
  // SAME NESTING DEPTH, or they are not siblings and cannot be an either/or.
  //
  // This is load-bearing, not belt-and-braces. `scanFile` derives `end` from the
  // FIRST closer after the opener, so for a gate that WRAPS another gate of the
  // same name that closer is the inner one — the outer gate's `end` lands inside
  // its own body. Without this test, `{{% conditional-text include-if="gme,gmg" %}}`
  // wrapping a `{{% conditional-text include-if="gme" %}}` reads as two adjacent
  // gates with overlapping tokens and reports. Four such blocks in solo-io/docs'
  // conrefs (`security/extauth-about.md`, `gloo-platform/reference/release-notes-2.10.md`)
  // were false positives until this landed.
  //
  // The same `end` quirk makes adjacency CONSERVATIVE in the other direction: a
  // gate containing a nested gate reports an early `end`, so the gap to its next
  // sibling includes real text and the pair is skipped. A missed report, never a
  // wrong one.
  if (a.depth !== b.depth) return false;
  if (b.start < a.end) return false;
  const gap = src.slice(a.end, b.start);
  if (gap.trim() !== "") return false;
  // Count blank LINES, not `\n\n` matches: those do not overlap, so "\n\n\n"
  // scores 1 rather than the 2 it is. The gap is all whitespace here, so every
  // line strictly between its first and last newline is a blank line — "" and
  // "\n" give 0, "\n\n" gives 1, "\n\n\n" gives 2.
  const blankLines = Math.max(0, gap.split("\n").length - 2);
  return blankLines <= 1;
}

/** The first combination that fires both gates, or null if none does. */
function doubleFire(
  ta: string[],
  tb: string[],
  combos: AxisCombo[],
): { combo: AxisCombo; section: string } | null {
  for (const combo of combos) {
    // "" covers the majority of pages, which sit in no section at all. A
    // build with no registered sections is therefore just [""], and no pair
    // can double-fire on it unless the two token lists genuinely overlap.
    for (const section of ["", ...combo.sections]) {
      if (collides(ta, tb, combo.condition, section)) {
        return { combo, section };
      }
    }
  }
  return null;
}

export function findAxisViolations(
  src: string,
  file: string,
  combos: AxisCombo[],
  gates?: Gate[],
): AxisViolation[] {
  // `version` gates are excluded: their tokens are versions, and version vs
  // linkVersion is a different axis pair with its own rules.
  const list = (gates ?? scanSource(src, file)).filter(
    (g) => g.name === "conditional-text",
  );
  const out: AxisViolation[] = [];

  for (let i = 0; i + 1 < list.length; i++) {
    const a = list[i];
    const b = list[i + 1];
    if (!isAdjacent(src, a, b)) continue;

    const ta = includeTokens(a.args);
    const tb = includeTokens(b.args);
    if (!ta || !tb) continue;

    // Identical token lists are a duplicate, not an either/or — a different
    // and harmless mistake. Overlapping-but-unequal lists still count.
    if (ta.length === tb.length && ta.every((t) => tb.includes(t))) continue;

    const hit = doubleFire(ta, tb, combos);
    if (!hit) continue;

    out.push({
      file,
      line: a.line,
      tokens: [ta, tb],
      combo: hit.combo.name,
      condition: hit.combo.condition,
      section: hit.section,
    });
    // One report per pair, and do not let `b` open a second pair with the gate
    // after it: the fix is to rewrite this pair, and reporting the overlap
    // twice just doubles the noise.
    i++;
  }
  return out;
}

/** Walk a source root and report every either/or pair that double-fires. */
export function scanRootForAxisViolations(
  root: string,
  combos: AxisCombo[],
): AxisViolation[] {
  const out: AxisViolation[] = [];
  for (const file of walkMarkdown(root)) {
    let src: string;
    try {
      src = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }
    out.push(...findAxisViolations(src, file, combos, scanSource(src, file)));
  }
  return out;
}

/** One line per violation, for the failure message. */
export function formatAxisViolation(v: AxisViolation): string {
  const where = v.section
    ? `${v.combo}: buildCondition "${v.condition}", section "${v.section}"`
    : `${v.combo}: buildCondition "${v.condition}"`;
  return (
    `${v.file}:${v.line} — include-if="${v.tokens[0].join(", ")}" and ` +
    `include-if="${v.tokens[1].join(", ")}" both render on ${where}. ` +
    `A token names a section on one axis and a product on the other, so both ` +
    `are true at once. Gate the product axis on the product token alone: ` +
    `make the first gate exclude-if="${v.tokens[1].join(", ")}".`
  );
}
