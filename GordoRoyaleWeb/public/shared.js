// Código compartido entre servidor y cliente: equilibrio, objetos, generación del mundo y colisiones.
export const WORLD_R = 240;
export const PLAYER_R = 0.8;
export const STEP = 3;
const TAU = Math.PI * 2;

// ---------- Valores de equilibrio (todo configurable aquí) ----------
export const CFG = {
  walk: 8, sprint: 11.5, jump: 10.5, gravity: 28,
  stamMax: 100, sprintDrain: 12, climbDrain: 11, climbSpeed: 3.6, climbJumpCost: 18, stamRegen: 26, stamDelay: 0.7,
  heavyCost: 20, blockCost: 12, slopeLimit: 1.05, vesselBonus: 25, elixirBonus: 50, elixirTime: 60,
  fallSafe: 21, fallDmg: 4.5, zoneMult: [2, 0.7, 1], blockMult: 0.3, burnDps: 6, burnTime: 5,
  specialCd: 12, specialRadius: 8, specialDmg: 40, tpCd: 12, dragonChance: 0.2, heavyMult: 1.8,
  weightSlow: 0.011, minSpeedMul: 0.55,
};
export const ZONES = ['Cabeza', 'Torso', 'Piernas'];
export const PIECES = ['Casco', 'Peto', 'Grebas'];
export const TOWER_H = [0, 12, 22, 34, 50];
export const BIOMES = ['Bosque', 'Montañas', 'Tierras Nevadas', 'Tierras Místicas', 'Desierto', 'Llanuras del Castillo'];

// style: chop (tajo vertical), stab (estocada), heavy (mandoble a dos manos), sweep (barrido enorme)
export const WEAPONS = [
  { name: 'Espada de Madera', dmg: 13, range: 2.6, cd: 0.55, wind: 0.16, kb: 6, len: 1.3, w: 2, color: 0x9b6b3a, glow: 0, style: 'chop', rank: 0, block: true },
  { name: 'Estoque Ligero', dmg: 11, range: 2.5, cd: 0.3, wind: 0.09, kb: 3, len: 1.25, w: 1, color: 0xe8eef5, glow: 0, style: 'stab', rank: 1, block: false },
  { name: 'Espada de Hierro', dmg: 20, range: 2.8, cd: 0.55, wind: 0.17, kb: 7, len: 1.5, w: 4, color: 0xaab4bd, glow: 0, style: 'chop', rank: 2, block: true },
  { name: 'Espada de Oro', dmg: 26, range: 3.0, cd: 0.52, wind: 0.17, kb: 8, len: 1.7, w: 5, color: 0xffd23f, glow: 0.25, style: 'chop', rank: 3, block: true },
  { name: 'Mandoble Pesado', dmg: 42, range: 3.5, cd: 1.05, wind: 0.38, kb: 13, len: 2.5, w: 11, color: 0x6f7c88, glow: 0, style: 'heavy', rank: 4, block: true, two: true },
  { name: 'Cuchilla del Chef', dmg: 33, range: 3.2, cd: 0.5, wind: 0.16, kb: 10, len: 1.9, w: 5, color: 0xff8a3d, glow: 0.7, style: 'chop', rank: 5, block: true },
  { name: 'GORDOCALIBUR', dmg: 46, range: 3.7, cd: 0.46, wind: 0.15, kb: 13, len: 2.4, w: 6, color: 0x4ff0ff, glow: 1.2, style: 'chop', rank: 7, block: true },
  { name: 'Espada Colosal (5 m)', dmg: 90, range: 6.4, cd: 2.0, wind: 0.7, kb: 22, len: 5, w: 22, color: 0x8892a0, glow: 0, style: 'sweep', rank: 6, block: false, two: true, wide: true },
  { name: 'Colmillo de Dragón', dmg: 40, range: 3.4, cd: 0.5, wind: 0.16, kb: 11, len: 2.2, w: 6, color: 0xff3b00, glow: 1.5, style: 'chop', rank: 8, block: true, fire: true },
];
export const ARMOR_T = [
  null,
  { name: 'de cuero', prot: 0.3, dur: [35, 60, 45], w: [1, 3, 2], color: 0x8a5a2b },
  { name: 'de malla', prot: 0.5, dur: [60, 105, 80], w: [3, 7, 5], color: 0x8f9aa5 },
  { name: 'de placas', prot: 0.7, dur: [95, 170, 125], w: [6, 13, 9], color: 0xdfe6ee },
];
export const ITEMS = {
  stam: { name: 'Poción de resistencia', desc: 'Restaura toda la resistencia al instante.', key: '1', icon: '🧪', color: 0x35d07f },
  elixir: { name: 'Elixir de aguante', desc: '+50 de resistencia máxima durante 60 s.', key: '2', icon: '⚗️', color: 0xffc533 },
  feather: { name: 'Pluma de impulso', desc: 'Úsala en el aire para impulsarte hacia arriba.', key: '3', icon: '🪶', color: 0x9fe8ff },
  vessel: { name: 'Vasija de vigor', desc: 'Mejora permanente: +25 de resistencia máxima.', icon: '🏺', color: 0xff7ad9, passive: true },
  djump: { name: 'Botas de doble salto', desc: 'Permiten saltar una segunda vez en el aire.', icon: '🥾', color: 0x7dd3fc, passive: true },
  claws: { name: 'Garras de escalada', desc: 'Escalas un 50 % más rápido y gastas un 40 % menos de resistencia.', icon: '🧤', color: 0xffa94d, passive: true },
  picks: { name: 'Piolets de hielo', desc: 'Permiten agarrarse a las paredes de hielo de las Tierras Nevadas.', icon: '⛏️', color: 0xcfefff, passive: true },
};
export function armorName(zone, tier) { return `${PIECES[zone]} ${ARMOR_T[tier].name}`; }
export function speedMul(weight) { return Math.max(CFG.minSpeedMul, 1 - weight * CFG.weightSlow); }
// arm: [[tier, dur], [tier, dur], [tier, dur]]
export function weightOf(weapon, arm) {
  let w = WEAPONS[weapon] ? WEAPONS[weapon].w : 0;
  for (let z = 0; z < 3; z++) if (arm[z][0] > 0 && arm[z][1] > 0) w += ARMOR_T[arm[z][0]].w[z];
  return w;
}

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

