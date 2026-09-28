import { describe, it, expect, beforeEach } from "vitest";
import { mintToken, resetTokenLimitsForTest, type TokenEnv } from "@/lib/tokenRoute";

const baseEnv: TokenEnv = { PRETEXT_MOCK: "1", PRETEXT_MOCK_WS_URL: "ws://mock/v1/ws" };

describe("token route", () => {
  beforeEach(() => resetTokenLimitsForTest());

  it("mock mode returns the mock ws url without an API key", async () => {
    const res = await mintToken(baseEnv, { ip: "1.1.1.1" });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.mock).toBe(true);
      expect(res.ws_url).toBe("ws://mock/v1/ws");
      expect(res.max_session_seconds).toBeLessThanOrEqual(240);
    }
  });

  it("no key + no mock → 503 with replay hint", async () => {
    const res = await mintToken({}, { ip: "2.2.2.2" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(503);
  });

  it("wrong/missing passcode → 401 when PRETEXT_DEMO_PASSCODE set", async () => {
    const env = { ...baseEnv, PRETEXT_DEMO_PASSCODE: "letmein" };
    const bad = await mintToken(env, { ip: "3.3.3.3", passcode: "nope" });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.status).toBe(401);
    const good = await mintToken({ ...env }, { ip: "3.3.3.4", passcode: "letmein" });
    expect(good.ok).toBe(true);
  });

  it("per-IP rate limit kicks in after 10 in 10min", async () => {
    for (let i = 0; i < 10; i++) {
      const r = await mintToken(baseEnv, { ip: "4.4.4.4" });
      expect(r.ok).toBe(true);
    }
    const r = await mintToken(baseEnv, { ip: "4.4.4.4" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("rate_limited");
    // Different IP unaffected.
    const other = await mintToken(baseEnv, { ip: "4.4.4.5" });
    expect(other.ok).toBe(true);
  });

  it("daily cap blocks after PRETEXT_DAILY_SESSION_CAP sessions", async () => {
    const env = { ...baseEnv, PRETEXT_DAILY_SESSION_CAP: "3" };
    for (let i = 0; i < 3; i++) {
      expect((await mintToken(env, { ip: `5.5.5.${i}` })).ok).toBe(true);
    }
    const r = await mintToken(env, { ip: "5.5.5.9" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("daily_cap_reached");
  });

  it("clamps max_session_seconds to <=240 hard cap", async () => {
    const env = { ...baseEnv, PRETEXT_MAX_SESSION_SECONDS: "9000" };
    const res = await mintToken(env, { ip: "6.6.6.6" });
    expect(res.ok && res.max_session_seconds === 240).toBe(true);
  });

  it("live path calls AssemblyAI token endpoint and returns token", async () => {
    let calledUrl = "";
    const fakeFetch = async (url: string) => {
      calledUrl = url;
      return { ok: true, status: 200, json: async () => ({ token: "tok_live" }), text: async () => "" };
    };
    const res = await mintToken(
      { ASSEMBLYAI_API_KEY: "k", PRETEXT_DEMO_PASSCODE: "private-code" },
      { ip: "7.7.7.7", passcode: "private-code", fetchFn: fakeFetch },
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.token).toBe("tok_live");
      expect(res.mock).toBe(false);
    }
    expect(calledUrl).toContain("agents.assemblyai.com/v1/token");
    expect(calledUrl).toContain("max_session_duration_seconds=240");
  });

  it("fails closed in production when the demo passcode is absent or blank", async () => {
    let called = false;
    const fakeFetch = async () => {
      called = true;
      return { ok: true, status: 200, json: async () => ({ token: "should-not-issue" }), text: async () => "" };
    };
    for (const env of [
      { NODE_ENV: "production", ASSEMBLYAI_API_KEY: "k" },
      { VERCEL_ENV: "production", ASSEMBLYAI_API_KEY: "k", PRETEXT_DEMO_PASSCODE: "   " },
      { NODE_ENV: "production", PRETEXT_MOCK: "1" },
      { NODE_ENV: "development", ASSEMBLYAI_API_KEY: "k" },
    ]) {
      const res = await mintToken(env, { ip: "9.9.9.9", passcode: "   ", fetchFn: fakeFetch });
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.status).toBe(503);
        expect(res.error).toBe("passcode_not_configured");
      }
    }
    expect(called).toBe(false);
  });

  it("allows a production live token only with the configured passcode", async () => {
    let called = 0;
    const fakeFetch = async () => {
      called += 1;
      return { ok: true, status: 200, json: async () => ({ token: "tok_live" }), text: async () => "" };
    };
    const env = { NODE_ENV: "production", ASSEMBLYAI_API_KEY: "k", PRETEXT_DEMO_PASSCODE: "private-code" };
    const bad = await mintToken(env, { ip: "9.9.9.10", passcode: "wrong", fetchFn: fakeFetch });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error).toBe("passcode_required");
    expect(called).toBe(0);
    const good = await mintToken(env, { ip: "9.9.9.10", passcode: "private-code", fetchFn: fakeFetch });
    expect(good.ok).toBe(true);
    expect(called).toBe(1);
  });

  it("does not call the upstream when a live key contains only whitespace", async () => {
    let called = false;
    const res = await mintToken(
      { ASSEMBLYAI_API_KEY: "  \n ", PRETEXT_DEMO_PASSCODE: "private-code" },
      {
        ip: "9.9.9.11",
        passcode: "private-code",
        fetchFn: async () => {
          called = true;
          throw new Error("unexpected upstream call");
        },
      },
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("no_api_key");
    expect(called).toBe(false);
  });

  it("upstream failure → 502", async () => {
    const fakeFetch = async () => ({
      ok: false, status: 401, json: async () => ({}), text: async () => "unauthorized",
    });
    const res = await mintToken(
      { ASSEMBLYAI_API_KEY: "k", PRETEXT_DEMO_PASSCODE: "private-code" },
      { ip: "8.8.8.8", passcode: "private-code", fetchFn: fakeFetch },
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(502);
  });
});
