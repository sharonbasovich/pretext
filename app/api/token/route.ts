import { NextRequest, NextResponse } from "next/server";
import { mintToken } from "@/lib/tokenRoute";

export const runtime = "nodejs";

function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "local";
}

export async function GET(req: NextRequest) {
  const passcode =
    req.nextUrl.searchParams.get("passcode") ?? req.headers.get("x-demo-passcode");
  const res = await mintToken(process.env, {
    ip: clientIp(req),
    passcode,
  });
  if (!res.ok) {
    return NextResponse.json(
      { error: res.error, detail: res.detail },
      { status: res.status },
    );
  }
  return NextResponse.json({
    token: res.token,
    ws_url: res.ws_url,
    max_session_seconds: res.max_session_seconds,
    mock: res.mock,
  });
}
