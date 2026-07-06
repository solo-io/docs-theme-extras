---
title: Flatguide Alpha
weight: 10
---

Alpha topic in the non-versioned fixture section. The sidebar rendered on this
leaf page must still list its sibling (Flatguide Beta) — see sidebar-flat.spec.ts.

The callouts below exercise the callout `icon=` override — see callout-icon.spec.ts.

{{< callout type="info" icon="flask" >}}
SVG-ICON-CALLOUT: `icon="flask"` is a site.Data.icons entry, so the icon renders as an inline SVG.
{{< /callout >}}

{{< callout icon="rocket_launch" >}}
MATERIAL-ICON-CALLOUT: `icon="rocket_launch"` is not in site.Data.icons, so it renders as a Material Icons ligature.
{{< /callout >}}
