import Link from "next/link";
import { SCENARIOS } from "@/lib/catalog";

export default function Lobby() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-10">
        <div className="mb-2 flex items-center gap-3">
          <span className="pill pill-warn">training simulator</span>
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
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        {SCENARIOS.map((s) => (
          <Link
            key={s.id}
            href={`/call/${s.id}`}
            className="panel block p-5 transition-transform hover:-translate-y-0.5"
          >
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
            <div className="mt-4 text-sm font-semibold" style={{ color: "var(--accent)" }}>
              Start call →
            </div>
          </Link>
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
