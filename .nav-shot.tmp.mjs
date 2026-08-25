import { chromium } from "@playwright/test";
const base = "http://localhost:4601";
const S = "/private/tmp/claude-501/-Users-kristinbrown-Documents-GitHub/cac35896-ab21-42bf-91c9-5646e4ce0c69/scratchpad";
const pages = [
  ["root2", "/"],
  ["section-landing2", "/kubernetes/"],
  ["content2", "/kubernetes/latest/about/"],
];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 500 } });
for (const [name, path] of pages) {
  await page.goto(base + path, { waitUntil: "networkidle" });
  await page.screenshot({ path: `${S}/nav-${name}.png`, clip: { x: 0, y: 0, width: 390, height: 110 } });
}
await browser.close();
