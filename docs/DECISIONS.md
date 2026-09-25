# Decisions log

Product/architecture choices made during the build, with reasoning.

- **Verdict engine is deterministic.** A BREACH fires only when the agent calls
  `attempt_protected_action` with a breach action + a succeeded outcome. HELD
  requires at least one rubric "held signal" before `session.ended`, else the
  call is INCONCLUSIVE. Soft-skill rubric hits come from tool observations and
  transcript regexes — no LLM judging, labeled as such in the UI.

- **Director channel is client-side.** The browser injects
  `conversation.message` (role=system) nudges on silence, swaps `system_prompt`
  via `session.update` to escalate at a scenario-specific time, and fires a
  `reply.create` final push near the cap. Cheaper and more reliable than
  a second process.

- **Mock-first.** `ASSEMBLYAI_API_KEY` may be absent in dev/CI, so
  `mock/server.ts` replays scripted wire events over the same WebSocket
  protocol; `?replay=1` drives the same reducer/UI from pre-generated
  fixtures. The E2E suite and CI run entirely against the mock.

- **Voice is immutable post-ready**, so the coach debrief speaks in the
  caller's voice — the UI says so and the coach opens with "That was the
  simulation — this is your coach."

- **Single trainee mic, no diarization.** Training aid only; not a tool for
  grading real multi-party calls.

- **Public-demo cost controls.** Token route: per-IP sliding-window rate
  limit, daily session cap, optional passcode, and a hard 240 s
  `max_session_duration_seconds` clamp. Sessions always send `session.end`
  on stop/pagehide.
