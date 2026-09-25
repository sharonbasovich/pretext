# Pretext

**An AI sparring partner for frontline staff.** An AssemblyAI Voice Agent plays
the *caller* — an angry billing customer, a confused elderly account holder
switching between Spanish and English, a vendor running a BEC scam, and a
social engineer running a help-desk pretext. You play the employee at the
fictional **Northwind Utilities**. A live rubric scores the call, a
protected-action trip-wire decides **BREACH** or **HELD THE LINE**, then the
caller drops character and debriefs you.

> Phishing simulations trained people to stop clicking. Pretext trains them to
> stop caving on the phone.

Built for the [AssemblyAI Voice Agent Hackathon](https://lablab.ai) (Sep 2026).

## 60-second demo

1. `cp .env.example .env` and set `ASSEMBLYAI_API_KEY` (or leave unset and use Replay mode).
2. `npm ci && npm run dev` → http://localhost:3000
3. Pick **Help-desk pretext** (the flagship). Chrome + headphones recommended.
4. The caller ("Dana Whitfield, CFO") pushes for an MFA reset. Refuse or comply — the verdict banner lands the moment you give away the protected action.
5. Click **Hear the debrief** — the same voice drops character and coaches. Then open **/debrief** for the rubric, metrics, recording playback (live sessions) and JSON export.

No API key? Every scenario card supports `?replay=1` — a recorded run drives the
same UI (clearly labeled **Replay (recorded)**).

## Architecture

```
browser                          next.js server
──────────────                   ─────────────────────────
CallConsole.tsx                  /api/token     → GET agents.assemblyai.com/v1/token
  ├─ MicCapture  (AudioWorklet,     (rate limit + daily cap + passcode + ≤240 s cap)
  │   PCM16 @24 kHz → input.audio) /api/agent-config/[id] → stored agent_id or inline config
  ├─ PcmPlayer   (PCM16 playback,   /api/session/[id]      → session history proxy
  │   flush on interrupt)
  └─ CallSession (lib/session.ts)  mock/server.ts → scripted wire-protocol replay
      ├─ lib/reducer.ts  (server events → call state)
      ├─ lib/rubric.ts   (tool_observation | transcript_regex | metric_threshold)
      ├─ lib/metrics.ts  (latency, talk ratio, dead air, interruptions)
      └─ director channel: conversation.message nudges, session.update escalation,
         reply.create final push; persona→coach switch via session.update
```

Personas live in `agents/*.json` (stored-agent bodies) + `scenarios/*.json`
(rubric/director/verdict config). `npm run publish` upserts them via
`POST /v1/agents` and writes `agents.lock.json`; without it the app falls back
to inline `session.update` configs.

## AssemblyAI feature map

| Feature | Use |
| --- | --- |
| Voice Agent WS (`/v1/ws`) | The whole call: STT + turn-taking + LLM persona + TTS + barge-in |
| `GET /v1/token` (`expires_in_seconds`, `max_session_duration_seconds`) | Key never reaches the browser; sessions hard-capped ≤240 s |
| Stored agents `POST /v1/agents` + `agents.lock.json` | Personas + tool schemas server-side; inline-config fallback |
| Client-side tools (`tool.call`/`tool.result`) | `attempt_protected_action` = the trip-wire; `log_observation` = rubric hits |
| `session.update` mid-session | Difficulty escalation + persona→coach switch (voice immutable — coach speaks in the caller's voice) |
| `conversation.message` + `reply.create` | Director channel: silence nudges, timed escalation, final push |
| `transcript.*` / `input.speech.*` / `reply.done` | Live captions, rubric regexes, latency/interruption/dead-air metrics |
| `input.keyterms` + `transcription_prompt` | Northwind names, ticket formats, "MFA", account digits |
| `input.turn_detection` | Aggressive barge-in (pretext) vs patient pacing (elderly caller) |
| `GET /v1/sessions/{id}` | Recording playback + timeline on the debrief page |

LLM Gateway is deliberately unused — not covered by the hackathon free tier.

## Setup

```bash
npm ci
cp .env.example .env        # set ASSEMBLYAI_API_KEY
npm run dev                 # http://localhost:3000
```

Mock mode (no key needed):

```bash
npm run mock                # ws://localhost:8787/v1/ws
PRETEXT_MOCK=1 npm run dev  # app talks to the mock
```

Scripts: `npm run lint` · `npm run typecheck` · `npm test` · `npm run build` ·
`npm run e2e` · `npm run fixtures` · `npm run mock:wav` · `npm run publish` · `npm run verify`

## Deploy (Vercel)

`vercel deploy --prod` with one env var: `ASSEMBLYAI_API_KEY`. Optional:
`PRETEXT_DAILY_SESSION_CAP` (default 200), `PRETEXT_DEMO_PASSCODE`,
`PRETEXT_MAX_SESSION_SECONDS` (default/max 240).

## Known limitations

Persona drift, trip-wire false ±, STT digit errors, echo on Firefox/Safari
without headphones, API latency/outage (Replay mode is the fallback),
public-demo cost exposure (rate-limited + capped), scoring is a training aid
not certification, single-mic only (no diarization), and ethics/scope:
personas target only fictional Northwind Utilities — defensive awareness
training in the same category as phishing sims. See `docs/DECISIONS.md`.

## License

MIT — see `LICENSE`.
