import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { getDeploymentStatus } from "@/lib/status";
import { GET } from "@/app/api/status/route";
import { SCENARIOS } from "@/lib/catalog";

/**
 * /api/status reports readiness as booleans + persona NAMES — the one test
 * that matters most is the last: the serialized payload must never contain a
 * key value or an agent ID.
 */

const savedEnv = { ...process.env };
const ALL = SCENARIOS.map((s) => s.agent);

describe("getDeploymentStatus", () => {
  beforeEach(() => {
    process.env = { ...savedEnv };
    delete process.env.ASSEMBLYAI_API_KEY;
    delete process.env.PRETEXT_DEMO_PASSCODE;
    delete process.env.PRETEXT_AGENT_IDS;
    delete process.env.PRETEXT_MOCK;
    delete process.env.PRETEXT_EXPOSE_INLINE;
    delete process.env.VERCEL_GIT_COMMIT_SHA;
    delete process.env.VERCEL_ENV;
  });
  afterAll(() => {
    process.env = savedEnv;
  });

  it("bare deployment: nothing configured, nothing claimed live", async () => {
    const s = await getDeploymentStatus();
    expect(s.has_assemblyai_key).toBe(false);
    expect(s.passcode_configured).toBe(false);
    expect(s.mock).toBe(false);
    expect(s.agent_ids.configured).toBe(false);
    expect(s.agent_ids.parse_ok).toBe(true);
    expect(s.agent_ids.mapped_personas).toEqual([]);
    expect(s.agent_ids.missing).toEqual(ALL);
    expect(s.live_ready).toBe(false);
    expect(s.commit).toBeNull();
    expect(s.vercel_env).toBeNull();
  });

  it("whitespace-only key does not count as configured", async () => {
    process.env.ASSEMBLYAI_API_KEY = "   \n  ";
    const s = await getDeploymentStatus();
    expect(s.has_assemblyai_key).toBe(false);
    expect(s.live_ready).toBe(false);
  });

  it("key + passcode + all four agent IDs → configuration ready", async () => {
    process.env.ASSEMBLYAI_API_KEY = "sk_TEST_SECRET_do_not_leak";
    process.env.PRETEXT_DEMO_PASSCODE = "private-code-do-not-leak";
    process.env.PRETEXT_AGENT_IDS = JSON.stringify({
      "helpdesk-pretext": "ag_secret_helpdesk",
      "billing-dispute": "ag_secret_billing",
      "elderly-bilingual": "ag_secret_rosa",
      "vendor-bec": "ag_secret_vendor",
    });
    const s = await getDeploymentStatus();
    expect(s.has_assemblyai_key).toBe(true);
    expect(s.passcode_configured).toBe(true);
    expect(s.agent_ids.configured).toBe(true);
    expect(s.agent_ids.parse_ok).toBe(true);
    expect(s.agent_ids.mapped_personas).toEqual(ALL);
    expect(s.agent_ids.missing).toEqual([]);
    expect(s.live_ready).toBe(true);
  });

  it("never claims live readiness without the private passcode", async () => {
    process.env.ASSEMBLYAI_API_KEY = "sk_TEST_SECRET_do_not_leak";
    process.env.PRETEXT_AGENT_IDS = JSON.stringify(Object.fromEntries(
      ALL.map((name) => [name, `ag_${name}`]),
    ));
    const s = await getDeploymentStatus();
    expect(s.agent_ids.missing).toEqual([]);
    expect(s.passcode_configured).toBe(false);
    expect(s.live_ready).toBe(false);
  });

  it("never claims safe readiness with inline persona exposure enabled", async () => {
    process.env.ASSEMBLYAI_API_KEY = "sk_TEST_SECRET_do_not_leak";
    process.env.PRETEXT_DEMO_PASSCODE = "private-code-do-not-leak";
    process.env.PRETEXT_AGENT_IDS = JSON.stringify(Object.fromEntries(
      ALL.map((name) => [name, `ag_${name}`]),
    ));
    process.env.PRETEXT_EXPOSE_INLINE = "1";
    const s = await getDeploymentStatus();
    expect(s.expose_inline).toBe(true);
    expect(s.live_ready).toBe(false);
  });

  it("partial agent IDs → mapped vs missing split", async () => {
    process.env.ASSEMBLYAI_API_KEY = "sk_x";
    process.env.PRETEXT_AGENT_IDS = JSON.stringify({ "helpdesk-pretext": "ag_1" });
    const s = await getDeploymentStatus();
    expect(s.agent_ids.mapped_personas).toEqual(["helpdesk-pretext"]);
    expect(s.agent_ids.missing).toEqual(ALL.slice(1));
    expect(s.live_ready).toBe(false);
  });

  it("malformed PRETEXT_AGENT_IDS → parse_ok false, safe 200 payload", async () => {
    process.env.ASSEMBLYAI_API_KEY = "sk_x";
    process.env.PRETEXT_AGENT_IDS = "{not json";
    const s = await getDeploymentStatus();
    expect(s.agent_ids.configured).toBe(true);
    expect(s.agent_ids.parse_ok).toBe(false);
    expect(s.agent_ids.mapped_personas).toEqual([]);
    expect(s.live_ready).toBe(false);
  });

  it("vercel env fields are validated before becoming public", async () => {
    process.env.VERCEL_GIT_COMMIT_SHA = "8e69673abcdef0123456789";
    process.env.VERCEL_ENV = "preview";
    const s = await getDeploymentStatus();
    expect(s.commit).toBe("8e69673");
    expect(s.vercel_env).toBe("preview");
    process.env.VERCEL_GIT_COMMIT_SHA = "accidentally-included-secret";
    process.env.VERCEL_ENV = "accidentally-included-secret";
    const invalid = await getDeploymentStatus();
    expect(invalid.commit).toBeNull();
    expect(invalid.vercel_env).toBeNull();
  });

  it("serialized payload never contains key material or agent IDs", async () => {
    process.env.ASSEMBLYAI_API_KEY = "sk_TEST_SECRET_do_not_leak";
    process.env.PRETEXT_DEMO_PASSCODE = "private-code-do-not-leak";
    process.env.PRETEXT_AGENT_IDS = JSON.stringify({
      "helpdesk-pretext": "ag_secret_helpdesk",
      "billing-dispute": "ag_secret_billing",
      "elderly-bilingual": "ag_secret_rosa",
      "vendor-bec": "ag_secret_vendor",
    });
    const s = await getDeploymentStatus();
    const text = JSON.stringify(s);
    expect(text).not.toContain("sk_TEST_SECRET_do_not_leak");
    expect(text).not.toContain("private-code-do-not-leak");
    expect(text).not.toContain("ag_secret_helpdesk");
    expect(text).not.toContain("ag_secret_billing");
    expect(text).not.toContain("ag_secret_rosa");
    expect(text).not.toContain("ag_secret_vendor");
    expect(text).not.toMatch(/sk_|ag_[a-z]/i);
  });

  it("GET /api/status is uncached and never includes config values", async () => {
    process.env.ASSEMBLYAI_API_KEY = "sk_TEST_SECRET_do_not_leak";
    process.env.PRETEXT_DEMO_PASSCODE = "private-code-do-not-leak";
    process.env.PRETEXT_AGENT_IDS = JSON.stringify({ "helpdesk-pretext": "ag_secret_helpdesk" });
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const text = await response.text();
    expect(text).not.toContain("sk_TEST_SECRET_do_not_leak");
    expect(text).not.toContain("private-code-do-not-leak");
    expect(text).not.toContain("ag_secret_helpdesk");
    expect(JSON.parse(text).passcode_configured).toBe(true);
  });
});
