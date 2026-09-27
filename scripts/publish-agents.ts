/**
 * `npm run publish` — creates/updates stored Voice Agents from agents/*.json
 * via the REST API and writes agents.lock.json ({name -> agent_id}).
 *
 * The app prefers the lock file (server-side personas) and falls back to
 * inline session config when it is absent. Key comes from ASSEMBLYAI_API_KEY
 * only — never committed.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { loadAgentFile, loadAgentLock, type AgentLock } from "../lib/agents";

const AGENTS_DIR = path.join(process.cwd(), "agents");
const LOCK_PATH = path.join(process.cwd(), "agents.lock.json");
const BASE = "https://agents.assemblyai.com/v1/agents";

function toStoredBody(agent: ReturnType<typeof loadAgentFile> extends Promise<infer T> ? T : never) {
  // Stored-agent API shape per manage-agents docs.
  return {
    name: agent.name,
    greeting: agent.greeting,
    voice: agent.voice,
    input: agent.input ? { type: "audio", ...agent.input } : undefined,
    output: agent.output ? { type: "audio", ...agent.output } : undefined,
    system_prompt: agent.system_prompt,
    tools: agent.tools,
  };
}

async function api(
  key: string,
  method: string,
  url: string,
  body?: unknown,
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      "content-type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON body */
  }
  return { ok: res.ok, status: res.status, data };
}

async function main() {
  const key = process.env.ASSEMBLYAI_API_KEY;
  if (!key) {
    console.error("ASSEMBLYAI_API_KEY is not set — cannot publish agents.");
    process.exit(2);
  }

  const lock = await loadAgentLock();
  const files = (await fs.readdir(AGENTS_DIR)).filter((f) => f.endsWith(".json")).sort();
  const nextLock: AgentLock = { agents: {} };

  for (const file of files) {
    const slug = file.replace(/\.json$/, "");
    const agent = await loadAgentFile(slug);
    const existingId = lock.agents[slug];
    const body = toStoredBody(agent);

    if (existingId) {
      const res = await api(key, "PUT", `${BASE}/${existingId}`, body);
      if (res.ok) {
        console.log(`updated  ${agent.name.padEnd(22)} ${existingId}`);
        nextLock.agents[slug] = existingId;
        continue;
      }
      if (res.status !== 404) {
        console.error(`update failed for ${agent.name} (${res.status}):`, JSON.stringify(res.data));
        process.exit(3);
      }
      // 404 → fall through to create.
    }

    const res = await api(key, "POST", BASE, body);
    if (!res.ok) {
      console.error(`create failed for ${agent.name} (${res.status}):`, JSON.stringify(res.data));
      process.exit(3);
    }
    const created = res.data as { id?: string; agent_id?: string };
    const id = created.agent_id ?? created.id;
    if (!id) {
      console.error(`create for ${agent.name} returned no id:`, JSON.stringify(res.data));
      process.exit(3);
    }
    console.log(`created  ${agent.name.padEnd(22)} ${id}`);
    nextLock.agents[slug] = id;
  }

  await fs.writeFile(LOCK_PATH, JSON.stringify(nextLock, null, 2) + "\n");
  console.log(`wrote ${LOCK_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
