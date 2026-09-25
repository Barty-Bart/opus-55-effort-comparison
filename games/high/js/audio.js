'use strict';
// ---------- Synthesised sound effects (WebAudio) ----------
const Sound = {
  ctx: null, master: null, enabled: true, last: {}, noiseBuf: null,
  init() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain(); this.master.gain.value = 0.35; this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 1.0, b = this.ctx.createBuffer(1, len, this.ctx.sampleRate), d = b.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.noiseBuf = b;
    } catch (e) { this.ctx = null; }
  },
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },
  throttle(name, ms) { const now = performance.now(); if (this.last[name] && now - this.last[name] < ms) return false; this.last[name] = now; return true; },
  tone(freq, dur, type = 'sine', vol = 0.3, when = 0, slide = 0) {
    const c = this.ctx, t = c.currentTime + when;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.05);
  },
  noise(dur, freq, q, vol = 0.3, when = 0, type = 'bandpass') {
    const c = this.ctx, t = c.currentTime + when;
    const s = c.createBufferSource(); s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  },
  play(name) {
    if (!this.ctx || !this.enabled) return;
    const T = this.throttle.bind(this);
    switch (name) {
      case 'click': if (T(name, 40)) this.tone(900, 0.05, 'triangle', 0.12); break;
      case 'select': if (T(name, 80)) { this.tone(520, 0.07, 'triangle', 0.12); this.tone(780, 0.08, 'triangle', 0.08, 0.05); } break;
      case 'order': if (T(name, 80)) { this.tone(660, 0.06, 'square', 0.05); this.tone(990, 0.07, 'triangle', 0.08, 0.04); } break;
      case 'place': if (T(name, 60)) { this.noise(0.12, 300, 1, 0.3); this.tone(140, 0.12, 'sine', 0.25); } break;
      case 'chop': if (T(name, 250)) { this.noise(0.06, 1800, 3, 0.18); this.tone(220, 0.05, 'triangle', 0.08); } break;
      case 'mine': if (T(name, 250)) { this.tone(1900 + Math.random() * 300, 0.08, 'square', 0.04); this.noise(0.05, 3000, 4, 0.1); } break;
      case 'build': if (T(name, 280)) { this.noise(0.05, 900, 4, 0.2); this.tone(300, 0.05, 'square', 0.05); } break;
      case 'sword': if (T(name, 120)) { this.noise(0.12, 3500 + Math.random() * 1500, 8, 0.2); this.tone(2400 + Math.random() * 600, 0.12, 'sawtooth', 0.03); } break;
      case 'arrow': if (T(name, 90)) this.noise(0.18, 2200, 2, 0.08, 0, 'highpass'); break;
      case 'hit': if (T(name, 90)) this.noise(0.08, 600, 2, 0.15); break;
      case 'rock': if (T(name, 200)) { this.noise(0.4, 200, 1, 0.5); this.tone(70, 0.3, 'sine', 0.35); } break;
      case 'die': if (T(name, 200)) this.tone(300 + Math.random() * 80, 0.35, 'sawtooth', 0.05, 0, 0.5); break;
      case 'collapse': if (T(name, 300)) { this.noise(1.2, 150, 0.8, 0.6); this.noise(0.8, 600, 1, 0.25, 0.1); } break;
      case 'train': if (T(name, 200)) { this.tone(440, 0.1, 'triangle', 0.1); this.tone(660, 0.15, 'triangle', 0.1, 0.1); } break;
      case 'done': if (T(name, 300)) { [523, 659, 784].forEach((f, i) => this.tone(f, 0.25, 'triangle', 0.12, i * 0.09)); } break;
      case 'research': if (T(name, 300)) { [392, 523, 659, 784].forEach((f, i) => this.tone(f, 0.3, 'triangle', 0.1, i * 0.08)); } break;
      case 'age': [262, 330, 392, 523, 392, 523, 659].forEach((f, i) => { this.tone(f, 0.5, 'sawtooth', 0.06, i * 0.18); this.tone(f / 2, 0.5, 'triangle', 0.1, i * 0.18); }); break;
      case 'alarm': if (T(name, 6000)) { this.tone(220, 0.7, 'sawtooth', 0.08, 0, 1.2); this.tone(220, 0.9, 'sawtooth', 0.08, 0.5, 1.2); } break;
      case 'bell': [0, 0.6, 1.2].forEach(w => { this.tone(660, 1.2, 'sine', 0.2, w); this.tone(1320, 0.8, 'sine', 0.06, w); }); break;
      case 'convert': if (T(name, 500)) [440, 554, 659, 880].forEach((f, i) => this.tone(f, 0.6, 'sine', 0.08, i * 0.12)); break;
      case 'error': if (T(name, 200)) this.tone(160, 0.15, 'square', 0.08); break;
      case 'victory': [392, 523, 659, 784, 659, 784, 1047].forEach((f, i) => { this.tone(f, 0.6, 'triangle', 0.14, i * 0.22); this.tone(f / 2, 0.6, 'sine', 0.1, i * 0.22); }); break;
      case 'defeat': [392, 349, 311, 262, 196].forEach((f, i) => this.tone(f, 0.8, 'sawtooth', 0.06, i * 0.35)); break;
    }
  },
};
