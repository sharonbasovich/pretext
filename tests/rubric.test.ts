import { describe, it, expect } from "vitest";
import { getScenario } from "@/lib/catalog";
import { initRubricState, applyRubricEvent, finalizeRubric, rubricScore } from "@/lib/rubric";
import { EMPTY_METRICS, type CallMetrics } from "@/lib/metrics";
import type { ServerEvent, ToolCallEvent } from "@/lib/types";

const scenario = getScenario("helpdesk-pretext")!;

function toolCall(name: string, args: Record<string, unknown>, id = "c1"): ToolCallEvent {
  return { type: "tool.call", call_id: id, name, arguments: args };
}

describe("rubric engine", () => {
  it("starts with every item unhit", () => {
    const s = initRubricState(scenario);
    expect(s.items.length).toBe(scenario.rubric.length);
    expect(s.items.every((i) => !i.hit)).toBe(true);
  });

  it("tool_observation hits when args satisfy where constraints", () => {
    const s = initRubricState(scenario);
    applyRubricEvent(s, toolCall("log_observation", { observation: "refused_request" }), 1000);
    const st = s.items.find((i) => i.item.id === "agent_logged_refusal")!;
    expect(st.hit).toBe(true);
    expect(st.evidence?.kind).toBe("tool_call");
    expect(st.evidence?.at_ms).toBe(1000);
  });

  it("tool_observation misses on wrong arg value", () => {
    const s = initRubricState(scenario);
    applyRubricEvent(s, toolCall("log_observation", { observation: "verified_identity" }), 500);
    expect(s.items.find((i) => i.item.id === "agent_logged_refusal")!.hit).toBe(false);
    applyRubricEvent(s, toolCall("attempt_protected_action", { outcome: "succeeded", action: "mfa_reset" }), 600);
    expect(s.items.find((i) => i.item.id === "breach_event")!.hit).toBe(true);
  });

  it("transcript_regex hits on trainee transcript with span evidence", () => {
    const s = initRubricState(scenario);
    const ev: ServerEvent = {
      type: "transcript.user",
      item_id: "i1",
      text: "Policy says I can't reset that on an inbound call — let me call you back at the number on file.",
    };
    applyRubricEvent(s, ev, 2000);
    const cb = s.items.find((i) => i.item.id === "offered_callback")!;
    expect(cb.hit).toBe(true);
    expect(cb.evidence?.kind).toBe("transcript");
    expect(cb.evidence?.span).toContain("call you back");
    const pol = s.items.find((i) => i.item.id === "stated_policy")!;
    expect(pol.hit).toBe(true);
  });

  it("metric_threshold evaluates at finalize only", () => {
    const s = initRubricState(scenario);
    const m: CallMetrics = { ...EMPTY_METRICS, response_latencies_ms: [1200, 3000] };
    // Before finalize: not hit.
    expect(s.items.find((i) => i.item.id === "stayed_calm")!.hit).toBe(false);
    finalizeRubric(s, m, 90000);
    const st = s.items.find((i) => i.item.id === "stayed_calm")!;
    expect(st.hit).toBe(true); // max latency 3000 <= 9000
    expect(st.evidence?.kind).toBe("metric");
    // And with a slow response it stays unhit.
    const s2 = initRubricState(scenario);
    finalizeRubric(s2, { ...m, response_latencies_ms: [12000] }, 90000);
    expect(s2.items.find((i) => i.item.id === "stayed_calm")!.hit).toBe(false);
  });

  it("rubricScore counts only good-polarity hits over good-polarity weights", () => {
    const s = initRubricState(scenario);
    for (const i of s.items) i.hit = true; // every item hit, including bad ones
    const { earned, possible } = rubricScore(s);
    const goodWeight = s.items
      .filter((i) => i.item.polarity === "good")
      .reduce((a, i) => a + i.item.weight, 0);
    expect(possible).toBe(goodWeight);
    expect(earned).toBe(goodWeight); // perfect score possible even with bad hits
  });
});
