MARKER_REMAP_INTRO. A reused table whose gated row is authored against the OSS
version string and remapped to the enterprise version. See
tests/reuse-version-remap.spec.ts for the full rationale.

| Function | Description |
| ------- | ----------- |
| `MARKER_REMAP_ALWAYS_KEY` | MARKER_REMAP_ALWAYS_DESC. Ungated row; renders on every version. |
{{% version include-if="v2oss" %}}| `MARKER_REMAP_GATED_KEY` | MARKER_REMAP_GATED_DESC. Percent-form row gated to OSS version v2oss, remapped to v2 on the enterprise config. |{{% /version %}}
{{< version include-if="v2oss" keepVersion="true" >}}| `MARKER_REMAP_KEEP_KEY` | MARKER_REMAP_KEEP_DESC. keepVersion row gated to v2oss. keepVersion="true" must PREVENT the OSS→enterprise remap, so the token stays v2oss (not rewritten to v2) and this row renders on NO page — no version equals v2oss. Contrast the plain gated row above, which IS remapped and renders on v2. |{{< /version >}}
