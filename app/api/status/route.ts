import { NextResponse } from "next/server";
import { getDeploymentStatus } from "@/lib/status";

export const runtime = "nodejs";

/**
 * Deploy-readiness diagnostics — booleans and persona names only; never echoes
 * env values, keys, or agent IDs. no-store: reflects live env each request.
 */
export async function GET() {
  const status = await getDeploymentStatus();
  return NextResponse.json(status, {
    headers: { "Cache-Control": "no-store" },
  });
}
