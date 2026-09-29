---
marp: true
theme: default
paginate: true
backgroundColor: "#0a0e14"
color: "#dbe4f0"
style: |
  section { font-family: ui-sans-serif, system-ui, sans-serif; }
  h1 { color: #ffffff; font-size: 2.2em; }
  h2 { color: #3b82f6; }
  strong { color: #ffffff; }
  code { background: #151d29; color: #93c5fd; }
  .breach { color: #ef4444; font-weight: 800; }
  .held { color: #22c55e; font-weight: 800; }
  table { font-size: 0.72em; }
  table, th, td { background: #151d29 !important; color: #dbe4f0 !important; border-color: #334155 !important; }
  th { color: #93c5fd !important; }
  pre, pre code { background: #151d29 !important; color: #dbe4f0 !important; }
---

# Pretext
### An AI sparring partner for frontline staff

Phishing simulations trained people to stop clicking.
**Pretext trains them to stop caving on the phone.**

An AssemblyAI Voice Agent plays the *caller*.
You play the employee.
A live rubric scores the call. A protected-action trip-wire decides
<span class="breach">BREACH</span> or <span class="held">HELD THE LINE</span>.

---

## The problem

- Voice social engineering (**vishing**) of help desks is behind headline
  breaches — the attacker just calls and *asks*.
- Security-awareness vendors sell phishing sims by the seat; **human-run
  vishing sims are expensive and rare** — most teams never drill the phone.
- Contact centers pay for onboarding role-play that's scripted, static,
  and can't escalate when the trainee freezes.

## The idea

Make the *attacker* a voice agent: adaptive, adversarial, always available —
with a deterministic trip-wire that decides the moment the trainee gives away
the protected action.

---

## Demo flow

Four personas at fictional **Northwind Utilities**:

| Scenario | Caller | Protected action |
| --- | --- | --- |
| **The CFO Pretext** (flagship) | "Dana Whitfield" — locked out before a board call | MFA / password reset |
| **The Double Charge** | "Ray Delgado" — furious, threatens to cancel | Refund > $50 |
| **Rosa's Letter** | "Rosa Vega" — 74, ES→EN, digit-by-digit | Account details |
| **The Remittance Switch** | "Mark Ellison" — vendor BEC | Payment-details change |

**Beat:** the moment the trainee caves, the agent calls
`attempt_protected_action` → <span class="breach">BREACH</span> banner → the same
voice drops character and coaches.

---

## How it works

```
browser (Next.js)                        AssemblyAI
───────────────                          ──────────
mic → AudioWorklet PCM16@24kHz ──WS──▶ Voice Agent (STT+LLM+TTS)
      ◀── reply.audio / transcripts / tool.call ──
lib/reducer → lib/rubric + lib/metrics → verdict + debrief
director: conversation.message nudges · session.update escalation
          reply.create final push · coach switch
```

- **Token route** mints capped tokens (≤240 s, per-IP rate limit, daily cap,
  required private passcode) — the API key never reaches the browser.
- **Mock agent + replay fixtures** — offline dev, CI, and a labeled fallback demo path.

---

## AssemblyAI feature map

| Feature | How Pretext uses it |
| --- | --- |
| Voice Agent WS | The entire call: STT, turn-taking, persona, TTS, barge-in |
| `GET /v1/token` caps | Hard ≤240 s sessions on a public demo |
| Stored agents | Persona prompts + tool schemas server-side |
| Client-side tools | `attempt_protected_action` = trip-wire; `log_observation` = rubric |
| `session.update` | Escalation + persona→coach switch |
| `conversation.message` / `reply.create` | Director channel |
| `transcript.*` / `input.speech.*` | Captions, rubric regexes, latency/interruption metrics |
| `input.keyterms` / `transcription_prompt` | Fictional names, digits, ticket formats |
| `input.turn_detection` | Barge-in vs patient pacing per persona |
| Session history API | Recording + timeline on the debrief page |

---

## Honest differentiation

- **Adversarial, adaptive AI caller** with a protected-action trip-wire —
  not a chatbot, not a detector.
- **Evidence-backed verdicts** — every rubric hit points at the transcript
  span, tool call, or metric that triggered it; labeled mock replays are
  available now, and live browser recording playback awaits verification.
- **Deterministic where it counts** — latency, talk ratio, interruptions,
  trip-wire, policy-phrase regexes. Soft-skill judgments are agent-observed
  and labeled as such.
- **Everything on one API** — no separate STT/TTS/LLM vendors; the trainee
  uses a browser while the server keeps the API key and stored-agent IDs private.

---

## Verification status

**Mock-verified:** 8 Playwright E2E and 41 unit tests cover the full call,
trip-wire verdict, coach debrief, and JSON export. Lint, typecheck, and build
pass.

**Production integration smoke test passed:** `/api/status` returned
`live_ready: true`, `/api/token` returned HTTP 200, four stored agents were
configured, and a genuine AssemblyAI session produced a greeting, coach
response, and retrievable history.

**Still to verify:** the full deployed browser trainee flow, call quality and
verdicts across all four personas, and live browser recording playback.

**Demo integrity:** all eight replays and bundled videos are labeled recorded
mock. Replace the footage after recording a genuine browser call.

---

## Live AssemblyAI verification progress

- [x] Publish and configure four stored agents; production status ready.
- [x] Mint a live token and verify a genuine WebSocket greeting, coach
      response, and session-history fetch.
- [ ] 3 live calls per scenario (12 total, ≤240s each): confirm persona
      holds character, trip-wire fires correctly, coach switch works.
- [ ] Capture per-call numbers: greeting TTFB, reply latency p50/p95,
      turn-detection accuracy, STT accuracy on names/digits (keyterms on).
- [ ] Verify a full deployed browser call and recording playback in debrief.
- [ ] Record scripted live demo (video_script.md) replacing demo.mp4.
- [ ] Finalize and submit the draft LabLab entry.

**The current demo video and GIF are mock/replay captures. LabLab is draft.**

---

## Business model & market

- **Buyers:** CISO / security-awareness lead (vishing drills), contact-center
  training lead (de-escalation & verification reps).
- **Pricing story:** per-seat per-month + scenario packs (help-desk pretext
  pack, billing-pack, BEC pack); enterprise: custom personas + rubrics wired
  to internal policy.
- **Why now:** voice agents just got good enough to be a believable attacker —
  and help-desk vishing keeps making headlines.

---

## Limitations (said out loud)

Persona drift · trip-wire false ± · STT digit errors · echo on Firefox/Safari
without headphones · API outage (Replay mode is the fallback) · scoring is a
training aid, not certification · single-mic, no diarization · personas target
only the fictional Northwind Utilities — defensive training, same category as
phishing sims.

---

## Roadmap

1. Real-time persona packs & rubric authoring UI
2. Team dashboards: cohort scores, trend lines, recurring drills
3. More personas: IT-recruiter pretext, "auditor", insider-threat calls
4. Deeper session-history analytics (timeline-aligned rubric events)
5. Optional LLM-judged soft-skill scorecard (when funded)

**Pretext — train the call before it costs you.**
