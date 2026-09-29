/**
 * Client call session — owns the WebSocket, mic capture, PCM playback, the
 * reducer, the director channel, and the persona→coach switch.
 */
import type { Scenario } from "./scenario";
import type { ServerEvent } from "./types";
import {
  applyServerEvent,
  initCallState,
  drainableToolResults,
  markResultsFlushed,
  type CallState,
  type DirectorNote,
} from "./reducer";
import { MicCapture, PcmPlayer, pcm16ToBase64 } from "./audio";
import { withBase } from "./basePath";

export interface SessionHooks {
  onState: (state: CallState) => void;
  onError: (message: string) => void;
  /** Optional mic input level (0..1), ~per worklet frame — for the meter UI. */
  onMicLevel?: (level: number) => void;
}

export interface ReplayHooks {
  onState: (state: CallState) => void;
  onDone: () => void;
}

const SILENCE_NUDGE =
  "The trainee has gone quiet — keep the pressure on: restate what you need and why it can't wait. Stay in character.";
const FINAL_PUSH =
  "Time is almost up — make your final push for what you need now, hard. Stay in character.";

export class CallSession {
  private ws: WebSocket | null = null;
  private mic = new MicCapture();
  private player: PcmPlayer | null = null;
  private state: CallState;
  private hooks: SessionHooks;
  private scenario: Scenario;
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;
  private escalateTimer: ReturnType<typeof setTimeout> | null = null;
  private finalPushTimer: ReturnType<typeof setTimeout> | null = null;
  private coachRequested = false;
  private coachUpdatePending = false;

  constructor(scenario: Scenario, hooks: SessionHooks) {
    this.scenario = scenario;
    this.hooks = hooks;
    this.state = initCallState(scenario);
  }

  private note(kind: DirectorNote["kind"], text: string) {
    const n: DirectorNote = { at_ms: this.state.metrics.elapsed_ms, note: text, kind };
    this.state.director_log.push(n);
    this.push();
  }

  private push() {
    // Shallow copy so React sees a new reference; the mutable tracker stays shared.
    this.hooks.onState({ ...this.state });
  }

