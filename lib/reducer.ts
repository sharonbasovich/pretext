import type { Scenario } from "./scenario";
import type { ServerEvent, ToolCallEvent } from "./types";
import { MetricsTracker, type CallMetrics } from "./metrics";
import {
  applyRubricEvent,
  finalizeRubric,
  initRubricState,
  type RubricState,
} from "./rubric";

/**
 * The session reducer: one pure function that folds every server event into
 * the console's view state. Live sessions, the mock server, and Replay all
 * feed the same reducer, so what the UI shows is always evidence-backed.
 */

export type Phase =
  | "idle"
  | "connecting"
  | "ready"
  | "ended"
  | "error";

export type Verdict = "none" | "breach" | "held" | "inconclusive";

export interface CaptionTurn {
  id: string;
  speaker: "user" | "agent";
  text: string;
  /** session-time ms */
  at_ms: number;
  interrupted?: boolean;
}

export interface ToolCallRecord {
  call_id: string;
  name: string;
  arguments: Record<string, unknown>;
  at_ms: number;
  /** set when the client dispatched tool.result */
  answered: boolean;
}

export interface BreachInfo {
  action: string;
  detail: string;
  at_ms: number;
  call_id: string;
}

export interface DirectorNote {
  at_ms: number;
  note: string;
  kind: "silence" | "escalation" | "final_push" | "coach" | "info";
}

export interface CallState {
  phase: Phase;
  scenario: Scenario;
  session_id: string | null;
  expires_at: number | null;
  /** ms timestamp of session.ready on the event clock (live: Date.now; replay: fixture clock). */
  ready_at: number | null;
  user_speaking: boolean;
  agent_speaking: boolean;
  live_user_text: string;
  live_agent_text: string;
  captions: CaptionTurn[];
  rubric: RubricState;
  metrics: CallMetrics;
  tracker: MetricsTracker;
  verdict: Verdict;
  breach: BreachInfo | null;
  tool_log: ToolCallRecord[];
  /** tool.call accumulated, to be flushed as tool.result after reply.done. */
  pending_results: ToolCallEvent[];
  last_turn_event: "reply.done" | "reply.started" | "input.speech.started" | null;
  director_log: DirectorNote[];
  last_user_activity_at: number | null;
  escalated: boolean;
  coach_started: boolean;
  error: { code: string; message: string } | null;
}

export function initCallState(scenario: Scenario): CallState {
  return {
    phase: "idle",
    scenario,
    session_id: null,
    expires_at: null,
    ready_at: null,
    user_speaking: false,
    agent_speaking: false,
    live_user_text: "",
    live_agent_text: "",
    captions: [],
    rubric: initRubricState(scenario),
    metrics: { response_latencies_ms: [], greeting_ttfb_ms: null, user_speech_ms: 0, agent_reply_ms: 0, trainee_interruptions: 0, user_turns: 0, agent_replies: 0, max_dead_air_ms: 0, elapsed_ms: 0, tool_calls: 0 },
    tracker: new MetricsTracker(),
    verdict: "none",
    breach: null,
    tool_log: [],
    pending_results: [],
    last_turn_event: null,
    director_log: [],
    last_user_activity_at: null,
    escalated: false,
    coach_started: false,
    error: null,
  };
}

let capSeq = 0;

function pushCaption(state: CallState, speaker: "user" | "agent", text: string, at: number, interrupted = false) {
  state.captions.push({ id: `${speaker}-${capSeq++}`, speaker, text, at_ms: at, interrupted });
  if (state.captions.length > 400) state.captions.splice(0, state.captions.length - 400);
}

function evaluateBreach(state: CallState, call: ToolCallEvent, atMs: number) {
  const v = state.scenario.verdict;
  if (call.name !== v.breach_tool) return;
  const action = String(call.arguments[v.action_arg] ?? "");
  const outcome = String(call.arguments[v.outcome_arg] ?? "");
  const detail = String(call.arguments["what_trainee_provided"] ?? call.arguments["detail"] ?? "");
  if (v.breach_actions.includes(action) && v.succeeded_values.includes(outcome)) {
    state.verdict = "breach";
    state.breach = { action, detail, at_ms: atMs, call_id: call.call_id };
  }
}

