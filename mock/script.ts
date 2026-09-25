/**
 * Mock-script schema. A script is a deterministic screenplay the mock agent
 * plays against a real client: scripted trainee turns (so tests need no
 * speech recognition), scripted agent replies, scripted tool calls, and a
 * scripted coach debrief.
 */

export interface MockToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface MockTurn {
  /** Pause before this beat, ms. */
  wait_ms?: number;
  /** Wait until this many ms of PCM audio have arrived from the client. */
  wait_user_audio_ms?: number;
  /** Emit a synthetic trainee utterance (input.speech.* + transcript.user). */
  user?: string;
  /** Emit an agent reply for this text (reply.* + transcript.agent.*). */
  agent?: string;
  /** Emit a tool.call wrapped in its own reply turn (docs-correct flush shape). */
  tool_call?: MockToolCall;
}

export interface MockScript {
  scenario: string;
  /** Spoken greeting emitted right after session.ready. */
  greeting_text: string;
  /** Main call script. */
  turns: MockTurn[];
  /** Coach-mode replies: emitted one per reply.create after the coach switch. */
  coach_turns: string[];
}
