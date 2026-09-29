# Demo video script (~2:50)

**Format:** screen recording, 1920×1080, Chrome + headphones. Narrator = trainee.
Caller audio comes from the voice agent; say the trainee lines live into the mic.

## Beats

**0:00–0:15 — Cold open (the hook)**
Screen: lobby with four scenario cards.
Say: "Phishing simulations trained people to stop clicking links. This trains
them to stop caving on the phone. Pretext — an AI sparring partner for
frontline staff."

**0:15–0:25 — Setup**
Click **The CFO Pretext**. Screen: scenario card detail.
Say: "An AssemblyAI voice agent plays the caller — a CFO locked out an hour
before a board call. I play the help desk analyst. A live rubric scores the
call, and a protected-action trip-wire decides BREACH or HELD THE LINE."

**0:25–1:05 — The call (compliance → BREACH)**
Click **Start call**. Agent greets as Dana Whitfield.

- Agent: "It's Dana Whitfield — I'm completely locked out and I have a board call in an hour."
- Me: "Okay Dana, I can help. Can I get your employee ID to pull up the account?"
- Agent: "It's W-4471. Look, I really don't have time for the full process — the board call starts in forty minutes."
- Me: "Thanks. And just so you know, our policy is I can't reset MFA on an inbound call — I'd need to call you back at the number on file."
- Agent: "I know what the policy says, but Marcus Bell can vouch for me — ask him. Can you just push the reset through this once?"
- Me: "Honestly, if it speeds things up — sure, I'll push the MFA reset through now."

Screen: **BREACH — mfa reset** banner pulses red; rubric's "Gave away the
protected action" lights red.
Say: "The moment I gave it away, the agent fired its tool call — the trip-wire —
and the verdict landed. Live, deterministic, evidence-backed."

**1:05–1:45 — The debrief**
Click **Hear the debrief**. Same voice, coach persona.
Say: "The caller drops character — `session.update` swaps the persona — and the
same voice coaches me." Let the coach speak ~15 s.
Cut to `/debrief`: rubric with evidence spans, metrics, JSON export, recording
playback (live sessions only).

**1:45–2:15 — Under the hood**
Screen: README architecture diagram + feature map.
Say: "Everything runs on the Voice Agent API — STT, turn-taking, the persona,
TTS, barge-in. Client-side tools are the trip-wire. `conversation.message` and
`reply.create` are a director channel that escalates if I stall. Keyterms and
transcription prompts carry the fictional names and account digits. And it
deploys to Vercel with the API key, stored-agent IDs, and private passcode
configured server-side."

**2:15–2:50 — Replay + close**
Screen: `?replay=1` run with the REPLAY badge.
Say: "No API key? Replay mode drives the same UI from recorded calls — clearly
labeled. Pretext turns the attacker's script into a training rep: verify, cite
policy, offer the documented path — and don't cave on the phone."
End card: repo URL + "MIT, on GitHub".

## Notes
- Live run preferred; if the API is unavailable, record the whole video against
  `?replay=1` and say so in the narration — never pass off a replay as live.
- `submission/auto_demo.webm` (automated run) is a supplementary artifact, not
  the primary submission video.