// Tipos sobre los que se puede estar de pie / escalar
export const STAND = { rock: 1, crate: 1, chest: 1, hut: 1, wall: 1, ctower: 1, keep: 1, tower: 1, ruin: 1, col: 1 };
export const CLIMB = { rock: 1, hut: 1, wall: 1, ctower: 1, keep: 1, tower: 1, ruin: 1, col: 1 };

// ---------- Generación del mundo ----------
export function makeWorld(seed) {
  const R = rng(seed);
  const a0 = R() * TAU;
  const ph = []; for (let i = 0; i < 8; i++) ph.push([R() * TAU, R() * TAU]);
  const wave = (k, x, z, f) => Math.sin((x * Math.cos(ph[k][0]) + z * Math.sin(ph[k][0])) * f + ph[k][1]);
  const SEC = TAU / 5;
  const wts = new Float64Array(6);
  function weights(x, z) {
    const r = Math.hypot(x, z), pc = 1 - smooth(62, 100, r);
    const a = Math.atan2(x, z) - a0;
    let sum = 0;
    for (let i = 0; i < 5; i++) {
      let d = (a - i * SEC) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU;
      let w = Math.max(0, 1 - Math.abs(d) / (SEC * 0.62)); w *= w;
      wts[i] = w; sum += w;
    }
    for (let i = 0; i < 5; i++) wts[i] = wts[i] / sum * (1 - pc);
    wts[5] = pc;
    return wts;
  }
  function biomeAt(x, z) { const w = weights(x, z); let b = 0; for (let i = 1; i < 6; i++) if (w[i] > w[b]) b = i; return b; }
  const terr = (h, s) => { const q = h / s, f = Math.floor(q); return (f + smooth(0.72, 1, q - f)) * s; };
  const flats = [];
  function raw(x, z) {
    const w = weights(x, z);
    const w0 = wave(0, x, z, 0.035), w1 = wave(1, x, z, 0.07), w2 = wave(2, x, z, 0.022), w3 = wave(3, x, z, 0.036),
      w4 = wave(4, x, z, 0.05), w5 = wave(5, x, z, 0.09), w6 = wave(6, x, z, 0.016);
    let h = 0;
    if (w[0] > 0) h += w[0] * (3.5 + 2.5 * w0 + 1.2 * w1);
    if (w[1] > 0) h += w[1] * (13 + 38 * (1 - Math.abs(w3)) * (0.55 + 0.45 * w6) + 5 * w1 + 3 * w5);
    if (w[2] > 0) { const s = 10 + 9 * w2 + 8 * (1 - Math.abs(w4)) + 2 * w1; h += w[2] * (s * 0.3 + terr(s, 7) * 0.7); }
    if (w[3] > 0) h += w[3] * terr(5 + 6 * w0 + 5 * w4, 5);
    if (w[4] > 0) h += w[4] * (2.5 + 4.5 * Math.abs(w4) + 1.5 * w0);
    if (w[5] > 0) h += w[5] * (2.2 + 1.0 * w0 + 0.5 * w1);
    return h;
  }
  function full(x, z) {
    let h = raw(x, z);
    for (const f of flats) {
      const d = Math.hypot(x - f.x, z - f.z);
      if (d < f.r) { const t = 1 - smooth(f.r * 0.6, f.r, d); h += (f.h - h) * t; }
    }
    const r = Math.hypot(x, z);
    if (h < 0.5) h = 0.5;
    const t = smooth(WORLD_R - 22, WORLD_R + 10, r);
    return h * (1 - t) - 3 * t;
  }
  const polar = (a, d) => [Math.round(Math.sin(a) * d), Math.round(Math.cos(a) * d)];

  // --- Puntos de interés ---
  flats.push({ x: 0, z: 0, r: 52, h: 2.2 });
  const towers = [], camps = [{ x: 0, z: 10, king: true }], forts = [], ruins = [];
  const TDEF = [[0, 1, -0.32, 122], [0, 2, 0.3, 186], [4, 1, -0.3, 126], [4, 2, 0.3, 190], [2, 2, -0.3, 130], [2, 3, 0.28, 188],
    [3, 2, -0.3, 126], [3, 3, 0.3, 186], [1, 3, -0.3, 132], [1, 4, 0.16, 182]];
  const TNAME = ['del Bosque', 'de la Cumbre', 'del Hielo', 'Mística', 'de las Dunas'];
  for (const [b, tier, off, d] of TDEF) {
    const [x, z] = polar(a0 + b * SEC + off, d);
    towers.push({ x, z, tier, biome: b, name: `Torre ${TNAME[b]} ${['', 'I', 'II', 'III', 'IV'][tier]}` });
  }
  for (let b = 0; b < 5; b++) { const [x, z] = polar(a0 + b * SEC + 0.02, 152); camps.push({ x, z, king: false }); }
  for (let b = 0; b < 5; b++) { const [x, z] = polar(a0 + (b + 0.5) * SEC, 112); forts.push({ x, z }); }
  for (let i = 0; i < 14; i++) {
    for (let k = 0; k < 30; k++) {
      const [x, z] = polar(R() * TAU, 70 + R() * 145);
      let ok = true;
      for (const p of [...towers, ...camps, ...forts, ...ruins]) if (Math.hypot(x - p.x, z - p.z) < 26) { ok = false; break; }
      if (ok) { ruins.push({ x, z }); break; }
    }
  }
  for (const t of towers) flats.push({ x: t.x, z: t.z, r: 8, h: raw(t.x, t.z) });
  for (const c of camps) if (!c.king) flats.push({ x: c.x, z: c.z, r: 14, h: raw(c.x, c.z) });
  for (const f of forts) flats.push({ x: f.x, z: f.z, r: 18, h: raw(f.x, f.z) });
  for (const f of ruins) flats.push({ x: f.x, z: f.z, r: 9, h: raw(f.x, f.z) });

  // --- Rejilla de alturas ---
  const half = WORLD_R + 24, n = Math.floor(2 * half / STEP) + 1;
  const grid = new Float32Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) grid[j * n + i] = full(-half + i * STEP, -half + j * STEP);
  function H(x, z) {
    let fx = (x + half) / STEP, fz = (z + half) / STEP;
    fx = clamp(fx, 0, n - 1.001); fz = clamp(fz, 0, n - 1.001);
    const i = fx | 0, j = fz | 0, u = fx - i, v = fz - j, k = j * n + i;
    return (grid[k] * (1 - u) + grid[k + 1] * u) * (1 - v) + (grid[k + n] * (1 - u) + grid[k + n + 1] * u) * v;
  }
  const slopeAt = (x, z) => Math.hypot(H(x + 1.5, z) - H(x - 1.5, z), H(x, z + 1.5) - H(x, z - 1.5)) / 3;

  // --- Obstáculos ---
  const obs = [];
  let id = 1;
  const add = (t, x, z, r, top, extra) => { const o = { id: id++, t, x, z, r, top, y: H(x, z), s: R(), ...extra }; obs.push(o); return o; };
  const box = (t, x, z, hw, hd, top, extra) => add(t, x, z, Math.max(hw, hd), top, { hw, hd, ...extra });
  // Castillo central
  const S = 32;
  box('wall', 0, -S, S, 1.3, 9); box('wall', -S, 0, 1.3, S, 9); box('wall', S, 0, 1.3, S, 9);
  box('wall', -18.5, S, 13.5, 1.3, 9); box('wall', 18.5, S, 13.5, 1.3, 9);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) add('ctower', sx * S, sz * S, 4.6, 15);
  box('keep', 0, -14, 8, 8, 20);
  for (const o of obs) o.y = 2.2;
  // Fortalezas
  for (const f of forts) {
    const s = 8, y = H(f.x, f.z), e = { y };
    box('wall', f.x, f.z - s, s, 0.9, 5, e); box('wall', f.x - s, f.z, 0.9, s, 5, e); box('wall', f.x + s, f.z, 0.9, s, 5, e);
    box('wall', f.x - 5.5, f.z + s, 2.5, 0.9, 5, e); box('wall', f.x + 5.5, f.z + s, 2.5, 0.9, 5, e);
    add('ctower', f.x - s, f.z - s, 2.6, 10, e);
    add('chest', f.x, f.z - 3, 0.8, 0.9, { rich: true });
    add('barrel', f.x + 4, f.z + 2, 0.6, 1.35); add('crate', f.x - 4, f.z + 3, 0.8, 1.4);
  }
  // Torres de exploración
  for (const t of towers) { const o = add('tower', t.x, t.z, 3.4, TOWER_H[t.tier], { tier: t.tier, name: t.name }); t.id = o.id; t.y = o.y; t.top = o.y + o.top; }
  // Ruinas
  for (const f of ruins) {
    const k = 3 + (R() * 3 | 0);
    for (let i = 0; i < k; i++) {
      const a = R() * TAU, d = 2 + R() * 5, x = f.x + Math.sin(a) * d, z = f.z + Math.cos(a) * d;
      if (R() < 0.45) add('col', x, z, 0.65, 3.5 + R() * 3);
      else { const l = 1.6 + R() * 2.2, hz = R() < 0.5; box('ruin', x, z, hz ? l : 0.55, hz ? 0.55 : l, 1.6 + R() * 2.6); }
    }
    if (R() < 0.6) add('chest', f.x, f.z, 0.8, 0.9);
  }
  // Vegetación y botín por bioma: [tipo, probabilidad acumulada]
  const TABLE = [
    [['tree', 0.6], ['rock', 0.66], ['crate', 0.75], ['chest', 0.8], ['barrel', 0.88], ['hut', 0.9]],
    [['rock', 0.4], ['pine', 0.58], ['chest', 0.63], ['crate', 0.68], ['barrel', 0.73]],
    [['pine', 0.42], ['rock', 0.56], ['crate', 0.64], ['chest', 0.69], ['barrel', 0.75], ['hut', 0.77]],
    [['shroom', 0.3], ['crystal', 0.54], ['chest', 0.61], ['crate', 0.67], ['barrel', 0.73]],
    [['cactus', 0.24], ['rock', 0.42], ['crate', 0.5], ['chest', 0.55], ['barrel', 0.63], ['hut', 0.65]],
    [['tree', 0.14], ['crate', 0.26], ['barrel', 0.36], ['chest', 0.41], ['hut', 0.46], ['rock', 0.51]],
  ];
  const SIZE = { tree: [0.6, 5.5], pine: [0.6, 6], cactus: [0.5, 3], shroom: [0.7, 4], crystal: [0.8, 2.6], crate: [0.8, 1.4], chest: [0.8, 0.9], barrel: [0.6, 1.35], hut: [3.5, 4.2] };
  const pois = [...towers.map(t => [t.x, t.z, 9]), ...camps.map(c => [c.x, c.z, 13]), ...forts.map(f => [f.x, f.z, 16]), ...ruins.map(f => [f.x, f.z, 9])];
  for (let i = 0; i < 1750; i++) {
    const a = R() * TAU, d = Math.sqrt(R()) * (WORLD_R - 14), q = R(), rr = R();
    const x = Math.round(Math.sin(a) * d * 100) / 100, z = Math.round(Math.cos(a) * d * 100) / 100;
    if (d < 50) continue;
    const row = TABLE[biomeAt(x, z)];
    let t = null; for (const [k, p] of row) if (q < p) { t = k; break; }
    if (!t) continue;
    let r, top;
    if (t === 'rock') { r = 1 + rr * 1.6; top = r * 0.85; } else[r, top] = SIZE[t];
    if (t === 'hut' && slopeAt(x, z) > 0.25) continue;
    let ok = true;
    for (const p of pois) if (Math.hypot(x - p[0], z - p[1]) < p[2] + r) { ok = false; break; }
    if (ok) for (const o of obs) if (Math.abs(x - o.x) < 8 && Math.hypot(x - o.x, z - o.z) < r + o.r + 1.8) { ok = false; break; }
    if (ok) add(t, x, z, Math.round(r * 100) / 100, Math.round(top * 100) / 100);
  }
  // Vehículos
  const vehicles = [{ type: 0, x: -6, z: 42 }, { type: 1, x: 6, z: 42 }];
  forts.forEach((f, i) => vehicles.push({ type: i % 2, x: f.x + 3, z: f.z + 13 }));
  camps.forEach((c, i) => { if (!c.king && i % 2) vehicles.push({ type: 1, x: c.x + 15, z: c.z }); });
  towers.forEach((t, i) => { if (i % 3 === 0) vehicles.push({ type: i % 2, x: t.x + 7, z: t.z + 3 }); });
  return { seed, obs, camps, towers, forts, ruins, vehicles, H, slopeAt, biomeAt, weights, grid, n, half };
}

