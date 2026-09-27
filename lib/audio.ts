/**
 * Browser audio engine: mic capture to PCM16@24kHz chunks (AudioWorklet) and
 * sequential PCM16@24kHz playback with flush-on-interrupt, per the Voice Agent
 * browser-integration docs.
 *
 * - Chrome/Edge/Firefox honor AudioContext({sampleRate:24000}) so frames arrive
 *   already at the target rate; Safari ignores it, so the engine resamples on
 *   the main thread when ctx.sampleRate !== 24000.
 * - Echo cancellation ON, noise suppression OFF (per docs).
 */

import { withBase } from "./basePath";

export const TARGET_RATE = 24000;

export type PcmChunkHandler = (pcm16: Int16Array) => void;

export function resampleLinear(pcm: Int16Array, fromRate: number, toRate: number): Int16Array {
  if (fromRate === toRate) return pcm;
  const ratio = fromRate / toRate;
  const out = new Int16Array(Math.floor(pcm.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const src = i * ratio;
    const a = Math.floor(src);
    const b = Math.min(a + 1, pcm.length - 1);
    const t = src - a;
    out[i] = pcm[a] + (pcm[b] - pcm[a]) * t;
  }
  return out;
}

export function pcm16ToBase64(pcm: Int16Array): string {
  const bytes = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

export function base64ToPcm16(b64: string): Int16Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Int16Array(bytes.buffer);
}

export class MicCapture {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private node: AudioWorkletNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;

  async start(onChunk: PcmChunkHandler, onLevel?: (level: number) => void): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: false, channelCount: 1 },
    });
    let ctx: AudioContext;
    try {
      ctx = new AudioContext({ sampleRate: TARGET_RATE });
    } catch {
      ctx = new AudioContext();
    }
    this.ctx = ctx;
    const rate = ctx.sampleRate;
    await ctx.audioWorklet.addModule(withBase("/pcm-capture-worklet.js"));
    this.source = ctx.createMediaStreamSource(this.stream);
    this.node = new AudioWorkletNode(ctx, "pcm-capture");
    this.node.port.onmessage = (ev: MessageEvent<ArrayBuffer>) => {
      const pcm = new Int16Array(ev.data);
      if (onLevel) {
        let peak = 0;
        for (let i = 0; i < pcm.length; i += 8) {
          const a = Math.abs(pcm[i]);
          if (a > peak) peak = a;
        }
        onLevel(Math.min(1, peak / 0x8000));
      }
      onChunk(rate === TARGET_RATE ? pcm : resampleLinear(pcm, rate, TARGET_RATE));
    };
    this.source.connect(this.node);
    this.node.connect(ctx.destination); // required on some browsers to keep the worklet running
    if (ctx.state === "suspended") await ctx.resume();
  }

  stop() {
    this.node?.disconnect();
    this.source?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    void this.ctx?.close();
    this.node = null;
    this.source = null;
    this.stream = null;
    this.ctx = null;
  }
}

export class PcmPlayer {
  private ctx: AudioContext | null = null;
  private nextStart = 0;
  private active: AudioBufferSourceNode[] = [];

  private createCtx(): AudioContext {
    try {
      return new AudioContext({ sampleRate: TARGET_RATE });
    } catch {
      return new AudioContext();
    }
  }

  /** Create and resume the AudioContext inside the user's click gesture so
   * autoplay policy allows playback. Call from the same handler that opens
   * the WebSocket — never lazily on first audio. */
  async prime(): Promise<void> {
    if (!this.ctx || this.ctx.state === "closed") this.ctx = this.createCtx();
    if (this.ctx.state === "suspended") await this.ctx.resume();
  }

  private ensureCtx(): AudioContext {
    if (!this.ctx || this.ctx.state === "closed") this.ctx = this.createCtx();
    return this.ctx;
  }

  /** Append a base64 PCM16@24kHz chunk to the playback queue. */
  enqueue(base64: string) {
    const ctx = this.ensureCtx();
    // Fallback for contexts that ended up suspended despite prime().
    if (ctx.state === "suspended") void ctx.resume();
    const pcm = base64ToPcm16(base64);
    // If the context runs at another rate (Safari), resample to it.
    const data = ctx.sampleRate === TARGET_RATE ? pcm : resampleLinear(pcm, TARGET_RATE, ctx.sampleRate);
    const playBuf = ctx.createBuffer(1, data.length, ctx.sampleRate);
    playBuf.getChannelData(0).set(intToFloat(data));
    const src = ctx.createBufferSource();
    src.buffer = playBuf;
    src.connect(ctx.destination);
    const now = ctx.currentTime;
    this.nextStart = Math.max(this.nextStart, now + 0.02);
    src.start(this.nextStart);
    this.nextStart += playBuf.duration;
    this.active.push(src);
    src.onended = () => {
      this.active = this.active.filter((s) => s !== src);
    };
  }

  /** Drop everything queued/playing — called when the reply is interrupted. */
  flush() {
    for (const s of this.active) {
      try {
        s.stop();
      } catch {
        /* already stopped */
      }
    }
    this.active = [];
    this.nextStart = 0;
  }

  async close() {
    this.flush();
    await this.ctx?.close();
    this.ctx = null;
  }
}

function intToFloat(pcm: Int16Array): Float32Array {
  const out = new Float32Array(pcm.length);
  for (let i = 0; i < pcm.length; i++) out[i] = pcm[i] / 0x8000;
  return out;
}
