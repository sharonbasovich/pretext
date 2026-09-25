/**
 * Builds public/fixtures/<scenario>.json — a flat, time-stamped event stream
 * derived from the mock scripts so Replay mode drives the same reducer/UI as a
 * live call. Audio events are omitted (silent anyway); transcript deltas kept.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import type { MockScript, MockTurn } from "../mock/script";
import type { ServerEvent } from "../lib/types";

const SCRIPTS = path.join(process.cwd(), "mock", "scripts");
const OUT = path.join(process.cwd(), "public", "fixtures");

interface TimedEvent {
  at_ms: number;
  event: ServerEvent;
}

let n = 0;
const nid = (p: string) => `${p}_fix${(++n).toString(36)}`;

function agentReply(t0: number, text: string): { events: TimedEvent[]; end: number } {
  const replyId = nid("reply");
  const evs: TimedEvent[] = [{ at_ms: t0, event: { type: "reply.started", reply_id: replyId } }];
  const words = text.split(" ");
  let t = t0;
  for (const w of words) {
    const wms = Math.max(80, w.length * 60);
    evs.push({ at_ms: t, event: { type: "transcript.agent.delta", reply_id: replyId, delta: `${w} `, start_ms: t - t0, end_ms: t - t0 + wms } });
    t += wms;
  }
  evs.push({ at_ms: t, event: { type: "transcript.agent", reply_id: replyId, text } });
  evs.push({ at_ms: t + 50, event: { type: "reply.done", reply_id: replyId, status: "completed" } });
  return { events: evs, end: t + 50 };
}

function userTurn(t0: number, text: string): { events: TimedEvent[]; end: number } {
  const itemId = nid("item");
  const evs: TimedEvent[] = [
    { at_ms: t0, event: { type: "input.speech.started" } },
    { at_ms: t0 + 200, event: { type: "transcript.user.delta", item_id: itemId, text: text.slice(0, Math.ceil(text.length / 2)) } },
    { at_ms: t0 + 500, event: { type: "transcript.user.delta", item_id: itemId, text } },
    { at_ms: t0 + 800, event: { type: "input.speech.stopped" } },
    { at_ms: t0 + 850, event: { type: "transcript.user", item_id: itemId, text } },
  ];
  return { events: evs, end: t0 + 850 };
}

function toolCall(t0: number, name: string, args: Record<string, unknown>): { events: TimedEvent[]; end: number } {
  const replyId = `fc-${nid("call")}`;
  const evs: TimedEvent[] = [
    { at_ms: t0, event: { type: "reply.started", reply_id: replyId } },
    { at_ms: t0 + 50, event: { type: "tool.call", call_id: nid("call"), name, arguments: args } as ServerEvent },
    { at_ms: t0 + 100, event: { type: "reply.done", reply_id: replyId, status: "completed" } },
  ];
  return { events: evs, end: t0 + 100 };
}

async function build(scenarioId: string) {
  const script = JSON.parse(await fs.readFile(path.join(SCRIPTS, `${scenarioId}.json`), "utf8")) as MockScript;
  const flat: TimedEvent[] = [
    { at_ms: 0, event: { type: "session.ready", session_id: `sess_replay_${scenarioId}`, expires_at: 0, resume_token: "", config: { replay: true } } },
  ];
  let t = 400;
  const greet = agentReply(t, script.greeting_text);
  flat.push(...greet.events);
  t = greet.end + 800;

  for (const turn of script.turns) {
    const turn2 = turn as MockTurn;
    t += turn2.wait_ms ?? 600;
    if (turn2.user) {
      const r = userTurn(t, turn2.user);
      flat.push(...r.events);
      t = r.end + 400;
    }
    if (turn2.agent) {
      const r = agentReply(t, turn2.agent);
      flat.push(...r.events);
      t = r.end + 300;
    }
    if (turn2.tool_call) {
      const r = toolCall(t, turn2.tool_call.name, turn2.tool_call.arguments);
      flat.push(...r.events);
      t = r.end + 300;
    }
  }

  // Coach debrief (spoken after the persona→coach switch).
  flat.push({ at_ms: t + 400, event: { type: "session.updated", config: { coach: true } } });
  t += 800;
  for (const line of script.coach_turns) {
    const r = agentReply(t, line);
    flat.push(...r.events);
    t = r.end + 300;
  }
  flat.push({ at_ms: t + 800, event: { type: "session.ended", session_duration_seconds: t / 1000, audio_duration_seconds: t / 1000, timestamp: 0 } });

  await fs.mkdir(OUT, { recursive: true });
  await fs.writeFile(path.join(OUT, `${scenarioId}.json`), JSON.stringify(flat, null, 1));
  console.log(`fixture ${scenarioId}: ${flat.length} events over ${(t / 1000).toFixed(1)}s`);
}

async function main() {
  const ids = (await fs.readdir(SCRIPTS)).filter((f) => f.endsWith(".json")).map((f) => f.replace(".json", ""));
  for (const id of ids) await build(id);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
