import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const APP = process.env.APP_URL ?? "http://localhost:3100";
const OUT = "shots";
mkdirSync(OUT, { recursive: true });

async function main() {
  const browser = await chromium.launch({
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
      "--use-file-for-fake-audio-capture=e2e/assets/fake-mic.wav",
      "--autoplay-policy=no-user-gesture-required",
    ],
  });
  const ctx = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    permissions: ["microphone"],
  });
  const page = await ctx.newPage();

  // 1. lobby
  await page.goto(`${APP}/`);
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/01-lobby.png` });

  // 2. live call mid-flow
  await page.goto(`${APP}/call/helpdesk-pretext`);
  await page.getByRole("button", { name: "Start call" }).click();
  await page.getByText(/conn · LIVE|LIVE/).first().waitFor({ timeout: 20000 });
  await page.getByText(/Dana Whitfield/).first().waitFor({ timeout: 30000 });
  await page.waitForTimeout(9000);
  await page.screenshot({ path: `${OUT}/02-live-call.png` });

  // 3. breach banner
  await page.getByText(/BREACH/).first().waitFor({ timeout: 60000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/03-breach.png` });

  // 4. coach + debrief page
  await page.getByRole("button", { name: "Hear the debrief" }).click();
  await page.getByText(/this is your coach/i).first().waitFor({ timeout: 30000 });
  await page.screenshot({ path: `${OUT}/04-coach.png` });
  await page.getByRole("button", { name: "End call" }).click();
  await page.waitForURL("**/debrief", { timeout: 15000 });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/05-debrief.png`, fullPage: true });

  await browser.close();
  console.log("done:", process.cwd() + "/" + OUT);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
