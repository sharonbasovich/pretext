import type { ServerEvent } from "./types";

/**
 * Deterministic session metrics derived purely from the event stream:
 * response latency, talk ratio, interruptions, dead air.
 *
 * All timestamps are event-time (ms since session start) supplied by the
 * caller — live sessions use wall-clock deltas from session.ready, replay
 * uses the recorded event times.
 */
export interface CallMetrics {
  /** ms from input.speech.stopped to the next reply.started. One per turn. */
  response_latencies_ms: number[];
  /** ms from session.ready to first reply.started (greeting TTFB). */
  greeting_ttfb_ms: number | null;
  /** Total ms the trainee was speaking (speech.started -> stopped). */
  user_speech_ms: number;
  /** Total ms the agent was replying (reply.started -> reply.done). */
  agent_reply_ms: number;
  /** Times the trainee interrupted the agent (reply.done status=interrupted). */
  trainee_interruptions: number;
  /** Trainee turns completed. */
  user_turns: number;
  /** Agent replies completed (incl. interrupted). */
  agent_replies: number;
  /** Longest stretch with neither party speaking (ms). */
  max_dead_air_ms: number;
  /** Total elapsed session time observed (ms). */
  elapsed_ms: number;
  /** Tool calls observed (all kinds). */
  tool_calls: number;
}

export const EMPTY_METRICS: CallMetrics = {
  response_latencies_ms: [],
  greeting_ttfb_ms: null,
  user_speech_ms: 0,
  agent_reply_ms: 0,
  trainee_interruptions: 0,
  user_turns: 0,
  agent_replies: 0,
  max_dead_air_ms: 0,
  elapsed_ms: 0,
  tool_calls: 0,
};

export function avgResponseLatencyMs(m: CallMetrics): number | null {
  if (m.response_latencies_ms.length === 0) return null;
  const sum = m.response_latencies_ms.reduce((a, b) => a + b, 0);
  return Math.round(sum / m.response_latencies_ms.length);
}

export function talkRatio(m: CallMetrics): { user: number; agent: number } {
  const total = m.user_speech_ms + m.agent_reply_ms;
  if (total <= 0) return { user: 0, agent: 0 };
  return {
    user: Math.round((m.user_speech_ms / total) * 100),
    agent: Math.round((m.agent_reply_ms / total) * 100),
  };
}

/** Lookup table for `metric_threshold` rubric detectors. */
export function metricValue(m: CallMetrics, name: string): number | null {
  switch (name) {
    case "avg_response_latency_ms":
      return avgResponseLatencyMs(m);
    case "max_response_latency_ms":
      return m.response_latencies_ms.length ? Math.max(...m.response_latencies_ms) : null;
    case "trainee_interruptions":
      return m.trainee_interruptions;
    case "user_turns":
      return m.user_turns;
    case "agent_replies":
      return m.agent_replies;
    case "max_dead_air_ms":
      return m.max_dead_air_ms;
    case "elapsed_ms":
      return m.elapsed_ms;
    case "tool_calls":
      return m.tool_calls;
    case "user_speech_ms":
      return m.user_speech_ms;
    case "agent_reply_ms":
      return m.agent_reply_ms;
    default:
      return null;
  }
}

interface Tracker {
  lastSpeechStoppedAt: number | null;
  speechStartedAt: number | null;
  replyStartedAt: number | null;
  /** PCM bytes observed in the current reply's reply.audio events. */
  replyAudioBytes: number;
  lastActivityAt: number | null;
  seenReady: boolean;
  greetingSeen: boolean;
}

/**
 * Incremental metrics tracker — feed every server event with its session-time.
 */
export class MetricsTracker {
  metrics: CallMetrics = { ...EMPTY_METRICS, response_latencies_ms: [] };
  private t: Tracker = {
    lastSpeechStoppedAt: null,
    speechStartedAt: null,
    replyStartedAt: null,
    replyAudioBytes: 0,
    lastActivityAt: null,
    seenReady: false,
    greetingSeen: false,
  };

  observe(event: ServerEvent, atMs: number): void {
    const m = this.metrics;
    const t = this.t;
    if (atMs > m.elapsed_ms) m.elapsed_ms = atMs;

    // Dead air: gap since last observable activity. We update lazily on each
    // event so the measurement stays deterministic for replays.
    if (t.lastActivityAt !== null && t.speechStartedAt === null && t.replyStartedAt === null) {
      const gap = atMs - t.lastActivityAt;
      if (gap > m.max_dead_air_ms) m.max_dead_air_ms = gap;
    }

    switch (event.type) {
      case "session.ready":
        t.seenReady = true;
        break;
      case "input.speech.started":
        t.speechStartedAt = atMs;
        break;
      case "input.speech.stopped":
        if (t.speechStartedAt !== null) {
          m.user_speech_ms += Math.max(0, atMs - t.speechStartedAt);
          t.speechStartedAt = null;
        }
        t.lastSpeechStoppedAt = atMs;
        break;
      case "transcript.user":
        m.user_turns += 1;
        break;
      case "reply.started":
        t.replyStartedAt = atMs;
        t.replyAudioBytes = 0;
        if (t.seenReady && !t.greetingSeen) {
          m.greeting_ttfb_ms = Math.max(0, atMs);
          t.greetingSeen = true;
        } else if (t.lastSpeechStoppedAt !== null) {
          m.response_latencies_ms.push(Math.max(0, atMs - t.lastSpeechStoppedAt));
          t.lastSpeechStoppedAt = null;
        }
        break;
      case "reply.audio":
        // base64 expands ~4/3 over raw bytes; PCM16 mono = 2 bytes per
        // sample at 24000 Hz → 48000 bytes per second of speech.
        t.replyAudioBytes += Math.floor(event.data.length * 0.75);
        break;
      case "reply.done":
        if (t.replyStartedAt !== null) {
          // Audio streams faster than realtime, so wall time understates
          // speech; derive it from payload bytes when audio events exist.
          if (t.replyAudioBytes > 0) {
            m.agent_reply_ms += t.replyAudioBytes / 48;
          } else {
            m.agent_reply_ms += Math.max(0, atMs - t.replyStartedAt);
          }
          t.replyStartedAt = null;
          t.replyAudioBytes = 0;
        }
        m.agent_replies += 1;
        if (event.status === "interrupted") m.trainee_interruptions += 1;
        break;
      case "tool.call":
        m.tool_calls += 1;
        break;
      default:
        break;
    }
    t.lastActivityAt = atMs;
  }
}
