/**
 * Generates e2e/assets/fake-mic.wav — a mono 8kHz PCM16 WAV of gentle
 * amplitude-modulated tone bursts with pauses. Chrome's
 * --use-file-for-fake-audio-capture feeds it as mic input; the mock only needs
 * sustained non-silent audio to open its wait_user_audio gates.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const OUT = path.join(process.cwd(), "e2e", "assets", "fake-mic.wav");
const RATE = 8000;
const SECONDS = 120;
const samples = new Int16Array(RATE * SECONDS);

// Speech-like bursts: 300ms tone + 150ms pause, 220Hz fundamental.
const burst = Math.floor(RATE * 0.3);
const pause = Math.floor(RATE * 0.15);
let i = 0;
let phase = 0;
while (i < samples.length) {
  for (let b = 0; b < burst && i < samples.length; b++, i++) {
    phase += (2 * Math.PI * 220) / RATE;
    const env = Math.sin((Math.PI * b) / burst);
    samples[i] = Math.floor(12000 * env * Math.sin(phase));
  }
  for (let p = 0; p < pause && i < samples.length; p++, i++) {
    samples[i] = 0;
  }
}

const dataSize = samples.length * 2;
const buf = Buffer.alloc(44 + dataSize);
buf.write("RIFF", 0);
buf.writeUInt32LE(36 + dataSize, 4);
buf.write("WAVE", 8);
buf.write("fmt ", 12);
buf.writeUInt32LE(16, 16);
buf.writeUInt16LE(1, 20); // PCM
buf.writeUInt16LE(1, 22); // mono
buf.writeUInt32LE(RATE, 24);
buf.writeUInt32LE(RATE * 2, 28);
buf.writeUInt16LE(2, 32);
buf.writeUInt16LE(16, 34);
buf.write("data", 36);
buf.writeUInt32LE(dataSize, 40);
Buffer.from(samples.buffer).copy(buf, 44);

mkdirSync(path.dirname(OUT), { recursive: true });
writeFileSync(OUT, buf);
console.log(`wrote ${OUT} (${SECONDS}s, ${(buf.length / 1024).toFixed(0)} KiB)`);
