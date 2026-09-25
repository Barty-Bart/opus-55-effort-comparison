// ===== Audio: synthesized SFX, procedural medieval music, ambient, unit voices (Web Speech + formant fallback) =====
'use strict';
const Sound = {
  ctx: null, master: null, music: null, sfx: null, voiceG: null, amb: null,
  vol: { master: 0.8, music: 0.45, sfx: 0.7, voice: 0.9, muted: false },
  last: {}, active: 0, voices: [], lastVoiceT: 0, lastLine: {}, speaking: false, musicOn: false, started: false,
  log: [],
  loadVol() { try { const v = JSON.parse(localStorage.getItem('aoe_vol') || 'null'); if (v) Object.assign(this.vol, v); } catch (e) { } },
  saveVol() { try { localStorage.setItem('aoe_vol', JSON.stringify(this.vol)); } catch (e) { } },
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    this.ctx = new AC();
    const c = this.ctx;
    this.master = c.createGain(); this.master.connect(c.destination);
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4; comp.connect(this.master);
    this.music = c.createGain(); this.music.connect(comp);
    this.sfx = c.createGain(); this.sfx.connect(comp);
    this.voiceG = c.createGain(); this.voiceG.connect(comp);
    this.amb = c.createGain(); this.amb.connect(this.sfx);
    // reverb for music
    this.rev = c.createConvolver(); const len = c.sampleRate * 2.2, buf = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = buf.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.5); }
    this.rev.buffer = buf; const rg = c.createGain(); rg.gain.value = 0.35; this.rev.connect(rg); rg.connect(this.music);
    this.noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate); const nd = this.noiseBuf.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    this.applyVol();
    if ('speechSynthesis' in window) { const load = () => { this.voices = speechSynthesis.getVoices(); }; load(); speechSynthesis.onvoiceschanged = load; }
    this.started = true;
  },
  applyVol() {
    if (!this.ctx) return;
    const m = this.vol.muted ? 0 : this.vol.master;
    this.master.gain.value = m; this.music.gain.value = this.vol.music * 0.5; this.sfx.gain.value = this.vol.sfx; this.voiceG.gain.value = this.vol.voice;
  },
  now() { return this.ctx.currentTime; },
  noise(dur, t0, filterType, freq, q, gain, dest, fEnd) {
    const c = this.ctx, s = c.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
    const f = c.createBiquadFilter(); f.type = filterType; f.frequency.setValueAtTime(freq, t0); if (fEnd) f.frequency.exponentialRampToValueAtTime(fEnd, t0 + dur); f.Q.value = q || 1;
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(gain, t0 + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f); f.connect(g); g.connect(dest || this.sfx); s.start(t0, Math.random() * 0.5); s.stop(t0 + dur + 0.05);
  },
  tone(freq, dur, t0, type, gain, dest, fEnd, attack = 0.005) {
    const c = this.ctx, o = c.createOscillator(); o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t0); if (fEnd) o.frequency.exponentialRampToValueAtTime(fEnd, t0 + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(gain, t0 + attack); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(dest || this.sfx); o.start(t0); o.stop(t0 + dur + 0.05);
    return o;
  },
  // positional gain: 0 if far from camera or hidden
  posGain(x, y) {
    if (x === undefined || !W || !R.cv) return 1;
    const c = screenToTile(R.cw / 2, R.ch / 2);
    const d = Math.hypot(x - c.x, y - c.y);
    const view = 14 / R.cam.zoom;
    if (d > view * 1.8) return 0;
    if (W.players && W.players[W.humanId] && W.settings && W.settings.fog !== 'none' && !W.noFog) { const n = W.n; const i = Math.max(0, Math.min(n - 1, y | 0)) * n + Math.max(0, Math.min(n - 1, x | 0)); if (!W.players[W.humanId].visible[i]) return 0; }
    return Math.max(0.15, 1 - d / (view * 1.8));
  },
  play(name, x, y) {
    if (!this.ctx || this.vol.muted) return;
    const g = this.posGain(x, y); if (g <= 0) return;
    const now = performance.now();
    const minGap = { chop: 90, mine: 90, hammer: 80, bow: 60, sword: 50, farm: 150, forage: 150 }[name] || 40;
    if (this.last[name] && now - this.last[name] < minGap) return;
    this.last[name] = now;
    this.log.push(name); if (this.log.length > 50) this.log.shift();
    const t = this.now() + 0.01, c = this.ctx;
    const out = c.createGain(); out.gain.value = g; out.connect(this.sfx);
    switch (name) {
      case 'chop': this.noise(0.08, t, 'bandpass', 900, 2, 0.5, out); this.tone(180, 0.09, t, 'triangle', 0.4, out, 90); break;
      case 'mine': this.tone(2400 + Math.random() * 400, 0.25, t, 'sine', 0.18, out); this.tone(3600, 0.12, t, 'sine', 0.08, out); this.noise(0.05, t, 'highpass', 3000, 1, 0.3, out); break;
      case 'hammer': this.tone(900 + Math.random() * 200, 0.08, t, 'square', 0.12, out, 500); this.noise(0.04, t, 'bandpass', 1500, 3, 0.3, out); break;
      case 'farm': this.noise(0.18, t, 'lowpass', 600, 1, 0.25, out, 200); break;
      case 'forage': this.noise(0.12, t, 'bandpass', 3000, 1, 0.12, out); this.tone(600, 0.05, t + 0.05, 'sine', 0.05, out); break;
      case 'butcher': this.noise(0.1, t, 'bandpass', 700, 1.5, 0.3, out); break;
      case 'fishsplash': case 'splash': this.noise(0.35, t, 'lowpass', 1800, 1, 0.3, out, 300); break;
      case 'deposit': this.tone(520, 0.08, t, 'triangle', 0.1, out); this.tone(780, 0.1, t + 0.06, 'triangle', 0.08, out); break;
      case 'treefall': this.noise(0.9, t, 'lowpass', 1400, 1, 0.35, out, 120); this.tone(90, 0.6, t + 0.25, 'sine', 0.4, out, 45); break;
      case 'bow': this.tone(300 + Math.random() * 60, 0.12, t, 'triangle', 0.18, out, 140); this.noise(0.1, t, 'highpass', 2500, 1, 0.12, out); break;
      case 'sword': { const f = 1800 + Math.random() * 900; this.tone(f, 0.22, t, 'square', 0.05, out, f * 0.9); this.tone(f * 1.51, 0.18, t, 'sine', 0.08, out); this.noise(0.06, t, 'bandpass', 4000, 2, 0.25, out); break; }
      case 'hitbld': this.noise(0.12, t, 'lowpass', 500, 1, 0.5, out); this.tone(120, 0.1, t, 'triangle', 0.3, out, 70); break;
      case 'ram': this.noise(0.25, t, 'lowpass', 300, 1, 0.8, out); this.tone(60, 0.3, t, 'sine', 0.7, out, 40); break;
      case 'bite': this.noise(0.08, t, 'bandpass', 1200, 2, 0.3, out); this.tone(250, 0.15, t, 'sawtooth', 0.08, out, 150); break;
      case 'catapult': this.noise(0.3, t, 'lowpass', 800, 1, 0.4, out, 200); this.tone(140, 0.25, t, 'triangle', 0.3, out, 60); break;
      case 'impact': this.noise(0.4, t, 'lowpass', 600, 1, 0.6, out, 100); break;
      case 'gun': this.noise(0.25, t, 'lowpass', 2500, 1, 0.7, out, 300); this.tone(80, 0.2, t, 'sine', 0.5, out, 40); break;
      case 'mg': this.noise(0.06, t, 'bandpass', 1800, 1, 0.6, out); this.tone(120, 0.05, t, 'square', 0.15, out); break;
      case 'explode': this.noise(1.0, t, 'lowpass', 1200, 1, 0.9, out, 60); this.tone(50, 0.8, t, 'sine', 0.8, out, 25); break;
      case 'fire': this.noise(0.3, t, 'bandpass', 700, 0.7, 0.25, out); break;
      case 'crash': this.noise(0.6, t, 'lowpass', 900, 1, 0.6, out, 100); for (let k = 0; k < 3; k++) this.tone(200 + k * 70, 0.1, t + k * 0.07, 'triangle', 0.2, out); break;
      case 'collapse': this.noise(1.6, t, 'lowpass', 900, 1, 0.8, out, 60); this.tone(55, 1.2, t, 'sine', 0.6, out, 30); break;
      case 'sink': this.noise(1.4, t, 'lowpass', 1000, 1, 0.5, out, 150); this.tone(120, 1.2, t, 'sine', 0.3, out, 40); break;
      case 'die': this.voiceSynth(['a', 'u'], t, 170 + Math.random() * 60, 0.45, out, true); break;
      case 'animaldie': this.tone(700, 0.3, t, 'sawtooth', 0.08, out, 250); break;
      case 'bleat': { const o = this.tone(420 + Math.random() * 80, 0.5, t, 'sawtooth', 0.06, out, 380); const lfo = c.createOscillator(); lfo.frequency.value = 22; const lg = c.createGain(); lg.gain.value = 30; lfo.connect(lg); lg.connect(o.frequency); lfo.start(t); lfo.stop(t + 0.5); break; }
      case 'garrison': this.noise(0.15, t, 'lowpass', 400, 1, 0.3, out); this.tone(160, 0.2, t + 0.05, 'triangle', 0.15, out); break;
      case 'trained': this.tone(660, 0.12, t, 'triangle', 0.1, out); this.tone(880, 0.16, t + 0.1, 'triangle', 0.1, out); break;
      case 'built': [523, 659, 784].forEach((f, i) => this.tone(f, 0.3, t + i * 0.1, 'triangle', 0.12, out)); break;
      case 'research': [392, 523, 659, 784].forEach((f, i) => this.tone(f, 0.35, t + i * 0.08, 'sine', 0.12, out)); break;
      case 'relic': [880, 1109, 1319].forEach((f, i) => this.tone(f, 0.6, t + i * 0.08, 'sine', 0.1, out)); break;
      case 'converted': [440, 554, 659, 880].forEach((f, i) => this.tone(f, 0.5, t + i * 0.1, 'sine', 0.12, out)); break;
      case 'coins': for (let k = 0; k < 4; k++) this.tone(2000 + Math.random() * 1500, 0.1, t + k * 0.05, 'sine', 0.08, out); break;
      case 'click': this.tone(1200, 0.03, t, 'square', 0.04, out); break;
      case 'error': this.tone(200, 0.15, t, 'square', 0.06, out, 150); break;
      case 'place': this.noise(0.1, t, 'lowpass', 500, 1, 0.3, out); break;
    }
  },
  alert() { if (!this.ctx) return; const t = this.now(); [0, 0.25].forEach(d => { this.tone(330, 0.2, t + d, 'square', 0.06, this.sfx); this.tone(247, 0.2, t + d + 0.12, 'square', 0.06, this.sfx); }); },
  bell() { if (!this.ctx) return; const t = this.now(); for (let k = 0; k < 5; k++) { [1, 2.4, 3.9, 5.4].forEach((h, j) => this.tone(420 * h, 1.8 - j * 0.3, t + k * 0.55, 'sine', 0.12 / (j + 1), this.sfx)); } },
  fanfare() { if (!this.ctx) return; const t = this.now(); const seq = [[392, 0], [523, 0.18], [659, 0.36], [784, 0.54], [659, 0.8], [784, 0.95]]; seq.forEach(([f, d]) => { this.tone(f, 0.35, t + d, 'sawtooth', 0.06, this.sfx); this.tone(f / 2, 0.35, t + d, 'triangle', 0.08, this.sfx); }); },
  defeat() { if (!this.ctx) return; const t = this.now(); [392, 349, 311, 262].forEach((f, i) => this.tone(f, 0.6, t + i * 0.35, 'sawtooth', 0.06, this.sfx)); },
  // Formant-based vocal synth (used for death cries, the monk chant and as a voice fallback)
  voiceSynth(vowels, t0, pitch, dur, dest, fall) {
    const F = { a: [800, 1200, 2500], e: [400, 2000, 2600], i: [300, 2300, 3000], o: [450, 800, 2600], u: [325, 700, 2500] };
    const c = this.ctx, src = c.createOscillator(); src.type = 'sawtooth';
    src.frequency.setValueAtTime(pitch, t0);
    if (fall) src.frequency.exponentialRampToValueAtTime(pitch * 0.6, t0 + dur);
    const vib = c.createOscillator(); vib.frequency.value = 5.5; const vg = c.createGain(); vg.gain.value = pitch * 0.02; vib.connect(vg); vg.connect(src.frequency);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.35, t0 + 0.03); g.gain.setValueAtTime(0.35, t0 + dur * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    const seg = dur / vowels.length;
    for (let k = 0; k < 3; k++) {
      const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 8 - k * 2;
      vowels.forEach((v, i) => f.frequency.setTargetAtTime(F[v][k], t0 + i * seg, 0.03));
      const fg = c.createGain(); fg.gain.value = [1, 0.5, 0.25][k];
      src.connect(f); f.connect(fg); fg.connect(g);
    }
    g.connect(dest || this.voiceG);
    src.start(t0); vib.start(t0); src.stop(t0 + dur + 0.05); vib.stop(t0 + dur + 0.05);
  },
  chant(u) { // "wololo"
    if (!this.ctx || this.vol.muted) return;
    const g = this.posGain(u.x, u.y); if (g <= 0) return;
    const t = this.now() + 0.02, out = this.ctx.createGain(); out.gain.value = g; out.connect(this.voiceG);
    [[['u', 'o'], 180, 0.35], [['o'], 150, 0.25], [['o'], 170, 0.45]].forEach(([v, p, d], i) => this.voiceSynth(v, t + i * 0.36, p, d, out));
  },
  // Unit acknowledgement voices
  speak(u, kind) {
    if (!u || this.vol.muted || this.vol.voice <= 0) return;
    const now = performance.now();
    if (now - this.lastVoiceT < 280) return; // throttle rapid clicks: no pile-up
    const p = W.players[u.owner]; if (!p) return;
    const d = UNITS[u.type];
    if (d.animal) { if (u.type === 'sheep') this.play('bleat'); return; }
    if (u.type === 'cobra') { this.play('mg'); return; }
    const civ = CIVS[p.civ];
    const lines = civ.voice[kind] || civ.voice.select;
    const key = p.civ + kind;
    let idx = (Math.random() * lines.length) | 0;
    if (lines.length > 1 && idx === this.lastLine[key]) idx = (idx + 1) % lines.length;
    this.lastLine[key] = idx;
    const text = lines[idx];
    this.lastVoiceT = now;
    const female = u.type === 'villager' && u.id % 3 === 0;
    const pitchBase = female ? 1.35 : u.type === 'monk' ? 0.8 : d.tags.includes('infantry') || d.tags.includes('cavalry') ? 0.85 : 1.0;
    this.lastSpoken = { text, lang: civ.lang, kind };
    const v = this.pickVoice(civ.lang, female);
    if ('speechSynthesis' in window && v) {
      try {
        speechSynthesis.cancel();
        const ut = new SpeechSynthesisUtterance(text);
        ut.voice = v; ut.lang = civ.lang;
        ut.pitch = Math.max(0.1, Math.min(2, pitchBase + (Math.random() - 0.5) * 0.15));
        ut.rate = kind === 'attack' ? 1.25 : 1.1;
        ut.volume = Math.min(1, (this.vol.muted ? 0 : this.vol.master) * this.vol.voice);
        speechSynthesis.speak(ut);
        return;
      } catch (e) { }
    }
    // fallback: formant babble shaped like the phrase
    if (!this.ctx) return;
    const t = this.now() + 0.01; const vowels = (text.toLowerCase().match(/[aeiou]/g) || ['a', 'e']).slice(0, 6);
    const pitch = (female ? 230 : 130) * (0.9 + Math.random() * 0.2);
    vowels.forEach((vw, i) => this.voiceSynth([vw], t + i * 0.13, pitch * (kind === 'attack' ? 1.2 : 1) * (1 + (i === vowels.length - 1 ? -0.1 : 0.05)), 0.14, this.voiceG));
  },
  pickVoice(lang, female) {
    if (!this.voices || !this.voices.length) { if ('speechSynthesis' in window) this.voices = speechSynthesis.getVoices(); }
    const L = lang.toLowerCase(), base = L.split('-')[0];
    const cands = (this.voices || []).filter(v => v.lang && (v.lang.toLowerCase().replace('_', '-') === L || v.lang.toLowerCase().startsWith(base)));
    if (!cands.length) return null;
    const avoid = /Grandma|Grandpa|Bubbles|Bells|Boing|Jester|Whisper|Wobble|Zarvox|Bad News|Good News|Organ|Trinoids|Cellos|Albert|Superstar|Ralph|Fred|Junior/;
    const good = cands.filter(v => !avoid.test(v.name));
    const pool = good.length ? good : cands;
    // prefer a stable voice per gender
    const fem = pool.filter(v => /Alice|Amélie|Anna|Monica|Paulina|Kyoko|Ting|Melina|Alva|Flo|Sandy|Shelley|Mei|Sin|Laila|Hedda|Amira|Marie|Petra|Mónica/i.test(v.name));
    const male = pool.filter(v => !fem.includes(v));
    if (female && fem.length) return fem[0];
    if (!female && male.length) return male[(this.voiceIdx || 0) % male.length];
    return pool[0];
  },
  // ---------- music ----------
  startMusic() {
    if (!this.ctx || this.musicOn) return;
    this.musicOn = true; this.mNext = this.now() + 0.2; this.mBar = 0;
    this.mMode = [0, 2, 3, 5, 7, 9, 10]; // dorian
    this.mRoot = 146.83; // D3
    const tick = () => { if (!this.musicOn) return; this.scheduleMusic(); this.mTimer = setTimeout(tick, 250); };
    tick();
    this.startAmbient();
  },
  stopMusic() { this.musicOn = false; clearTimeout(this.mTimer); },
  note(deg, oct) { const m = this.mMode; const o = Math.floor(deg / 7); const d = ((deg % 7) + 7) % 7; return this.mRoot * Math.pow(2, (m[d] + 12 * (o + oct)) / 12); },
  lute(f, t, dur, gain) {
    const c = this.ctx;
    const o1 = c.createOscillator(), o2 = c.createOscillator(); o1.type = 'sawtooth'; o2.type = 'triangle'; o1.frequency.value = f; o2.frequency.value = f * 2.003;
    const flt = c.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.setValueAtTime(f * 8, t); flt.frequency.exponentialRampToValueAtTime(f * 1.5, t + dur); flt.Q.value = 2;
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o1.connect(flt); o2.connect(flt); flt.connect(g); g.connect(this.music); g.connect(this.rev);
    o1.start(t); o2.start(t); o1.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
  },
  flute(f, t, dur, gain) {
    const c = this.ctx, o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f;
    const vib = c.createOscillator(); vib.frequency.value = 5; const vg = c.createGain(); vg.gain.value = f * 0.012; vib.connect(vg); vg.connect(o.frequency);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.06); g.gain.setValueAtTime(gain, t + dur * 0.8); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const n = c.createBufferSource(); n.buffer = this.noiseBuf; const nf = c.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = f * 2; nf.Q.value = 3; const ng = c.createGain(); ng.gain.value = 0.05; n.connect(nf); nf.connect(ng); ng.connect(g);
    o.connect(g); g.connect(this.music); g.connect(this.rev);
    o.start(t); vib.start(t); n.start(t); o.stop(t + dur + 0.05); vib.stop(t + dur + 0.05); n.stop(t + dur + 0.05);
  },
  drum(t, low) { this.tone(low ? 90 : 160, 0.25, t, 'sine', low ? 0.35 : 0.18, this.music, low ? 50 : 110); this.noise(0.08, t, 'bandpass', low ? 300 : 1800, 1, low ? 0.15 : 0.1, this.music); },
  drone(t, dur) {
    const c = this.ctx; for (const f of [this.mRoot / 2, this.mRoot * 0.75]) {
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
      const flt = c.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.value = 400;
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05, t + 1); g.gain.setValueAtTime(0.05, t + dur - 1); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(flt); flt.connect(g); g.connect(this.music); o.start(t); o.stop(t + dur + 0.1);
    }
  },
  scheduleMusic() {
    const beat = 0.36;
    while (this.mNext < this.now() + 1.2) {
      const t = this.mNext, bar = this.mBar++;
      const section = Math.floor(bar / 8) % 4;
      if (bar % 8 === 0) { this.drone(t, beat * 4 * 8); const roots = [146.83, 146.83, 130.81, 164.81]; this.mRoot = roots[section]; this.mMode = section === 2 ? [0, 2, 4, 5, 7, 9, 10] : [0, 2, 3, 5, 7, 9, 10]; }
      const rng = mulberry32(bar * 977 + 13);
      // lute arpeggio
      const chordDeg = [0, 3, 4, 0, 5, 3, 4, 0][bar % 8];
      for (let k = 0; k < 8; k++) {
        const deg = chordDeg + [0, 2, 4, 7, 4, 2, 0, 4][k] - (k > 4 ? 7 : 0);
        if (rng() < 0.85) this.lute(this.note(deg, 0), t + k * beat / 2, 0.7, 0.05);
      }
      // melody (flute) on some sections
      if (section !== 0 || bar % 8 >= 4) {
        let tt = t;
        while (tt < t + beat * 4 - 0.01) {
          const len = [beat, beat, beat * 2, beat / 2][(rng() * 4) | 0];
          if (rng() < 0.8) this.flute(this.note(chordDeg + [0, 2, 4, 1, 3, 5][(rng() * 6) | 0], 1), tt, len * 0.95, 0.045);
          tt += len;
        }
      }
      // frame drum
      for (let k = 0; k < 4; k++) { if (k === 0 || k === 2) this.drum(t + k * beat, true); else if (rng() < 0.6) this.drum(t + k * beat + (rng() < 0.3 ? beat / 2 : 0), false); }
      this.mNext += beat * 4;
    }
  },
  startAmbient() {
    if (this.ambOn) return; this.ambOn = true;
    const c = this.ctx;
    // wind
    const s = c.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 350;
    const g = c.createGain(); g.gain.value = 0.04;
    const lfo = c.createOscillator(); lfo.frequency.value = 0.08; const lg = c.createGain(); lg.gain.value = 150; lfo.connect(lg); lg.connect(f.frequency);
    s.connect(f); f.connect(g); g.connect(this.amb); s.start(); lfo.start();
    // waves (volume follows amount of water on screen)
    const w = c.createBufferSource(); w.buffer = this.noiseBuf; w.loop = true;
    const wf = c.createBiquadFilter(); wf.type = 'lowpass'; wf.frequency.value = 600;
    this.waveG = c.createGain(); this.waveG.gain.value = 0;
    const wl = c.createOscillator(); wl.frequency.value = 0.15; const wlg = c.createGain(); wlg.gain.value = 0.03; wl.connect(wlg); wlg.connect(this.waveG.gain);
    w.connect(wf); wf.connect(this.waveG); this.waveG.connect(this.amb); w.start(); wl.start();
    const birds = () => {
      if (!this.ambOn) return;
      if (W && !W.paused && Math.random() < 0.7 && !this.vol.muted) {
        const t = this.now(); const base = 2200 + Math.random() * 1800;
        for (let k = 0; k < 2 + (Math.random() * 4 | 0); k++) this.tone(base * (1 + Math.random() * 0.2), 0.08, t + k * 0.11, 'sine', 0.025, this.amb, base * 1.3);
      }
      this.birdT = setTimeout(birds, 2500 + Math.random() * 5000);
    };
    birds();
  },
  updateAmbient(waterFrac) { if (this.waveG) this.waveG.gain.setTargetAtTime(0.02 + waterFrac * 0.09, this.now(), 0.5); },
};
Sound.loadVol();
