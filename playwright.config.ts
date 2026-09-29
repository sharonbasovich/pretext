import { defineConfig, devices } from "@playwright/test";
import { MOCK_E2E_API_KEY, MOCK_E2E_PASSCODE } from "./e2e/mock-env";

const MOCK_WS_PORT = 8787;
const APP_PORT = 3100;

export default defineConfig({
  testDir: "./e2e",
  timeout: 150_000,
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: `http://localhost:${APP_PORT}`,
    video: "on",
    trace: "retain-on-failure",
    launchOptions: {
      args: [
        "--use-fake-device-for-media-stream",
        "--use-fake-ui-for-media-stream",
        `--use-file-for-fake-audio-capture=${process.env.PRETEXT_FAKE_WAV ?? "e2e/assets/fake-mic.wav"}`,
        "--autoplay-policy=no-user-gesture-required",
      ],
    },
    permissions: ["microphone"],
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "npx tsx mock/server.ts",
      port: MOCK_WS_PORT,
      reuseExistingServer: false,
      env: { PRETEXT_MOCK_PORT: String(MOCK_WS_PORT) },
    },
    {
      command: process.env.CI ? "npm run start -- -p 3100" : "npm run dev -- -p 3100",
      url: `http://localhost:${APP_PORT}`,
      reuseExistingServer: false,
      timeout: 240_000,
      env: {
        ASSEMBLYAI_API_KEY: MOCK_E2E_API_KEY,
        PRETEXT_DEMO_PASSCODE: MOCK_E2E_PASSCODE,
        PRETEXT_MOCK: "1",
        PRETEXT_MOCK_WS_URL: `ws://localhost:${MOCK_WS_PORT}/v1/ws`,
      },
    },
  ],
});