  private send(obj: Record<string, unknown>) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(obj));
    }
  }

  /** Director channel is closed once the coach took over or the call ended —
   *  no session.update / reply.create may go out after that point. */
  private directorClosed() {
    return this.coachRequested || this.state.coach_started || this.state.phase === "ended";
  }

  private resetSilenceTimer() {
    if (this.state.phase !== "ready" || this.directorClosed()) return;
    if (this.silenceTimer) clearTimeout(this.silenceTimer);
    this.silenceTimer = setTimeout(() => {
      if (this.directorClosed() || this.state.phase !== "ready") return;
      this.send({ type: "conversation.message", role: "system", content: SILENCE_NUDGE });
      this.note("silence", "Trainee silent — injected a pressure nudge via conversation.message");
    }, this.scenario.director.silence_nudge_ms);
  }

  private armDirectorTimers() {
    const d = this.scenario.director;
    this.resetSilenceTimer();
    this.escalateTimer = setTimeout(() => {
      if (this.state.phase !== "ready" || this.state.escalated || this.directorClosed()) return;
      this.send({ type: "session.update", session: { system_prompt: d.escalation_prompt } });
      this.state.escalated = true;
      this.note("escalation", `Escalated at ${Math.round(d.escalate_at_ms / 1000)}s — sent harder system prompt`);
    }, d.escalate_at_ms);
    const finalAt = Math.max(15000, this.scenario.approx_seconds * 1000 - d.final_push_before_end_ms);
    this.finalPushTimer = setTimeout(() => {
      if (this.state.phase !== "ready" || this.directorClosed()) return;
      this.send({ type: "conversation.message", role: "system", content: FINAL_PUSH });
      this.send({ type: "reply.create" });
      this.note("final_push", "Time cap near — injected final-push directive");
    }, finalAt);
  }

  private clearTimers() {
    if (this.silenceTimer) clearTimeout(this.silenceTimer);
    if (this.escalateTimer) clearTimeout(this.escalateTimer);
    if (this.finalPushTimer) clearTimeout(this.finalPushTimer);
    this.silenceTimer = this.escalateTimer = this.finalPushTimer = null;
  }

  async start(wsUrl: string, token: string) {
    this.state.phase = "connecting";
    this.push();
    this.player = new PcmPlayer();
    // prime() must run inside this click handler — autoplay policy.
    void this.player.prime();
    const sep = wsUrl.includes("?") ? "&" : "?";
    const ws = new WebSocket(`${wsUrl}${sep}token=${encodeURIComponent(token)}&scenario=${encodeURIComponent(this.scenario.id)}`);
    this.ws = ws;

    ws.onopen = async () => {
      try {
        const res = await fetch(withBase(`/api/agent-config/${this.scenario.id}`));
        const body = (await res.json()) as { session?: Record<string, unknown>; error?: string; detail?: string };
        if (!body.session) throw new Error(body.detail ?? body.error ?? `agent-config ${res.status}`);
        this.send({ type: "session.update", session: body.session });
      } catch (err) {
        this.hooks.onError(err instanceof Error ? err.message : String(err));
        // The socket is billable open time — never leave it running when the
        // session config can't be fetched (missing/malformed stored IDs).
        void this.close();
      }
    };

    ws.onmessage = (ev) => {
      let msg: ServerEvent;
      try {
        msg = JSON.parse(ev.data as string) as ServerEvent;
      } catch {
        return;
      }
      this.handleEvent(msg);
    };

    ws.onerror = () => {
      this.hooks.onError("WebSocket error");
    };

    ws.onclose = () => {
      if (this.state.phase === "ready" || this.state.phase === "connecting") {
        this.state.phase = "ended";
        this.state.tracker.observe({ type: "session.ended" } as ServerEvent, this.state.metrics.elapsed_ms);
        this.push();
      }
      this.clearTimers();
      this.mic.stop();
    };
  }

  private readyPerfAt: number | null = null;

  private handleEvent(msg: ServerEvent) {
    // Event clock = ms since session.ready (performance.now-based).
    const at = this.readyPerfAt == null ? 0 : performance.now() - this.readyPerfAt;
    applyServerEvent(this.state, msg, at);
    this.push();

    switch (msg.type) {
      case "session.ready":
        this.readyPerfAt = performance.now();
        this.armDirectorTimers();
        void this.startMic();
        break;
      case "session.updated":
        if (this.coachUpdatePending && msg.config?.system_prompt === this.scenario.coach_prompt) {
          this.coachUpdatePending = false;
          // Wait for the coach prompt and tool removal to take effect before
          // requesting speech; otherwise the persona can call a scoring tool.
          this.send({
            type: "reply.create",
            instructions: "Deliver the spoken debrief now. Begin: 'That was the simulation — this is your coach.' Give one specific strength, one improvement, and the safe next step.",
          });
        }
        break;
      case "input.speech.started":
      case "input.speech.stopped":
      case "transcript.user":
        this.resetSilenceTimer();
        break;
      case "reply.audio":
        this.player?.enqueue(msg.data);
        break;
      case "transcript.agent":
      case "reply.started":
        this.resetSilenceTimer();
        break;
      case "reply.done":
        if (msg.status === "interrupted") this.player?.flush();
        this.flushPendingToolResults();
        this.resetSilenceTimer();
        break;
      case "session.error":
        this.hooks.onError(`${msg.code}: ${msg.message}`);
        if (msg.code === "session_expired" || msg.code === "invalid_config" || msg.code === "session_not_found") {
          void this.close();
        }
        break;
      case "session.ended":
        this.coachUpdatePending = false;
        this.clearTimers();
        this.mic.stop();
        break;
      default:
        break;
    }
  }

  private async startMic() {
    try {
      await this.mic.start((pcm) => {
        this.send({ type: "input.audio", audio: pcm16ToBase64(pcm) });
      }, this.hooks.onMicLevel);
    } catch (err) {
      this.hooks.onError(`microphone: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private flushPendingToolResults() {
    const drain = drainableToolResults(this.state);
    if (!drain.length) return;
    for (const call of drain) {
      this.send({
        type: "tool.result",
        call_id: call.call_id,
        result: JSON.stringify({ acknowledged: true, tool: call.name }),
        is_error: false,
      });
    }
    markResultsFlushed(this.state, drain);
    this.push();
  }

  /** Persona → coach switch: mutable system_prompt + a prompted reply. */
  startDebrief() {
    if (this.coachRequested || this.state.phase !== "ready") return;
    this.clearTimers();
    this.coachRequested = true;
    this.coachUpdatePending = true;
    this.send({ type: "session.update", session: { system_prompt: this.scenario.coach_prompt, tools: [] } });
    this.state.coach_started = true;
    this.note("coach", "Requested persona → coach switch and disabled scoring tools; the debrief starts after session.updated (same voice — voice is immutable mid-session)");
  }

  /** Always session.end so billing stops; then close the socket. */
  endCall() {
    this.coachUpdatePending = false;
    this.clearTimers();
    this.send({ type: "session.end" });
    this.mic.stop();
    setTimeout(() => {
      try {
        this.ws?.close(1000);
      } catch {
        /* noop */
      }
    }, 600);
  }

  async close() {
    this.coachUpdatePending = false;
    this.clearTimers();
    this.mic.stop();
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.send({ type: "session.end" });
      try {
        this.ws.close(1000);
      } catch {
        /* noop */
      }
    }
    this.ws = null;
    await this.player?.close();
  }

  getState(): CallState {
    return this.state;
  }
}

/** Drive the reducer/UI from a recorded fixture — Replay mode. */
export async function replayFixture(
  scenario: Scenario,
  events: { at_ms: number; event: ServerEvent }[],
  hooks: ReplayHooks,
  speed = 1,
) {
  const state = initCallState(scenario);
  let prev = 0;
  for (const { at_ms, event } of events) {
    const delay = Math.min(4000, Math.max(0, (at_ms - prev) / speed));
    await sleep(delay);
    prev = at_ms;
    applyServerEvent(state, event, at_ms);
    hooks.onState({ ...state });
  }
  hooks.onDone();
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
