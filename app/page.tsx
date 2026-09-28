import Link from "next/link";
import { SCENARIOS } from "@/lib/catalog";
import LiveStatus from "@/components/LiveStatus";

export default function Lobby() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-10">
        <div className="mb-2 flex items-center gap-3">
          <span className="pill pill-warn">training simulator</span>
          <span className="pill pill-muted">AssemblyAI Voice Agent API</span>
          <span className="text-sm" style={{ color: "var(--muted)" }}>
            fictional company: Northwind Utilities
          </span>
        </div>
        <h1 className="text-5xl font-extrabold tracking-tight">
          Pretext
        </h1>
        <p className="mt-3 max-w-2xl text-lg" style={{ color: "var(--muted)" }}>
          An AI voice agent plays the caller — angry customer, confused elder, social
          engineer running a pretext. You play the employee. A live rubric scores the
          call; a protected-action trip-wire decides <strong className="text-white">BREACH</strong> or{" "}
          <strong className="text-white">HELD THE LINE</strong>; then the caller drops
          character and coaches you.
        </p>
        <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
          Phishing simulations trained people to stop clicking. Pretext trains them to stop caving on the phone.
        </p>
        <LiveStatus />
      </header>

      {/* how it works — 3-step strip */}
      <section className="mb-8 grid gap-3 sm:grid-cols-3">
        <div className="panel p-4">
          <div className="mb-1 text-xs font-bold uppercase tracking-wider" style={{ color: "var(--accent)" }}>1 · The call</div>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            An AI voice agent phones in character — angry, confused, or running a pretext. You answer as the employee.
          </p>
        </div>
        <div className="panel p-4">
          <div className="mb-1 text-xs font-bold uppercase tracking-wider" style={{ color: "var(--warn)" }}>2 · The trip-wire</div>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            Hand over a protected action and the agent fires a tool call — BREACH lands live on screen.
          </p>
        </div>
        <div className="panel p-4">
          <div className="mb-1 text-xs font-bold uppercase tracking-wider" style={{ color: "var(--held)" }}>3 · The debrief</div>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            The same voice drops character and coaches: rubric hits, evidence spans, latency metrics.
          </p>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        {SCENARIOS.map((s) => (
          <div key={s.id} className="panel block p-5">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-xl font-bold">{s.title}</h2>
              <span className="pill pill-muted">~{Math.round(s.approx_seconds / 60)} min</span>
            </div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--accent)" }}>
              {s.persona_name} · {s.persona_role}
            </p>
            <p className="mb-3 text-sm" style={{ color: "var(--muted)" }}>{s.description}</p>
            <ul className="space-y-1 text-xs" style={{ color: "var(--muted)" }}>
              {s.objectives.slice(0, 3).map((o) => (
                <li key={o}>· {o}</li>
              ))}
            </ul>
            <div className="mt-4 flex items-center justify-between">
              <Link className="text-sm font-semibold" style={{ color: "var(--accent)" }} href={`/call/${s.id}`}>
                Start call →
              </Link>
              <span className="flex gap-3">
                <Link className="text-xs font-semibold" style={{ color: "var(--breach)" }} href={`/call/${s.id}?replay=1`}>
                  Replay: breach ↗
                </Link>
                <Link className="text-xs font-semibold" style={{ color: "var(--held)" }} href={`/call/${s.id}?replay=held`}>
                  Replay: held ↗
                </Link>
              </span>
            </div>
          </div>
        ))}
      </div>

      <section className="panel mt-10 p-5">
        <h3 className="mb-2 text-sm font-bold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
          How it works
        </h3>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          The caller is an AssemblyAI Voice Agent with a scripted persona and in-fiction
          tools. When you hand over a protected action (an MFA reset, a refund, account
          details) the agent fires a tool call — the trip-wire — and the verdict lands.
          A director channel nudges the caller when you go quiet or when time runs out.
          When it ends, the same voice drops character and debriefs you. Scoring is a
          training aid, not a certification.
        </p>
      </section>
    </main>
  );
}
