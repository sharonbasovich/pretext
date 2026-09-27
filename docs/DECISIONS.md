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

- **Two replay variants for the flagship.** `?replay=1` (breach) and
  `?replay=held` (held-the-line) so reviewers can watch both outcomes with
  no mic and no key. Held scripts deliberately let the trip-wire fire with
  `outcome: "refused"` — proving the wire evaluates and does not trip.
- **Static-exportable replay.** `?replay` is read via `useSearchParams` in
  the client component (not server `searchParams`) and `/call/[scenario]`
  uses `generateStaticParams`, so `PRETEXT_STATIC_EXPORT=1` produces a
  bundle that serves lobby + replay + debrief on a plain static host.
  `scripts/build-static.sh` moves `app/api` aside for the export (route
  handlers can't be statically exported) and restores it after.
- **Automated demo video.** `submission/demo.mp4` is a Playwright capture of
  the real UI at 1920x1080 with ffmpeg title cards and a persistent
  "recorded replay — live AssemblyAI verification pending" banner. It is
  the honest backup until a scripted live run can be recorded.

## Round 4 (judge polish)

- **Held fixtures for all scenarios**: every lobby card links both
  `?replay=1` (breach) and `?replay=held` (held the line). Held scripts make
  the trainee hit held-signal rubric items (verify-first, stated policy,
  out-of-band verification) and fire `attempt_protected_action` with
  `outcome:"refused"`. Verified through the reducer before committing.
- **a11y**: axe-core audits wcag2a/aa serious+ on the stable surfaces (lobby,
  pre-call console). Live-call axe was skipped — mid-call DOM churn makes it
  flaky rather than informative. One real fix came out of it: primary button
  contrast 3.67:1 → 5.6:1.
- **demo_short.mp4 (~31s)**: separate record+ffmpeg pipeline
  (`demo:record:short`/`demo:video:short`) rather than cutting demo.mp4 —
  deterministic timestamps, same honesty banner.
- **docs/demo.gif**: 19s slice of the short demo at 960px/12fps/192-colour
  palette = 4.3MB, inside the 8MB GitHub-README limit.
