import { test, expect } from "@playwright/test";
import { AxeBuilder } from "@axe-core/playwright";

// axe-core on the static states + a 375px-wide viewport pass. The live-call
// axe audit isn't run (headless audio streams produce no useful violations and
// flake); lobby + pre-call gate + debrief-empty are the stable surfaces.

test("a11y: lobby has no critical/serious axe violations", async ({ page }) => {
  await page.goto("/");
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  const serious = results.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
  expect(serious.map((v) => `${v.id}: ${v.nodes.length} nodes`)).toEqual([]);
});

test("a11y: call console pre-call has no critical/serious axe violations", async ({ page }) => {
  await page.goto("/call/helpdesk-pretext?replay=1");
  await page.getByRole("button", { name: "Start replay" }).waitFor();
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  const serious = results.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
  expect(serious.map((v) => `${v.id}: ${v.nodes.length} nodes`)).toEqual([]);
});

test("mobile 375px: lobby and console render without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  await expect(page.getByText("Pretext", { exact: true })).toBeVisible();
  let scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scrollW).toBeLessThanOrEqual(376);

  await page.goto("/call/helpdesk-pretext?replay=1");
  await page.getByRole("button", { name: "Start replay" }).waitFor();
  scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scrollW).toBeLessThanOrEqual(376);
});
