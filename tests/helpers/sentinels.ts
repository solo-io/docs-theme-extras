export const SHORTCODE_MARKERS = [
  "MARKER_SNIPPET",
  "MARKER_NESTED_SNIPPET",
  "MARKER_ALERT_INFO",
  "MARKER_ALERT_WARNING",
  "MARKER_ALERT_DANGER",
  "MARKER_ALERT_WITH_REUSE",
  "MARKER_ALERT_SUCCESS",
  "MARKER_CALLOUT_INFO",
  "MARKER_CALLOUT_WARNING",
  "MARKER_CALLOUT_DANGER",
  "MARKER_CALLOUT_SUCCESS",
  "MARKER_DETAILS",
  "MARKER_TAB_YAML",
  "MARKER_TAB_BASH",
  "MARKER_CODE_YAML",
  "MARKER_CODE_SH",
  "MARKER_CODE_GO",
  "MARKER_REUSE_IN_CODE",
  "MARKER_LINENOS",
  "MARKER_HIGHLIGHTED",
  "MARKER_HIGHLIGHT_NUMBERED",
  "MARKER_FENCE_TILDE",
  "MARKER_FENCE_INDENTED",
  "MARKER_CODE_LONG_LINE",
  "MARKER_LINK",
  "MARKER_LINK_HEXTRA",
  "MARKER_OL_L1",
  "MARKER_OL_L2",
  "MARKER_OL_L3",
  "MARKER_UL_L1",
  "MARKER_UL_L2",
  "MARKER_UL_L3",
  "MARKER_STEP_1",
  "MARKER_STEP_2",
  "MARKER_STEP_3",
  "MARKER_STEPS_TABS_1",
  "MARKER_STEPS_TABS_2",
  "MARKER_STEPS_TABS_3",
  "MARKER_STEPS_TABS_4",
  "MARKER_STEPS_TABS_A",
  "MARKER_STEPS_TABS_B",
  "MARKER_SVG_ALT",
  "MARKER_PRISM",
  "MARKER_OPENAPI",
  "MARKER_READFILE",
  "MARKER_REUSE_IMAGE_DARK",
  "MARKER_NUMBERED_BEFORE_TAB",
  "MARKER_NUMBERED_INSIDE_TAB",
  "MARKER_NUMBERED_AFTER_TAB",
  "MARKER_TAB_BLANKFENCE_PROSE",
  "MARKER_TAB_BLANKFENCE_BEFORE",
  "MARKER_TAB_BLANKFENCE_AFTER",
  "MARKER_GITHUB",
  "MARKER_GITHUB_TABLE",
  "MARKER_GITHUB_YAML",
  "MARKER_GITHUB_TEXT",
  "MARKER_TABLE_ROW1A",
  "MARKER_CHECKLIST_1",
  "MARKER_CHECKLIST_2",
  "MARKER_CHECKLIST_3",
  "MARKER_IMAGE_ALT",
  "MARKER_MERMAID_REQUEST",
  "MARKER_MERMAID_RESPONSE",
  "MARKER_BADGE",
  "MARKER_FILETREE",
  "MARKER_INCLUDE",
] as const;

