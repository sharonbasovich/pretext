/**
 * Mock Voice Agent API server — speaks the real wire protocol over
 * ws://localhost:<port>/v1/ws?scenario=<id> so the whole client stack is
 * exercised identically offline. Replays scripted events from
 * mock/scripts/<scenario>.json; emits silent PCM for reply.audio.
 *
 * Client events it understands: session.update (config, coach switch,
 * escalation prompt echo), input.audio (counted for wait_user_audio gates),
 * tool.result, reply.create, conversation.message, session.end, session.resume.
 */
import { createServer } from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import { WebSocketServer, WebSocket } from "ws";
import type { MockScript, MockTurn } from "./script";

const PORT = parseInt(process.env.PRETEXT_MOCK_PORT ?? "8787", 10);
const SCRIPTS_DIR = path.join(process.cwd(), "mock", "scripts");

let seq = 0;
const nid = (p: string) => `${p}_mock${(++seq).toString(36)}${Date.now().toString(36)}`;

const SILENT_PCM_40MS = Buffer.alloc(24000 * 2 * 0.04).toString("base64"); // zeros, 24kHz s16le

/** Rough speech duration for a scripted line: ~14 chars/sec spoken English. */
function speechMs(text: string): number {
  return Math.min(9000, Math.max(700, (text.length / 14) * 1000));
}

function silentAudioChunks(ms: number): { type: "reply.audio"; data: string }[] {
  const chunks = Math.max(1, Math.round(ms / 40));
  return Array.from({ length: chunks }, () => ({ type: "reply.audio" as const, data: SILENT_PCM_40MS }));
}

async function loadScript(scenario: string): Promise<MockScript> {
  const file = path.join(SCRIPTS_DIR, `${scenario}.json`);
  const raw = await fs.readFile(file, "utf8");
  return JSON.parse(raw) as MockScript;
}

class MockSession {
  ws: WebSocket;
  script: MockScript;
  audioBytes = 0;
  audioWaiters: { needMs: number; resolve: () => void }[] = [];
  ended = false;
  coachMode = false;
  coachIdx = 0;
  pendingToolCalls = 0;

  constructor(ws: WebSocket, script: MockScript) {
    this.ws = ws;
    this.script = script;
  }

  send(obj: Record<string, unknown>) {
    if (this.ws.readyState === WebSocket.OPEN && !this.ended) {
      this.ws.send(JSON.stringify(obj));
    }
  }

  noteAudio(bytes: number) {
    this.audioBytes += bytes;
    const ms = this.audioBytes / 48; // 48000 B/s at 24kHz s16le mono
    this.audioWaiters = this.audioWaiters.filter((w) => {
      if (ms >= w.needMs) {
        w.resolve();
        return false;
      }
      return true;
    });
  }

  waitAudioMs(needMs: number): Promise<void> {
    if (this.audioBytes / 48 >= needMs) return Promise.resolve();
    return new Promise((resolve) => this.audioWaiters.push({ needMs, resolve }));
  }

  async emitAgentReply(text: string, opts: { interrupted?: boolean } = {}) {
    const replyId = nid("reply");
    this.send({ type: "reply.started", reply_id: replyId });
    const durMs = speechMs(text);
    for (const chunk of silentAudioChunks(durMs)) this.send(chunk);
    const words = text.split(" ");
    let t = 0;
    for (const w of words) {
      const wms = Math.max(80, w.length * 60);
      this.send({ type: "transcript.agent.delta", reply_id: replyId, delta: `${w} `, start_ms: t, end_ms: t + wms });
      t += wms;
    }
    this.send({ type: "transcript.agent", reply_id: replyId, text, interrupted: opts.interrupted ?? false });
    this.send({ type: "reply.done", reply_id: replyId, status: opts.interrupted ? "interrupted" : "completed" });
    await sleep(Math.min(600, durMs));
  }

  async emitUserTurn(text: string) {
    const itemId = nid("item");
    // Trainee speech duration derives from the scripted line at the same
    // ~14 chars/s rate as the agent — fake-mic frames are only the trigger,
    // not the duration, so talk ratio stays plausible (~40/60).
    const durMs = speechMs(text);
    this.send({ type: "input.speech.started" });
    const half = Math.ceil(text.length / 2);
    this.send({ type: "transcript.user.delta", item_id: itemId, text: text.slice(0, half) });
    await sleep(Math.round(durMs * 0.55));
    this.send({ type: "transcript.user.delta", item_id: itemId, text });
    await sleep(Math.round(durMs * 0.45));
    this.send({ type: "input.speech.stopped" });
    this.send({ type: "transcript.user", item_id: itemId, text });
  }