// ---------- Colisiones ----------
// Distancia desde (x,z) hasta la superficie del obstáculo (negativa si está dentro).
export function distTo(o, x, z) {
  if (o.hw) {
    const dx = Math.abs(x - o.x) - o.hw, dz = Math.abs(z - o.z) - o.hd;
    return Math.hypot(Math.max(dx, 0), Math.max(dz, 0)) + Math.min(Math.max(dx, dz), 0);
  }
  return Math.hypot(x - o.x, z - o.z) - o.r;
}
// Empuja un círculo fuera de los obstáculos (según su altura y) y lo mantiene en la isla. Devuelve [x, z, obstáculoTocado].
export function collide(x, z, r, y, obs) {
  let hit = null;
  for (let i = 0; i < obs.length; i++) {
    const o = obs[i], topY = o.y + o.top;
    if (y > topY - (STAND[o.t] ? 0.7 : 0)) continue;
    if (o.hw) {
      const cx = clamp(x, o.x - o.hw, o.x + o.hw), cz = clamp(z, o.z - o.hd, o.z + o.hd);
      const dx = x - cx, dz = z - cz, d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 > 1e-6) { const d = Math.sqrt(d2); x = cx + dx / d * r; z = cz + dz / d * r; }
      else {
        const px = o.hw - Math.abs(x - o.x), pz = o.hd - Math.abs(z - o.z);
        if (px < pz) x = o.x + (x < o.x ? -1 : 1) * (o.hw + r); else z = o.z + (z < o.z ? -1 : 1) * (o.hd + r);
      }
      hit = o;
    } else {
      const dx = x - o.x, dz = z - o.z, m = r + o.r, d2 = dx * dx + dz * dz;
      if (d2 >= m * m) continue;
      const d = Math.sqrt(d2) || 0.001;
      x = o.x + dx / d * m; z = o.z + dz / d * m; hit = o;
    }
  }
  const d = Math.hypot(x, z), lim = WORLD_R - 2;
  if (d > lim) { x = x / d * lim; z = z / d * lim; }
  return [x, z, hit];
}
// Altura del suelo en (x,z) para alguien que está a la altura y (terreno o encima de una estructura).
export function groundAt(world, x, z, y, obs) {
  let g = world.H(x, z);
  for (let i = 0; i < obs.length; i++) {
    const o = obs[i];
    if (!STAND[o.t]) continue;
    const topY = o.y + o.top;
    if (topY <= g || y < topY - 0.7) continue;
    if (distTo(o, x, z) < 0.15) g = topY;
  }
  return g;
}