function evaluateFinalVerdict(state: CallState, atMs: number) {
  finalizeRubric(state.rubric, state.metrics, atMs);
  if (state.verdict === "breach") return;
  const heldSignals = new Set(state.scenario.verdict.held_signals);
  const heldOk = state.rubric.items.some((s) => heldSignals.has(s.item.id) && s.hit);
  state.verdict = heldOk ? "held" : "inconclusive";
}

/**
 * Fold one server event into the call state. Mutates the draft state —
 * callers pass an immer draft or a plain object per their wiring.
 *
 * `atMs` is the event's session-time (ms since session start on the event
 * clock). For `session.ready`, pass 0.
 */
export function applyServerEvent(state: CallState, event: ServerEvent, atMs: number): void {
  state.tracker.observe(event, atMs);
  state.metrics = state.tracker.metrics;
  applyRubricEvent(state.rubric, event, atMs);

  switch (event.type) {
    case "session.ready":
      state.phase = "ready";
      state.session_id = event.session_id;
      state.expires_at = event.expires_at ?? null;
      state.ready_at = atMs;
      break;
    case "session.updated":
      break;
    case "input.speech.started":
      state.user_speaking = true;
      state.last_turn_event = "input.speech.started";
      state.last_user_activity_at = atMs;
      break;
    case "input.speech.stopped":
      state.user_speaking = false;
      state.last_user_activity_at = atMs;
      break;
    case "transcript.user.delta":
      state.live_user_text = event.text;
      break;
    case "transcript.user":
      state.live_user_text = "";
      state.last_user_activity_at = atMs;
      pushCaption(state, "user", event.text, atMs);
      break;
    case "reply.started":
      state.agent_speaking = true;
      state.live_agent_text = "";
      state.last_turn_event = "reply.started";
      break;
    case "transcript.agent.delta":
      state.live_agent_text += event.delta;
      break;
    case "transcript.agent":
      pushCaption(state, "agent", event.text, atMs, event.interrupted ?? false);
      state.live_agent_text = "";
      break;
    case "reply.audio":
      break;
    case "reply.done":
      state.agent_speaking = false;
      state.last_turn_event = "reply.done";
      if (event.status === "interrupted") {
        // Per docs: discard pending tool.result accumulators from the ended reply.
        state.pending_results = [];
      }
      break;
    case "tool.call": {
      const record: ToolCallRecord = {
        call_id: event.call_id,
        name: event.name,
        arguments: event.arguments,
        at_ms: atMs,
        answered: false,
      };
      state.tool_log.push(record);
      state.pending_results.push(event);
      evaluateBreach(state, event, atMs);
      break;
    }
    case "session.error":
      state.error = { code: event.code, message: event.message };
      state.phase = "error";
      break;
    case "session.ended":
      state.phase = "ended";
      state.user_speaking = false;
      state.agent_speaking = false;
      evaluateFinalVerdict(state, atMs);
      break;
    default:
      break;
  }
}

/**
 * Tool results that are ready to flush: only when the last turn event is
 * reply.done (and not interrupted). See the docs' client-side-tools pattern.
 */
export function drainableToolResults(state: CallState): ToolCallEvent[] {
  if (state.last_turn_event !== "reply.done") return [];
  return state.pending_results;
}

export function markResultsFlushed(state: CallState, calls: ToolCallEvent[]) {
  const ids = new Set(calls.map((c) => c.call_id));
  state.pending_results = state.pending_results.filter((c) => !ids.has(c.call_id));
  for (const rec of state.tool_log) {
    if (ids.has(rec.call_id)) rec.answered = true;
  }
}
