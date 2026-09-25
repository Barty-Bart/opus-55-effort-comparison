// Particles and transient world effects (smoke, fire, dust, corpses, markers).
const TAU = Math.PI * 2;

export class Effects {
  constructor() {
    this.parts = [];     // particles in iso-pixel space
    this.corpses = [];   // dying/dead units
    this.rubble = [];    // destroyed building remains
    this.stumps = [];    // felled trees
    this.markers = [];   // command feedback
    this.floaters = [];  // floating text
  }

  update(dt, time) {
    const P = this.parts;
    let w = 0;
    for (let i = 0; i < P.length; i++) {
      const p = P[i];
      p.life += dt;
      if (p.life >= p.max) continue;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= 1 - p.drag * dt; p.vy *= 1 - p.drag * dt;
      p.vy += p.g * dt;
      p.size += p.grow * dt;
      P[w++] = p;
    }
    P.length = w;
    this.corpses = this.corpses.filter((c) => time - c.t0 < c.ttl);
    this.rubble = this.rubble.filter((r) => time - r.t0 < 90);
    this.markers = this.markers.filter((m) => time - m.t0 < 0.8);
    this.floaters = this.floaters.filter((f) => time - f.t0 < 1.4);
    if (this.stumps.length > 1500) this.stumps.splice(0, this.stumps.length - 1500);
  }

  add(p) {
    if (this.parts.length > 1400) return;
    this.parts.push({ vx: 0, vy: 0, g: 0, drag: 0, grow: 0, life: 0, alpha: 1, ...p });
  }

  smoke(x, y, dark = false, scale = 1) {
    this.add({ x: x + (Math.random() - 0.5) * 3, y, vx: 5 + Math.random() * 5, vy: -14 - Math.random() * 8, drag: 0.4, size: 4 * scale, grow: 7 * scale, max: 2.8 + Math.random(), kind: dark ? 'dsmoke' : 'smoke', alpha: dark ? 0.55 : 0.4 });
  }
  fire(x, y, s = 1) {
    this.add({ x: x + (Math.random() - 0.5) * 6 * s, y, vx: (Math.random() - 0.5) * 6, vy: -18 - Math.random() * 16, drag: 1, size: (3 + Math.random() * 3) * s, grow: -2.2 * s, max: 0.55 + Math.random() * 0.35, kind: 'fire', alpha: 0.95 });
    if (Math.random() < 0.35) this.add({ x, y: y - 8 * s, vx: 6 + Math.random() * 6, vy: -18 - Math.random() * 10, drag: 0.35, size: 5 * s, grow: 9 * s, max: 2.6, kind: 'dsmoke', alpha: 0.5 });
  }
  dust(x, y, n = 8, s = 1, color = 'dust') {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, v = (12 + Math.random() * 26) * s;
      this.add({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.5 - 6, drag: 2.2, size: (3 + Math.random() * 3) * s, grow: 10 * s, max: 0.9 + Math.random() * 0.7, kind: color, alpha: 0.55 });
    }
  }
  chips(x, y, color = '#b08050', n = 3) {
    for (let i = 0; i < n; i++) {
      this.add({ x, y, vx: (Math.random() - 0.5) * 40, vy: -30 - Math.random() * 25, g: 120, size: 1.2, max: 0.45, kind: 'chip', color, alpha: 1 });
    }
  }
  sparkle(x, y, color = '#fff6a0', n = 10) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, v = 10 + Math.random() * 30;
      this.add({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 20, drag: 1.8, size: 1.6, max: 0.9 + Math.random() * 0.5, kind: 'spark', color, alpha: 1 });
    }
  }
  heal(x, y) { this.add({ x: x + (Math.random() - 0.5) * 10, y, vy: -16, size: 2.2, max: 0.9, kind: 'plus', color: '#7dff7a', alpha: 1 }); }
  splash(x, y) {
    for (let i = 0; i < 6; i++) this.add({ x, y, vx: (Math.random() - 0.5) * 30, vy: -25 - Math.random() * 20, g: 110, size: 1.4, max: 0.5, kind: 'chip', color: '#d8ecff', alpha: 0.9 });
  }
  marker(x, y, kind, time) { this.markers.push({ x, y, kind, t0: time }); }
  float(x, y, text, color, time) { this.floaters.push({ x, y, text, color, t0: time }); }
}
