# Demo checklist

- [ ] Chrome (recommended; Firefox/Safari work but may need resampling)
- [ ] Headphones plugged in (echo cancellation off-mic without them)
- [ ] `ASSEMBLYAI_API_KEY` set on the deployment
- [ ] `PRETEXT_DEMO_PASSCODE` set if the demo is public — keep it on a card at the podium
- [ ] `PRETEXT_DAILY_SESSION_CAP` tuned for the audience size
- [ ] Warm up: run one mock call locally (`npm run mock` + `PRETEXT_MOCK=1 npm run dev`)
- [ ] Fallback ready: if the API is down, run every scenario via `?replay=1` — say "Replay (recorded)" out loud
- [ ] Show the trip-wire: let the caller push you past your comfort — say "sure, I'll push it through" to trigger BREACH
- [ ] After the verdict: click **Hear the debrief** — the same voice switches to coach
- [ ] End with `/debrief` — rubric evidence spans, metrics, JSON export, recording playback (live only)
