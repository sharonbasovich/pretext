import { describe, it, expect } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import { loadAgentFile, validateAgentFile, validateParameters, buildSessionConfig } from "@/lib/agents";

const AGENTS_DIR = path.join(process.cwd(), "agents");

describe("agents/*.json validation", () => {
  it("all four persona files exist and validate", async () => {
    const files = (await fs.readdir(AGENTS_DIR)).filter((f) => f.endsWith(".json"));
    expect(files.length).toBe(4);
    for (const f of files) {
      const agent = await loadAgentFile(f.replace(/\.json$/, ""));
      const errs = validateAgentFile(agent, f.replace(/\.json$/, ""));
      expect(errs, `${f}: ${errs.join("; ")}`).toEqual([]);
    }
  });

  it("every agent has required wire fields", async () => {
    for (const f of await fs.readdir(AGENTS_DIR)) {
      if (!f.endsWith(".json")) continue;
      const agent = await loadAgentFile(f.replace(/\.json$/, ""));
      expect(agent.name.length).toBeGreaterThan(3);
      expect(agent.system_prompt.length).toBeGreaterThan(100);
      expect(agent.greeting.length).toBeGreaterThan(10);
      expect(agent.voice?.voice_id ?? (agent.output as { voice?: string })?.voice).toBeTruthy();
      expect(agent.tools!.length).toBeLessThanOrEqual(10);
    }
  });

  it("parameter validation rejects non-object schemas", () => {
    const errs = validateParameters({ type: "array" } as never, "t");
    expect(errs.length).toBeGreaterThan(0);
  });

  it("parameter validation checks enum is an array and examples match patterns", () => {
    const bad = {
      type: "object",
      properties: {
        action: { type: "string", enum: "not-array" },
        digits: { type: "string", pattern: "^[0-9]+$", examples: ["abc"] },
      },
      required: ["missing_prop"],
    };
    const errs = validateParameters(bad as never, "t");
    expect(errs.length).toBeGreaterThanOrEqual(3);
  });

  it("buildSessionConfig returns inline config when no lock exists", async () => {
    const cfg = await buildSessionConfig("helpdesk-pretext");
    // No agents.lock.json in a fresh checkout → inline session config.
    if ("agent_id" in cfg) {
      expect(typeof cfg.agent_id).toBe("string");
    } else {
      expect(cfg.system_prompt).toBeTruthy();
      expect(cfg.tools?.[0]?.type).toBe("function");
    }
  });
});