  async emitToolCall(call: { name: string; arguments: Record<string, unknown> }) {
    // Docs shape: tool.call inside its own reply turn, then reply.done — the
    // client flushes tool.result on reply.done.
    const replyId = `fc-${nid("call")}`;
    const callId = nid("call");
    this.pendingToolCalls++;
    this.send({ type: "reply.started", reply_id: replyId });
    this.send({ type: "tool.call", call_id: callId, name: call.name, arguments: call.arguments });
    this.send({ type: "reply.done", reply_id: replyId, status: "completed" });
  }

  async run() {
    this.send({
      type: "session.ready",
      session_id: nid("sess"),
      expires_at: Math.floor(Date.now() / 1000) + 240,
      resume_token: "",
      config: { mock: true },
    });
    await sleep(350);
    await this.emitAgentReply(this.script.greeting_text);
    for (const turn of this.script.turns) {
      if (this.ended) return;
      await this.runTurn(turn);
    }
  }

  private async runTurn(turn: MockTurn) {
    if (turn.wait_ms) await sleep(turn.wait_ms);
    if (turn.wait_user_audio_ms) await this.waitAudioMs(turn.wait_user_audio_ms);
    if (this.ended) return;
    if (turn.user) await this.emitUserTurn(turn.user);
    if (turn.agent) await this.emitAgentReply(turn.agent);
    if (turn.tool_call) await this.emitToolCall(turn.tool_call);
  }

  async onClientMessage(raw: string) {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(raw);
    } catch {
      this.send({ type: "session.error", code: "invalid_format", message: "bad JSON" });
      return;
    }
    switch (msg.type) {
      case "input.audio": {
        const b64 = (msg.audio as string) ?? "";
        this.noteAudio(Math.floor(b64.length * 0.75));
        return;
      }
      case "session.update": {
        const prompt = String((msg.session as Record<string, unknown>)?.system_prompt ?? "");
        if (/coach|trainer|debrief/i.test(prompt)) this.coachMode = true;
        this.send({ type: "session.updated", config: { applied: true } });
        return;
      }
      case "tool.result":
        this.pendingToolCalls = Math.max(0, this.pendingToolCalls - 1);
        return;
      case "reply.create":
        if (this.coachMode) {
          const text = this.script.coach_turns[Math.min(this.coachIdx, this.script.coach_turns.length - 1)];
          this.coachIdx++;
          await this.emitAgentReply(text);
        } else {
          await this.emitAgentReply("I'm still here — what was that?");
        }
        return;
      case "conversation.message":
        // Director channel — accepted silently; the script keeps playing.
        return;
      case "session.end":
        this.end("client_end");
        return;
      case "session.resume":
        this.send({ type: "session.error", code: "session_not_found", message: "mock does not resume" });
        return;
      default:
        this.send({ type: "session.error", code: "invalid_format", message: `unknown type ${String(msg.type)}` });
    }
  }

  end(reason: string) {
    if (this.ended) return;
    this.ended = true;
    this.send({
      type: "session.ended",
      session_duration_seconds: this.audioBytes / 48 / 1000,
      audio_duration_seconds: this.audioBytes / 48 / 1000,
      timestamp: Date.now() / 1000,
    });
    try {
      this.ws.close(1000, reason);
    } catch {
      /* already closed */
    }
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

const server = createServer((_req, res) => {
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ ok: true, service: "pretext-mock-agent" }));
});
const wss = new WebSocketServer({ server, path: "/v1/ws" });

wss.on("connection", async (ws, req) => {
  const url = new URL(req.url ?? "", "http://localhost");
  const scenario = url.searchParams.get("scenario") ?? "helpdesk-pretext";
  let script: MockScript;
  try {
    script = await loadScript(scenario);
  } catch {
    ws.send(JSON.stringify({ type: "session.error", code: "invalid_config", message: `no mock script for scenario ${scenario}` }));
    ws.close();
    return;
  }
  const session = new MockSession(ws, script);

  let started = false;
  ws.on("message", async (data) => {
    const raw = data.toString();
    // The first session.update kicks off the script.
    if (!started) {
      try {
        const msg = JSON.parse(raw);
        if (msg.type === "session.update") {
          started = true;
          void session.run();
          return;
        }
      } catch {
        /* fall through */
      }
    }
    await session.onClientMessage(raw);
  });
  ws.on("close", () => {
    session.ended = true;
  });
});

server.listen(PORT, () => {
  console.log(`[pretext-mock] ws://localhost:${PORT}/v1/ws?scenario=<id>`);
});
