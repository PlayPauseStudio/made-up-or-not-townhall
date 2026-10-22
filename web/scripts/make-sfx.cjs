/**
 * Synthesises the show's sound effects from scratch — no samples from anywhere
 * else — and writes them to public/sfx/*.wav (mono, 16-bit, 32 kHz).
 *
 *   node scripts/make-sfx.cjs
 *
 * Tweak a cue below and re-run to regenerate. Each cue is a function that
 * returns its samples (floats, -1..1); everything is normalised on write.
 */
const fs = require('fs');
const path = require('path');

const SR = 32000;
const OUT = path.join(__dirname, '..', 'public', 'sfx');

// ── Building blocks ──────────────────────────────────────────────────────────

const buf = (sec) => new Float32Array(Math.round(sec * SR));
const TAU = Math.PI * 2;
const note = (n) => 440 * Math.pow(2, (n - 69) / 12); // MIDI note → Hz

/** Seeded noise, so every regeneration gives the same files. */
let seed = 12345;
const noise = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return (seed / 4294967296) * 2 - 1;
};

/** Attack / exponential-decay envelope. */
const env = (t, attack, decay) => (t < attack ? t / attack : Math.exp(-(t - attack) / decay));

/** Add a tone into `out` at `start` seconds. `harm` = [[multiple, gain], …] partials. */
function tone(out, start, dur, freq, { gain = 1, attack = 0.005, decay = 0.3, harm = [[1, 1]], glide = 0, vibrato = 0 } = {}) {
  const s0 = Math.round(start * SR);
  const n = Math.round(dur * SR);
  const phases = harm.map(() => 0);
  for (let i = 0; i < n && s0 + i < out.length; i++) {
    const t = i / SR;
    const f = freq * (1 + glide * (t / dur)) * (1 + vibrato * Math.sin(TAU * 5.5 * t));
    let v = 0;
    harm.forEach(([m, g], k) => {
      phases[k] += (TAU * f * m) / SR;
      v += g * Math.sin(phases[k]);
    });
    // Short fade at the very end so nothing clicks.
    const tail = Math.min(1, (n - i) / (0.01 * SR));
    out[s0 + i] += gain * env(t, attack, decay) * v * tail;
  }
}

/** Filtered noise burst. `lp` / `hp` are one-pole cutoffs in Hz (0 = off). */
function hiss(out, start, dur, { gain = 1, attack = 0.002, decay = 0.1, lp = 0, hp = 0, sweep = null } = {}) {
  const s0 = Math.round(start * SR);
  const n = Math.round(dur * SR);
  let low = 0;
  let prevIn = 0;
  let high = 0;
  for (let i = 0; i < n && s0 + i < out.length; i++) {
    const t = i / SR;
    let x = noise();
    const cut = sweep ? sweep[0] * Math.pow(sweep[1] / sweep[0], t / dur) : lp;
    if (cut) {
      const a = 1 - Math.exp((-TAU * cut) / SR);
      low += a * (x - low);
      x = low;
    }
    if (hp) {
      const a = Math.exp((-TAU * hp) / SR);
      high = a * (high + x - prevIn);
      prevIn = x;
      x = high;
    }
    const tail = Math.min(1, (n - i) / (0.01 * SR));
    out[s0 + i] += gain * env(t, attack, decay) * x * tail;
  }
}

/** A small room: a few feedback combs plus an all-pass, mixed under the dry signal. */
function reverb(dry, mix = 0.25, size = 1) {
  const out = new Float32Array(dry.length);
  const combs = [1557, 1617, 1491, 1422].map((d) => ({ d: Math.round(d * size * (SR / 44100)), fb: 0.78, buf: null, i: 0 }));
  combs.forEach((c) => (c.buf = new Float32Array(c.d)));
  const ap = { d: Math.round(225 * (SR / 44100)), buf: null, i: 0 };
  ap.buf = new Float32Array(ap.d);
  for (let n = 0; n < dry.length; n++) {
    let wet = 0;
    for (const c of combs) {
      const y = c.buf[c.i];
      c.buf[c.i] = dry[n] + y * c.fb;
      c.i = (c.i + 1) % c.d;
      wet += y;
    }
    wet /= combs.length;
    const b = ap.buf[ap.i];
    const y = -wet + b;
    ap.buf[ap.i] = wet + b * 0.5;
    ap.i = (ap.i + 1) % ap.d;
    out[n] = dry[n] + mix * y;
  }
  return out;
}

