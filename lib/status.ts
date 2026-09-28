/**
 * Deployment readiness for GET /api/status — booleans and persona NAMES only,
 * never env values (no key material, no agent IDs). Reuses the same
 * loadAgentLock() merge that /api/agent-config uses so the mapping shown here
 * is exactly what calls resolve at call time.
 */
import { SCENARIOS } from "./catalog";
import { loadAgentLock, agentIdsFromEnv } from "./agents";

export interface DeploymentStatus {
  /** Validated VERCEL_GIT_COMMIT_SHA short-sha, or null off Vercel. */
  commit: string | null;
  /** "production" | "preview" | "development" | null. */
  vercel_env: string | null;
  mock: boolean;
  has_assemblyai_key: boolean;
  passcode_configured: boolean;
  agent_ids: {
    /** PRETEXT_AGENT_IDS is set and non-empty after trim. */
    configured: boolean;
    /** It parses as the expected {name: id} JSON object. */
    parse_ok: boolean;
    /** Persona file names resolving to a stored agent_id (names, never IDs). */
    mapped_personas: string[];
    /** Persona file names with no stored agent_id. */
    missing: string[];
  };
  expose_inline: boolean;
  /** Configuration prerequisites only; does not prove an AssemblyAI call works. */
  live_ready: boolean;
}

export async function getDeploymentStatus(): Promise<DeploymentStatus> {
  const env = process.env;
  const personas = SCENARIOS.map((s) => s.agent);
  const rawIds = env.PRETEXT_AGENT_IDS;
  const configured = Boolean(rawIds?.trim());

  let parse_ok = true;
  if (configured) {
    try {
      agentIdsFromEnv(rawIds);
    } catch {
      parse_ok = false;
    }
  }

  // The merged map (env over agents.lock.json) — identical to agent-config's.
  // If the env value is malformed the whole load throws: report parse_ok=false
  // and treat every persona as missing rather than 500ing the diagnostics call.
  let lock: { agents: Record<string, string> } = { agents: {} };
  let lockOk = true;
  try {
    lock = await loadAgentLock();
  } catch {
    lockOk = false;
  }
  if (!lockOk) parse_ok = false;

  const mapped_personas = personas.filter((n) => Boolean(lock.agents[n]?.trim()));
  const missing = personas.filter((n) => !lock.agents[n]?.trim());

  const has_assemblyai_key = Boolean(env.ASSEMBLYAI_API_KEY?.trim());
  const passcode_configured = Boolean(env.PRETEXT_DEMO_PASSCODE?.trim());
  const mock = env.PRETEXT_MOCK === "1";
  const expose_inline = env.PRETEXT_EXPOSE_INLINE === "1";
  const sha = env.VERCEL_GIT_COMMIT_SHA;
  const commit = sha && /^[0-9a-f]{7,40}$/i.test(sha) ? sha.slice(0, 7) : null;
  const vercel_env = ["production", "preview", "development"].includes(env.VERCEL_ENV ?? "")
    ? env.VERCEL_ENV!
    : null;

  return {
    commit,
    vercel_env,
    mock,
    has_assemblyai_key,
    passcode_configured,
    agent_ids: { configured, parse_ok, mapped_personas, missing },
    expose_inline,
    live_ready: !mock && !expose_inline && has_assemblyai_key && passcode_configured &&
      missing.length === 0 && parse_ok,
  };
}