export const VERSION_MARKERS = {
  v1: "MARKER_V1_ONLY",
  v2: "MARKER_V2_ONLY",
  main: "MARKER_MAIN_ONLY",
  notV1: "MARKER_NOT_V1",
  v1OrMain: "MARKER_V1_OR_MAIN",
  keepVersion: "MARKER_KEEP_VERSION",
  nestedLink: "MARKER_NESTED_LINK",
  versionedImage: "MARKER_VERSIONED_IMAGE",
  inFenceKey: "MARKER_VERSION_INFENCE_KEY",
  inFenceComment: "MARKER_VERSION_INFENCE_COMMENT",
  inFenceGated: "MARKER_VERSION_INFENCE_GATED",
  inFencePlaceholderUpper: "MARKER_VERSION_INFENCE_PLACEHOLDER_UPPER",
  inFencePlaceholderLower: "MARKER_VERSION_INFENCE_PLACEHOLDER_LOWER",
  wrapAroundBullet: "MARKER_VERSION_WRAPAROUND_BULLET",
  wrapAroundFn: "MARKER_VERSION_WRAPAROUND_FN",
  wrapAroundComment: "MARKER_VERSION_WRAPAROUND_COMMENT",
  // Rich-context matrix: version shortcode placed inside other markdown
  // structures. Each marker below is v2-gated except the seq* group, which
  // tests adjacent same-line version blocks one per version.
  inCallout: "MARKER_VERSION_IN_CALLOUT",
  inUL3: "MARKER_VERSION_IN_UL3",
  inOL3: "MARKER_VERSION_IN_OL3",
  inTableCell: "MARKER_VERSION_IN_TABLE_CELL",
  inTabBody: "MARKER_VERSION_IN_TAB",
  inCodePhrase: "MARKER_VERSION_IN_CODEPHRASE",
  inBold: "MARKER_VERSION_IN_BOLD",
  inHeading: "MARKER_VERSION_IN_HEADING",
  seqV1: "MARKER_VERSION_SEQ_V1",
  seqV2: "MARKER_VERSION_SEQ_V2",
  seqMain: "MARKER_VERSION_SEQ_MAIN",
  linkText: "MARKER_VERSION_LINK_TEXT",
  linkDestText: "MARKER_VERSION_LINK_DEST",
  // Fence-adjacency: version block on the line immediately following or
  // preceding a fenced code block, with no blank-line separator. Goldmark
  // could otherwise absorb the shortcode body into the fence's <pre>.
  fenceAdjAfter: "MARKER_FENCE_ADJ_AFTER_V2",
  fenceAdjBefore: "MARKER_FENCE_ADJ_BEFORE_V2",
  // Opening fence on the same line as the opening shortcode tag, and
  // closing fence on the same line as the closing tag. Compactness
  // variant of the wrap-around-fence pattern.
  fenceSameLine: "MARKER_FENCE_SAMELINE_V2",
  // Version-gated card using path= inside a {{% version %}} wrapper.
  // Title text carries the marker so we can locate the rendered card.
  nestedArgTitle: "MARKER_NESTED_ARG_TITLE",
  // Block-level content inside a version block: heading, table, nested
  // shortcode. Two form variants cover both paths through version.html:
  // - angle-bracket ({{< >}}): RenderString path fires when $hasMarkdown=true
  // - percent-form ({{% %}}): no-markdown path emits raw text → outer pass renders it
  blockH2: "MARKER_VERSION_BLOCK_H2",
  blockTable: "MARKER_VERSION_BLOCK_TABLE",
  blockCallout: "MARKER_VERSION_BLOCK_CALLOUT",
  pctBlockH2: "MARKER_VERSION_PCT_H2",
  pctBlockTable: "MARKER_VERSION_PCT_TABLE",
} as const;

export const CONDITIONAL_MARKERS = {
  testOnly: "COND_TEST_ONLY",
  notTest: "COND_NOT_TEST",
  bullet1: "COND_BULLET_1",
  bullet2: "COND_BULLET_2",
  bullet3: "COND_BULLET_3",
  codeInside: "COND_CODE_INSIDE_CONDITIONAL",
  // Rich-context matrix: conditional-text placed inside other markdown
  // structures. buildCondition is "test" in the fixture so all include-if
  // markers render on every page; the matrix exercises structural placement
  // rather than gating.
  inCallout: "COND_IN_CALLOUT",
  inUL3: "COND_IN_UL3",
  inOL3: "COND_IN_OL3",
  inTableCell: "COND_IN_TABLE_CELL",
  inTabBody: "COND_IN_TAB",
  inCodePhrase: "COND_IN_CODEPHRASE",
  inBold: "COND_IN_BOLD",
  inHeading: "COND_IN_HEADING",
  inFenceComment: "COND_INFENCE_COMMENT",
  wrapAroundFn: "COND_WRAPAROUND_FN",
  linkText: "COND_LINK_TEXT",
  linkDestText: "COND_LINK_DEST",
  // Fence-adjacency: conditional-text on the line immediately following
  // or preceding a fenced code block, with no blank-line separator.
  // Goldmark could otherwise absorb the shortcode body into the fence.
  fenceAdjAfter: "COND_FENCE_ADJ_AFTER",
  fenceAdjBefore: "COND_FENCE_ADJ_BEFORE",
  // Conditional mirror of the same-line opening fence + shortcode tag
  // pattern. The body should render as a Chroma-highlighted yaml fence
  // when buildCondition matches, not as plain backtick text.
  fenceSameLine: "COND_FENCE_SAMELINE",
  // Conditional-gated card using path= inside a {{% conditional-text %}}
  // wrapper. Title text carries the marker.
  nestedArgTitle: "COND_NESTED_ARG_TITLE",
} as const;