// Timbres (partials).
const BELL = [[1, 1], [2.01, 0.45], [3.02, 0.22], [4.17, 0.12], [5.43, 0.06]];
const BRASS = [[1, 1], [2, 0.7], [3, 0.5], [4, 0.35], [5, 0.25], [6, 0.15], [7, 0.1]];
const SQUAREISH = [[1, 1], [3, 0.33], [5, 0.2], [7, 0.14], [9, 0.11], [11, 0.09]];
const SOFT = [[1, 1], [2, 0.25], [3, 0.08]];

// ── Cues ─────────────────────────────────────────────────────────────────────

const cues = {
  /** A square is picked: bright two-note "ding-ding" with a shimmer. */
  select() {
    const o = buf(1.3);
    tone(o, 0, 1.1, note(88), { gain: 0.5, decay: 0.35, harm: BELL });
    tone(o, 0.11, 1.1, note(95), { gain: 0.55, decay: 0.45, harm: BELL });
    hiss(o, 0, 0.5, { gain: 0.05, decay: 0.15, hp: 6000 });
    return reverb(o, 0.3);
  },

  /** The team's X / O lands on the square: a punchy stamp. */
  mark() {
    const o = buf(0.7);
    tone(o, 0, 0.35, 140, { gain: 1, attack: 0.001, decay: 0.09, glide: -0.6 });
    hiss(o, 0, 0.08, { gain: 0.5, attack: 0.0005, decay: 0.02, lp: 3500 });
    tone(o, 0.01, 0.5, note(76), { gain: 0.35, decay: 0.12, harm: SOFT });
    tone(o, 0.01, 0.5, note(83), { gain: 0.25, decay: 0.12, harm: SOFT });
    return reverb(o, 0.2, 0.7);
  },

  /** The question goes up (and the correct answer after a wrong one): rising whoosh into a soft chord. */
  reveal() {
    const o = buf(1.8);
    hiss(o, 0, 0.6, { gain: 0.5, attack: 0.45, decay: 0.06, sweep: [400, 6000] });
    tone(o, 0, 0.6, note(55), { gain: 0.25, attack: 0.4, decay: 0.08, glide: 1, harm: SOFT });
    for (const n of [72, 76, 79, 84]) tone(o, 0.52, 1.25, note(n), { gain: 0.22, attack: 0.01, decay: 0.45, harm: BELL });
    return reverb(o, 0.35);
  },

  /** An answer is locked: a quick two-tone "bloop-blip". */
  lock() {
    const o = buf(0.6);
    tone(o, 0, 0.18, note(74), { gain: 0.6, attack: 0.002, decay: 0.06, harm: SOFT, glide: -0.15 });
    tone(o, 0.09, 0.35, note(81), { gain: 0.6, attack: 0.002, decay: 0.1, harm: SOFT });
    return reverb(o, 0.2, 0.6);
  },

  /** Right answer: rising major arpeggio of bells into a ringing chord. */
  right() {
    const o = buf(2.2);
    [72, 76, 79, 84].forEach((n, i) => tone(o, i * 0.09, 1.6, note(n), { gain: 0.42, decay: 0.5, harm: BELL }));
    for (const n of [60, 67, 72, 76, 79, 84, 88]) tone(o, 0.36, 1.8, note(n), { gain: 0.14, attack: 0.01, decay: 0.7, harm: BELL });
    hiss(o, 0.36, 1.2, { gain: 0.06, decay: 0.4, hp: 7000 });
    return reverb(o, 0.35);
  },

  /** Wrong answer: a low, dissonant two-pulse buzzer. */
  wrong() {
    const o = buf(1.0);
    for (const [start, dur] of [[0, 0.22], [0.27, 0.6]]) {
      tone(o, start, dur, 98, { gain: 0.5, attack: 0.005, decay: 2, harm: SQUAREISH });
      tone(o, start, dur, 104, { gain: 0.45, attack: 0.005, decay: 2, harm: SQUAREISH });
    }
    return reverb(o, 0.12, 0.6);
  },

  /** Coin in the air: a snare roll that builds for three seconds. */
  drumroll() {
    const o = buf(3.1);
    const len = 3.0;
    let t = 0;
    let k = 0;
    while (t < len) {
      const p = t / len;
      const g = 0.18 + 0.7 * p * p; // crescendo
      hiss(o, t, 0.06, { gain: g * (k % 2 ? 0.8 : 1), attack: 0.001, decay: 0.018, hp: 1200, lp: 0 });
      tone(o, t, 0.05, 190, { gain: g * 0.25, attack: 0.001, decay: 0.015 });
      t += 1 / (16 + 10 * p); // speeds up
      k++;
    }
    tone(o, 0, len, 55, { gain: 0.15, attack: 1.5, decay: 4 }); // low rumble underneath
    return reverb(o, 0.18, 0.8);
  },

  /** Coin lands: cymbal crash with a bright chord hit. */
  land() {
    const o = buf(2.4);
    hiss(o, 0, 2.3, { gain: 0.5, attack: 0.002, decay: 0.7, hp: 4000 });
    tone(o, 0, 0.3, 80, { gain: 0.8, attack: 0.001, decay: 0.1, glide: -0.4 });
    for (const n of [60, 64, 67, 72]) tone(o, 0, 1.6, note(n), { gain: 0.2, attack: 0.005, decay: 0.45, harm: BRASS });
    return reverb(o, 0.3);
  },

  /** The row line strikes through the board: a fast rising zap. */
  line() {
    const o = buf(0.9);
    tone(o, 0, 0.45, note(60), { gain: 0.35, attack: 0.01, decay: 0.3, glide: 2, harm: SOFT });
    hiss(o, 0, 0.45, { gain: 0.35, attack: 0.3, decay: 0.05, sweep: [800, 9000] });
    tone(o, 0.4, 0.45, note(96), { gain: 0.2, decay: 0.15, harm: BELL });
    return reverb(o, 0.3);
  },

  /** Completed row, final scores: brass fanfare into a big chord with a cymbal. */
  win() {
    const o = buf(3.4);
    const fan = [
      [0, 67, 0.14], [0.15, 67, 0.14], [0.3, 67, 0.14], [0.45, 72, 0.5],
      [1.0, 76, 0.2], [1.22, 79, 1.9],
    ];
    for (const [t, n, d] of fan) tone(o, t, d + 0.15, note(n), { gain: 0.35, attack: 0.02, decay: d * 1.5 + 0.1, harm: BRASS, vibrato: d > 1 ? 0.004 : 0 });
    for (const n of [48, 55, 60, 64, 67, 72]) tone(o, 1.22, 2.1, note(n), { gain: 0.13, attack: 0.03, decay: 1.1, harm: BRASS });
    hiss(o, 1.22, 2.1, { gain: 0.3, attack: 0.002, decay: 0.8, hp: 5000 });
    tone(o, 1.22, 0.4, 70, { gain: 0.7, attack: 0.001, decay: 0.15, glide: -0.4 });
    return reverb(o, 0.35, 1.2);
  },

  /** The red Big X: a harsh, pulsing buzzer. */
  bigx() {
    const o = buf(1.3);
    const s0 = 0;
    const n = Math.round(1.2 * SR);
    let p1 = 0;
    let p2 = 0;
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      p1 += (TAU * 87) / SR;
      p2 += (TAU * 131) / SR;
      // Hard-clipped saw-ish tones, chopped at 12 Hz.
      const v = Math.tanh(3 * (Math.sin(p1) + 0.6 * Math.sin(2 * p1) + 0.7 * Math.sin(p2)));
      const chop = 0.65 + 0.35 * Math.sign(Math.sin(TAU * 12 * t));
      const tail = Math.min(1, (n - i) / (0.03 * SR));
      o[s0 + i] += 0.5 * v * chop * Math.min(1, t / 0.005) * tail;
    }
    return reverb(o, 0.1, 0.5);
  },
};

// ── Write ────────────────────────────────────────────────────────────────────

function wav(samples) {
  let peak = 0;
  for (const v of samples) peak = Math.max(peak, Math.abs(v));
  const scale = peak ? 0.89 / peak : 1; // about -1 dBFS
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((v, i) => data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(v * scale * 32767))), i * 2));
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + data.length, 4);
  h.write('WAVE', 8);
  h.write('fmt ', 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); // PCM
  h.writeUInt16LE(1, 22); // mono
  h.writeUInt32LE(SR, 24);
  h.writeUInt32LE(SR * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write('data', 36);
  h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

fs.mkdirSync(OUT, { recursive: true });
for (const [name, make] of Object.entries(cues)) {
  const file = path.join(OUT, name + '.wav');
  const bytes = wav(make());
  fs.writeFileSync(file, bytes);
  console.log(name.padEnd(9), (bytes.length / 1024).toFixed(0).padStart(4), 'KB');
}
