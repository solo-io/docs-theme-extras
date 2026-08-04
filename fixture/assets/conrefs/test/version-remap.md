MARKER_REMAP_INTRO. A reused table whose gated row is authored against the OSS
version string and remapped to the enterprise version. See
tests/reuse-version-remap.spec.ts for the full rationale.

| Function | Description |
| ------- | ----------- |
| `MARKER_REMAP_ALWAYS_KEY` | MARKER_REMAP_ALWAYS_DESC. Ungated row; renders on every version. |
{{% version include-if="v2oss" %}}| `MARKER_REMAP_GATED_KEY` | MARKER_REMAP_GATED_DESC. Percent-form row gated to OSS version v2oss, remapped to v2 on the enterprise config. |{{% /version %}}
{{< version include-if="v2oss" keepVersion="true" >}}| `MARKER_REMAP_KEEP_KEY` | MARKER_REMAP_KEEP_DESC. keepVersion row gated to v2oss. keepVersion="true" must PREVENT the OSS→enterprise remap, so the token stays v2oss (not rewritten to v2) and this row renders on NO page — no version equals v2oss. Contrast the plain gated row above, which IS remapped and renders on v2. |{{< /version >}}

The keepVersion collision probe. The v1 version entry sets `ossVersion = "v3"`,
so the remap rewrites the token `v3` to `v1` inside `include-if`. The two blocks
below carry that same `v3` token and differ ONLY in `keepVersion`, which isolates
the guard in reuse.html: the plain block must be remapped onto v1, the keepVersion
block must be left alone and stay on v3.

These are plain inline blocks rather than table rows on purpose. The production
defect this reproduces (kgateway `versions/github-branch.md`) is a keepVersion
block whose body is a bare git branch name interpolated into a URL, and inline
content also keeps the probe clear of the separate, known Goldmark issue where a
gated pipe row fails to re-flow into the table above it.

{{% version include-if="v3" %}}MARKER_REMAP_COLLIDE_PLAIN. Plain (non-keepVersion) block gated to `v3`, the v1 entry's ossVersion. Proves the collision mapping is live: this IS remapped v3 to v1, so it renders on v1 and nowhere else.{{% /version %}}

{{< version include-if="v3" keepVersion="true" >}}MARKER_REMAP_COLLIDE_KEEP. The POSITIVE collision case. Same `v3` token as the block above, but keepVersion, so the remap must leave it alone and it must render on v3 — not follow the plain block onto v1.{{< /version >}}
