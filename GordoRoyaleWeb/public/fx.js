// GORDO ROYALE - efectos visuales (partículas, textos flotantes, destellos) y sonido sintetizado
import * as THREE from '/vendor/three.module.js';
import { G } from '/models.js';

let scene = null, groundY = () => 0;
export function initFx(s, groundFn) { scene = s; groundY = groundFn; }

const parts = [], decals = [], floats = [], flashes = [], rings = [];
const pMat = new Map();
function pm(c) { if (!pMat.has(c)) pMat.set(c, new THREE.MeshBasicMaterial({ color: c })); return pMat.get(c); }
// opts: grav (gravedad), up (sesgo hacia arriba)
export function burst(x, y, z, n, colors, speed, size = 0.25, life = 1, grav = 22, up = 1) {
  for (let i = 0; i < n && parts.length < 700; i++) {
    const m = new THREE.Mesh(G.sphLo, pm(colors[i % colors.length]));
    const s = size * (0.5 + Math.random());
    m.scale.setScalar(s); m.position.set(x, y, z); scene.add(m);
    const a = Math.random() * 6.28;
    parts.push({ m, s, vx: Math.sin(a) * speed * (0.3 + Math.random()), vy: speed * (0.4 + Math.random()) * up, vz: Math.cos(a) * speed * (0.3 + Math.random()), life: life * (0.6 + Math.random() * 0.8), grav });
  }
}
export function flash(x, y, z, r, color, dur = 0.35, op = 0.75) {
  const m = new THREE.Mesh(G.sph, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, depthWrite: false }));
  m.position.set(x, y, z); scene.add(m); flashes.push({ m, r, t: 0, dur, op });
}
// anillo que se expande por el suelo (onda de choque, activación, subida de nivel)
export function ring(x, y, z, r, color, dur = 0.6) {
  const m = new THREE.Mesh(new THREE.RingGeometry(0.82, 1, 40), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.set(x, y + 0.12, z); scene.add(m); rings.push({ m, r, t: 0, dur });
}
export function decal(x, y, z, r, color, life = 14) {
  const m = new THREE.Mesh(new THREE.CircleGeometry(r, 18), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.set(x, y + 0.06 + Math.random() * 0.03, z); scene.add(m); decals.push({ m, life });
}
export function floatText(txt, color, x, y, z, scale = 1) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const g = c.getContext('2d'); g.font = 'bold 40px Segoe UI, Arial'; g.textAlign = 'center';
  g.lineWidth = 7; g.strokeStyle = '#000'; g.strokeText(txt, 128, 46); g.fillStyle = color; g.fillText(txt, 128, 46);
  const t = new THREE.CanvasTexture(c);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
  s.position.set(x + (Math.random() - 0.5), y, z + (Math.random() - 0.5)); s.scale.set(3.8 * scale, 0.95 * scale, 1); s.renderOrder = 11;
  scene.add(s); floats.push({ s, t, life: 1.0 });
}
export function boomFx(x, y, z, r, kind) {
  const cols = kind === 2 ? [0xff5a1f, 0xffd60a, 0xff2200, 0xffa200] : kind ? [0xff7b00, 0xffd60a, 0x333333, 0xff3d00] : [0x6b3f1d, 0x8b5a2b, 0x4a2c12, 0xa9743a];
  burst(x, y + 0.3, z, kind === 2 ? 60 : 46, cols, kind === 2 ? 9 : 11, kind ? 0.32 : 0.36, 1.1);
  flash(x, y, z, r, kind === 2 ? 0xff7a1a : kind ? 0xffb300 : 0x8b5a2b);
  if (kind === 2) { ring(x, groundY(x, z), z, r, 0xffa200, 0.5); burst(x, y, z, 24, [0xff5a1f, 0xffd60a], 3, 0.3, 1.6, -6, 1); }
  decal(x, groundY(x, z), z, r * 0.55, kind ? 0x2b2b2b : 0x5a3516);
}
export function updateFx(dt) {
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i]; p.life -= dt; p.vy -= p.grav * dt;
    const o = p.m.position; o.x += p.vx * dt; o.y += p.vy * dt; o.z += p.vz * dt;
    if (p.grav > 0 && p.vy < 0) { const gy = groundY(o.x, o.z) + 0.08; if (o.y < gy) { o.y = gy; p.vy *= -0.3; p.vx *= 0.6; p.vz *= 0.6; } }
    p.m.scale.setScalar(p.s * Math.max(0.05, Math.min(1, p.life / 0.4)));
    if (p.life <= 0) { scene.remove(p.m); parts.splice(i, 1); }
  }
  for (let i = flashes.length - 1; i >= 0; i--) {
    const f = flashes[i]; f.t += dt; const k = f.t / f.dur;
    f.m.scale.setScalar(f.r * (0.25 + 0.75 * Math.min(1, k))); f.m.material.opacity = f.op * (1 - k);
    if (k >= 1) { scene.remove(f.m); f.m.material.dispose(); flashes.splice(i, 1); }
  }
  for (let i = rings.length - 1; i >= 0; i--) {
    const f = rings[i]; f.t += dt; const k = f.t / f.dur;
    f.m.scale.setScalar(Math.max(0.01, f.r * k)); f.m.material.opacity = 0.9 * (1 - k);
    if (k >= 1) { scene.remove(f.m); f.m.geometry.dispose(); f.m.material.dispose(); rings.splice(i, 1); }
  }
  for (let i = decals.length - 1; i >= 0; i--) {
    const d = decals[i]; d.life -= dt; d.m.material.opacity = Math.min(0.85, d.life / 4);
    if (d.life <= 0) { scene.remove(d.m); d.m.geometry.dispose(); d.m.material.dispose(); decals.splice(i, 1); }
  }
  for (let i = floats.length - 1; i >= 0; i--) {
    const f = floats[i]; f.life -= dt; f.s.position.y += dt * 2.2; f.s.material.opacity = Math.min(1, f.life / 0.3);
    if (f.life <= 0) { scene.remove(f.s); f.t.dispose(); f.s.material.dispose(); floats.splice(i, 1); }
  }
}

