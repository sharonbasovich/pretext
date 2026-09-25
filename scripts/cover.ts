import { chromium } from "@playwright/test";
async function main() {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  await p.goto("file:///tmp/cover.html");
  await p.waitForTimeout(400);
  await p.screenshot({ path: "submission/cover.png" });
  await b.close();
  console.log("cover done");
}
main().catch((e) => { console.error(e); process.exit(1); });
