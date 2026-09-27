import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/token/route";
import { resetTokenLimitsForTest } from "@/lib/tokenRoute";

/**
 * Transport rules for /api/token: the demo passcode is accepted ONLY via the
 * x-demo-passcode header (query strings end up in access logs), and every
 * response carries Cache-Control: no-store since it may contain a credential.
 */

const savedEnv = { ...process.env };

function req(url: string, headers: Record<string, string> = {}) {
  return new NextRequest(url, { headers });
}

describe("/api/token transport", () => {
  beforeEach(() => {
    resetTokenLimitsForTest();
    process.env = { ...savedEnv, PRETEXT_DEMO_PASSCODE: "letmein" };
    delete process.env.ASSEMBLYAI_API_KEY;
    delete process.env.PRETEXT_MOCK;
  });

  afterAll(() => {
    process.env = savedEnv;
  });

  it("ignores ?passcode= query strings (401 even when correct)", async () => {
    const res = await GET(req("http://localhost/api/token?passcode=letmein"));
    expect(res.status).toBe(401);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("accepts x-demo-passcode header (past the gate → 503 without a key)", async () => {
    const res = await GET(
      req("http://localhost/api/token", { "x-demo-passcode": "letmein" }),
    );
    expect(res.status).toBe(503); // no ASSEMBLYAI_API_KEY configured
    expect((await res.json()).error).toBe("no_api_key");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });
});
