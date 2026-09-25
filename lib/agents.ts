import { promises as fs } from "node:fs";
import path from "node:path";
import type { FunctionTool, JsonSchemaObject, SessionConfig } from "./types";

/**
 * agents/*.json hold the exact request body for POST /v1/agents (stored agent).
 * This module validates them at load time (the API does NOT validate tool
 * parameters at session.update time — malformed schemas fail silently at
 * runtime) and converts them into inline session.update configs as the
 * fallback when agents.lock.json is absent.
 */

export interface AgentFile {
  name: string;
  system_prompt: string;
  greeting: string;
  voice?: { voice_id?: string };
  input?: SessionConfig["input"];
  output?: SessionConfig["output"];
  tools?: StoredTool[];
}

interface StoredTool {
  name: string;
  description: string;
  parameters?: JsonSchemaObject;
  execution_mode?: "interactive" | "hold";
  timeout_seconds?: number;
  http?: { url: string; http_method?: string; headers?: unknown[] };
}

const AGENTS_DIR = path.join(process.cwd(), "agents");
const LOCK_PATH = path.join(AGENTS_DIR, "..", "agents.lock.json");

/** Validate a JSON-schema property block the way the docs describe. */
export function validateParameters(parameters: unknown, context: string): string[] {
  const errors: string[] = [];
  if (parameters === undefined || parameters === null) return errors;
  if (typeof parameters !== "object") return [`${context}: parameters must be an object`];
  const p = parameters as JsonSchemaObject;
  if (p.type !== "object") errors.push(`${context}: parameters.type must be "object"`);
  if (p.properties !== undefined) {
    if (typeof p.properties !== "object" || p.properties === null) {
      errors.push(`${context}: parameters.properties must be an object`);
    } else {
      for (const [key, prop] of Object.entries(p.properties)) {
        if (prop === null || typeof prop !== "object") {
          errors.push(`${context}.properties.${key}: must be an object`);
          continue;
        }
        if (prop.enum !== undefined && !Array.isArray(prop.enum)) {
          errors.push(`${context}.properties.${key}.enum: must be an array`);
        }
        if (prop.pattern !== undefined) {
          try {
            new RegExp(prop.pattern);
          } catch {
            errors.push(`${context}.properties.${key}.pattern: invalid regex "${prop.pattern}"`);
          }
          // examples must match the pattern (docs rule)
          if (Array.isArray(prop.examples)) {
            const re = new RegExp(`^(?:${prop.pattern})$`);
            for (const ex of prop.examples) {
              if (!re.test(String(ex))) {
                errors.push(
                  `${context}.properties.${key}: example ${JSON.stringify(ex)} fails pattern ${prop.pattern}`,
                );
              }
            }
          }
        }
      }
    }
  }
  if (p.required !== undefined && !Array.isArray(p.required)) {
    errors.push(`${context}: parameters.required must be an array`);
  }
  if (Array.isArray(p.required) && p.properties) {
    for (const req of p.required) {
      if (!(req in p.properties)) errors.push(`${context}: required "${req}" not in properties`);
    }
  }
  return errors;
}

export function validateAgentFile(agent: unknown, name: string): string[] {
  const errors: string[] = [];
  if (agent === null || typeof agent !== "object") return [`${name}: not an object`];
  const a = agent as AgentFile;
  if (typeof a.name !== "string" || !a.name) errors.push(`${name}: name required`);
  if (typeof a.system_prompt !== "string" || !a.system_prompt)
    errors.push(`${name}: system_prompt required`);
  if (typeof a.greeting !== "string" || !a.greeting) errors.push(`${name}: greeting required`);
  if (a.voice !== undefined && typeof a.voice?.voice_id !== "string")
    errors.push(`${name}: voice.voice_id must be a string`);
  if (a.output?.voice !== undefined && typeof a.output.voice !== "string")
    errors.push(`${name}: output.voice must be a string`);
  if (a.input?.keyterms !== undefined && a.input.keyterms !== null) {
    if (!Array.isArray(a.input.keyterms) || a.input.keyterms.length > 100)
      errors.push(`${name}: input.keyterms must be an array of <=100 strings`);
  }
  if (a.input?.transcription_prompt !== undefined) {
    if (typeof a.input.transcription_prompt !== "string")
      errors.push(`${name}: transcription_prompt must be a string`);
    else if (a.input.transcription_prompt.length > 1750)
      errors.push(`${name}: transcription_prompt exceeds 1750 chars`);
  }
  if (a.tools !== undefined) {
    if (!Array.isArray(a.tools)) {
      errors.push(`${name}: tools must be an array`);
    } else {
      for (const t of a.tools) {
        if (typeof t.name !== "string" || !/^[a-z][a-z0-9_]*$/.test(t.name))
          errors.push(`${name}: tool name "${t.name}" must be snake_case`);
        if (typeof t.description !== "string" || !t.description)
          errors.push(`${name}.${t.name}: description required`);
        errors.push(...validateParameters(t.parameters, `${name}.${t.name}`));
      }
    }
  }
  return errors;
}

export async function loadAgentFile(agentName: string): Promise<AgentFile> {
  const file = path.join(AGENTS_DIR, `${agentName}.json`);
  const raw = await fs.readFile(file, "utf8");
  const parsed = JSON.parse(raw) as AgentFile;
  const errors = validateAgentFile(parsed, agentName);
  if (errors.length) {
    throw new Error(`Invalid agent file ${agentName}: ${errors.join("; ")}`);
  }
  return parsed;
}

export interface AgentLock {
  agents: Record<string, string>; // agent file name -> stored agent id
  published_at?: string;
}

export async function loadAgentLock(): Promise<AgentLock> {
  try {
    const raw = await fs.readFile(LOCK_PATH, "utf8");
    const parsed = JSON.parse(raw) as AgentLock;
    return parsed;
  } catch {
    return { agents: {} };
  }
}

/**
 * Build the session.update payload for a scenario.
 * Prefers a stored agent_id from agents.lock.json; otherwise converts the
 * agents/<name>.json file into an inline config (adding type:"function" to
 * each tool, which is required for inline tools but absent in stored bodies).
 */
export async function buildSessionConfig(agentName: string): Promise<SessionConfig> {
  const lock = await loadAgentLock();
  const storedId = lock.agents[agentName];
  if (storedId) {
    return { agent_id: storedId };
  }
  const agent = await loadAgentFile(agentName);
  const config: SessionConfig = {
    system_prompt: agent.system_prompt,
    greeting: agent.greeting,
  };
  if (agent.input) config.input = agent.input;
  const voice = agent.output?.voice ?? agent.voice?.voice_id;
  config.output = { ...(agent.output ?? {}), voice };
  if (agent.tools) {
    config.tools = agent.tools.map(
      (t): FunctionTool => ({
        type: "function",
        name: t.name,
        description: t.description,
        parameters: t.parameters,
        execution_mode: t.execution_mode,
        timeout_seconds: t.timeout_seconds,
      }),
    );
  }
  return config;
}
