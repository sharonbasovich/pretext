# Live verification runbook — ~20 minutes once `ASSEMBLYAI_API_KEY` exists

Everything below is pending. Nothing in this file has been run against
production AssemblyAI.

## 1. Configure (2 min)

```bash
cp .env.example .env
# set ASSEMBLYAI_API_KEY=... in .env (never commit it)
npm ci
```

`npm run publish` loads `.env` itself (`tsx --env-file-if-exists=.env`), so
plain `npm run publish` picks up the key — no manual `source .env` needed.
Real exported env vars still win if both are set.

Set `PRETEXT_DEMO_PASSCODE` before starting any live-key deployment: the live
token route fails closed without a nonempty value, regardless of NODE_ENV.
Optional public-demo guards:
`PRETEXT_DAILY_SESSION_CAP` (e.g. `40`) and
`PRETEXT_MAX_SESSION_SECONDS` (≤240 — the WS bills open time). Do **not** set
`PRETEXT_EXPOSE_INLINE` — that ships the attacker playbook to trainees.

## 2. Publish stored agents (1 min)

```bash
npm run publish   # creates/updates /v1/agents from agents/*.json → agents.lock.json
```

Expected: 4 agent ids written to `agents.lock.json` (gitignored) and a final
line `PRETEXT_AGENT_IDS={"helpdesk-pretext":"ag_...",...}` — copy that JSON
verbatim into the deployment env. If publish fails, `/api/agent-config`
returns 503 `stored_agent_required` by design — fix the key/publish instead
of exposing inline config.

For a cloud server, copy only the `agents` object into the server-side
`PRETEXT_AGENT_IDS` environment variable:

```bash
node -p "JSON.stringify(require('./agents.lock.json').agents)"
```

The output maps scenario slugs to stored agent IDs. Keep both this variable and
`ASSEMBLYAI_API_KEY` out of client-side `NEXT_PUBLIC_*` variables and source
control. Do not copy persona prompts into browser configuration.

## 3. Deploy (3 min)

```bash
npx vercel --prod   # server env: ASSEMBLYAI_API_KEY + PRETEXT_AGENT_IDS + PRETEXT_DEMO_PASSCODE
```

Or run locally: `npm run build && npm start`. First verify
`GET /api/agent-config/helpdesk-pretext` returns only a stored `agent_id` and
no API key or persona prompt. Use the private passcode header to verify that
`GET /api/token` mints a short-lived token with
`max_session_duration_seconds` ≤ 240; do not put the passcode in a URL or logs.

## 4. Diagnose configuration — `GET /api/status`

The uncached status endpoint returns booleans and the public scenario names,
never key material, the passcode, or stored agent IDs. `live_ready: true`
means the configuration prerequisites are present, **not** that a genuine
AssemblyAI call has succeeded. Check these fields before a live test:

| Field | If false or missing |
| --- | --- |
| `has_assemblyai_key` | Confirm the key is set for this deployment environment, then redeploy. |
| `passcode_configured` | Set `PRETEXT_DEMO_PASSCODE` privately, then redeploy; token minting fails closed without it. |
| `agent_ids.parse_ok` | Correct `PRETEXT_AGENT_IDS` JSON and redeploy. |
| `agent_ids.missing` | Publish/map the named personas and redeploy. |
| `mock` | Remove `PRETEXT_MOCK=1` for a genuine live run. |
| `expose_inline` | Remove `PRETEXT_EXPOSE_INLINE=1`; never ship persona prompts to the browser. |

`commit` and `vercel_env` identify which code and environment answered. If
`/api/status` is 404, the deployment predates this endpoint. If the fields
look correct yet the token or voice session fails, inspect the upstream
response and function logs; status does not validate the key or billing.

## 5. Live calls — 3 per scenario, ≤240s each (~10 min)

For each of `helpdesk-pretext`, `billing-dispute`, `elderly-bilingual`,
`vendor-bec` — run one breach-line call, one held-line call, one sloppy call:

| Check | Pass |
| --- | --- |
| Persona holds character (no "I'm an AI") | yes/no |
| Trip-wire fires exactly on the giveaway | `attempt_protected_action` args correct |
| Coach switch | post-verdict `session.update` speaks in same voice |
| STT accuracy on names/digits | keyterms catching "Whitfield", acct digits |
| Turn detection | barge-in vs patience per persona |

## 6. Numbers to capture (from each debrief page / `/api/session/[id]`)

- greeting time-to-first-audio (`greeting_ttfb_ms`)
- reply latency p50/p95 (`wait_user_audio_ms` series)
- talk ratio, trainee interruptions, max dead air
- `GET /v1/sessions/{id}`: confirm recording + timeline playback on /debrief

Paste the numbers into `submission/SUBMISSION_STATUS.md`.

## 7. Re-record the demo against live (~4 min)

The automated recorder drives the real UI with a fake mic. For a live run,
feed the trainee's scripted lines (see `submission/video_script.md`) as the
fake-mic WAV (generate with `espeak-ng`/`sox` per line, concatenate with
pauses), then:

```bash
APP_URL=http://localhost:3100 npm run demo:record   # live path — no ?replay=
npm run demo:video                                  # swap banner text to live
npm run demo:record:short && npm run demo:video:short
```

Update `scripts/demo-video.sh` banner text once live (drop "verification
pending"). Keep the raw webm out of git (`submission/demo-raw/` is ignored).

## 8. Doc flips — "pending" → "verified"

- `README.md` — Status section: live paths → verified; remove the caption
  under `docs/demo.gif`.
- `submission/SUBMISSION_STATUS.md` — move token/publish/session-history
  lines from "NOT live-verified" to "Verified"; paste latency numbers.
- `submission/long_description.md` — rewrite the Verification status
  paragraph.
- `submission/slides.md` — check off the "Live AssemblyAI verification plan"
  slide items, drop the PENDING label; `npm run slides`.
- `docs/demo.gif` — regenerate from the live demo_short.mp4.
