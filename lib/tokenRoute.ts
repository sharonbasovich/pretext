/**
 * Token-minting logic for /api/token — separated from the route handler so it
 * is unit-testable without a running server.
 *
 * Cost controls (per the demo-hardening spec):
 *  - per-IP sliding-window rate limit
 *  - a daily session cap (UTC day rollover)
 *  - required demo passcode for every live-key deployment
 *  - max_session_duration_seconds hard-clamped to <=240 (Voice Agent API bills
 *    on socket-open time; the free tier is $50 and must survive a public demo)
 */

export const ASSEMBLYAI_TOKEN_URL = "https://agents.assemblyai.com/v1/token";
export const ASSEMBLYAI_WS_URL = "wss://agents.assemblyai.com/v1/ws";
export const HARD_MAX_SESSION_SECONDS = 240;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX_PER_IP = 10;

export interface TokenEnv {
  ASSEMBLYAI_API_KEY?: string;
  NODE_ENV?: string;
  VERCEL_ENV?: string;
  PRETEXT_MAX_SESSION_SECONDS?: string;
  PRETEXT_DAILY_SESSION_CAP?: string;
  PRETEXT_DEMO_PASSCODE?: string;
  PRETEXT_MOCK?: string;
  PRETEXT_MOCK_WS_URL?: string;
  [key: string]: string | undefined;
}

export interface TokenResponseOk {
  ok: true;
  token: string;
  ws_url: string;
  max_session_seconds: number;
  mock: boolean;
  expires_in_seconds: number;
}

export interface TokenResponseErr {
  ok: false;
  status: number;
  error: string;
  detail?: string;
}

export type TokenResponse = TokenResponseOk | TokenResponseErr;

interface Bucket {
  hits: number[];
}
const ipBuckets = new Map<string, Bucket>();
let daily = { day: "", count: 0 };

function utcDay(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

export function rateLimited(ip: string, now = Date.now()): boolean {
  const bucket = ipBuckets.get(ip) ?? { hits: [] };
  bucket.hits = bucket.hits.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  const limited = bucket.hits.length >= RATE_LIMIT_MAX_PER_IP;
  if (!limited) {
    bucket.hits.push(now);
    ipBuckets.set(ip, bucket);
  }
  return limited;
}

export function dailyCapped(env: TokenEnv, now = Date.now()): boolean {
  const cap = parseInt(env.PRETEXT_DAILY_SESSION_CAP ?? "200", 10) || 200;
  const today = utcDay(now);
  if (daily.day !== today) daily = { day: today, count: 0 };
  if (daily.count >= cap) return true;
  daily.count += 1;
  return false;
}

export function maxSessionSeconds(env: TokenEnv): number {
  const asked = parseInt(env.PRETEXT_MAX_SESSION_SECONDS ?? "240", 10) || 240;
  // Clamp to the server-side allowed range and our own 240s hard cap.
  return Math.max(60, Math.min(HARD_MAX_SESSION_SECONDS, asked));
}

export function resetTokenLimitsForTest(): void {
  ipBuckets.clear();
  daily = { day: "", count: 0 };
}

export type FetchFn = (url: string, init?: { headers?: Record<string, string> }) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
}>;

export async function mintToken(
  env: TokenEnv,
  opts: { ip: string; passcode?: string | null; now?: number; fetchFn?: FetchFn },
): Promise<TokenResponse> {
  const now = opts.now ?? Date.now();

  // A configured live key could incur charges if mock mode is later removed,
  // regardless of the deployment label. Keep it gated even while mock mode is
  // selected. A production mock with no key stays usable for E2E verification.
  const hasLiveKey = Boolean(env.ASSEMBLYAI_API_KEY?.trim());
  if (hasLiveKey && !env.PRETEXT_DEMO_PASSCODE?.trim()) {
    return {
      ok: false,
      status: 503,
      error: "passcode_not_configured",
      detail: "The live demo is unavailable until PRETEXT_DEMO_PASSCODE is configured. Replay mode is always available.",
    };
  }

  // Passcode gate. Local mock mode may deliberately omit it.
  const requiredPasscode = env.PRETEXT_DEMO_PASSCODE;
  if (requiredPasscode && opts.passcode !== requiredPasscode) {
    return { ok: false, status: 401, error: "passcode_required" };
  }

  // Rate limit (per IP) + daily cap apply in every mode — they protect the mock too.
  if (rateLimited(opts.ip, now)) {
    return { ok: false, status: 429, error: "rate_limited", detail: "Too many sessions from this address. Try again in a few minutes." };
  }
  if (dailyCapped(env, now)) {
    return { ok: false, status: 429, error: "daily_cap_reached", detail: "Demo session cap reached for today. Replay mode is always available." };
  }

  if (env.PRETEXT_MOCK === "1") {
    return {
      ok: true,
      token: "mock",
      ws_url: env.PRETEXT_MOCK_WS_URL ?? "ws://localhost:8787/v1/ws",
      max_session_seconds: maxSessionSeconds(env),
      mock: true,
      expires_in_seconds: 300,
    };
  }

  if (!env.ASSEMBLYAI_API_KEY?.trim()) {
    return {
      ok: false,
      status: 503,
      error: "no_api_key",
      detail: "ASSEMBLYAI_API_KEY is not configured on this deployment. Replay mode is always available.",
    };
  }

  const url = new URL(ASSEMBLYAI_TOKEN_URL);
  url.searchParams.set("expires_in_seconds", "300");
  url.searchParams.set("max_session_duration_seconds", String(maxSessionSeconds(env)));

  const fetchFn = opts.fetchFn ?? fetch;
  const res = await fetchFn(url.toString(), {
    headers: { Authorization: `Bearer ${env.ASSEMBLYAI_API_KEY}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return {
      ok: false,
      status: 502,
      error: "upstream_error",
      detail: `AssemblyAI token request failed (${res.status})${body ? `: ${body.slice(0, 200)}` : ""}`,
    };
  }
  const data = (await res.json()) as { token?: string };
  if (!data.token) {
    return { ok: false, status: 502, error: "upstream_error", detail: "Token response had no token field." };
  }
  return {
    ok: true,
    token: data.token,
    ws_url: ASSEMBLYAI_WS_URL,
    max_session_seconds: maxSessionSeconds(env),
    mock: false,
    expires_in_seconds: 300,
  };
}
