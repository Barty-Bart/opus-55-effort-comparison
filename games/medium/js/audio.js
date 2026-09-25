// Synthesized sound effects and a gentle procedural medieval music loop (WebAudio, no assets).
export class Audio {
  constructor() {
    this.ctx = null;
    this.last = {};
    this.sfxVol = 0.5;
    this.musicVol = 0.22;
    this.musicOn = true;
    this.musicT = 0;
  }
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain(); this.master.gain.value = 1; this.master.connect(this.ctx.destination);
    this.sfxBus = this.ctx.createGain(); this.sfxBus.gain.value = this.sfxVol; this.sfxBus.connect(this.master);
    this.musicBus = this.ctx.createGain(); this.musicBus.gain.value = this.musicVol; this.musicBus.connect(this.master);
    const len = this.ctx.sampleRate * 1;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // simple reverb for music
    this.verb = this.ctx.createConvolver();
    const vl = this.ctx.sampleRate * 2.2;
    const vb = this.ctx.createBuffer(2, vl, this.ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const ch = vb.getChannelData(c); for (let i = 0; i < vl; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / vl, 2.5); }
    this.verb.buffer = vb;
    const vg = this.ctx.createGain(); vg.gain.value = 0.35;
    this.verb.connect(vg); vg.connect(this.musicBus);
  }
  setMusic(on) { this.musicOn = on; }
  setSfxVol(v) { this.sfxVol = v; if (this.sfxBus) this.sfxBus.gain.value = v; }

  env(g, t, a, peak, dcy) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + dcy);
  }
  noiseHit(t, { f = 1000, q = 1, type = 'bandpass', dur = 0.1, vol = 0.3, a = 0.003, sweep = 0 }) {
    const src = this.ctx.createBufferSource(); src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const fl = this.ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
    if (sweep) fl.frequency.exponentialRampToValueAtTime(Math.max(50, f * sweep), t + dur);
    const g = this.ctx.createGain();
    this.env(g, t, a, vol, dur);
    src.connect(fl); fl.connect(g); g.connect(this.out);
    src.start(t, Math.random() * 0.5); src.stop(t + dur + a + 0.05);
  }
  tone(t, { f = 440, type = 'sine', dur = 0.2, vol = 0.2, a = 0.005, slide = 0, dest }) {
    const o = this.ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, f * slide), t + dur);
    const g = this.ctx.createGain();
    this.env(g, t, a, vol, dur);
    o.connect(g); g.connect(dest || this.out);
    o.start(t); o.stop(t + a + dur + 0.05);
  }

  play(name, vol = 1, pan = 0) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const minGap = { chop: 0.12, mine: 0.12, hammer: 0.12, sword: 0.07, bow: 0.06, punch: 0.1, die: 0.12, farm: 0.3, berry: 0.3, meat: 0.2, trained: 0.2, hitbuilding: 0.1 }[name] ?? 0.05;
    if (this.last[name] && now - this.last[name] < minGap) return;
    this.last[name] = now;
    const p = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;
    const g = this.ctx.createGain(); g.gain.value = vol;
    if (p) { p.pan.value = Math.max(-1, Math.min(1, pan)); g.connect(p); p.connect(this.sfxBus); } else g.connect(this.sfxBus);
    this.out = g;
    const t = now + 0.005;
    const r = Math.random;
    switch (name) {
      case 'click': this.tone(t, { f: 900, type: 'triangle', dur: 0.04, vol: 0.15 }); break;
      case 'select': this.tone(t, { f: 620, type: 'triangle', dur: 0.06, vol: 0.12 }); this.tone(t + 0.04, { f: 930, type: 'triangle', dur: 0.06, vol: 0.1 }); break;
      case 'error': this.tone(t, { f: 220, type: 'square', dur: 0.12, vol: 0.08 }); this.tone(t + 0.1, { f: 180, type: 'square', dur: 0.15, vol: 0.08 }); break;
      case 'chop': this.noiseHit(t, { f: 700 + r() * 200, q: 3, dur: 0.08, vol: 0.35 }); this.tone(t, { f: 180, type: 'triangle', dur: 0.06, vol: 0.2, slide: 0.6 }); break;
      case 'mine': this.tone(t, { f: 1800 + r() * 600, type: 'square', dur: 0.05, vol: 0.05 }); this.noiseHit(t, { f: 3000, q: 4, dur: 0.06, vol: 0.2 }); break;
      case 'hammer': this.tone(t, { f: 420 + r() * 60, type: 'triangle', dur: 0.07, vol: 0.2, slide: 0.7 }); this.noiseHit(t, { f: 1500, q: 2, dur: 0.04, vol: 0.2 }); break;
      case 'farm': case 'berry': this.noiseHit(t, { f: 4000, q: 0.8, dur: 0.12, vol: 0.06, type: 'highpass' }); break;
      case 'meat': this.noiseHit(t, { f: 500, q: 1, dur: 0.1, vol: 0.12 }); break;
      case 'sword': this.noiseHit(t, { f: 3500 + r() * 1500, q: 8, dur: 0.12, vol: 0.2 }); this.tone(t, { f: 2400 + r() * 800, type: 'sine', dur: 0.15, vol: 0.05 }); break;
      case 'punch': this.noiseHit(t, { f: 400, q: 1, dur: 0.06, vol: 0.25 }); break;
      case 'bow': this.noiseHit(t, { f: 1200, q: 1.5, dur: 0.14, vol: 0.12, sweep: 2.5 }); break;
      case 'catapult': this.noiseHit(t, { f: 300, q: 1, dur: 0.25, vol: 0.3, sweep: 0.5 }); this.tone(t, { f: 90, type: 'triangle', dur: 0.2, vol: 0.2 }); break;
      case 'thud': this.tone(t, { f: 90, type: 'sine', dur: 0.25, vol: 0.4, slide: 0.5 }); this.noiseHit(t, { f: 250, q: 0.7, dur: 0.2, vol: 0.3 }); break;
      case 'ram': this.tone(t, { f: 70, type: 'sine', dur: 0.3, vol: 0.5, slide: 0.6 }); this.noiseHit(t, { f: 180, q: 0.7, dur: 0.2, vol: 0.4 }); break;
      case 'hitbuilding': this.noiseHit(t, { f: 900, q: 2, dur: 0.07, vol: 0.18 }); break;
      case 'die': this.tone(t, { f: 260 + r() * 80, type: 'sawtooth', dur: 0.25, vol: 0.05, slide: 0.55 }); this.noiseHit(t, { f: 600, q: 1, dur: 0.12, vol: 0.12 }); break;
      case 'crash': this.noiseHit(t, { f: 400, q: 0.6, dur: 0.5, vol: 0.4, sweep: 0.4 }); break;
      case 'collapse':
        this.noiseHit(t, { f: 300, q: 0.5, dur: 1.4, vol: 0.5, sweep: 0.3, type: 'lowpass' });
        this.tone(t, { f: 60, type: 'sine', dur: 1, vol: 0.4, slide: 0.5 });
        break;
      case 'built':
        [523, 659, 784].forEach((f, i) => this.tone(t + i * 0.08, { f, type: 'triangle', dur: 0.3, vol: 0.12 }));
        break;
      case 'trained': this.tone(t, { f: 660, type: 'triangle', dur: 0.12, vol: 0.1 }); this.tone(t + 0.08, { f: 880, type: 'triangle', dur: 0.15, vol: 0.08 }); break;
      case 'research': [392, 494, 587, 784].forEach((f, i) => this.tone(t + i * 0.07, { f, type: 'triangle', dur: 0.35, vol: 0.1 })); break;
      case 'alarm':
        for (let i = 0; i < 2; i++) { this.tone(t + i * 0.35, { f: 233, type: 'sawtooth', dur: 0.28, vol: 0.09, a: 0.04 }); this.tone(t + i * 0.35, { f: 349, type: 'sawtooth', dur: 0.28, vol: 0.06, a: 0.04 }); }
        break;
      case 'fanfare': {
        const notes = [[392, 0], [523, 0.18], [659, 0.36], [784, 0.54], [659, 0.8], [784, 0.95]];
        for (const [f, d] of notes) {
          this.tone(t + d, { f, type: 'sawtooth', dur: d > 0.9 ? 0.9 : 0.22, vol: 0.07, a: 0.02 });
          this.tone(t + d, { f: f / 2, type: 'triangle', dur: d > 0.9 ? 0.9 : 0.22, vol: 0.08, a: 0.02 });
        }
        break;
      }
      case 'victory': {
        const n = [523, 659, 784, 1047, 784, 1047];
        n.forEach((f, i) => this.tone(t + i * 0.2, { f, type: 'sawtooth', dur: i === 5 ? 1.4 : 0.25, vol: 0.07, a: 0.02 }));
        n.forEach((f, i) => this.tone(t + i * 0.2, { f: f / 2, type: 'triangle', dur: i === 5 ? 1.4 : 0.25, vol: 0.08 }));
        break;
      }
      case 'defeat': {
        const n = [392, 349, 311, 262];
        n.forEach((f, i) => this.tone(t + i * 0.4, { f, type: 'sawtooth', dur: i === 3 ? 1.6 : 0.4, vol: 0.06, a: 0.03 }));
        break;
      }
    }
  }

  // Procedural lute-ish music in D dorian
  updateMusic(dt) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    this.musicBus.gain.value = this.musicOn ? this.musicVol : 0;
    if (!this.musicOn) return;
    this.musicT -= dt;
    if (this.musicT > 0) return;
    const scale = [146.83, 164.81, 174.61, 196, 220, 246.94, 261.63, 293.66, 329.63, 349.23, 392, 440];
    const t = this.ctx.currentTime + 0.05;
    const bar = 2.4;
    const chords = [[0, 2, 4], [3, 5, 7], [6, 1, 3], [4, 6, 1]];
    this.bar = ((this.bar || 0) + 1) % 4;
    const ch = chords[this.bar];
    // bass drone
    this.pluck(t, scale[ch[0]] / 2, 0.16, 2.2);
    // arpeggio / melody
    const pattern = [0, 1, 2, 1, 0, 2, 1, 2];
    for (let i = 0; i < 8; i++) {
      if (Math.random() < 0.18) continue;
      let deg = ch[pattern[i]] + (Math.random() < 0.3 ? 7 : 0);
      deg = Math.min(scale.length - 1, deg);
      this.pluck(t + i * (bar / 8) + (Math.random() - 0.5) * 0.02, scale[deg] * (Math.random() < 0.15 ? 2 : 1), 0.06, 0.9);
    }
    this.musicT = bar;
  }
  pluck(t, f, vol, dur) {
    const o = this.ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
    const o2 = this.ctx.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = f * 1.002;
    const fl = this.ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.setValueAtTime(f * 6, t); fl.frequency.exponentialRampToValueAtTime(f * 1.2, t + dur * 0.6);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const g2 = this.ctx.createGain(); g2.gain.value = 0.25;
    o.connect(g); o2.connect(g2); g2.connect(g); g.connect(fl); fl.connect(this.musicBus); fl.connect(this.verb);
    o.start(t); o2.start(t); o.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
  }
}
