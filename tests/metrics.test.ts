import { describe, it, expect } from "vitest";
import { MetricsTracker, avgResponseLatencyMs, talkRatio, metricValue } from "@/lib/metrics";
import type { ServerEvent } from "@/lib/types";

function feed(t: MetricsTracker, seq: [number, ServerEvent][]) {
  for (const [ms, e] of seq) t.observe(e, ms);
}

describe("MetricsTracker", () => {
  it("measures response latency speech.stopped -> reply.started", () => {
    const t = new MetricsTracker();
    feed(t, [
      [1000, { type: "input.speech.stopped" }],
      [1800, { type: "reply.started", reply_id: "r1" }],
    ]);
    expect(t.metrics.response_latencies_ms).toEqual([800]);
  });

  it("measures greeting ttfb ready -> first reply.started", () => {
    const t = new MetricsTracker();
    feed(t, [
      [0, { type: "session.ready", session_id: "s1" }],
      [900, { type: "reply.started", reply_id: "r1" }],
      [3000, { type: "reply.started", reply_id: "r2" }],
    ]);
    expect(t.metrics.greeting_ttfb_ms).toBe(900);
  });

  it("accumulates user/agent speech and counts turns", () => {
    const t = new MetricsTracker();
    feed(t, [
      [0, { type: "session.ready", session_id: "s1" }],
      [500, { type: "input.speech.started" }],
      [2500, { type: "input.speech.stopped" }],
      [2500, { type: "transcript.user", item_id: "i1", text: "hi" }],
      [2600, { type: "reply.started", reply_id: "r1" }],
      [5100, { type: "reply.done", reply_id: "r1", status: "completed" }],
    ]);
    const m = t.metrics;
    expect(m.user_speech_ms).toBe(2000);
    expect(m.user_turns).toBe(1);
    expect(m.agent_replies).toBe(1);
    expect(m.agent_reply_ms).toBeGreaterThan(0);
  });

  it("counts interrupted replies as trainee interruptions", () => {
    const t = new MetricsTracker();
    feed(t, [
      [0, { type: "reply.done", reply_id: "r1", status: "interrupted" }],
      [0, { type: "reply.done", reply_id: "r2", status: "interrupted" }],
      [0, { type: "reply.done", reply_id: "r3", status: "completed" }],
    ]);
    expect(t.metrics.trainee_interruptions).toBe(2);
  });

  it("counts tool calls and dead air", () => {
    const t = new MetricsTracker();
    feed(t, [
      [0, { type: "reply.done", reply_id: "r1", status: "completed" }],
      [5000, { type: "input.speech.started" }],
      [6000, { type: "tool.call", call_id: "c1", name: "log_observation", arguments: {} }],
    ]);
    expect(t.metrics.tool_calls).toBe(1);
    expect(t.metrics.max_dead_air_ms).toBe(5000);
  });
});

describe("metric helpers", () => {
  it("avgResponseLatencyMs and talkRatio", () => {
    const t = new MetricsTracker();
    feed(t, [
      [0, { type: "input.speech.started" }],
      [1000, { type: "input.speech.stopped" }],
      [2000, { type: "reply.started", reply_id: "r1" }],
      [3000, { type: "reply.done", reply_id: "r1", status: "completed" }],
    ]);
    const m = t.metrics;
    expect(avgResponseLatencyMs(m)).toBe(1000);
    const r = talkRatio(m);
    expect(r.user).toBe(50);
    expect(r.agent).toBe(50);
  });

  it("metricValue resolves every declared metric", () => {
    const t = new MetricsTracker();
    const m = t.metrics;
    for (const name of [
      "avg_response_latency_ms",
      "max_response_latency_ms",
      "trainee_interruptions",
      "user_turns",
      "agent_replies",
      "max_dead_air_ms",
      "elapsed_ms",
      "tool_calls",
      "user_speech_ms",
      "agent_reply_ms",
    ]) {
      // null allowed only for latency metrics with no data
      const v = metricValue(m, name);
      if (name.includes("latency")) expect(v).toBeNull();
      else expect(v).toBe(0);
    }
    expect(metricValue(m, "bogus")).toBeNull();
  });
});
