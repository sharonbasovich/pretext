# Pretext — an AI sparring partner for frontline staff

Phishing simulations trained people to stop clicking links. Pretext trains them
to stop caving on the phone.

Pretext is a voice-driven training simulator designed for the AssemblyAI Voice
Agent API. The agent plays the *caller* — four adversarial personas at the fictional
**Northwind Utilities**: a CFO running a help-desk pretext to steal an MFA reset,
an angry double-charged customer, a confused elderly bilingual caller, and a
vendor pushing a remittance change (BEC by phone). You play the employee.

**Verification status (2026-09-29):** the mock agent and committed replay
fixtures cover the full call UI and score. The production server reports
`live_ready: true`; its token route returned HTTP 200, four stored agents are
configured, and a genuine AssemblyAI WebSocket session produced a caller
greeting, coach response, and retrievable session history. A full deployed
browser trainee call and live demo recording are still being verified. The
current public replay footage remains labeled as mock-derived.

While the call runs, a deterministic rubric lights up live: did you verify the
caller, cite the policy, offer the documented path? The moment you hand over a
protected action, the agent fires an `attempt_protected_action` tool call — the
trip-wire — and a **BREACH** banner lands. Hold the line to the end and the
verdict is **HELD THE LINE**. Then the caller drops character — the same voice
switches persona via `session.update` — and debriefs you with what you did
right, where the pretext almost worked, and the exact sentence to say next
time. The debrief shows every rubric item with its evidence span and exports a
JSON evidence pack. The live session-history fetch passed a production smoke
test; recording playback in a full browser run remains to be verified. The
published replays use clearly labeled mock fixtures.

**No mic or no key? Watch the replays.** Each of the 4 scenarios ships two
recorded fixtures — breach and held-the-line — labeled "REPLAY · recorded
mock" throughout the UI (8 total). The whole app also exports as a static
bundle (`npm run build:static`) that runs replays on any static host — a
GitHub Pages workflow ships in-repo. The console passes axe-core wcag2a/aa
checks (aria-live verdict + captions, keyboard focus rings, ≥375px mobile).

## Why this wins

- **Business value** — voice social engineering of help desks is behind
  headline breaches; security-awareness vendors sell phishing sims by the seat,
  and human-run vishing sims are expensive and rare. Contact centers already
  pay for onboarding role-play. Buyer: CISO / awareness lead / training lead.
  Pricing: per-seat per-month + scenario packs.
- **Originality** — the field has scam *detectors* and generic tutors; an
  adaptive adversarial *caller* with a live rubric and an evidence-backed
  debrief is a different product category.
- **Application of technology** — the Voice Agent API is the product, not a
  dependency: client-side tools form the trip-wire, `session.update` powers
  escalation and the coach switch, `conversation.message`/`reply.create` are a
  director channel, keyterms/transcription_prompt handle digits and fictional
  names, `turn_detection` differentiates the personas, session history feeds
  the debrief.
- **Presentation** — the demo has a dramatic beat (the BREACH banner), a live
  rubric lighting up, captions, metrics, and a spoken coach debrief. Judges
  can replay both verdicts per scenario with no mic, and a static-export
  bundle serves them from any host.

## AssemblyAI integration (selected production checks verified)

| Feature | Use |
| --- | --- |
| Voice Agent WS API | The whole call: STT, turn-taking, LLM persona, TTS, barge-in |
| `GET /v1/token` caps | API key stays server-side; sessions hard-capped ≤240 s for a public demo |
| Stored agents (`POST /v1/agents`) | Persona prompts + tool schemas server-side; no public inline-config fallback |
| Client-side tools (`tool.call`/`tool.result`) | `attempt_protected_action` trip-wire; `log_observation` rubric hits |
| `session.update` | Difficulty escalation + persona→coach debrief switch |
| `conversation.message` + `reply.create` | Director channel: silence nudges, timed escalation, final push |
| `transcript.*`, `input.speech.*`, `reply.done` | Live captions, rubric regexes, latency/interruption/dead-air metrics |
| `input.keyterms`, `transcription_prompt` | Fictional names, ticket formats, "MFA", account digits |
| `input.turn_detection` | Aggressive barge-in vs patient pacing per persona |
| `GET /v1/sessions/{id}` | Recording playback + timeline on the debrief page |

LLM Gateway is deliberately unused (outside the free tier); every score is
deterministic or agent-observed and labeled as such.

## Honest limitations

Persona drift, trip-wire false ±, STT digit errors, echo on Firefox/Safari
without headphones, API latency/outage (Replay mode is the labeled fallback),
public-demo cost exposure (rate-limited + capped), scoring is a training aid
not certification, single-mic only, and ethics/scope: personas target only
fictional Northwind Utilities — defensive awareness training in the same
category as phishing simulations.
