/**
 * Records submission/demo raw footage with Playwright (1920x1080) driving the
 * real UI: lobby → replay (breach fixture, ?speed compresses gaps) → debrief.
 * The webm is post-processed by scripts/demo-video.sh (title cards + persistent
 * "recorded replay · mock agent" disclaimer band). No live agent is used.
 *
 * Prereqs: `npx tsx mock/server.ts` on :8787 and `npm run dev -- -p 3100`.
 */
import { chromium } from "playwright";
import { promises as fs } from "node:fs";
import path from "node:path";

const APP = process.env.APP_URL ?? "http://localhost:3100";
const OUT = path.join(process.cwd(), "submission", "demo-raw");
const SPEED = process.env.DEMO_SPEED ?? "1.6";

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

  // ── beat 1: lobby — pick the flagship, show both replay variants ──
  await page.goto(`${APP}/`);
  await settle(2500);
  await page.hover("text=The CFO Pretext");
  await settle(1800);

  // ── beat 2: replay the breach fixture (recorded mock) ──
  await page.goto(`${APP}/call/helpdesk-pretext?replay=1&speed=${SPEED}`);
  await settle(1200);
  await page.getByRole("button", { name: "Start replay" }).click();
  await page.getByText(/BREACH/).first().waitFor({ timeout: 90_000 });
  await settle(4500); // let the verdict banner sit on screen
  await page.getByRole("button", { name: "Open debrief" }).click();
  await page.waitForURL("**/debrief", { timeout: 15_000 });
  await settle(5000);
  await page.mouse.move(960, 540);
  await page.mouse.wheel(0, 700);
  await settle(3500);

  // ── beat 3: quick held-the-line replay glance ──
  await page.goto(`${APP}/call/helpdesk-pretext?replay=held&speed=6`);
  await settle(800);
  await page.getByRole("button", { name: "Start replay" }).click();
  await page.getByText(/HELD THE LINE/).first().waitFor({ timeout: 60_000 });
  await settle(4000);

  await ctx.close(); // flushes the recording
  await browser.close();

  const vids = (await fs.readdir(OUT)).filter((f) => f.endsWith(".webm"));
  console.log("recorded:", vids.map((v) => path.join(OUT, v)).join("\n"));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
