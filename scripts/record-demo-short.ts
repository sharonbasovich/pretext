/**
 * Records the ~25s raw body for submission/demo_short.mp4 (1920x1080):
 * lobby hook → breach replay at high speed → debrief. Post-processed by
 * scripts/demo-video-short.sh (title card + honesty banner + closing card).
 * No live agent is used — recorded replay only.
 *
 * Prereqs: `npx tsx mock/server.ts` on :8787 and `npm run dev -- -p 3100`.
 */
import { chromium } from "playwright";
import { promises as fs } from "node:fs";
import path from "node:path";

const APP = process.env.APP_URL ?? "http://localhost:3100";
const OUT = path.join(process.cwd(), "submission", "demo-raw");

async function main() {
  await fs.mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({
    args: [
      "--use-fake-device-for-media-stream",
      `--use-file-for-fake-audio-capture=${path.join(process.cwd(), "e2e", "assets", "fake-mic.wav")}`,
    ],
  });
  const ctx = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    recordVideo: { dir: OUT, size: { width: 1920, height: 1080 } },
    permissions: ["microphone"],
  });
  const page = await ctx.newPage();
  const settle = (ms: number) => page.waitForTimeout(ms);

  // hook: lobby → straight into the flagship replay
  await page.goto(`${APP}/`);
  await settle(1500);
  await page.goto(`${APP}/call/helpdesk-pretext?replay=1&speed=8`);
  await settle(900);
  await page.getByRole("button", { name: "Start replay" }).click();

  // breach lands ~12s in at 8x; hold the banner on screen
  await page.getByText(/BREACH/).first().waitFor({ timeout: 60_000 });
  await settle(6500);

  // debrief: rubric evidence + metrics
  await page.getByRole("button", { name: "Open debrief" }).click();
  await page.waitForURL("**/debrief", { timeout: 15_000 });
  await settle(5000);
  await page.mouse.move(960, 540);
  await page.mouse.wheel(0, 700);
  await settle(4000);

  await ctx.close();
  await browser.close();
  console.log("short demo raw written to", OUT);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
