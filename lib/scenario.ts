/**
 * Scenario definitions: the UI/rubric metadata for each persona.
 * The publishable agent bodies live in agents/*.json; the scenario files in
 * scenarios/*.json reference them and carry everything the console needs:
 * rubric items, director-channel rules, the coach prompt, and verdict logic.
 */

export type Detector =
  | {
      kind: "tool_observation";
      /** Tool name that, when called, marks this item. */
      tool: string;
      /** Optional argument constraints; all must match for a hit. */
      where?: ArgConstraint[];
    }
  | {
      kind: "transcript_regex";
      /** Regex applied to final user (trainee) transcripts, or agent when speaker="agent". */
      pattern: string;
      speaker?: "user" | "agent";
      flags?: string;
    }
  | {
      kind: "metric_threshold";
      /** Metric from lib/metrics.ts evaluated at call end. */
      metric: string;
      op: "<" | "<=" | ">" | ">=";
      value: number;
    };

export interface ArgConstraint {
  /** Argument key on the tool call. */
  key: string;
  /** Required value. For arrays, any match counts; for strings, exact match unless `regex` set. */
  equals?: string | number | boolean;
  /** Treat `equals` as a regex against the stringified argument. */
  regex?: boolean;
}

export interface RubricItem {
  id: string;
  /** Short label shown on the checklist. */
  label: string;
  weight: number;
  /** "good" = a behavior we want (lights up green). "bad" = a failure signal (lights red). */
  polarity: "good" | "bad";
  detect: Detector;
  /** What the trainee is being scored on — surfaced in the debrief. */
  hint?: string;
}

export interface DirectorRules {
  /** Trainee silence threshold before a system nudge is injected (ms). */
  silence_nudge_ms: number;
  /** When to escalate difficulty via a session.update system_prompt (ms since session.ready). */
  escalate_at_ms: number;
  /** Persona-specific escalation instruction appended/replacing behavior guidance. */
  escalation_prompt: string;
  /** Send a "final push" director note when this many ms remain before the cap. */
  final_push_before_end_ms: number;
}

export interface VerdictRules {
  /** The trip-wire tool name. */
  breach_tool: string;
  /** Values of the `action` argument that count as the protected action being given away. */
  breach_actions: string[];
  /** Argument key carrying what the trainee provided. */
  action_arg: string;
  /** Argument key carrying the outcome (e.g. "outcome" -> "succeeded"). */
  outcome_arg: string;
  /** Outcome value(s) that mean the protected action actually succeeded. */
  succeeded_values: string[];
  /** Rubric item ids — at least one must be "hit" for HELD (otherwise INCONCLUSIVE). */
  held_signals: string[];
}

export interface Scenario {
  id: string;
  title: string;
  subtitle: string;
  /** Filename inside agents/ (without .json). */
  agent: string;
  difficulty: "moderate" | "hard" | "expert";
  category: string;
  persona_name: string;
  persona_role: string;
  /** What the trainee is role-playing. */
  trainee_role: string;
  protected_action: string;
  description: string;
  objectives: string[];
  rubric: RubricItem[];
  director: DirectorRules;
  /** Replaces system_prompt for the spoken debrief (persona -> coach switch). */
  coach_prompt: string;
  verdict: VerdictRules;
  /** Estimated demo length in seconds, shown on the scenario card. */
  approx_seconds: number;
}
