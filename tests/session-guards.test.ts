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
