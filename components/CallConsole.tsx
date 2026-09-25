"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Scenario } from "@/lib/scenario";
import type { CallState } from "@/lib/reducer";
import { initCallState } from "@/lib/reducer";
import { CallSession, replayFixture } from "@/lib/session";
import { avgResponseLatencyMs, talkRatio } from "@/lib/metrics";
import { rubricScore } from "@/lib/rubric";
import type { ServerEvent } from "@/lib/types";

interface Fixture {
  at_ms: number;
  event: ServerEvent;
}

function fmtClock(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

const CONN_LABEL: Record<string, { label: string; cls: string }> = {
  idle: { label: "IDLE", cls: "pill-muted" },
  connecting: { label: "CONNECTING", cls: "pill-warn" },
  ready: { label: "LIVE", cls: "pill-held" },
  ended: { label: "ENDED", cls: "pill-muted" },
  error: { label: "ERROR", cls: "pill-breach" },
};

/** Session cap countdown is cosmetic — max_session_duration_seconds on the
 * token is the hard guarantee server-side. */

export default function CallConsole({ scenario, replay }: { scenario: Scenario; replay: boolean }) {
  const router = useRouter();
  const [state, setState] = useState<CallState>(() => initCallState(scenario));
  const [error, setError] = useState<string | null>(null);
  const [needsPasscode, setNeedsPasscode] = useState(false);
  const [passcode, setPasscode] = useState("");
  const [mock, setMock] = useState(false);
  const [started, setStarted] = useState(false);
  const [replayDone, setReplayDone] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [capSeconds, setCapSeconds] = useState<number | null>(null);
  const sessionRef = useRef<CallSession | null>(null);
  const captionsRef = useRef<HTMLDivElement>(null);
  const micLevelRef = useRef(0);

  const onState = useCallback((s: CallState) => setState({ ...s }), []);
  const onError = useCallback((m: string) => setError(m), []);

  // Auto-scroll captions.
  useEffect(() => {
    const el = captionsRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [state.captions.length, state.live_user_text, state.live_agent_text]);

  // Persist state for the debrief page whenever it changes post-start.
  useEffect(() => {
    if (!started) return;
    const serializable = stripTracker(state);
    sessionStorage.setItem("pretext:last-call", JSON.stringify(serializable));
  }, [state, started]);

  // session.end on pagehide/beforeunload — billing safety (docs: always end).
  useEffect(() => {
    const onHide = () => {
      sessionRef.current?.endCall();
    };
    window.addEventListener("pagehide", onHide);
    window.addEventListener("beforeunload", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      window.removeEventListener("beforeunload", onHide);
    };
  }, []);

  // Mic level meter: worklet reports ~per-frame; throttle to 10Hz UI updates.
  useEffect(() => {
    const iv = setInterval(() => setMicLevel(micLevelRef.current), 100);
    return () => clearInterval(iv);
  }, []);

  const onMicLevel = useCallback((level: number) => {
    micLevelRef.current = level;
  }, []);

  async function begin() {
    setError(null);
    if (replay) {
      setStarted(true);
      const res = await fetch(`/fixtures/${scenario.id}.json`);
      if (!res.ok) {
        setError(`No replay fixture for this scenario yet (${res.status}).`);
        return;
      }
      const events = (await res.json()) as Fixture[];
      void replayFixture(scenario, events, {
        onState,
        onDone: () => setReplayDone(true),
      });
      return;
    }
    const tok = await fetch(`/api/token${passcode ? `?passcode=${encodeURIComponent(passcode)}` : ""}`);
    const body = await tok.json();
    if (!tok.ok) {
      if (body.error === "passcode_required") setNeedsPasscode(true);
      setError(body.detail ?? body.error ?? `token ${tok.status}`);
      return;
    }
    setMock(Boolean(body.mock));
    setCapSeconds(typeof body.max_session_seconds === "number" ? body.max_session_seconds : null);
    const session = new CallSession(scenario, { onState, onError, onMicLevel });
    sessionRef.current = session;
    setStarted(true);
    await session.start(body.ws_url, body.token);
  }

  async function finish() {
    sessionRef.current?.endCall();
    setTimeout(() => router.push("/debrief"), 900);
  }

  const conn = CONN_LABEL[state.phase] ?? CONN_LABEL.idle;
  const score = rubricScore(state.rubric);
  const ratio = talkRatio(state.metrics);
  const avgLatency = avgResponseLatencyMs(state.metrics);
  const live = state.phase === "ready";

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col px-6 py-6">
      {/* header */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold">{scenario.title}</h1>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            {scenario.persona_name} · {scenario.persona_role} — you are the {scenario.trainee_role}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {replay && <span className="pill pill-warn">REPLAY (recorded)</span>}
          {mock && <span className="pill pill-muted">mock agent</span>}
          <span className={`pill ${conn.cls}`}>conn · {conn.label}</span>
          <span className="mono text-lg font-bold">{fmtClock(state.metrics.elapsed_ms)}</span>
          {live && capSeconds != null && (
            <span className="mono text-xs" style={{ color: "var(--muted)" }} title="max_session_duration_seconds cap">
              cap -{fmtClock(Math.max(0, capSeconds * 1000 - state.metrics.elapsed_ms))}
            </span>
          )}
        </div>
      </div>

      {/* verdict banner */}
      {state.verdict === "breach" && (
        <div className="banner-breach mb-4 rounded-lg border-2 px-6 py-4" style={{ borderColor: "var(--breach)", background: "rgba(239,68,68,0.10)" }}>
          <div className="text-3xl font-black tracking-wide" style={{ color: "var(--breach)" }}>
            BREACH — {state.breach?.action.replaceAll("_", " ")}
          </div>
          <p className="mt-1 text-sm" style={{ color: "var(--text)" }}>
            The caller fired the protected-action trip-wire: {state.breach?.detail}
          </p>
        </div>
      )}
      {state.verdict === "held" && (
        <div className="mb-4 rounded-lg border-2 px-6 py-4" style={{ borderColor: "var(--held)", background: "rgba(34,197,94,0.10)" }}>
          <div className="text-3xl font-black tracking-wide" style={{ color: "var(--held)" }}>
            HELD THE LINE
          </div>
          <p className="mt-1 text-sm">Call ended with the protected action intact.</p>
        </div>
      )}
      {state.verdict === "inconclusive" && state.phase === "ended" && (
        <div className="mb-4 rounded-lg border-2 px-6 py-4" style={{ borderColor: "var(--warn)", background: "rgba(245,158,11,0.08)" }}>
          <div className="text-2xl font-black" style={{ color: "var(--warn)" }}>INCONCLUSIVE</div>
          <p className="mt-1 text-sm">No breach, but the held-the-line signals were never demonstrated.</p>
        </div>
      )}

      {error && (
        <div className="panel mb-4 px-4 py-3 text-sm" style={{ borderColor: "var(--warn)", color: "var(--warn)" }}>
          {error}
        </div>
      )}

      {/* pre-call gate */}
      {!started && (
        <div className="panel mx-auto mt-16 max-w-lg p-8 text-center">
          <h2 className="mb-2 text-xl font-bold">Ready?</h2>
          <p className="mb-1 text-sm" style={{ color: "var(--muted)" }}>
            {replay
              ? "This replays a recorded call — no live agent is involved."
              : "Your mic connects to the agent. Chrome + headphones recommended (echo)."}
          </p>
          <p className="mb-5 text-xs" style={{ color: "var(--muted)" }}>
            You play the {scenario.trainee_role} at Northwind Utilities.
          </p>
          {needsPasscode && (
            <input
              type="password"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              placeholder="Demo passcode"
              className="mb-3 w-full rounded-md border px-3 py-2 text-sm"
              style={{ background: "var(--bg)", borderColor: "var(--border)", color: "var(--text)" }}
            />
          )}
          <button className="btn btn-primary w-full justify-center" onClick={begin}>
            {replay ? "Start replay" : "Start call"}
          </button>
        </div>
      )}

      {started && (
        <div className="grid flex-1 gap-4 lg:grid-cols-3">
          {/* captions */}
          <div className="panel flex flex-col p-4 lg:col-span-2" style={{ minHeight: 420 }}>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
                Live captions
              </h3>
              <div className="flex items-center gap-2">
                <span
                  className={`speaker-chip ${state.user_speaking ? "speaker-you-on" : ""}`}
                >
                  ● you
                </span>
                <span
                  className={`speaker-chip ${state.agent_speaking ? "speaker-caller-on" : ""}`}
                >
                  ● {scenario.persona_name.split(" ")[0]}
                </span>
              </div>
            </div>
            <div ref={captionsRef} className="caption-scroll flex-1 space-y-3 overflow-y-auto pr-2" style={{ maxHeight: 460 }}>
              {state.captions.map((c) => (
                <div key={c.id} className={c.speaker === "user" ? "text-right" : "text-left"}>
                  <div className="mb-0.5 text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
                    {c.speaker === "user" ? "You" : scenario.persona_name}
                  </div>
                  <div
                    className="panel-2 inline-block max-w-[80%] px-3 py-2 text-sm"
                    style={{
                      borderColor: c.speaker === "user" ? "var(--accent)" : "var(--border)",
                      opacity: c.interrupted ? 0.75 : 1,
                    }}
                  >
                    <span className="mono mr-2 text-[10px]" style={{ color: "var(--muted)" }}>{fmtClock(c.at_ms)}</span>
                    {c.text}
                    {c.interrupted && <span className="tag-interrupted ml-2">interrupted</span>}
                  </div>
                </div>
              ))}
              {state.live_user_text && (
                <div className="text-right">
                  <div className="mb-0.5 text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--muted)" }}>You</div>
                  <div className="panel-2 inline-block max-w-[80%] px-3 py-2 text-sm" style={{ borderColor: "var(--accent)", opacity: 0.7 }}>
                    <em>{state.live_user_text}</em>
                  </div>
                </div>
              )}
              {state.live_agent_text && (
                <div className="text-left">
                  <div className="mb-0.5 text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--muted)" }}>{scenario.persona_name}</div>
                  <div className="panel-2 inline-block max-w-[80%] px-3 py-2 text-sm" style={{ opacity: 0.7 }}>
                    <em>{state.live_agent_text}</em>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* right rail */}
          <div className="flex flex-col gap-4">
            <div className="panel p-4">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--muted)" }}>Rubric</h3>
                <span className="mono text-xs font-bold">
                  {score.earned}/{score.possible}
                </span>
              </div>
              <ul className="space-y-2">
                {state.rubric.items.map(({ item, hit }) => (
                  <li key={item.id} className="flex items-start gap-2 text-sm">
                    <span className={`rubric-dot mt-1 ${hit ? (item.polarity === "good" ? "on-good" : "on-bad") : ""}`} />
                    <span style={{ color: hit ? "var(--text)" : "var(--muted)" }}>{item.label}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="panel p-4">
              <h3 className="mb-3 text-xs font-bold uppercase tracking-wider" style={{ color: "var(--muted)" }}>Metrics</h3>
              <div className="space-y-3 text-xs">
                <div>
                  <div className="mb-1 flex justify-between" style={{ color: "var(--muted)" }}>
                    <span>Talk ratio (you / caller)</span>
                    <span className="mono">{ratio.user}% / {ratio.agent}%</span>
                  </div>
                  <div className="meter-track"><div className="meter-fill" style={{ width: `${ratio.user}%`, background: "var(--accent)" }} /></div>
                </div>
                <div className="flex justify-between" style={{ color: "var(--muted)" }}>
                  <span>Avg response latency</span>
                  <span className="mono">{avgLatency == null ? "—" : `${avgLatency} ms`}</span>
                </div>
                <div className="flex justify-between" style={{ color: "var(--muted)" }}>
                  <span>Your interruptions</span>
                  <span className="mono">{state.metrics.trainee_interruptions}</span>
                </div>
                <div className="flex justify-between" style={{ color: "var(--muted)" }}>
                  <span>Tool calls</span>
                  <span className="mono">{state.metrics.tool_calls}</span>
                </div>
              </div>
            </div>

            <div className="panel flex-1 p-4">
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wider" style={{ color: "var(--muted)" }}>Director</h3>
              <ul className="space-y-1 text-xs" style={{ color: "var(--muted)" }}>
                {state.director_log.length === 0 && <li>No interventions yet.</li>}
                {state.director_log.map((d, i) => (
                  <li key={i}><span className="mono">{fmtClock(d.at_ms)}</span> {d.note}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* controls */}
      {started && (
        <div className="mt-4 flex items-center justify-between">
          <div className="flex items-center gap-4 text-xs" style={{ color: "var(--muted)" }}>
            {state.session_id && <span className="mono">session {state.session_id}</span>}
            {live && !replay && (
              <span className="flex items-center gap-1.5" title="microphone input level">
                mic
                <span className="mic-meter"><span className="mic-meter-fill" style={{ width: `${Math.round(micLevel * 100)}%` }} /></span>
              </span>
            )}
          </div>
          <div className="flex gap-3">
            {live && !replay && !state.coach_started && (
              <button className="btn" onClick={() => sessionRef.current?.startDebrief()}>
                Hear the debrief
              </button>
            )}
            {(live || state.phase === "ended") && (
              <button className="btn btn-danger" onClick={finish} disabled={replayDone && state.phase !== "ended"}>
                {replay || state.phase === "ended" ? "Open debrief" : "End call"}
              </button>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

/** CallState minus the non-serializable MetricsTracker instance. */
function stripTracker(state: CallState): Omit<CallState, "tracker"> {
  const { tracker, ...rest } = state;
  void tracker;
  return rest;
}
