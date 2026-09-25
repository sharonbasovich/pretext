import type { ArgConstraint, Detector, RubricItem, Scenario } from "./scenario";
import type { CallMetrics } from "./metrics";
import { metricValue } from "./metrics";
import type { ServerEvent, ToolCallEvent } from "./types";

/**
 * Deterministic rubric engine.
 *
 * Every rubric item declares exactly one detector:
 *  - tool_observation: a matching tool.call marks it (the agent's own
 *    log_observation / attempt_protected_action calls are the signal).
 *  - transcript_regex: a regex on final transcripts (default: trainee speech).
 *  - metric_threshold: evaluated at call end from lib/metrics.
 *
 * Hits record evidence pointing at the transcript span / tool call / metric
 * that triggered them, so the debrief is evidence-backed.
 */
export interface RubricEvidence {
  kind: "tool_call" | "transcript" | "metric";
  /** Human-readable evidence summary. */
  detail: string;
  /** Session-time ms when the evidence was observed. */
  at_ms: number;
  /** The transcript text or tool arguments behind the hit. */
  span?: string;
}

export interface RubricItemState {
  item: RubricItem;
  hit: boolean;
  evidence: RubricEvidence | null;
}

export interface RubricState {
  items: RubricItemState[];
}

export function initRubricState(scenario: Scenario): RubricState {
  return {
    items: scenario.rubric.map((item) => ({ item, hit: false, evidence: null })),
  };
}

function argMatches(args: Record<string, unknown>, constraint: ArgConstraint): boolean {
  const raw = args[constraint.key];
  if (raw === undefined) return false;
  if (constraint.equals === undefined) return raw !== undefined;
  if (constraint.regex) {
    try {
      return new RegExp(String(constraint.equals), "i").test(String(raw));
    } catch {
      return false;
    }
  }
  if (Array.isArray(raw)) {
    return raw.some((v) => String(v) === String(constraint.equals));
  }
  return String(raw) === String(constraint.equals);
}

function toolCallMatches(
  detector: Extract<Detector, { kind: "tool_observation" }>,
  call: ToolCallEvent,
): boolean {
  if (call.name !== detector.tool) return false;
  if (!detector.where) return true;
  return detector.where.every((c) => argMatches(call.arguments, c));
}

/**
 * Feed one server event through the rubric. Returns whether state changed.
 */
export function applyRubricEvent(
  state: RubricState,
  event: ServerEvent,
  atMs: number,
): boolean {
  let changed = false;
  for (const s of state.items) {
    if (s.hit) continue;
    const d = s.item.detect;
    if (d.kind === "tool_observation" && event.type === "tool.call") {
      if (toolCallMatches(d, event)) {
        s.hit = true;
        s.evidence = {
          kind: "tool_call",
          detail: `tool.call ${event.name}(${JSON.stringify(event.arguments)})`,
          at_ms: atMs,
          span: JSON.stringify(event.arguments),
        };
        changed = true;
      }
    } else if (d.kind === "transcript_regex") {
      const speaker = d.speaker ?? "user";
      const text =
        speaker === "user" && event.type === "transcript.user"
          ? event.text
          : speaker === "agent" && event.type === "transcript.agent"
            ? event.text
            : null;
      if (text !== null) {
        try {
          const re = new RegExp(d.pattern, d.flags ?? "i");
          if (re.test(text)) {
            s.hit = true;
            s.evidence = {
              kind: "transcript",
              detail: `${speaker === "user" ? "Trainee" : "Caller"} said: "${truncate(text, 140)}"`,
              at_ms: atMs,
              span: text,
            };
            changed = true;
          }
        } catch {
          // invalid pattern is a config bug; validation catches it upstream
        }
      }
    }
  }
  return changed;
}

/**
 * Evaluate metric_threshold detectors. Call once the session ends.
 */
export function finalizeRubric(
  state: RubricState,
  metrics: CallMetrics,
  atMs: number,
): boolean {
  let changed = false;
  for (const s of state.items) {
    if (s.hit) continue;
    const d = s.item.detect;
    if (d.kind !== "metric_threshold") continue;
    const value = metricValue(metrics, d.metric);
    if (value === null) continue;
    const ok =
      d.op === "<" ? value < d.value
      : d.op === "<=" ? value <= d.value
      : d.op === ">" ? value > d.value
      : value >= d.value;
    if (ok) {
      s.hit = true;
      s.evidence = {
        kind: "metric",
        detail: `${d.metric} = ${value} (${d.op} ${d.value})`,
        at_ms: atMs,
      };
      changed = true;
    }
  }
  return changed;
}

export function rubricScore(state: RubricState): { earned: number; possible: number } {
  let earned = 0;
  let possible = 0;
  for (const s of state.items) {
    // "bad"-polarity items are failure signals — they never contribute points.
    if (s.item.polarity !== "good") continue;
    possible += s.item.weight;
    if (s.hit) earned += s.item.weight;
  }
  return { earned, possible };
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n - 1)}…`;
}
