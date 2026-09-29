import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CallSession } from "../lib/session";
import { getScenario } from "../lib/catalog";
import type { ServerEvent } from "../lib/types";

/** Minimal AudioContext stand-in — PcmPlayer.prime() runs in start(). */
class FakeAudioContext {
  state: AudioContextState = "running";
  sampleRate = 24000;
  currentTime = 0;
  destination = {};
  async resume() {
    this.state = "running";
  }
  async close() {
    this.state = "closed";
  }
}

/** Minimal WebSocket stand-in for node tests. */
class FakeWS {
  static OPEN = 1;
  static instances: FakeWS[] = [];
  readyState = FakeWS.OPEN;
  sent: Record<string, unknown>[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  constructor(public url: string) {
    FakeWS.instances.push(this);
  }
  send(raw: string) {
    this.sent.push(JSON.parse(raw) as Record<string, unknown>);
  }
  close() {
    this.readyState = 3;
    this.onclose?.();
  }
  emit(ev: ServerEvent) {
    this.onmessage?.({ data: JSON.stringify(ev) });
  }
}

function makeSession() {
  const scenario = getScenario("helpdesk-pretext");
  if (!scenario) throw new Error("missing helpdesk-pretext scenario");
  const session = new CallSession(scenario, { onState: () => {}, onError: () => {} });
  return { scenario, session };
}

function readyWs(): FakeWS {
  const ws = FakeWS.instances[FakeWS.instances.length - 1];
  ws.emit({
    type: "session.ready",
    session_id: "sess_test",
    expires_at: 0,
    resume_token: "",
  });
  return ws;
}

describe("director channel guards", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeWS.instances = [];
    vi.stubGlobal("WebSocket", FakeWS);
    vi.stubGlobal("AudioContext", FakeAudioContext);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("fires escalation + final push while the call is live", () => {
    const { scenario, session } = makeSession();
    void session.start("ws://mock/v1/ws", "t");
    const ws = readyWs();
    vi.advanceTimersByTime(scenario.director.escalate_at_ms + 100);
    const updates = ws.sent.filter((m) => m.type === "session.update");
    expect(updates.some((m) => (m.session as { system_prompt?: string }).system_prompt === scenario.director.escalation_prompt)).toBe(true);
    vi.advanceTimersByTime(scenario.approx_seconds * 1000);
    expect(ws.sent.filter((m) => m.type === "reply.create").length).toBe(1); // final push
  });

  it("sends nothing after the coach took over", () => {
    const { scenario, session } = makeSession();
    void session.start("ws://mock/v1/ws", "t");
    const ws = readyWs();
    session.startDebrief();
    ws.sent = [];
    vi.advanceTimersByTime(scenario.approx_seconds * 1000 + scenario.director.escalate_at_ms + 60_000);
    expect(ws.sent.filter((m) => m.type === "session.update")).toHaveLength(0);
    expect(ws.sent.filter((m) => m.type === "reply.create")).toHaveLength(0);
    expect(ws.sent.filter((m) => m.type === "conversation.message")).toHaveLength(0);
  });

  it("starts the coach reply only after scoring tools are removed and the update is acknowledged", () => {
    const { scenario, session } = makeSession();
    void session.start("ws://mock/v1/ws", "t");
    const ws = readyWs();

    session.startDebrief();
    session.startDebrief(); // a second click must not queue another debrief
    expect(ws.sent).toEqual([{
      type: "session.update",
      session: { system_prompt: scenario.coach_prompt, tools: [] },
    }]);

    ws.emit({ type: "session.updated", config: { system_prompt: scenario.director.escalation_prompt } });
    expect(ws.sent).toHaveLength(1);

    ws.emit({ type: "session.updated", config: { system_prompt: scenario.coach_prompt, tools: [] } });
    expect(ws.sent).toHaveLength(2);
    expect(ws.sent[1]).toMatchObject({
      type: "reply.create",
      instructions: expect.stringContaining("spoken debrief"),
    });

    ws.emit({ type: "session.updated", config: { system_prompt: scenario.coach_prompt, tools: [] } });
    expect(ws.sent.filter((m) => m.type === "reply.create")).toHaveLength(1);
  });

  it("does not request a coach reply if the call ends before the update acknowledgment", () => {
    const { scenario, session } = makeSession();
    void session.start("ws://mock/v1/ws", "t");
    const ws = readyWs();
    session.startDebrief();
    session.endCall();
    ws.emit({ type: "session.updated", config: { system_prompt: scenario.coach_prompt, tools: [] } });
    expect(ws.sent.filter((m) => m.type === "reply.create")).toHaveLength(0);
  });

  it("sends nothing after endCall", () => {
    const { scenario, session } = makeSession();
    void session.start("ws://mock/v1/ws", "t");
    const ws = readyWs();
    session.endCall();
    ws.sent = [];
    vi.advanceTimersByTime(scenario.approx_seconds * 1000 + 60_000);
    expect(ws.sent.filter((m) => m.type === "session.update")).toHaveLength(0);
    expect(ws.sent.filter((m) => m.type === "reply.create")).toHaveLength(0);
    expect(ws.sent.filter((m) => m.type === "conversation.message")).toHaveLength(0);
  });
});

describe("agent-config failure", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeWS.instances = [];
    vi.stubGlobal("WebSocket", FakeWS);
    vi.stubGlobal("AudioContext", FakeAudioContext);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("closes the billable socket instead of leaving it open to the 240s cap", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 503,
        json: async () => ({ error: "stored_agent_required", detail: "no stored agent" }),
      })),
    );
    const { session } = makeSession();
    void session.start("ws://mock/v1/ws", "t");
    const ws = FakeWS.instances[FakeWS.instances.length - 1];
    await ws.onopen?.();
    expect(ws.sent.some((m) => m.type === "session.end")).toBe(true);
    expect(ws.readyState).toBe(3); // CLOSED
  });
});
