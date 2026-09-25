import { NextResponse } from "next/server";
import { getScenario } from "@/lib/catalog";
import { buildSessionConfig } from "@/lib/agents";

export const runtime = "nodejs";

/**
 * Returns the session.update payload for a scenario: {agent_id} when
 * agents.lock.json has a stored agent, otherwise the inline config built from
 * agents/<name>.json. The browser sends this verbatim as its first WS frame.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ scenario: string }> },
) {
  const { scenario } = await ctx.params;
  const s = getScenario(scenario);
  if (!s) {
    return NextResponse.json({ error: "unknown_scenario" }, { status: 404 });
  }
  try {
    const session = await buildSessionConfig(s.agent);
    return NextResponse.json({ session });
  } catch (err) {
    return NextResponse.json(
      { error: "agent_config_error", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
