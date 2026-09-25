import { describe, it, expect } from "vitest";
import { getScenario } from "@/lib/catalog";
import { initCallState, applyServerEvent, drainableToolResults, markResultsFlushed } from "@/lib/reducer";
import type { ServerEvent, ToolCallEvent } from "@/lib/types";

const scenario = getScenario("helpdesk-pretext")!;

describe("reducer", () => {
  it("idle -> ready on session.ready with session_id", () => {
    const s = initCallState(scenario);
    applyServerEvent(s, { type: "session.ready", session_id: "sess_1", expires_at: 999 }, 0);
    expect(s.phase).toBe("ready");
    expect(s.session_id).toBe("sess_1");
    expect(s.expires_at).toBe(999);
  });

  it("builds captions from final transcripts and clears live text", () => {
    const s = initCallState(scenario);
    applyServerEvent(s, { type: "transcript.user.delta", item_id: "i1", text: "hello the" }, 100);
    expect(s.live_user_text).toBe("hello the");
    applyServerEvent(s, { type: "transcript.user", item_id: "i1", text: "hello there" }, 200);
    expect(s.live_user_text).toBe("");
    expect(s.captions).toHaveLength(1);
    expect(s.captions[0].speaker).toBe("user");
    applyServerEvent(s, { type: "transcript.agent.delta", reply_id: "r1", delta: "hi ", start_ms: 0, end_ms: 50 }, 300);
    applyServerEvent(s, { type: "transcript.agent", reply_id: "r1", text: "hi there" }, 400);
    expect(s.captions[1].speaker).toBe("agent");
  });

  it("BREACH on attempt_protected_action with breach action + succeeded outcome", () => {
    const s = initCallState(scenario);
    const call: ToolCallEvent = {
      type: "tool.call",
      call_id: "c1",
      name: "attempt_protected_action",
      arguments: { action: "mfa_reset", outcome: "succeeded", what_trainee_provided: "agreed to push reset" },
    };
    applyServerEvent(s, call, 5000);
    expect(s.verdict).toBe("breach");
    expect(s.breach?.action).toBe("mfa_reset");
    expect(s.tool_log).toHaveLength(1);
    expect(s.pending_results).toHaveLength(1);
  });

  it("no breach on refused outcome or non-breach action", () => {
    const s = initCallState(scenario);
    applyServerEvent(s, {
      type: "tool.call", call_id: "c1", name: "attempt_protected_action",
      arguments: { action: "mfa_reset", outcome: "refused" },
    }, 100);
    applyServerEvent(s, {
      type: "tool.call", call_id: "c2", name: "attempt_protected_action",
      arguments: { action: "share_wifi_password", outcome: "succeeded" },
    }, 200);
    expect(s.verdict).not.toBe("breach");
  });

  it("tool.result drains only after reply.done (docs flush rule)", () => {
    const s = initCallState(scenario);
    applyServerEvent(s, {
      type: "tool.call", call_id: "c1", name: "log_observation", arguments: { observation: "x" },
    }, 100);
    // Before reply.done → cannot flush.
    expect(drainableToolResults(s)).toHaveLength(0);
    applyServerEvent(s, { type: "reply.done", reply_id: "r1", status: "completed" }, 200);
    const drain = drainableToolResults(s);
    expect(drain).toHaveLength(1);
    markResultsFlushed(s, drain);
    expect(s.pending_results).toHaveLength(0);
    expect(s.tool_log[0].answered).toBe(true);
  });

  it("interrupted reply.done discards pending results and marks caption", () => {
    const s = initCallState(scenario);
    applyServerEvent(s, {
      type: "tool.call", call_id: "c1", name: "log_observation", arguments: {},
    }, 100);
    applyServerEvent(s, { type: "transcript.agent", reply_id: "r1", text: "wait—", interrupted: true }, 200);
    applyServerEvent(s, { type: "reply.done", reply_id: "r1", status: "interrupted" }, 300);
    expect(s.pending_results).toHaveLength(0);
    expect(s.captions[0].interrupted).toBe(true);
  });

  it("session.ended evaluates final verdict: held iff a held signal hit", () => {
    const s = initCallState(scenario);
    applyServerEvent(s, { type: "session.ready", session_id: "s1" }, 0);
    applyServerEvent(s, {
      type: "transcript.user", item_id: "i1",
      text: "Policy says I can't do that — let me call you back at the number on file.",
    }, 1000);
    applyServerEvent(s, { type: "session.ended", session_duration_seconds: 60, audio_duration_seconds: 60 }, 60000);
    expect(s.phase).toBe("ended");
    expect(s.verdict).toBe("held");
  });

  it("session.ended without held signals → inconclusive", () => {
    const s = initCallState(scenario);
    applyServerEvent(s, { type: "session.ready", session_id: "s1" }, 0);
    applyServerEvent(s, { type: "transcript.user", item_id: "i1", text: "uh huh" }, 1000);
    applyServerEvent(s, { type: "session.ended", session_duration_seconds: 30, audio_duration_seconds: 30 }, 30000);
    expect(s.verdict).toBe("inconclusive");
  });

  it("breach survives session.ended (not overwritten)", () => {
    const s = initCallState(scenario);
    applyServerEvent(s, { type: "session.ready", session_id: "s1" }, 0);
    applyServerEvent(s, {
      type: "tool.call", call_id: "c1", name: "attempt_protected_action",
      arguments: { action: "mfa_reset", outcome: "succeeded" },
    }, 1000);
    applyServerEvent(s, { type: "session.ended" }, 2000);
    expect(s.verdict).toBe("breach");
  });

  it("session.error sets error phase", () => {
    const s = initCallState(scenario);
    applyServerEvent(s, { type: "session.error", code: "session_expired", message: "bye" }, 100);
    expect(s.phase).toBe("error");
    expect(s.error?.code).toBe("session_expired");
  });
});
