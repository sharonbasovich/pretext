/**
 * Voice Agent API wire protocol types, modelled after
 * https://www.assemblyai.com/docs/voice-agents/voice-agent-api/events-reference
 *
 * The mock server and the replay fixtures speak exactly this protocol so the
 * whole client stack is exercised identically live, mocked, and replayed.
 */

// ---------------------------------------------------------------------------
// Client -> Server
// ---------------------------------------------------------------------------

export interface SessionUpdateMessage {
  type: "session.update";
  session: SessionConfig;
}

export interface SessionConfig {
  /** Stored agent binding. First session.update only; mutually exclusive with inline fields. */
  agent_id?: string;
  system_prompt?: string;
  greeting?: string;
  input?: {
    format?: { encoding?: "audio/pcm" | "audio/pcmu" | "audio/pcma"; sample_rate?: number };
    keyterms?: string[] | null;
    turn_detection?: {
      vad_threshold?: number;
      min_silence?: number;
      max_silence?: number;
      interrupt_response?: boolean;
      interruption_delay?: number;
    };
    transcription_mode?: "min_latency" | "balanced" | "max_accuracy";
    transcription_prompt?: string;
    language_codes?: string[];
    voice_focus?: "near-field" | "far-field";
    voice_focus_threshold?: number;
  };
  output?: {
    voice?: string;
    format?: { encoding?: "audio/pcm" | "audio/pcmu" | "audio/pcma"; sample_rate?: number };
    volume?: number;
  };
  tools?: FunctionTool[];
}

export interface FunctionTool {
  type: "function";
  name: string;
  description: string;
  parameters?: JsonSchemaObject;
  execution_mode?: "interactive" | "hold";
  timeout_seconds?: number;
}

export interface JsonSchemaObject {
  type: "object";
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
  [key: string]: unknown;
}

export interface JsonSchemaProperty {
  type?: string;
  description?: string;
  enum?: string[];
  examples?: unknown[];
  pattern?: string;
  format?: string;
  [key: string]: unknown;
}

export interface InputAudioMessage {
  type: "input.audio";
  /** base64-encoded PCM16 mono 24kHz */
  audio: string;
}

export interface SessionResumeMessage {
  type: "session.resume";
  session_id: string;
}

export interface SessionEndMessage {
  type: "session.end";
}

export interface ToolResultMessage {
  type: "tool.result";
  call_id: string;
  /** JSON string */
  result: string;
  is_error?: boolean;
}

export interface ReplyCreateMessage {
  type: "reply.create";
  instructions?: string;
}

export interface ConversationMessage {
  type: "conversation.message";
  role: "user" | "system";
  content: string;
}

export type ClientMessage =
  | SessionUpdateMessage
  | InputAudioMessage
  | SessionResumeMessage
  | SessionEndMessage
  | ToolResultMessage
  | ReplyCreateMessage
  | ConversationMessage;

// ---------------------------------------------------------------------------
// Server -> Client
// ---------------------------------------------------------------------------

export interface SessionReadyEvent {
  type: "session.ready";
  session_id: string;
  expires_at?: number;
  resume_token?: string;
  config?: Record<string, unknown>;
}

export interface SessionUpdatedEvent {
  type: "session.updated";
  config?: Record<string, unknown>;
}

export interface SessionEndedEvent {
  type: "session.ended";
  session_duration_seconds?: number;
  audio_duration_seconds?: number | null;
  timestamp?: number;
}

export interface InputSpeechStartedEvent {
  type: "input.speech.started";
}

export interface InputSpeechStoppedEvent {
  type: "input.speech.stopped";
}

export interface TranscriptUserDeltaEvent {
  type: "transcript.user.delta";
  item_id: string;
  /** The full transcript so far for this item — NOT an incremental chunk. */
  text: string;
}

export interface TranscriptUserEvent {
  type: "transcript.user";
  text: string;
  item_id?: string;
}

export interface ReplyStartedEvent {
  type: "reply.started";
  reply_id?: string;
  item_id?: string;
}

export interface ReplyAudioEvent {
  type: "reply.audio";
  /** base64-encoded PCM16 mono 24kHz */
  data: string;
}

export interface TranscriptAgentDeltaEvent {
  type: "transcript.agent.delta";
  reply_id?: string;
  item_id?: string;
  delta: string;
  start_ms?: number | null;
  end_ms?: number | null;
}

export interface TranscriptAgentEvent {
  type: "transcript.agent";
  text: string;
  reply_id?: string;
  item_id?: string;
  interrupted?: boolean;
}

export interface ReplyDoneEvent {
  type: "reply.done";
  reply_id?: string;
  status: "completed" | "interrupted";
}

export interface ToolCallEvent {
  type: "tool.call";
  call_id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface SessionErrorEvent {
  type: "session.error";
  code: string;
  message: string;
  timestamp?: string;
  param?: string;
}

export type ServerEvent =
  | SessionReadyEvent
  | SessionUpdatedEvent
  | SessionEndedEvent
  | InputSpeechStartedEvent
  | InputSpeechStoppedEvent
  | TranscriptUserDeltaEvent
  | TranscriptUserEvent
  | ReplyStartedEvent
  | ReplyAudioEvent
  | TranscriptAgentDeltaEvent
  | TranscriptAgentEvent
  | ReplyDoneEvent
  | ToolCallEvent
  | SessionErrorEvent;

export type ServerEventType = ServerEvent["type"];

/** Errors that can be retried per the docs (reconnect with backoff). */
export const RETRYABLE_ERROR_CODES = new Set([
  "at_capacity",
  "concurrency_exceeded",
  "internal_error",
]);
