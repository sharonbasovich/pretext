import { NextResponse } from "next/server";

export const runtime = "nodejs";

const SESSIONS_BASE = "https://agents.assemblyai.com/v1/sessions";

/**
 * Proxies GET /v1/sessions/{id} (session history — status, config, artifact
 * URLs). The artifact URLs it returns are pre-signed and need no key, so the
 * browser downloads them directly.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  if (!/^sess_[a-zA-Z0-9]+$/.test(id)) {
    return NextResponse.json({ error: "bad_session_id" }, { status: 400 });
  }
  const key = process.env.ASSEMBLYAI_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "no_api_key", detail: "Session history requires ASSEMBLYAI_API_KEY." },
      { status: 503 },
    );
  }
  const res = await fetch(`${SESSIONS_BASE}/${id}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!res.ok) {
    return NextResponse.json(
      { error: "upstream_error", detail: `AssemblyAI session lookup failed (${res.status})` },
      { status: res.status === 404 ? 404 : 502 },
    );
  }
  const data = await res.json();
  return NextResponse.json(data);
}
