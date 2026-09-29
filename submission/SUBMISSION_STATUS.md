# Submission status — Pretext

Internal tracker for what is verified and what remains before submission.
Last updated: 2026-09-29. The LabLab entry remains a draft; this file does not
claim registration or submission.

## Verified with the bundled mock agent (real WS wire protocol)

- Lint (0 warnings), `tsc --noEmit`, 41/41 Vitest unit tests, `npm run build`
  — re-run green from a clean clone (`git clone` → `npm ci`).
- Playwright E2E ×8 (chromium, fake mic): live-mock call → BREACH → coach →
  debrief + export; CFO held-fixture replay → HELD; vendor-BEC held replay
  → HELD THE LINE; lobby rendering; mobile/a11y suite (axe-core wcag2a/aa
  serious+ on lobby + pre-call console; 375px no-horizontal-overflow).
  Videos recorded per run.
- Mock-first call flow: simulated token route → WS connect → session.update →
  session.ready → captions → rubric hits → `attempt_protected_action`
  trip-wire → BREACH → `session.update` coach switch → spoken debrief →
  `session.end` → debrief page + JSON export.
- Replay mode (`?replay=1`) drives the identical reducer/UI from committed
  fixtures — labeled "REPLAY · recorded mock" banner throughout. Every
  scenario has both `?replay=1` (breach) and `?replay=held` (held the line)
  variants linked from its lobby card — 8 fixtures total.
- A11y/responsive: aria-live verdict banners (role=alert) + caption log
  (role=log), global :focus-visible ring, ≥375px no-overflow check in E2E,
  axe-core scan clean (btn contrast fix included).
- Static-exportable replay verified: `PRETEXT_STATIC_EXPORT=1` +
  `scripts/build-static.sh` → `out/` serves lobby + replay + debrief with
  fixtures from /public on a plain static host (no server APIs needed).
- `submission/demo.mp4` (79s, 1920×1080) and `submission/demo_short.mp4`
  (~31s hook→BREACH→debrief) recorded via Playwright of the real UI —
  title/closing cards + persistent "mock agent / recorded replay — live
  AssemblyAI verification pending" banner via ffmpeg drawtext.
  `docs/demo.gif` (19s, 960×540, <8MB) sits atop the README.
- No API keys or secrets anywhere in git history (`git log -p` grep clean —
  only env-var *names* appear).

## Verified against production AssemblyAI (integration smoke test)

- The deployed `/api/status` reported `live_ready: true`: the server had its
  AssemblyAI key, required private passcode, and mappings for all four stored
  agents. This is a configuration check, not proof of a completed browser call.
- An authorized request to the deployed `/api/token` returned HTTP 200 and
  minted a live session token.
- Four caller personas were published as stored AssemblyAI agents and mapped
  in the deployment; their IDs and the API key remain server-side.
- A genuine session on `wss://agents.assemblyai.com/v1/ws` produced a caller
  greeting and coach response. Its session history was retrieved through the
  live API path.

## Implemented; full deployed browser flow still being verified

- A trainee's browser call from microphone permission through live captions,
  rubric/tool verdict, coach handoff, `/debrief`, and recording playback has not
  yet been completed and verified end to end on the deployed server.
- The production smoke test does not establish call quality, trip-wire accuracy,
  or the complete breach/held outcomes across all four personas. The mock E2E
  suite and eight replay fixtures cover those UI paths separately.
- `PRETEXT_EXPOSE_INLINE=1` remains a local debugging path. Production uses
  stored agents; the default without an ID is 503 `stored_agent_required` so
  persona prompts and tool schemas are not sent to trainees.

## Remaining before submission

1. Finish and document the deployed browser trainee run, including the
   protected-action verdict, coach handoff, and debrief playback. Then test
   breach and held outcomes across the four personas and capture call metrics.
2. Record a genuine live demo following `submission/video_script.md`.
   `submission/demo.mp4`, `submission/demo_short.mp4`, and `docs/demo.gif` are
   still clearly labeled mock/replay captures.
3. Keep [the public source](https://github.com/sharonbasovich/pretext) current
   and finalize the draft LabLab entry with the reviewed copy and live demo.
