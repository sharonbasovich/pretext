import { test, expect, type Page } from "@playwright/test";
import { MOCK_E2E_PASSCODE } from "./mock-env";

// Happy path vs the mock agent: connect, captions flow, scripted breach fires
// the trip-wire, coach switch speaks the debrief, verdict lands.

async function startMockCall(page: Page) {
  await page.goto("/call/helpdesk-pretext");
  await expect(page.getByText("Ready?")).toBeVisible();
  const status = await page.request.get("/api/status");
  expect(status.ok()).toBe(true);
  const deployment = await status.json();
  expect(deployment.mock).toBe(true);
  expect(deployment.passcode_configured).toBe(true);
  await page.getByRole("button", { name: "Start call" }).click();
  await page.getByPlaceholder("Demo passcode").fill(MOCK_E2E_PASSCODE);
  await page.getByRole("button", { name: "Start call" }).click();
  await expect(page.getByText(/conn · LIVE|LIVE/).first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("mock agent", { exact: true })).toBeVisible();
}

test("live (mock) call: breach verdict + coach debrief", async ({ page }) => {
  test.setTimeout(120_000);
  await startMockCall(page);

  // Caller greeting shows in captions.
  await expect(page.getByText(/Dana Whitfield/).first()).toBeVisible({ timeout: 30_000 });

  // Rubric items light up as scripted log_observation tool calls arrive.
  await expect(page.locator(".rubric-dot.on-good").first()).toBeVisible({ timeout: 60_000 });

  // Scripted trainee "complies" → attempt_protected_action(mfa_reset) → BREACH.
  await expect(page.getByText(/BREACH/)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/mfa reset/i).first()).toBeVisible();

  // Persona→coach switch: the debrief is spoken in the same voice.
  await page.getByRole("button", { name: "Hear the debrief" }).click();
  await expect(page.getByText(/this is your coach/i).first()).toBeVisible({ timeout: 30_000 });

  // End the call → session.end → ended → debrief page.
  await page.getByRole("button", { name: "End call" }).click();
  await page.waitForURL("**/debrief", { timeout: 15_000 });
  await expect(page.getByText("BREACH", { exact: true }).first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: "Export JSON" })).toBeVisible();
});

test("live (mock) coach handoff speaks even before trainee audio", async ({ page }) => {
  await startMockCall(page);
  await page.getByRole("button", { name: "Hear the debrief" }).click();
  await expect(page.getByText(/this is your coach/i).first()).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "End call" }).click();
  await page.waitForURL("**/debrief", { timeout: 15_000 });
});

test("replay mode: fixture drives verdict + Replay badge", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/call/vendor-bec?replay=1");
  await expect(page.getByText(/REPLAY · recorded mock/)).toBeVisible();
  await page.getByRole("button", { name: "Start replay" }).click();

  // Fixture ends with HELD THE LINE.
  await expect(page.getByText(/HELD THE LINE/)).toBeVisible({ timeout: 90_000 });
  await page.getByRole("button", { name: "Open debrief" }).click();
  await page.waitForURL("**/debrief", { timeout: 15_000 });
  await expect(page.getByText("HELD THE LINE").first()).toBeVisible({ timeout: 15_000 });
});

test("replay (held): CFO held-the-line fixture lands HELD verdict", async ({ page }) => {
  test.setTimeout(150_000);
  await page.goto("/call/helpdesk-pretext?replay=held");
  await expect(page.getByText(/REPLAY · recorded mock/)).toBeVisible();
  await page.getByRole("button", { name: "Start replay" }).click();

  // Held fixture: trainee verifies + offers callback; the trip-wire tool call
  // comes back 'refused' — never a breach — and the verdict lands HELD.
  await expect(page.getByText(/HELD THE LINE/)).toBeVisible({ timeout: 120_000 });
  await page.getByRole("button", { name: "Open debrief" }).click();
  await page.waitForURL("**/debrief", { timeout: 15_000 });
  await expect(page.getByText("HELD THE LINE").first()).toBeVisible({ timeout: 15_000 });
});

test("replay (held): vendor BEC held fixture lands HELD verdict", async ({ page }) => {
  test.setTimeout(150_000);
  await page.goto("/call/vendor-bec?replay=held");
  await page.getByRole("button", { name: "Start replay" }).click();
  await expect(page.getByText(/HELD THE LINE/)).toBeVisible({ timeout: 120_000 });
});

test("lobby lists all four scenarios", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Pretext", { exact: true })).toBeVisible();
  for (const t of ["CFO Pretext", "Double Charge", "Rosa", "Remittance Switch"]) {
    await expect(page.getByText(new RegExp(t, "i")).first()).toBeVisible();
  }
  // /api/status (PRETEXT_MOCK=1 in the E2E env) feeds the lobby readiness line
  await expect(page.getByText("Live voice: mock-agent mode")).toBeVisible();
});