// ---------- Sonido ----------
let ac = null, noiseBuf = null, engine = null;
export function initAudio() {
  if (ac) return;
  try {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } catch { ac = null; }
}
// tonos: [forma, f0, f1, duración, volumen]
const TONES = {
  hit: ['square', 220, 90, 0.12, 0.2], head: ['square', 660, 330, 0.16, 0.22], hurt: ['sawtooth', 160, 60, 0.2, 0.25],
  pick: ['sine', 520, 1040, 0.18, 0.2], win: ['triangle', 400, 1200, 0.8, 0.25], die: ['sawtooth', 300, 40, 0.7, 0.25],
  deny: ['square', 150, 120, 0.09, 0.12], ready: ['sine', 880, 1320, 0.08, 0.1], clang: ['triangle', 1400, 500, 0.18, 0.25],
  tired: ['sawtooth', 200, 70, 0.4, 0.18], rested: ['sine', 500, 800, 0.2, 0.12], jump2: ['sine', 300, 900, 0.2, 0.15],
  tp: ['sine', 200, 1600, 0.5, 0.2], roar: ['sawtooth', 190, 55, 1.3, 0.4], mount: ['triangle', 250, 500, 0.15, 0.15],
  drink: ['sine', 300, 600, 0.3, 0.15], swingH: ['triangle', 140, 60, 0.3, 0.18],
};
// noise: [filtro, f0, f1, duración, volumen]
const NOISES = {
  boom: ['lowpass', 900, 60, 0.9, 0.9], swing: ['bandpass', 500, 2200, 0.16, 0.25], break: ['bandpass', 700, 700, 0.25, 0.3],
  abreak: ['highpass', 2500, 900, 0.45, 0.45], fire: ['bandpass', 300, 1400, 0.7, 0.5], step: ['lowpass', 300, 100, 0.08, 0.1], whoosh: ['bandpass', 300, 900, 0.5, 0.3],
};
export function snd(type, vol = 1) {
  if (!ac || vol <= 0.01) return;
  const t = ac.currentTime, g = ac.createGain(); g.connect(ac.destination);
  if (NOISES[type]) {
    const [ft, f0, f1, dur, v] = NOISES[type];
    const n = ac.createBufferSource(); n.buffer = noiseBuf;
    const f = ac.createBiquadFilter(); f.type = ft; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(v * vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    n.connect(f); f.connect(g); n.start(t); n.stop(t + dur);
  } else if (TONES[type]) {
    const [w, f0, f1, dur, v] = TONES[type];
    const o = ac.createOscillator(); o.connect(g); o.type = w;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(v * vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.start(t); o.stop(t + dur);
  }
}
// melodía corta ascendente (mejora desbloqueada, torre activada, recompensa legendaria)
export function jingle(notes = [523, 659, 784, 1047], step = 0.11, vol = 0.18) {
  if (!ac) return;
  notes.forEach((f, i) => {
    const t = ac.currentTime + i * step, o = ac.createOscillator(), g = ac.createGain();
    o.type = 'triangle'; o.frequency.value = f; o.connect(g); g.connect(ac.destination);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    o.start(t); o.stop(t + 0.36);
  });
}
// motor continuo del vehículo: type 0 moto (grave), 1 patinete (zumbido eléctrico); speed<0 lo apaga
export function engineSound(type, speed) {
  if (!ac) return;
  if (speed < 0) { if (engine) { engine.g.gain.setTargetAtTime(0, ac.currentTime, 0.08); const e = engine; engine = null; setTimeout(() => e.o.stop(), 400); } return; }
  if (!engine || engine.type !== type) {
    if (engine) engine.o.stop();
    const o = ac.createOscillator(), g = ac.createGain(), f = ac.createBiquadFilter();
    o.type = type ? 'triangle' : 'sawtooth'; f.type = 'lowpass'; f.frequency.value = type ? 2500 : 600;
    o.connect(f); f.connect(g); g.connect(ac.destination); g.gain.value = 0; o.start();
    engine = { o, g, type };
  }
  const s = Math.abs(speed), t = ac.currentTime;
  engine.o.frequency.setTargetAtTime(type ? 180 + s * 38 : 42 + s * 5.5, t, 0.08);
  engine.g.gain.setTargetAtTime(type ? 0.025 + Math.min(0.05, s * 0.004) : 0.06 + Math.min(0.07, s * 0.004), t, 0.1);
}
