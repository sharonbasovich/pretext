# Submission status — Pretext

Internal tracker for what is verified and what remains for a human to finish.
Last updated: 2026-09-25. Nothing here claims registration or submission —
the coordinator handles that.

## Verified (against the bundled mock agent — real WS wire protocol)

- Lint (0 warnings), `tsc --noEmit`, 39/39 Vitest unit tests, `npm run build`
  — re-run green from a clean clone (`git clone` → `npm ci`).
- Playwright E2E ×4 (chromium, fake mic): live-mock call → BREACH → coach →
  debrief + export; vendor-BEC replay → HELD THE LINE; CFO held-fixture
  replay → HELD THE LINE; lobby rendering. Videos recorded per run.
- Mock-first call flow: token route → WS connect → session.update →
  session.ready → captions → rubric hits → `attempt_protected_action`
  trip-wire → BREACH → `session.update` coach switch → spoken debrief →
  `session.end` → debrief page + JSON export.
- Replay mode (`?replay=1`) drives the identical reducer/UI from committed
  fixtures — labeled "REPLAY · recorded mock" banner throughout. Two CFO
  variants: `?replay=1` (breach) and `?replay=held` (held the line); both
  linked from the lobby card.
- Static-exportable replay verified: `PRETEXT_STATIC_EXPORT=1` +
  `scripts/build-static.sh` → `out/` serves lobby + replay + debrief with
  fixtures from /public on a plain static host (no server APIs needed).
- `submission/demo.mp4` (79s, 1920×1080) recorded via Playwright of the real
  UI — title/closing cards + persistent "mock agent / recorded replay — live
  AssemblyAI verification pending" banner via ffmpeg drawtext.
- No API keys or secrets anywhere in git history (`git log -p` grep clean —
  only env-var *names* appear).

## Implemented but NOT live-verified (needs `ASSEMBLYAI_API_KEY`)

- `GET /api/token` → real `GET /v1/token` mint (caps + limits are unit-tested).
- `npm run publish` → stored agents on `/v1/agents` + `agents.lock.json`.
- Real WS session against `wss://agents.assemblyai.com/v1/ws` (turn
  detection, keyterms, voice choices may need tuning per persona).
- `GET /api/session/[id]` → session history recording playback on debrief.
- `PRETEXT_EXPOSE_INLINE=1` inline-config path (default is 503
  `stored_agent_required` so the attacker playbook isn't shipped to trainees).

## Remaining steps for a human

1. Push to `github.com/sharonbasovich/pretext` (repo now exists, public,
   empty). Devin's git-manager proxy returns 403 on push — an org-level
   Devin↔GitHub integration issue (read works, write doesn't; zero repos in
   `git_list_repos`). Fallback: `git bundle create pretext.bundle --all`
   attached to reports — owner can `git clone pretext.bundle` and push.
2. Set `ASSEMBLYAI_API_KEY` in `.env`; run `npm run publish` (writes
   `agents.lock.json`, gitignored).
3. Deploy: `npx vercel --prod` with `ASSEMBLYAI_API_KEY` env (+ optional
   `PRETEXT_DAILY_SESSION_CAP`, `PRETEXT_DEMO_PASSCODE`,
   `PRETEXT_MAX_SESSION_SECONDS`). Do NOT set `PRETEXT_EXPOSE_INLINE`.
4. Run one real call per persona; capture real fixtures into
   `public/fixtures/` if better than the mock-derived ones.
5. Demo video: `submission/demo.mp4` exists (automated Playwright capture
   of replay + mock flows, clearly watermarked). For the real submission,
   record the scripted live run per `submission/video_script.md` once the
   API key is live — the automated file is the honest backup.
6. Fill the lablab.ai form: title/short/long/tags from `submission/`,
   `cover.png`, `slides.pdf`, repo URL, demo URL.
