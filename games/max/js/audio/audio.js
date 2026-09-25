// Synthesized sound effects and generative medieval music (WebAudio, no samples).
const MIN_GAP = {
  chop: 0.09, mine: 0.09, hammer: 0.09, sword: 0.05, hit: 0.06, arrow: 0.05, death: 0.08, farm: 0.2, collapse: 0.3,
  select: 0.08, ack: 0.08, click: 0.03, trained: 0.3, sheep: 0.6, wololo: 0.5, splash: 0.1, stone: 0.1,
};

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.last = {};
    this.vol = { master: 0.8, sfx: 0.8, music: 0.45 };
    this.musicOn = true;
    this.voices = 0;
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctx = this.ctx = new AC();
      this.master = ctx.createGain();
      this.comp = ctx.createDynamicsCompressor();
      this.comp.threshold.value = -14; this.comp.ratio.value = 4;
      this.master.connect(this.comp); this.comp.connect(ctx.destination);
      this.sfx = ctx.createGain(); this.sfx.connect(this.master);
      this.music = ctx.createGain(); this.music.connect(this.master);
      // shared reverb for music & big sounds
      this.reverb = ctx.createConvolver();
      this.reverb.buffer = this.impulse(2.2, 2.5);
      this.revGain = ctx.createGain(); this.revGain.gain.value = 0.25;
      this.reverb.connect(this.revGain); this.revGain.connect(this.master);
      const len = ctx.sampleRate * 2;
      this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.applyVolumes();
      if (this.musicOn) this.startMusic();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setVolumes(v) { Object.assign(this.vol, v); this.applyVolumes(); }
  applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.vol.master, t, 0.05);
    this.sfx.gain.setTargetAtTime(this.vol.sfx * 0.9, t, 0.05);
    this.music.gain.setTargetAtTime(this.vol.music * 0.5, t, 0.05);
  }

  impulse(sec, decay) {
    const ctx = this.ctx, len = Math.floor(ctx.sampleRate * sec);
    const b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return b;
  }

  // ---------------------------------------------------------------- building blocks
  out(vol = 1, pan = 0, dest = null) {
    const ctx = this.ctx;
    const g = ctx.createGain(); g.gain.value = vol;
    if (pan && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan));
      g.connect(p); p.connect(dest || this.sfx);
    } else g.connect(dest || this.sfx);
    return g;
  }
  env(g, t, a, peak, d, sustain = 0) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, sustain || 0.0001), t + a + d);
  }
  tone(type, f0, f1, t, dur, vol, out, opts = {}) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    this.env(g, t, opts.a || 0.005, vol, dur);
    let node = o;
    if (opts.lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = opts.lp; node.connect(f); node = f; }
    node.connect(g); g.connect(out);
    if (opts.vib) { const l = ctx.createOscillator(); l.frequency.value = opts.vib; const lg = ctx.createGain(); lg.gain.value = opts.vibAmt || 4; l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t + dur + 0.1); }
    o.start(t); o.stop(t + dur + 0.05);
    return o;
  }
  noiseBurst(t, dur, vol, out, type = 'bandpass', freq = 1000, q = 1, f1 = null) {
    const ctx = this.ctx;
    const s = ctx.createBufferSource(); s.buffer = this.noise;
    s.playbackRate.value = 1;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    this.env(g, t, 0.003, vol, dur);
    s.connect(f); f.connect(g); g.connect(out);
    s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
  }
  bell(f, t, dur, vol, out) {
    const ctx = this.ctx;
    const car = ctx.createOscillator(), mod = ctx.createOscillator(), mg = ctx.createGain(), g = ctx.createGain();
    car.frequency.value = f; mod.frequency.value = f * 3.5;
    mg.gain.setValueAtTime(f * 2, t); mg.gain.exponentialRampToValueAtTime(1, t + dur);
    mod.connect(mg); mg.connect(car.frequency);
    this.env(g, t, 0.004, vol, dur);
    car.connect(g); g.connect(out);
    car.start(t); mod.start(t); car.stop(t + dur + 0.1); mod.stop(t + dur + 0.1);
  }
  brass(f, t, dur, vol, out) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
    const o2 = ctx.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = f * 1.004;
    const flt = ctx.createBiquadFilter(); flt.type = 'lowpass';
    flt.frequency.setValueAtTime(f * 1.5, t); flt.frequency.linearRampToValueAtTime(f * 6, t + 0.08); flt.frequency.linearRampToValueAtTime(f * 3, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.05); g.gain.setValueAtTime(vol, t + dur - 0.08); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.15);
    o.connect(flt); o2.connect(flt); flt.connect(g); g.connect(out);
    const l = ctx.createOscillator(); l.frequency.value = 5.5; const lg = ctx.createGain(); lg.gain.value = f * 0.006; l.connect(lg); lg.connect(o.frequency); lg.connect(o2.frequency);
    o.start(t); o2.start(t); l.start(t); o.stop(t + dur + 0.2); o2.stop(t + dur + 0.2); l.stop(t + dur + 0.2);
  }

  // ---------------------------------------------------------------- effects
  play(name, o = {}) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const gap = MIN_GAP[name] ?? 0.02;
    if (this.last[name] && now - this.last[name] < gap) return;
    this.last[name] = now;
    const vol = o.vol ?? 1, pan = o.pan || 0;
    const t = now + 0.005;
    const out = this.out(vol, pan);
    const R = Math.random;
    switch (name) {
      case 'click': this.tone('square', 1300, 900, t, 0.035, 0.05, out, { lp: 3000 }); break;
      case 'error': this.tone('square', 220, 200, t, 0.09, 0.07, out, { lp: 1200 }); this.tone('square', 165, 150, t + 0.1, 0.12, 0.07, out, { lp: 1200 }); break;
      case 'selVil': this.tone('sine', 740, 760, t, 0.06, 0.12, out); this.tone('sine', 988, 1000, t + 0.06, 0.08, 0.1, out); break;
      case 'selMil': this.tone('triangle', 196, 180, t, 0.12, 0.2, out, { lp: 900 }); this.noiseBurst(t, 0.05, 0.08, out, 'highpass', 3000); this.tone('sine', 392, 392, t + 0.05, 0.1, 0.07, out); break;
      case 'selCav': this.noiseBurst(t, 0.08, 0.12, out, 'bandpass', 500, 2); this.tone('triangle', 260, 180, t, 0.18, 0.12, out, { lp: 800 }); break;
      case 'selBld': this.noiseBurst(t, 0.07, 0.25, out, 'bandpass', 420, 3); this.tone('sine', 150, 110, t, 0.09, 0.2, out); break;
      case 'selRes': this.tone('sine', 520, 540, t, 0.05, 0.08, out); break;
      case 'ack': this.tone('sine', 587, 600, t, 0.05, 0.1, out); this.tone('sine', 880, 880, t + 0.05, 0.07, 0.07, out); break;
      case 'ackMil': this.tone('triangle', 247, 247, t, 0.08, 0.13, out, { lp: 1500 }); this.tone('triangle', 330, 330, t + 0.08, 0.1, 0.11, out, { lp: 1500 }); break;
      case 'ackAttack': this.tone('sawtooth', 220, 180, t, 0.14, 0.08, out, { lp: 1100 }); this.noiseBurst(t, 0.06, 0.08, out, 'highpass', 2500); break;
      case 'chop': this.noiseBurst(t, 0.07, 0.35, out, 'bandpass', 700 + R() * 300, 2.5); this.tone('sine', 150, 90, t, 0.07, 0.3, out); break;
      case 'mine': for (const f of [2100, 3150, 4700]) this.tone('sine', f * (0.97 + R() * 0.06), f, t, 0.16, 0.05, out); this.noiseBurst(t, 0.03, 0.2, out, 'highpass', 2500); break;
      case 'hammer': this.noiseBurst(t, 0.05, 0.3, out, 'bandpass', 1400, 3); this.tone('sine', 320, 220, t, 0.05, 0.2, out); break;
      case 'farm': this.noiseBurst(t, 0.12, 0.12, out, 'highpass', 1800); break;
      case 'sword': {
        this.noiseBurst(t, 0.1, 0.3, out, 'highpass', 3500);
        const b = 1700 + R() * 600;
        for (const k of [1, 1.47, 2.09, 2.83]) this.tone('sine', b * k, b * k * 0.995, t, 0.28, 0.05, out);
        break;
      }
      case 'hit': this.noiseBurst(t, 0.08, 0.35, out, 'lowpass', 700); this.tone('sine', 110, 60, t, 0.09, 0.3, out); break;
      case 'arrow': this.noiseBurst(t, 0.18, 0.3, out, 'bandpass', 2600, 3, 700); break;
      case 'stone': this.noiseBurst(t, 0.3, 0.3, out, 'lowpass', 500); this.tone('sine', 80, 40, t, 0.3, 0.35, out); break;
      case 'splash': this.noiseBurst(t, 0.25, 0.32, out, 'bandpass', 1500, 1, 500); break;
      case 'death': this.tone('sawtooth', 240 + R() * 60, 90, t, 0.28, 0.17, out, { lp: 700 }); this.noiseBurst(t, 0.12, 0.2, out, 'lowpass', 600); break;
      case 'horseDeath': this.tone('sawtooth', 500, 200, t, 0.4, 0.13, out, { lp: 1200, vib: 20, vibAmt: 30 }); this.noiseBurst(t + 0.1, 0.25, 0.26, out, 'lowpass', 400); break;
      case 'collapse': this.noiseBurst(t, 1.4, 0.55, out, 'lowpass', 600, 1, 80); this.tone('sine', 55, 35, t, 1.2, 0.4, out); this.noiseBurst(t + 0.2, 0.8, 0.25, out, 'bandpass', 900, 1, 200); break;
      case 'place': this.noiseBurst(t, 0.06, 0.8, out, 'bandpass', 380, 2); this.noiseBurst(t + 0.09, 0.06, 0.7, out, 'bandpass', 460, 2); this.tone('sine', 140, 100, t, 0.08, 0.2, out); break;
      case 'built': [523, 659, 784, 1047].forEach((f, i) => this.tone('triangle', f, f, t + i * 0.07, 0.25, 0.1, out)); break;
      case 'trained': this.tone('triangle', 392, 392, t, 0.1, 0.1, out, { lp: 2000 }); this.tone('triangle', 523, 523, t + 0.1, 0.16, 0.1, out, { lp: 2000 }); break;
      case 'trainedVil': this.bell(1175, t, 0.4, 0.05, out); break;
      case 'research': this.bell(880, t, 1.1, 0.12, out); this.bell(1318, t + 0.12, 1.0, 0.08, out); break;
      case 'coin': this.tone('square', 1318, 1318, t, 0.06, 0.04, out, { lp: 4000 }); this.tone('square', 1760, 1760, t + 0.06, 0.12, 0.04, out, { lp: 4000 }); break;
      case 'delete': this.noiseBurst(t, 0.25, 0.25, out, 'bandpass', 1800, 1, 300); break;
      case 'age': {
        const o2 = this.out(vol, 0, this.sfx); const rv = this.out(0.5, 0, this.reverb);
        const seq = [[262, 0, 0.22], [330, 0.22, 0.22], [392, 0.44, 0.22], [523, 0.66, 0.9]];
        for (const [f, dt, d] of seq) { this.brass(f, t + dt, d, 0.09, o2); this.brass(f, t + dt, d, 0.05, rv); }
        this.brass(196, t + 0.66, 0.9, 0.06, o2); this.brass(330, t + 0.66, 0.9, 0.05, o2);
        this.noiseBurst(t + 0.66, 0.5, 0.1, o2, 'lowpass', 300);
        break;
      }
      case 'alarm': {
        const rv = this.out(0.4, 0, this.reverb);
        for (const [f, dt, d] of [[220, 0, 0.45], [330, 0.5, 0.7]]) { this.brass(f, t + dt, d, 0.12, out); this.brass(f, t + dt, d, 0.06, rv); }
        break;
      }
      case 'bell': for (let k = 0; k < 3; k++) this.bell(660, t + k * 0.45, 1.2, 0.12, out); break;
      case 'victory': {
        const seq = [[392, 0, 0.2], [392, 0.2, 0.2], [392, 0.4, 0.2], [523, 0.6, 0.6], [466, 1.25, 0.2], [523, 1.45, 0.2], [659, 1.65, 1.2]];
        for (const [f, dt, d] of seq) this.brass(f, t + dt, d, 0.1, out);
        break;
      }
      case 'defeat': for (const [f, dt, d] of [[294, 0, 0.5], [262, 0.5, 0.5], [233, 1.0, 0.5], [196, 1.5, 1.4]]) this.brass(f, t + dt, d, 0.09, out); break;
      case 'sheep': this.voice(t, [[320, 0.35]], out, [900, 2300], 0.2, 28); break;
      case 'wololo': this.wololo(t, out); break;
    }
  }

  // Formant-ish voice: segments [[pitch, dur]], formants [f1, f2]
  voice(t, segs, out, formants, vol, trem = 0) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    let tt = t;
    o.frequency.setValueAtTime(segs[0][0], t);
    for (const [f, d] of segs) { o.frequency.linearRampToValueAtTime(f, tt + d * 0.3); tt += d; }
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.03); g.gain.setValueAtTime(vol, tt - 0.05); g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.08);
    const mix = ctx.createGain(); mix.gain.value = 1;
    for (const f of formants) { const b = ctx.createBiquadFilter(); b.type = 'bandpass'; b.frequency.value = f; b.Q.value = 6; o.connect(b); b.connect(mix); }
    mix.connect(g); g.connect(out);
    if (trem) { const l = ctx.createOscillator(); l.frequency.value = trem; const lg = ctx.createGain(); lg.gain.value = 18; l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(tt + 0.1); }
    o.start(t); o.stop(tt + 0.1);
  }
  wololo(t, out) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    const pitches = [150, 190, 150, 200, 160];
    const f1 = ctx.createBiquadFilter(); f1.type = 'bandpass'; f1.Q.value = 5;
    const f2 = ctx.createBiquadFilter(); f2.type = 'bandpass'; f2.Q.value = 7;
    const g = ctx.createGain();
    const syl = 0.2;
    g.gain.setValueAtTime(0.0001, t);
    for (let i = 0; i < 3; i++) {
      const s = t + i * syl;
      o.frequency.setValueAtTime(pitches[i], s); o.frequency.linearRampToValueAtTime(pitches[i + 1], s + syl);
      // "w/l" consonant (low F2) then "o" vowel
      f1.frequency.setValueAtTime(320, s); f1.frequency.linearRampToValueAtTime(520, s + syl * 0.5);
      f2.frequency.setValueAtTime(i === 0 ? 650 : 1200, s); f2.frequency.linearRampToValueAtTime(880, s + syl * 0.5);
      g.gain.setValueAtTime(0.02, s); g.gain.linearRampToValueAtTime(0.28, s + 0.06); g.gain.linearRampToValueAtTime(0.18, s + syl - 0.02);
    }
    g.gain.linearRampToValueAtTime(0.0001, t + syl * 3 + 0.15);
    o.connect(f1); o.connect(f2); f1.connect(g); f2.connect(g);
    g.connect(out);
    const rv = this.out(0.5, 0, this.reverb); g.connect(rv);
    o.start(t); o.stop(t + syl * 3 + 0.2);
  }

  // ---------------------------------------------------------------- helpers for game code
  selectSound(e) {
    if (!e) return;
    if (e.kind === 'building') this.play('selBld', { vol: 0.8 });
    else if (e.kind === 'resource') this.play('selRes', { vol: 0.7 });
    else if (e.isVillager) this.play('selVil');
    else if (e.def && e.def.classes.includes('cavalry')) this.play('selCav');
    else if (e.def && e.def.herdable) this.play('sheep', { vol: 0.8 });
    else this.play('selMil');
  }
  ackSound(u, kind) {
    if (kind === 'attack' || kind === 'convert') this.play('ackAttack');
    else if (u && u.isVillager) this.play('ack');
    else this.play('ackMil');
  }

  // ---------------------------------------------------------------- music
  ks(freq) {
    // Karplus–Strong plucked string, cached per frequency
    this.ksCache = this.ksCache || new Map();
    const key = Math.round(freq * 10);
    let b = this.ksCache.get(key);
    if (b) return b;
    const ctx = this.ctx, sr = ctx.sampleRate, dur = 2.6;
    const len = Math.floor(sr * dur);
    b = ctx.createBuffer(1, len, sr);
    const d = b.getChannelData(0);
    const N = Math.max(2, Math.round(sr / freq));
    const buf = new Float32Array(N);
    for (let i = 0; i < N; i++) buf[i] = Math.random() * 2 - 1;
    let prev = 0;
    for (let i = 0; i < len; i++) {
      const j = i % N;
      const v = buf[j];
      const nv = 0.5 * (v + prev) * 0.9965;
      prev = v;
      buf[j] = nv;
      d[i] = v * 0.5;
    }
    this.ksCache.set(key, b);
    return b;
  }
  pluck(freq, t, vol, pan = 0) {
    const ctx = this.ctx;
    const s = ctx.createBufferSource(); s.buffer = this.ks(freq);
    const g = ctx.createGain(); g.gain.value = vol;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 3200;
    s.connect(f); f.connect(g);
    let dest = g;
    if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); dest = p; }
    dest.connect(this.music);
    const rv = ctx.createGain(); rv.gain.value = 0.6; dest.connect(rv); rv.connect(this.reverb);
    s.start(t); s.stop(t + 2.6);
  }
  flute(freq, t, dur, vol) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = freq;
    const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = freq * 2;
    const g2 = ctx.createGain(); g2.gain.value = 0.25;
    const l = ctx.createOscillator(); l.frequency.value = 5; const lg = ctx.createGain(); lg.gain.value = freq * 0.008;
    l.connect(lg); lg.connect(o.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.08); g.gain.setValueAtTime(vol, t + dur - 0.1); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.1);
    o.connect(g); o2.connect(g2); g2.connect(g);
    g.connect(this.music);
    const rv = ctx.createGain(); rv.gain.value = 0.8; g.connect(rv); rv.connect(this.reverb);
    o.start(t); o2.start(t); l.start(t); o.stop(t + dur + 0.2); o2.stop(t + dur + 0.2); l.stop(t + dur + 0.2);
  }
  drum(t, vol) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(48, t + 0.25);
    const g = ctx.createGain(); this.env(g, t, 0.004, vol, 0.35);
    o.connect(g); g.connect(this.music); o.start(t); o.stop(t + 0.4);
    const s = ctx.createBufferSource(); s.buffer = this.noise;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900;
    const g2 = ctx.createGain(); this.env(g2, t, 0.002, vol * 0.3, 0.12);
    s.connect(f); f.connect(g2); g2.connect(this.music); s.start(t, Math.random()); s.stop(t + 0.2);
  }

  chirp(t) {
    const ctx = this.ctx;
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    const g = ctx.createGain(); g.gain.value = 0.018 + Math.random() * 0.012;
    if (pan) { pan.pan.value = Math.random() * 1.6 - 0.8; g.connect(pan); pan.connect(this.music); } else g.connect(this.music);
    const n = 2 + Math.floor(Math.random() * 3), base = 2200 + Math.random() * 1400;
    for (let k = 0; k < n; k++) {
      const o = ctx.createOscillator(); o.type = 'sine';
      const s = t + k * (0.09 + Math.random() * 0.05), f = base * (0.9 + Math.random() * 0.25);
      o.frequency.setValueAtTime(f, s); o.frequency.exponentialRampToValueAtTime(f * (1.25 + Math.random() * 0.3), s + 0.06);
      const e = ctx.createGain(); e.gain.setValueAtTime(0.0001, s); e.gain.exponentialRampToValueAtTime(1, s + 0.01); e.gain.exponentialRampToValueAtTime(0.0001, s + 0.075);
      o.connect(e); e.connect(g); o.start(s); o.stop(s + 0.1);
    }
  }

  startMusic() {
    if (!this.ctx || this.musicTimer) return;
    const ctx = this.ctx;
    const D = 146.83;
    const scale = [0, 2, 3, 5, 7, 9, 10]; // dorian
    const noteF = (deg, oct = 0) => { const o = Math.floor(deg / 7); const s = scale[((deg % 7) + 7) % 7]; return D * Math.pow(2, (s + 12 * (o + oct)) / 12); };
    const chords = [[0, 2, 4], [6, 8, 10], [3, 5, 7], [4, 6, 8], [0, 2, 4], [5, 7, 9], [3, 5, 7], [4, 6, 8]];
    const bpm = 76, beat = 60 / bpm;
    let bar = 0, next = ctx.currentTime + 0.5;
    let melody = null;
    const drone = () => {
      const o = ctx.createOscillator(), o2 = ctx.createOscillator();
      o.type = 'sine'; o2.type = 'sine'; o.frequency.value = D / 2; o2.frequency.value = (D / 2) * 1.5;
      const g = ctx.createGain(); g.gain.value = 0.035;
      const l = ctx.createOscillator(); l.frequency.value = 0.1; const lg = ctx.createGain(); lg.gain.value = 0.015; l.connect(lg); lg.connect(g.gain);
      o.connect(g); o2.connect(g); g.connect(this.music);
      o.start(); o2.start(); l.start();
      this.droneNodes = [o, o2, l];
    };
    drone();
    const schedule = () => {
      while (next < ctx.currentTime + 1.2) {
        const ch = chords[bar % chords.length];
        const t0 = next;
        // arpeggio pattern
        const pat = [0, 1, 2, 1, 0, 2, 1, 2];
        for (let i = 0; i < 8; i++) {
          if (Math.random() < 0.12 && i % 2) continue;
          const deg = ch[pat[i]] + (i >= 4 && Math.random() < 0.4 ? 7 : 0);
          this.pluck(noteF(deg, 0), t0 + i * beat * 0.5 + (Math.random() - 0.5) * 0.01, 0.16 + (i % 4 === 0 ? 0.06 : 0), (Math.random() - 0.5) * 0.4);
        }
        this.pluck(noteF(ch[0], -1), t0, 0.22, 0);
        if (bar % 2 === 0) this.drum(t0, 0.18);
        this.drum(t0 + beat * 2, 0.1);
        if (Math.random() < 0.25) this.drum(t0 + beat * 3.5, 0.06);
        // occasional melodic phrase
        if (!melody && bar % 4 === 0 && Math.random() < 0.55) melody = { bars: 4, deg: 7 + ch[0] };
        if (melody) {
          let deg = melody.deg;
          const rhythm = Math.random() < 0.5 ? [1, 1, 1, 1] : [1.5, 0.5, 1, 1];
          let tt = t0;
          for (const r of rhythm) {
            if (Math.random() < 0.85) this.flute(noteF(deg, 1), tt, r * beat * 0.95, 0.045);
            deg += [-1, 1, -2, 2, 0, -1, 1][Math.floor(Math.random() * 7)];
            deg = Math.max(4, Math.min(14, deg));
            tt += r * beat;
          }
          melody.deg = deg;
          if (--melody.bars <= 0) melody = null;
        }
        // distant birdsong now and then
        if (Math.random() < 0.28) this.chirp(t0 + Math.random() * beat * 4);
        next += beat * 4;
        bar++;
      }
    };
    schedule();
    this.musicTimer = setInterval(schedule, 300);
  }
  stopMusic() {
    if (this.musicTimer) { clearInterval(this.musicTimer); this.musicTimer = null; }
    if (this.droneNodes) { for (const n of this.droneNodes) try { n.stop(); } catch { /* */ } this.droneNodes = null; }
  }
}
