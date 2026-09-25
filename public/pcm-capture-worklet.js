/**
 * PCM capture worklet: receives Float32 mic frames at the AudioContext rate
 * (24 kHz where supported), converts to little-endian PCM16, and posts
 * ArrayBuffer chunks to the main thread.
 */
class PcmCapture extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0] || input[0].length === 0) return true;
    const ch = input[0];
    const out = new Int16Array(ch.length);
    for (let i = 0; i < ch.length; i++) {
      const s = Math.max(-1, Math.min(1, ch[i]));
      out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    this.port.postMessage(out.buffer, [out.buffer]);
    return true;
  }
}
registerProcessor("pcm-capture", PcmCapture);
