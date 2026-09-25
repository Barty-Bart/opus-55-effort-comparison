// Procedurally synthesized sound effects and a generative medieval soundtrack (WebAudio).

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.sfxVol = 0.7;
    this.musicVol = 0.45;
    this.muted = false;
    this.last = {};
    this.active = 0;
    this.plucks = new Map();
    this.musicOn = true;
    this.nextBeat = 0;
    this.beat = 0;
  }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 1;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    this.master.connect(comp); comp.connect(ctx.destination);
    this.sfx = ctx.createGain(); this.sfx.gain.value = this.sfxVol; this.sfx.connect(this.master);
    this.music = ctx.createGain(); this.music.gain.value = this.musicVol * 0.5; this.music.connect(this.master);
    // shared noise buffer
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // reverb-ish bus for music
    this.verb = ctx.createConvolver();
    const ir = ctx.createBuffer(2, ctx.sampleRate * 2.2, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const ch = ir.getChannelData(c);
      for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / ch.length, 3);
    }
    this.verb.buffer = ir;
    const vg = ctx.createGain(); vg.gain.value = 0.35;
    this.verb.connect(vg); vg.connect(this.music);
    this.musicTimer = setInterval(() => this.scheduleMusic(), 120);
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 1, this.ctx.currentTime, 0.05);
  }
  setSfxVolume(v) { this.sfxVol = v; if (this.sfx) this.sfx.gain.value = v; }
  setMusicVolume(v) { this.musicVol = v; if (this.music) this.music.gain.setTargetAtTime(v * 0.5, this.ctx.currentTime, 0.1); }

  // ---------------------------------------------------------------- primitives
  env(g, t, a, peak, dec, sus = 0.0001) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, sus), t + a + dec);
  }
  osc(type, freq, t, dur, vol, dest, opts = {}) {
    const c = this.ctx;
    const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (opts.to) o.frequency.exponentialRampToValueAtTime(opts.to, t + (opts.slide || dur));
    const g = c.createGain();
    this.env(g, t, opts.a || 0.005, vol, dur);
    let node = o;
    if (opts.filter) { const f = c.createBiquadFilter(); f.type = opts.filter; f.frequency.value = opts.ff || 1000; f.Q.value = opts.q || 1; o.connect(f); node = f; }
    node.connect(g); g.connect(dest || this.sfx);
    o.start(t); o.stop(t + (opts.a || 0.005) + dur + 0.05);
    return o;
  }
  noiseBurst(t, dur, vol, type, freq, q = 1, dest, opts = {}) {
    const c = this.ctx;
    const s = c.createBufferSource(); s.buffer = this.noise;
    s.playbackRate.value = opts.rate || 1;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (opts.to) f.frequency.exponentialRampToValueAtTime(opts.to, t + dur);
    const g = c.createGain();
    this.env(g, t, opts.a || 0.003, vol, dur);
    s.connect(f); f.connect(g); g.connect(dest || this.sfx);
    const off = Math.random() * 1.5;
    s.start(t, off, dur + 0.1);
  }

  // ---------------------------------------------------------------- catalogue
  play(name, vol = 1) {
    if (!this.ctx || this.muted || vol <= 0.01) return;
    const now = this.ctx.currentTime;
    const minGap = { chop: 0.06, mine: 0.06, sword: 0.05, arrow: 0.04, hit: 0.04, farm: 0.1, hammer: 0.05, forage: 0.1, death: 0.08 }[name] || 0.03;
    if (this.last[name] && now - this.last[name] < minGap) return;
    this.last[name] = now;
    const t = now + 0.01;
    const v = vol;
    switch (name) {
      case 'click': this.osc('sine', 1400, t, 0.04, 0.12 * v); break;
      case 'error': this.osc('square', 150, t, 0.12, 0.08 * v, null, { filter: 'lowpass', ff: 600 }); this.osc('square', 110, t + 0.08, 0.14, 0.08 * v, null, { filter: 'lowpass', ff: 600 }); break;
      case 'select_vill':
        this.osc('triangle', 330, t, 0.07, 0.18 * v, null, { to: 220 }); this.noiseBurst(t, 0.04, 0.08 * v, 'bandpass', 1800, 2); break;
      case 'select_mil':
        this.osc('square', 1320, t, 0.18, 0.05 * v, null, { filter: 'bandpass', ff: 2600, q: 6 });
        this.osc('sine', 2210, t + 0.01, 0.25, 0.06 * v); this.noiseBurst(t, 0.05, 0.1 * v, 'highpass', 3500); break;
      case 'select_bld': this.osc('triangle', 196, t, 0.18, 0.15 * v); this.osc('triangle', 294, t + 0.05, 0.2, 0.1 * v); break;
      case 'ack': this.osc('sine', 660, t, 0.05, 0.08 * v); this.osc('sine', 880, t + 0.05, 0.06, 0.07 * v); break;
      case 'chop':
        this.noiseBurst(t, 0.07, 0.35 * v, 'bandpass', 900 + Math.random() * 300, 3);
        this.osc('sine', 160, t, 0.08, 0.3 * v, null, { to: 90 }); break;
      case 'mine':
        this.osc('sine', 1900 + Math.random() * 300, t, 0.16, 0.12 * v); this.osc('sine', 2850, t, 0.1, 0.07 * v);
        this.noiseBurst(t, 0.03, 0.2 * v, 'highpass', 3000); break;
      case 'farm': this.noiseBurst(t, 0.16, 0.12 * v, 'lowpass', 700, 1, null, { a: 0.03 }); break;
      case 'forage': this.noiseBurst(t, 0.12, 0.08 * v, 'bandpass', 3200, 1, null, { a: 0.02 }); break;
      case 'hammer':
        this.osc('triangle', 520 + Math.random() * 80, t, 0.05, 0.2 * v); this.noiseBurst(t, 0.03, 0.15 * v, 'highpass', 2200); break;
      case 'sword':
        this.noiseBurst(t, 0.06, 0.3 * v, 'highpass', 3000);
        for (const f of [2100, 3150, 4350]) this.osc('sine', f * (0.95 + Math.random() * 0.1), t, 0.22, 0.05 * v);
        break;
      case 'punch': this.osc('sine', 140, t, 0.08, 0.25 * v, null, { to: 70 }); this.noiseBurst(t, 0.05, 0.15 * v, 'lowpass', 900); break;
      case 'arrow': this.noiseBurst(t, 0.22, 0.13 * v, 'bandpass', 2400, 2, null, { to: 700, a: 0.02 }); break;
      case 'hit': this.osc('sine', 180, t, 0.07, 0.2 * v, null, { to: 70 }); this.noiseBurst(t, 0.04, 0.1 * v, 'bandpass', 1200); break;
      case 'death':
        this.osc('sawtooth', 240 + Math.random() * 40, t, 0.28, 0.07 * v, null, { to: 110, filter: 'bandpass', ff: 700, q: 2 }); break;
      case 'built':
        [523, 659, 784].forEach((f, i) => this.osc('triangle', f, t + i * 0.08, 0.35, 0.12 * v)); break;
      case 'trained': this.osc('sawtooth', 392, t, 0.25, 0.06 * v, null, { filter: 'lowpass', ff: 1400, a: 0.03 }); this.osc('sawtooth', 523, t + 0.12, 0.3, 0.06 * v, null, { filter: 'lowpass', ff: 1400, a: 0.03 }); break;
      case 'tech': [440, 554, 659, 880].forEach((f, i) => this.osc('triangle', f, t + i * 0.07, 0.3, 0.1 * v)); break;
      case 'ageup': this.fanfare(t, v); break;
      case 'alert':
        this.osc('sawtooth', 294, t, 0.35, 0.12 * v, null, { filter: 'lowpass', ff: 1200, a: 0.05 });
        this.osc('sawtooth', 392, t + 0.38, 0.55, 0.12 * v, null, { filter: 'lowpass', ff: 1200, a: 0.05 }); break;
      case 'collapse':
        this.noiseBurst(t, 1.3, 0.5 * v, 'lowpass', 500, 1, null, { a: 0.02, to: 120 });
        this.osc('sine', 70, t, 0.6, 0.35 * v, null, { to: 35 }); break;
      case 'launch': this.noiseBurst(t, 0.3, 0.2 * v, 'bandpass', 500, 1, null, { to: 1500 }); this.osc('triangle', 110, t, 0.2, 0.2 * v, null, { to: 60 }); break;
      case 'boom': this.noiseBurst(t, 0.5, 0.4 * v, 'lowpass', 600, 1, null, { to: 150 }); this.osc('sine', 90, t, 0.4, 0.4 * v, null, { to: 40 }); break;
      case 'bell': for (let k = 0; k < 3; k++) for (const [f, a] of [[520, 0.2], [1263, 0.08], [1840, 0.05], [260, 0.08]]) this.osc('sine', f, t + k * 0.55, 1.4, a * v); break;
      case 'convert': this.wololo(t, v); break;
      case 'heal': this.osc('sine', 880, t, 0.2, 0.05 * v); this.osc('sine', 1320, t + 0.08, 0.25, 0.04 * v); break;
      case 'victory': [[392, 0], [523, 0.25], [659, 0.5], [784, 0.75], [1047, 1.0]].forEach(([f, d]) => this.brass(f, t + d, 0.6, 0.12 * v)); this.brass(523, t + 1.4, 1.6, 0.1 * v); this.brass(659, t + 1.4, 1.6, 0.1 * v); this.brass(784, t + 1.4, 1.6, 0.1 * v); break;
      case 'defeat': [[392, 0], [349, 0.45], [311, 0.9], [262, 1.35]].forEach(([f, d]) => this.brass(f, t + d, 0.7, 0.11 * v)); break;
      case 'sheep': this.osc('sawtooth', 380, t, 0.35, 0.05 * v, null, { filter: 'bandpass', ff: 900, q: 3, to: 340 }); break;
    }
  }
  brass(f, t, dur, vol) {
    this.osc('sawtooth', f, t, dur, vol, null, { filter: 'lowpass', ff: f * 3, a: 0.06 });
    this.osc('sawtooth', f * 1.005, t, dur, vol * 0.6, null, { filter: 'lowpass', ff: f * 3, a: 0.06 });
  }
  fanfare(t, v) {
    const seq = [[392, 0, 0.18], [392, 0.2, 0.18], [523, 0.4, 0.5], [659, 0.95, 0.18], [784, 1.15, 0.9]];
    for (const [f, d, dur] of seq) this.brass(f, t + d, dur, 0.13 * v);
    this.brass(262, t + 1.15, 1.0, 0.08 * v); this.brass(523, t + 1.15, 1.0, 0.07 * v);
  }
  // "Wo-lo-lo": a sawtooth voice through vowel formant filters.
  wololo(t, v) {
    const c = this.ctx;
    const o = c.createOscillator(); o.type = 'sawtooth';
    const sylls = [[0, 0.28, 175, 'o'], [0.3, 0.2, 196, 'o'], [0.52, 0.45, 165, 'o']];
    o.frequency.setValueAtTime(175, t);
    const f1 = c.createBiquadFilter(), f2 = c.createBiquadFilter();
    f1.type = 'bandpass'; f2.type = 'bandpass'; f1.Q.value = 6; f2.Q.value = 8;
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t);
    for (const [d, dur, pitch] of sylls) {
      o.frequency.setValueAtTime(pitch, t + d);
      o.frequency.linearRampToValueAtTime(pitch * 0.94, t + d + dur);
      f1.frequency.setValueAtTime(300, t + d); f1.frequency.linearRampToValueAtTime(500, t + d + 0.06); f1.frequency.linearRampToValueAtTime(420, t + d + dur);
      f2.frequency.setValueAtTime(700, t + d); f2.frequency.linearRampToValueAtTime(900, t + d + 0.06); f2.frequency.linearRampToValueAtTime(760, t + d + dur);
      g.gain.linearRampToValueAtTime(0.35 * v, t + d + 0.03);
      g.gain.linearRampToValueAtTime(0.25 * v, t + d + dur - 0.04);
      g.gain.linearRampToValueAtTime(0.02, t + d + dur);
    }
    g.gain.linearRampToValueAtTime(0.0001, t + 1.05);
    const mix = c.createGain(); mix.gain.value = 1;
    o.connect(f1); o.connect(f2); f1.connect(g); f2.connect(g); g.connect(this.sfx);
    o.start(t); o.stop(t + 1.1);
  }

  // ---------------------------------------------------------------- music
  pluckBuffer(freq) {
    const key = Math.round(freq * 10);
    let b = this.plucks.get(key);
    if (b) return b;
    const c = this.ctx, sr = c.sampleRate;
    const len = Math.floor(sr * 2.2);
    b = c.createBuffer(1, len, sr);
    const d = b.getChannelData(0);
    const period = Math.max(2, Math.round(sr / freq));
    const buf = new Float32Array(period);
    for (let i = 0; i < period; i++) buf[i] = Math.random() * 2 - 1;
    let idx = 0, prev = 0;
    const damp = 0.996 - Math.min(0.01, freq / 60000);
    for (let i = 0; i < len; i++) {
      const cur = buf[idx];
      const nv = (cur + prev) * 0.5 * damp;
      prev = cur;
      buf[idx] = nv;
      d[i] = cur;
      idx = (idx + 1) % period;
    }
    this.plucks.set(key, b);
    return b;
  }
  pluck(freq, t, vol) {
    const c = this.ctx;
    const s = c.createBufferSource(); s.buffer = this.pluckBuffer(freq);
    const g = c.createGain(); g.gain.value = vol;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2600;
    s.connect(f); f.connect(g); g.connect(this.music); g.connect(this.verb);
    s.start(t); s.stop(t + 2.2);
  }
  pad(freq, t, dur, vol) {
    const c = this.ctx;
    for (const det of [-4, 4]) {
      const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = freq; o.detune.value = det;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + dur * 0.3); g.gain.linearRampToValueAtTime(0.0001, t + dur);
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900;
      o.connect(f); f.connect(g); g.connect(this.music); g.connect(this.verb);
      o.start(t); o.stop(t + dur + 0.1);
    }
  }
  scheduleMusic() {
    if (!this.ctx || !this.musicOn || this.muted || this.musicVol <= 0.01) { if (this.ctx) this.nextBeat = this.ctx.currentTime + 0.1; return; }
    const c = this.ctx;
    const spb = 60 / 76 / 2; // eighth notes at 76 bpm
    if (this.nextBeat < c.currentTime) this.nextBeat = c.currentTime + 0.05;
    // D dorian progression
    const D = 146.83;
    const scale = [0, 2, 3, 5, 7, 9, 10, 12, 14, 15, 17, 19];
    const prog = [[0, 3, 7], [-2, 2, 5], [0, 3, 7], [7, 10, 14], [3, 7, 10], [-2, 2, 5], [5, 9, 12], [7, 10, 14]];
    const hz = (semi) => D * Math.pow(2, semi / 12);
    while (this.nextBeat < c.currentTime + 0.35) {
      const t = this.nextBeat;
      const bar = Math.floor(this.beat / 8) % prog.length;
      const inBar = this.beat % 8;
      const chord = prog[bar];
      if (inBar === 0) {
        this.pluck(hz(chord[0] - 12), t, 0.28);
        this.pad(hz(chord[0] - 12), t, spb * 8, 0.035);
        this.pad(hz(chord[1]), t, spb * 8, 0.02);
      }
      if (inBar === 4) this.pluck(hz(chord[2] - 12), t, 0.18);
      // melody: a gentle random walk on the scale favouring chord tones
      const phraseRest = (Math.floor(this.beat / 16) % 4) === 3 && inBar > 3;
      if (!phraseRest && Math.random() < (inBar % 2 === 0 ? 0.75 : 0.35)) {
        if (this.melIdx === undefined) this.melIdx = 4;
        this.melIdx = Math.max(0, Math.min(scale.length - 1, this.melIdx + [-2, -1, -1, 0, 1, 1, 2][Math.floor(Math.random() * 7)]));
        let semi = scale[this.melIdx] + 12;
        if (inBar % 4 === 0) { const ct = chord[Math.floor(Math.random() * 3)] + 12; semi = ct; }
        this.pluck(hz(semi), t, inBar % 4 === 0 ? 0.2 : 0.14);
      }
      this.nextBeat += spb * (inBar % 2 === 0 ? 1.08 : 0.92); // slight swing
      this.beat++;
    }
  }
}
