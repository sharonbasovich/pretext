# Submission status — Pretext

Internal tracker for what is verified and what remains for a human to finish.
Last updated: 2026-09-25. Nothing here claims registration or submission —
the coordinator handles that.

## Verified (against the bundled mock agent — real WS wire protocol)

- Lint (0 warnings), `tsc --noEmit`, 39/39 Vitest unit tests, `npm run build`
  — re-run green from a clean clone (`git clone` → `npm ci`).
- Playwright E2E ×3 (chromium, fake mic): live-mock call → BREACH → coach →
  debrief + export; vendor-BEC replay → HELD THE LINE; lobby rendering.
  Videos recorded per run.
- Mock-first call flow: token route → WS connect → session.update →
  session.ready → captions → rubric hits → `attempt_protected_action`
  trip-wire → BREACH → `session.update` coach switch → spoken debrief →
  `session.end` → debrief page + JSON export.
- Replay mode (`?replay=1`) drives the identical reducer/UI from committed
  fixtures — labeled "REPLAY (recorded)".
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

1. Create empty public repo `github.com/sharonbasovich/pretext` (MIT) —
   local `main` has all commits; `git push -u origin main` (currently 403).
2. Set `ASSEMBLYAI_API_KEY` in `.env`; run `npm run publish` (writes
   `agents.lock.json`, gitignored).
3. Deploy: `npx vercel --prod` with `ASSEMBLYAI_API_KEY` env (+ optional
   `PRETEXT_DAILY_SESSION_CAP`, `PRETEXT_DEMO_PASSCODE`,
   `PRETEXT_MAX_SESSION_SECONDS`). Do NOT set `PRETEXT_EXPOSE_INLINE`.
4. Run one real call per persona; capture real fixtures into
   `public/fixtures/` if better than the mock-derived ones.
5. Record the ≤3 min demo video per `submission/video_script.md`
   (exact trainee lines included); keep the automated Playwright run
   labeled as automated if used as backup.
6. Fill the lablab.ai form: title/short/long/tags from `submission/`,
   `cover.png`, `slides.pdf`, repo URL, demo URL.
