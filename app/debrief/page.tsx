"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { CallState } from "@/lib/reducer";
import { avgResponseLatencyMs, talkRatio } from "@/lib/metrics";
import { rubricScore } from "@/lib/rubric";

type StoredCall = Omit<CallState, "tracker">;

function fmtClock(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function fmtMs(ms: number | null | undefined): string {
  if (ms == null) return "—";
  return `${Math.round(ms)} ms`;
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

export default function DebriefPage() {
  const [call, setCall] = useState<StoredCall | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);

  useEffect(() => {
    const raw = sessionStorage.getItem("pretext:last-call");
    if (raw) {
      try {
        setCall(JSON.parse(raw) as StoredCall);
      } catch {
        /* ignore */
      }
    }
  }, []);

  // When live, fetch the session recording via the history proxy.
  useEffect(() => {
    if (!call?.session_id || /^sess_(mock|replay)/.test(call.session_id)) return;
    fetch(`/api/session/${call.session_id}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`history ${res.status}`);
        const data = await res.json();
        const audio = (data.artifacts ?? []).find((a: { type: string }) => a.type === "audio");
        if (audio?.url) setAudioUrl(audio.url as string);
      })
      .catch((e) => setHistoryError(e instanceof Error ? e.message : String(e)));
  }, [call]);

  if (!call) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-16 text-center">
        <h1 className="mb-4 text-3xl font-extrabold">No call to debrief</h1>
        <p className="mb-6 text-sm" style={{ color: "var(--muted)" }}>
          Run a call (or a replay) first — the debrief reads the last call from this browser session.
        </p>
        <Link className="btn btn-primary" href="/">Back to scenarios</Link>
      </main>
    );
  }

  const score = rubricScore(call.rubric);
  const ratio = talkRatio(call.metrics);
  const avg = avgResponseLatencyMs(call.metrics);

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(call, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pretext-debrief-${call.scenario.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-extrabold">Debrief — {call.scenario.title}</h1>
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            {call.scenario.persona_name} · you were the {call.scenario.trainee_role}
          </p>
        </div>
        <button className="btn" onClick={exportJson}>Export JSON</button>
      </div>

      {/* verdict */}
      <div
        className="mb-6 rounded-lg border-2 px-6 py-5"
        style={{
          borderColor: call.verdict === "breach" ? "var(--breach)" : call.verdict === "held" ? "var(--held)" : "var(--warn)",
          background: "rgba(255,255,255,0.02)",
        }}
      >
        <div
          className="text-4xl font-black tracking-wide"
          style={{ color: call.verdict === "breach" ? "var(--breach)" : call.verdict === "held" ? "var(--held)" : "var(--warn)" }}
        >
          {call.verdict === "breach" ? "BREACH" : call.verdict === "held" ? "HELD THE LINE" : "INCONCLUSIVE"}
        </div>
        {call.breach && (
          <p className="mt-2 text-sm">
            <strong>{call.breach.action.replaceAll("_", " ")}</strong> at {fmtClock(call.breach.at_ms)} — {call.breach.detail}
          </p>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="panel p-5">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
            Rubric — {score.earned}/{score.possible} pts
          </h2>
          <ul className="space-y-3">
            {call.rubric.items.map(({ item, hit, evidence }) => {
              const isBreachItem =
                item.detect.kind === "tool_observation" && item.detect.tool === call.scenario.verdict.breach_tool;
              return (
                <li key={item.id}>
                  <div className="flex items-start gap-2 text-sm">
                    <span className={`rubric-dot mt-1 ${hit ? (item.polarity === "good" ? "on-good" : "on-bad") : ""}`} />
                    <div className="min-w-0">
                      <span style={{ color: hit ? "var(--text)" : "var(--muted)" }}>{item.label}</span>
                      {isBreachItem && hit && call.breach ? (
                        <div
                          className="mt-1 rounded border px-2 py-1.5 text-xs"
                          style={{ borderColor: "var(--breach)", background: "rgba(239,68,68,0.08)", color: "var(--breach)" }}
                        >
                          <span className="font-bold">BREACH · </span>
                          {call.breach.detail} — tool.call {item.detect.kind === "tool_observation" ? item.detect.tool : ""}
                          {" "}at <span className="mono">{fmtClock(call.breach.at_ms)}</span>
                        </div>
                      ) : (
                        evidence && (
                          <p className="mt-0.5 text-xs" style={{ color: "var(--muted)" }}>
                            {evidence.span && evidence.kind !== "tool_call" ? (
                              <>“{truncate(evidence.span, 180)}” <span className="mono">· {fmtClock(evidence.at_ms)}</span></>
                            ) : (
                              <>{evidence.detail} <span className="mono">· {fmtClock(evidence.at_ms)}</span></>
                            )}
                          </p>
                        )
                      )}
                      {evidence?.kind === "tool_call" && (
                        <details className="mt-0.5 text-xs" style={{ color: "var(--muted)" }}>
                          <summary className="cursor-pointer select-none">raw tool call</summary>
                          <code className="mono mt-1 block whitespace-pre-wrap break-all">{evidence.detail}</code>
                        </details>
                      )}
                      {!hit && item.hint && (
                        <p className="mt-0.5 text-xs" style={{ color: "var(--muted)" }}>hint: {item.hint}</p>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="flex flex-col gap-4">
          <div className="panel p-5">
            <h2 className="mb-3 text-xs font-bold uppercase tracking-wider" style={{ color: "var(--muted)" }}>Metrics</h2>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between"><dt style={{ color: "var(--muted)" }}>Duration</dt><dd className="mono">{fmtClock(call.metrics.elapsed_ms)}</dd></div>
              <div className="flex justify-between"><dt style={{ color: "var(--muted)" }}>Talk ratio (you/caller)</dt><dd className="mono">{ratio.user}%/{ratio.agent}%</dd></div>
              <div className="flex justify-between"><dt style={{ color: "var(--muted)" }}>Avg response latency</dt><dd className="mono">{fmtMs(avg)}</dd></div>
              <div className="flex justify-between"><dt style={{ color: "var(--muted)" }}>Greeting time-to-first-audio</dt><dd className="mono">{fmtMs(call.metrics.greeting_ttfb_ms)}</dd></div>
              <div className="flex justify-between"><dt style={{ color: "var(--muted)" }}>Your interruptions</dt><dd className="mono">{call.metrics.trainee_interruptions}</dd></div>
              <div className="flex justify-between"><dt style={{ color: "var(--muted)" }}>Max dead air</dt><dd className="mono">{fmtClock(call.metrics.max_dead_air_ms)}</dd></div>
              <div className="flex justify-between"><dt style={{ color: "var(--muted)" }}>Tool calls</dt><dd className="mono">{call.metrics.tool_calls}</dd></div>
            </dl>
          </div>

          <div className="panel p-5">
            <h2 className="mb-3 text-xs font-bold uppercase tracking-wider" style={{ color: "var(--muted)" }}>Recording</h2>
            {audioUrl ? (
              <audio controls src={audioUrl} className="w-full" />
            ) : (
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                {historyError ?? "Recording is only available for live sessions (session history API)."}
              </p>
            )}
          </div>

          <div className="panel p-5">
            <h2 className="mb-3 text-xs font-bold uppercase tracking-wider" style={{ color: "var(--muted)" }}>Director interventions</h2>
            <ul className="space-y-1 text-xs" style={{ color: "var(--muted)" }}>
              {call.director_log.length === 0 && <li>None — the call ran clean.</li>}
              {call.director_log.map((d, i) => (
                <li key={i}><span className="mono">{fmtClock(d.at_ms)}</span> [{d.kind}] {d.note}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <p className="mt-6 text-xs" style={{ color: "var(--muted)" }}>
        Scoring is a deterministic training aid, not a certification — tool trip-wire,
        agent-logged observations, transcript patterns and timing metrics; no separate LLM judge.
      </p>

      <div className="mt-8 flex gap-3">
        <Link className="btn btn-primary" href="/">Train again</Link>
        <Link className="btn" href={`/call/${call.scenario.id}?replay=1`}>Replay this scenario</Link>
      </div>
    </main>
  );
}
