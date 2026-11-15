// GORDO ROYALE - servidor (el host ejecuta esto). Sirve el juego por HTTP y lo sincroniza por WebSocket.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { exec } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { WORLD_R, PLAYER_R, CFG, WEAPONS, ARMOR_T, ITEMS, TOWER_H, makeWorld, collide, distTo, weightOf, speedMul, armorName } from './public/shared.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const MAX_PLAYERS = 20;
const TEST = !!process.env.GR_TEST;
const PUB = path.join(__dirname, 'public');
const VENDOR = path.join(__dirname, 'node_modules', 'three', 'build');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.png': 'image/png' };

const rollDragon = () => process.env.GR_DRAGON ? process.env.GR_DRAGON === '1' : Math.random() < CFG.dragonChance;
if (process.argv.includes('--roll-test')) {
  let n = 0; for (let i = 0; i < 200000; i++) if (Math.random() < CFG.dragonChance) n++;
  console.log(`Dragón: ${(n / 2000).toFixed(2)} % de 200000 partidas simuladas`); process.exit(0);
}

// ---------- HTTP ----------
const server = http.createServer((req, res) => {
  let u = decodeURIComponent((req.url || '/').split('?')[0]);
  if (u === '/') u = '/index.html';
  let base = PUB;
  if (u.startsWith('/vendor/')) { base = VENDOR; u = u.slice(7); }
  const file = path.normalize(path.join(base, u));
  if (!file.startsWith(base)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('No encontrado'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});
function lanIPs() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces()))
    for (const i of list || []) if (i.family === 'IPv4' && !i.internal) out.push(i.address);
  return out;
}

// ---------- Estado ----------
const BOT_NAMES = ['Barrigón', 'Tocinete', 'Albóndiga', 'Michelín', 'Panceta', 'Chorizo', 'Donut', 'Torrezno', 'Lacón', 'Morcilla',
  'Bollicao', 'Churro', 'Fabada', 'Croqueta', 'Mantecas', 'Flan', 'Zampabollos', 'Tragaldabas', 'Bacon', 'Cachopo', 'Butifarra', 'Chuletón'];
const STORM_R0 = WORLD_R + 8;
const PHASES = [
  { wait: 90, shrink: 45, r: 170, dmg: 2 },
  { wait: 60, shrink: 40, r: 110, dmg: 4 },
  { wait: 45, shrink: 35, r: 60, dmg: 7 },
  { wait: 35, shrink: 30, r: 25, dmg: 10 },
  { wait: 25, shrink: 25, r: 0, dmg: 16 },
];
const BOSS_W = {
  2: { dmg: 20, range: 3.4, cd: 1.2, wind: 0.35, kb: 10, style: 'chop' },
  3: { dmg: 32, range: 4.6, cd: 1.5, wind: 0.45, kb: 15, style: 'heavy' },
  4: { dmg: 28, range: 6.5, cd: 1.8, wind: 0.5, kb: 16, style: 'bite', wide: true },
};
const MHP = [100, 100, 260, 600, 900];
const RAD = [PLAYER_R, PLAYER_R, 1.5, 2.1, 3.2];

let state = 'lobby';           // lobby | playing | ended
let seed = 1, world = null, obs = [], obsById = new Map(), deadObs = new Set();
const ents = new Map();        // id -> entidad (0 humano, 1 bot, 2 cocinero, 3 rey, 4 dragón)
const pickups = new Map(), vehicles = new Map();
let grenades = [], fuses = [], pending = [];
let nextId = 1, hostId = 0, endTimer = 0, noHumanT = 0, halfT = 0, now = 0, matchT = 0, hasDragon = false;
let storm = {};

const r2 = v => Math.round(v * 100) / 100;
const rand = (a, b) => a + Math.random() * (b - a);
const pick = a => a[(Math.random() * a.length) | 0];
function lerpAngle(a, b, t) {
  const d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  return a + d * Math.min(1, t);
}
function send(ws, o) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); }
function broadcast(o) {
  const s = JSON.stringify(o);
  for (const e of ents.values()) if (e.ws && e.ws.readyState === 1) e.ws.send(s);
}
const humans = () => [...ents.values()].filter(e => e.kind === 0);
const contenders = () => [...ents.values()].filter(e => e.kind < 2 && e.alive);
const roster = () => [...ents.values()].map(e => [e.id, e.kind, e.name, e.color, e.mhp]);
const pkOf = p => [p.id, p.type, p.v, r2(p.x), r2(p.y), r2(p.z)];
const vehOf = v => [v.id, v.type, r2(v.x), r2(v.y), r2(v.z), r2(v.yaw), v.driver, v.pass, r2(v.sp)];
function worldMsg() {
  return { t: 'world', state, seed, dead: [...deadObs], pk: [...pickups.values()].map(pkOf), roster: roster(), host: hostId, dragon: hasDragon };
}
function sendInv(e) { if (e.kind === 0) send(e.ws, { t: 'inv', inv: e.inv, tw: [...e.towers] }); }

function newWorld(st) {
  state = st;
  seed = (Math.random() * 2 ** 31) | 0;
  world = makeWorld(seed);
  obs = [...world.obs];
  obsById = new Map(obs.map(o => [o.id, o]));
  deadObs = new Set();
  pickups.clear(); vehicles.clear(); grenades = []; fuses = []; pending = [];
  for (const e of [...ents.values()]) if (e.kind !== 0) ents.delete(e.id);
  for (const v of world.vehicles) {
    const [x, z] = collide(v.x, v.z, 1.5, 0, obs);
    const id = nextId++;
    vehicles.set(id, { id, type: v.type, x, y: world.H(x, z), z, yaw: Math.random() * 6.28, driver: 0, pass: 0, sp: 0 });
  }
  hasDragon = false;
  storm = { x: 0, z: 0, r: STORM_R0, fx: 0, fz: 0, fr: STORM_R0, nx: 0, nz: 0, nr: STORM_R0, phase: 0, mode: 'off', t: 0 };
}
function resetGear(e) {
  e.hp = e.mhp; e.alive = true; e.weapon = 0; e.gren = 2; e.kills = 0; e.kx = e.kz = 0;
  e.arm = [[0, 0], [0, 0], [0, 0]]; e.burn = 0; e.burnSrc = null; e.block = false; e.blockT = 0; e.climb = false; e.veh = 0;
  e.inv = { stam: 1, elixir: 0, feather: 0, vessel: 0, djump: 0, claws: 0, picks: 0 };
  e.towers = new Set(); e.tpT = 0; e.spcT = 0; e.atkT = 0; e.thrT = 0;
}
function makeEnt(kind, name, x, z) {
  const e = {
    id: nextId++, kind, name, color: (Math.random() * 12) | 0, x, y: world.H(x, z), z, yaw: Math.random() * 6.28,
    mhp: MHP[kind], r: RAD[kind], ws: null, ai: null,
  };
  resetGear(e);
  ents.set(e.id, e);
  return e;
}
function makeBotAI(b) {
  b.ai = {
    think: Math.random() * 0.4, mode: 'wander', gx: b.x, gz: b.z, enemy: 0, pk: 0, obs: 0, wanderT: 0,
    str: 1, strT: 0, react: 0.3, grenT: rand(3, 8), stT: 1, lx: b.x, lz: b.z, sideT: 0, sdx: 0, sdz: 0,
    brave: Math.random() < 0.3, calm: rand(35, 110),
  };
}
function placeLobby(e) {
  resetGear(e);
  [e.x, e.z] = collide(rand(-12, 12), rand(40, 50), e.r, 0, obs);
  e.y = world.H(e.x, e.z);
  send(e.ws, { t: 'tp', x: e.x, y: e.y, z: e.z }); sendInv(e);
}
function toLobby() {
  newWorld('lobby');
  for (const h of humans()) placeLobby(h);
  broadcast(worldMsg());
}
function startMatch() {
  newWorld('playing');
  const hs = humans(), slots = [], off = Math.random() * 6.28;
  for (let i = 0; i < MAX_PLAYERS; i++) {
    const a = off + i * Math.PI * 2 / MAX_PLAYERS, d = [212, 165, 192][i % 3];
    slots.push(collide(Math.sin(a) * d, Math.cos(a) * d, PLAYER_R, 0, obs));
  }
  slots.sort(() => Math.random() - 0.5);
  const names = [...BOT_NAMES].sort(() => Math.random() - 0.5);
  hs.forEach((h, i) => { resetGear(h); h.x = slots[i][0]; h.z = slots[i][1]; h.y = world.H(h.x, h.z); });
  for (let i = hs.length; i < MAX_PLAYERS; i++) makeBotAI(makeEnt(1, names[i % names.length], slots[i][0], slots[i][1]));
  for (const c of world.camps) {
    const b = makeEnt(c.king ? 3 : 2, c.king ? 'REY GORDO' : 'Cocinero Grasiento', c.x, c.z);
    b.ai = { camp: c, target: 0 };
  }
  hasDragon = rollDragon();
  if (hasDragon) {
    const d = makeEnt(4, 'DRAGÓN DEL CASTILLO', 0, -14); d.y = 46;
    d.ai = { st: 'fly', ang: Math.random() * 6.28, target: 0, fireT: 4, shots: 0, t: 0, atk: 0 };
    console.log('¡En esta partida aparece el dragón!');
  }
  storm.mode = 'wait'; storm.phase = 0; storm.t = PHASES[0].wait; pickNext();
  noHumanT = 0; matchT = 0;
  broadcast(worldMsg());
  for (const h of hs) { send(h.ws, { t: 'tp', x: h.x, y: h.y, z: h.z }); sendInv(h); }
  if (hasDragon) broadcast({ t: 'msg', m: '🐉 ¡Un dragón sobrevuela el castillo central!', big: 1 });
}
function endMatch(w) {
  if (state !== 'playing') return;
  state = 'ended'; endTimer = 10;
  broadcast({ t: 'end', id: w ? w.id : 0, name: w ? w.name : 'Los bots', kills: w ? w.kills : 0 });
}

// ---------- Tormenta ----------
function pickNext() {
  const P = PHASES[storm.phase];
  const off = Math.max(0, storm.r - P.r) * 0.5 * Math.sqrt(Math.random()), a = Math.random() * 6.28;
  storm.nx = storm.x + Math.sin(a) * off; storm.nz = storm.z + Math.cos(a) * off; storm.nr = P.r;
}
function updateStorm(dt) {
  if (storm.mode === 'off' || storm.mode === 'done') return;
  storm.t -= dt;
  const P = PHASES[storm.phase];
  if (storm.mode === 'wait' && storm.t <= 0) {
    storm.mode = 'shrink'; storm.t = P.shrink; storm.fx = storm.x; storm.fz = storm.z; storm.fr = storm.r;
    broadcast({ t: 'msg', m: '🌪️ ¡La tormenta se cierra!', big: 1 });
  }
  if (storm.mode === 'shrink') {
    const k = Math.min(1, 1 - storm.t / P.shrink);
    storm.x = storm.fx + (storm.nx - storm.fx) * k; storm.z = storm.fz + (storm.nz - storm.fz) * k;
    storm.r = storm.fr + (storm.nr - storm.fr) * k;
    if (storm.t <= 0) {
      storm.phase++;
      if (storm.phase < PHASES.length) { storm.mode = 'wait'; storm.t = PHASES[storm.phase].wait; pickNext(); }
      else { storm.mode = 'done'; storm.t = 0; }
    }
  }
}

// ---------- Daño, armadura y botín ----------
function knock(o, dx, dz, force, up) {
  if (o.kind === 4) return;
  const d = Math.hypot(dx, dz) || 1, fx = dx / d * force, fz = dz / d * force;
  if (o.kind === 0) send(o.ws, { t: 'kb', x: r2(fx), z: r2(fz), y: r2(up) });
  else { const m = o.kind >= 2 ? 0.3 : 1; o.kx += fx * m; o.kz += fz * m; }
}
// zone: 0 cabeza, 1 torso, 2 piernas; undefined = daño directo (tormenta, fuego, caída)
function damage(o, amt, src, cause, zone) {
  if (state !== 'playing' || !o.alive) return;
  if (TEST && o.kind === 0 && cause !== 'storm') return;
  let ar = 0;
  if (zone !== undefined) {
    amt *= CFG.zoneMult[zone];
    const p = o.arm[zone];
    if (p[0] > 0 && p[1] > 0) {
      const absorbed = amt * ARMOR_T[p[0]].prot;
      amt -= absorbed; p[1] -= absorbed; ar = 1;
      if (p[1] <= 0) { p[1] = 0; ar = 2; broadcast({ t: 'abreak', id: o.id, z: zone, tier: p[0] }); p[0] = 0; }
    }
  }
  amt = Math.max(1, Math.round(amt));
  o.hp -= amt;
  broadcast({ t: 'hit', id: o.id, d: amt, by: src ? src.id : 0, z: zone === undefined ? -1 : zone, ar, c: cause });
  if (src && src !== o && src.alive) {
    if (o.kind >= 2) o.ai.target = src.id;
    else if (o.kind === 1 && src.kind < 2) o.ai.enemy = src.id;
  }
  if (o.hp <= 0) die(o, src, cause);
}
function setBurn(o, src, t) { if (o.alive && o.kind !== 4 && state === 'playing') { o.burn = Math.max(o.burn, t); o.burnSrc = src; } }
function spawnPickup(type, v, x, z, y, extra) {
  const a = Math.random() * 6.28, d = rand(0.4, 1.6);
  const px = x + Math.sin(a) * d, pz = z + Math.cos(a) * d;
  const p = { id: nextId++, type, v, x: px, z: pz, y: y === undefined ? world.H(px, pz) : y, ...extra };
  pickups.set(p.id, p);
  broadcast({ t: 'pk+', p: pkOf(p) });
  return p;
}
const armorPk = (zone, tier, x, z, y, dur) => spawnPickup('a', zone * 10 + tier, x, z, y, { dur: dur === undefined ? ARMOR_T[tier].dur[zone] : dur });
const randArmor = (x, z, y, tiers) => armorPk((Math.random() * 3) | 0, pick(tiers), x, z, y);
const randCons = () => { const q = Math.random(); return q < 0.5 ? 'stam' : q < 0.75 ? 'elixir' : 'feather'; };
function die(o, src, cause) {
  o.alive = false; o.hp = 0; o.burn = 0; o.block = false;
  leaveVehicle(o);
  if (src && src !== o) src.kills++;
  const { x, z, y } = o, gy = o.kind === 4 ? undefined : y;
  if (o.kind < 2) {
    if (o.weapon > 0) spawnPickup('w', o.weapon, x, z, gy);
    for (let i = 0; i < 3; i++) if (o.arm[i][0] > 0 && o.arm[i][1] > 0) armorPk(i, o.arm[i][0], x, z, gy, o.arm[i][1]);
    if (o.gren > 0) spawnPickup('g', Math.min(o.gren, 3), x, z, gy);
    if (Math.random() < 0.5) spawnPickup('b', 1, x, z, gy);
  } else if (o.kind === 2) {
    spawnPickup('w', 5, x, z); randArmor(x, z, undefined, [3]); spawnPickup('b', 1, x, z); spawnPickup('g', 3, x, z); spawnPickup('i', 'elixir', x, z);
  } else if (o.kind === 3) {
    spawnPickup('w', 6, x, z); armorPk(0, 3, x, z); armorPk(1, 3, x, z); spawnPickup('i', 'vessel', x, z); spawnPickup('b', 1, x, z);
  } else {
    spawnPickup('w', 8, x, z); for (let i = 0; i < 3; i++) armorPk(i, 3, x, z);
    spawnPickup('i', 'vessel', x, z); spawnPickup('i', 'elixir', x, z); spawnPickup('i', 'feather', x, z);
    broadcast({ t: 'msg', m: `🐉 ¡${src ? src.name : 'Alguien'} ha derrotado al DRAGÓN! Ha soltado el Colmillo de Dragón`, big: 2 });
  }
  broadcast({ t: 'die', id: o.id, vn: o.name, by: src ? src.id : 0, kn: src ? src.name : '', c: cause, pl: contenders().length + 1, k: o.kind });
}
function breakObs(o, src) {
  if (deadObs.has(o.id)) return;
  deadObs.add(o.id);
  obs = obs.filter(x => x !== o);
  broadcast({ t: 'ob-', id: o.id });
  const { x, z } = o;
  if (o.t === 'chest' && o.rich) {
    spawnPickup('w', pick([3, 4, 4]), x, z); randArmor(x, z, undefined, [2, 3]); randArmor(x, z, undefined, [2, 3]);
    spawnPickup('i', randCons(), x, z); spawnPickup('i', randCons(), x, z);
    if (Math.random() < 0.4) spawnPickup('i', pick(['claws', 'djump', 'picks', 'vessel']), x, z);
  } else if (o.t === 'chest') {
    const q = Math.random();
    spawnPickup('w', q < 0.32 ? 1 : q < 0.7 ? 2 : q < 0.92 ? 3 : 4, x, z);
    if (Math.random() < 0.6) randArmor(x, z, undefined, [1, 1, 1, 2, 2, 3]);
    if (Math.random() < 0.45) spawnPickup('g', 2, x, z);
    if (Math.random() < 0.35) spawnPickup('i', randCons(), x, z);
    if (Math.random() < 0.3) spawnPickup('b', 1, x, z);
  } else if (o.t === 'crate') {
    const q = Math.random();
    if (q < 0.28) spawnPickup('g', 2, x, z);
    else if (q < 0.5) spawnPickup('b', 1, x, z);
    else if (q < 0.65) randArmor(x, z, undefined, [1]);
    else if (q < 0.77) spawnPickup('i', 'stam', x, z);
    else if (q < 0.85) spawnPickup('w', pick([1, 2]), x, z);
  } else if (o.t === 'crystal') {
    if (Math.random() < 0.35) spawnPickup('i', randCons(), x, z);
  } else if (o.t === 'barrel') {
    explode(x, o.y + 0.8, z, src, 6.5, 50, 1);
  }
}
const BREAKABLE = { tree: 1, pine: 1, cactus: 1, shroom: 1, crystal: 1, crate: 1, chest: 1 };
// kind: 0 caca, 1 barril, 2 fuego
function explode(x, y, z, src, radius, dmg, kind, immune) {
  broadcast({ t: 'boom', x: r2(x), y: r2(y), z: r2(z), r: radius, k: kind });
  if (src && !ents.has(src.id)) src = null;
  for (const e of ents.values()) {
    if (!e.alive || e === immune) continue;
    const dx = e.x - x, dz = e.z - z, d = Math.max(0, Math.hypot(dx, dz) - e.r);
    if (d >= radius || Math.abs(e.y - y) > radius + (e.kind === 4 ? 4 : 0)) continue;
    const f = 1 - d / radius * 0.75;
    knock(e, dx, dz, 15 * f, 8 * f);
    damage(e, dmg * f, src, kind === 2 ? 'fire' : kind ? 'barrel' : 'poop', Math.random() < 0.5 ? 1 : 2);
    if (kind === 2) setBurn(e, src, CFG.burnTime);
  }
  for (const o of [...obs]) {
    if (distTo(o, x, z) > radius || Math.abs(o.y - y) > radius + 3) continue;
    if (BREAKABLE[o.t]) breakObs(o, src);
    else if (o.t === 'barrel' && !o.fused) { o.fused = true; fuses.push({ id: o.id, t: rand(0.12, 0.35), src }); }
  }
}
// Inicia un ataque: la animación empieza ya y el golpe se aplica al terminar el "windup".
function startAttack(e, W, heavy, pitch) {
  const wind = W.wind * (heavy ? 1.6 : 1);
  e.atkT = now + W.cd * (heavy ? 1.7 : 1);
  broadcast({ t: 'swing', id: e.id, w: r2(wind), s: heavy ? 'spin' : W.style });
  pending.push({ t: now + wind, e, W, heavy, pitch });
}
function meleeHit(e, W, heavy, pitch) {
  const fx = Math.sin(e.yaw), fz = Math.cos(e.yaw);
  const reach = W.range + (e.r - PLAYER_R), arc = heavy ? -2 : W.wide ? -0.15 : 0.4;
  const base = W.dmg * (heavy ? CFG.heavyMult : 1);
  let any = false;
  for (const o of ents.values()) {
    if (o === e || !o.alive) continue;
    if (e.kind >= 2 && o.kind >= 2) continue;
    const dx = o.x - e.x, dz = o.z - e.z, d = Math.hypot(dx, dz) || 0.01;
    if (d - o.r > reach || Math.abs(o.y - e.y) > 2.8 + (o.kind === 4 || e.kind === 4 ? 4 : 0)) continue;
    if (d > 1.2 && (dx * fx + dz * fz) / d < arc) continue;
    let zone;
    if (pitch !== null && pitch !== undefined) {
      const rel = (e.y + 2.9 + Math.tan(pitch) * d - o.y) / (2.9 * (o.r / PLAYER_R));
      zone = rel >= 0.69 ? 0 : rel >= 0.3 ? 1 : 2;
    } else { const q = Math.random(); zone = q < 0.2 ? 0 : q < 0.72 ? 1 : 2; }
    let dmg = base * (e.kind === 1 ? (o.kind === 1 ? 0.3 : 0.8) : 1), kb = W.kb;
    // bloqueo: solo si mira hacia el atacante
    if (o.kind === 1 && !o.block && WEAPONS[o.weapon].block && Math.random() < 0.12) { o.block = true; o.blockT = 0.5; }
    if (o.block && (Math.sin(o.yaw) * -dx + Math.cos(o.yaw) * -dz) / d > 0.3) {
      dmg *= CFG.blockMult; kb *= 0.3;
      broadcast({ t: 'blk', id: o.id });
    }
    knock(o, dx, dz, kb, 3);
    damage(o, dmg, e, 'sword', zone);
    if (W.fire) setBurn(o, e, 3);
    any = true;
  }
  if (e.kind >= 2) return;
  for (const o of [...obs]) {
    if (o.t !== 'crate' && o.t !== 'chest' && o.t !== 'barrel' && o.t !== 'crystal') continue;
    const dx = o.x - e.x, dz = o.z - e.z, d = Math.hypot(dx, dz) || 0.01;
    if (d - o.r > reach || Math.abs(o.y - e.y) > 3 || (dx * fx + dz * fz) / d < Math.max(arc, 0.2)) continue;
    if (o.t === 'barrel') {
      if (!o.fused && e.kind === 0) { o.fused = true; fuses.push({ id: o.id, t: 0.8, src: e }); broadcast({ t: 'fuse', id: o.id }); }
    } else breakObs(o, e);
  }
  return any;
}
function throwGrenade(e, vx, vy, vz) {
  if (state === 'playing') e.gren--;
  grenades.push({ id: nextId++, k: 0, owner: e, x: e.x + Math.sin(e.yaw) * 0.9, y: e.y + 1.7, z: e.z + Math.cos(e.yaw) * 0.9, vx, vy, vz, t: 1.8 });
  broadcast({ t: 'thr', id: e.id });
}
function updateGrenades(dt) {
  for (const g of [...grenades]) {
    if (g.k === 0) g.vy -= 25 * dt;
    g.x += g.vx * dt; g.y += g.vy * dt; g.z += g.vz * dt; g.t -= dt;
    let boom = g.t <= 0;
    const gy = world.H(g.x, g.z) + 0.25;
    if (g.y <= gy) {
      g.y = gy;
      if (g.k) boom = true;
      else if (g.vy < -3) { g.vy = -g.vy * 0.35; g.vx *= 0.6; g.vz *= 0.6; } else { g.vy = 0; g.vx *= 0.9; g.vz *= 0.9; }
    }
    if (!boom) for (const e of ents.values()) {
      if (!e.alive || e === g.owner) continue;
      if (Math.hypot(e.x - g.x, e.z - g.z) < e.r + 0.35 && g.y < e.y + 2.8 * (e.r / PLAYER_R) && g.y > e.y - 0.5) { boom = true; break; }
    }
    if (!boom) for (const o of obs) if (g.y < o.y + o.top && distTo(o, g.x, g.z) < 0.25) { boom = true; break; }
    if (boom) {
      grenades = grenades.filter(x => x !== g);
      if (g.k) explode(g.x, g.y, g.z, g.owner, 5.5, 26, 2, g.owner); else explode(g.x, g.y, g.z, g.owner, 7, 65, 0);
    }
  }
}

// ---------- Vehículos ----------
function leaveVehicle(e) {
  if (!e.veh) return;
  const v = vehicles.get(e.veh);
  if (v) {
    if (v.driver === e.id) { v.driver = 0; v.sp = 0; } else if (v.pass === e.id) v.pass = 0;
    broadcast({ t: 'veh', id: v.id, driver: v.driver, pass: v.pass, who: e.id, on: 0 });
  }
  e.veh = 0;
}

// ---------- Bots ----------
const botW = b => speedMul(weightOf(b.weapon, b.arm));
function pickWander(b) {
  const a = Math.random() * 6.28, d = Math.sqrt(Math.random()) * Math.max(6, Math.min(storm.r * 0.85, 70));
  const cx = storm.r < 75 ? storm.x : b.x * 0.92, cz = storm.r < 75 ? storm.z : b.z * 0.92;
  let x = cx + Math.sin(a) * d, z = cz + Math.cos(a) * d;
  const l = Math.hypot(x, z); if (l > WORLD_R - 12) { x *= (WORLD_R - 12) / l; z *= (WORLD_R - 12) / l; }
  b.ai.gx = x; b.ai.gz = z; b.ai.wanderT = rand(8, 14);
}
function usefulTo(b, p) {
  if (p.type === 'w') return WEAPONS[p.v].rank > WEAPONS[b.weapon].rank && p.v !== 7;
  if (p.type === 'a') { const z = (p.v / 10) | 0, t = p.v % 10; return t > b.arm[z][0] || b.arm[z][1] <= 0; }
  if (p.type === 'g') return b.gren < 6;
  if (p.type === 'b') return b.hp < 80;
  return false;
}
function botDecide(b) {
  const ai = b.ai;
  let best = null, bd = matchT < ai.calm ? 6 : 18, bossOnMe = null;
  for (const o of ents.values()) {
    if (o === b || !o.alive) continue;
    const d = Math.hypot(o.x - b.x, o.z - b.z);
    if (d >= bd || (o.kind === 1 && d > 10)) continue;
    if (o.kind >= 2) {
      const hunt = o.kind < 4 && ai.brave && WEAPONS[b.weapon].rank >= 3 && b.hp > 60 && d < 22;
      if (!hunt) { if (o.ai.target === b.id && d < 16) bossOnMe = o; continue; }
    }
    if (d > 6) {
      let n = 0;
      for (const q of ents.values()) if (q !== b && q.kind === 1 && q.alive && q.ai.enemy === o.id) n++;
      if (n >= 2) continue;
    }
    best = o; bd = d;
  }
  if (bossOnMe) { ai.enemy = bossOnMe.id; ai.mode = 'flee'; return; }
  ai.enemy = best ? best.id : 0;
  const soon = storm.mode === 'shrink' || (storm.mode === 'wait' && storm.t < 25);
  const dCur = Math.hypot(b.x - storm.x, b.z - storm.z), dNext = Math.hypot(b.x - storm.nx, b.z - storm.nz);
  if ((dCur > storm.r - 6 || (soon && dNext > storm.nr - 4)) && !(best && bd < 4)) {
    if (ai.mode !== 'storm') {
      const a = Math.random() * 6.28, d = Math.random() * storm.nr * 0.6;
      ai.gx = storm.nx + Math.sin(a) * d; ai.gz = storm.nz + Math.cos(a) * d;
    }
    ai.mode = 'storm'; return;
  }
  if (b.hp < 35) {
    let bp = null, pd = 50;
    for (const p of pickups.values()) if (p.type === 'b') { const d = Math.hypot(p.x - b.x, p.z - b.z); if (d < pd) { pd = d; bp = p; } }
    if (bp) { ai.mode = 'pick'; ai.pk = bp.id; ai.gx = bp.x; ai.gz = bp.z; return; }
    if (best && bd < 12 && bd > 3.5) { ai.mode = 'flee'; return; }
  }
  if (best) { ai.mode = 'fight'; return; }
  let bp = null, pd = 30;
  for (const p of pickups.values()) {
    if (!usefulTo(b, p) || Math.abs(p.y - b.y) > 4) continue;
    const d = Math.hypot(p.x - b.x, p.z - b.z);
    if (d >= pd) continue;
    let taken = false;
    for (const q of ents.values()) if (q !== b && q.kind === 1 && q.alive && q.ai.mode === 'pick' && q.ai.pk === p.id) { taken = true; break; }
    if (!taken) { pd = d; bp = p; }
  }
  if (bp) { ai.mode = 'pick'; ai.pk = bp.id; ai.gx = bp.x; ai.gz = bp.z; return; }
  let bo = null, od = 34;
  for (const o of obs) {
    if (o.t !== 'chest' && o.t !== 'crate') continue;
    if (Math.abs(o.x - b.x) > 34) continue;
    const d = Math.hypot(o.x - b.x, o.z - b.z) * (o.t === 'chest' ? 0.7 : 1);
    if (d >= od || Math.hypot(o.x - storm.x, o.z - storm.z) > storm.r - 4) continue;
    let taken = false;
    for (const q of ents.values()) if (q !== b && q.kind === 1 && q.alive && q.ai.mode === 'obs' && q.ai.obs === o.id) { taken = true; break; }
    if (!taken) { od = d; bo = o; }
  }
  if (bo) { ai.mode = 'obs'; ai.obs = bo.id; return; }
  if (ai.mode !== 'wander') { ai.mode = 'wander'; pickWander(b); }
}
function botAI(b, dt) {
  const ai = b.ai, W = WEAPONS[b.weapon];
  ai.think -= dt;
  if (ai.think <= 0) { ai.think = rand(0.3, 0.5); botDecide(b); }
  if (b.blockT > 0) { b.blockT -= dt; if (b.blockT <= 0) b.block = false; }
  let gx = ai.gx, gz = ai.gz, face = null, speed = 7.4 * botW(b), want = true;
  const en = ai.enemy ? ents.get(ai.enemy) : null;
  if ((ai.mode === 'fight' || ai.mode === 'flee') && (!en || !en.alive)) { ai.mode = 'wander'; pickWander(b); ai.think = 0; }
  if (ai.mode === 'fight' && en && en.alive) {
    const dx = en.x - b.x, dz = en.z - b.z, d = Math.hypot(dx, dz) || 0.01, reach = W.range + en.r - 0.3;
    face = Math.atan2(dx, dz);
    if (d > reach * 0.85) { gx = en.x; gz = en.z; }
    else {
      ai.strT -= dt;
      if (ai.strT <= 0) { ai.strT = rand(0.8, 2.2); ai.str = Math.random() < 0.5 ? -1 : 1; }
      gx = b.x - dz / d * ai.str * 4; gz = b.z + dx / d * ai.str * 4; speed *= 0.6;
    }
    ai.react -= dt;
    if (d < reach && now >= b.atkT && ai.react <= 0) { b.yaw = face; startAttack(b, W, Math.random() < 0.15, null); ai.react = rand(0.4, 1.1); }
    ai.grenT -= dt;
    if (b.gren > 0 && ai.grenT <= 0 && d > 9 && d < 22) {
      const T = 0.7 + d / 22; b.yaw = face;
      throwGrenade(b, dx / T, (en.y + 0.25 - b.y - 1.7) / T + 12.5 * T, dz / T);
      ai.grenT = rand(4, 10);
    }
  } else if (ai.mode === 'flee' && en) {
    const dx = b.x - en.x, dz = b.z - en.z, d = Math.hypot(dx, dz) || 0.01;
    gx = b.x + dx / d * 10; gz = b.z + dz / d * 10;
  } else if (ai.mode === 'obs') {
    const o = obsById.get(ai.obs);
    if (!o || deadObs.has(o.id)) { ai.mode = 'wander'; pickWander(b); ai.think = 0; }
    else {
      gx = o.x; gz = o.z;
      if (Math.hypot(o.x - b.x, o.z - b.z) < W.range + o.r - 0.3) {
        want = false; face = Math.atan2(o.x - b.x, o.z - b.z);
        if (now >= b.atkT) { b.yaw = face; startAttack(b, W, false, null); }
      }
    }
  } else if (ai.mode === 'pick') {
    if (!pickups.has(ai.pk)) { ai.mode = 'wander'; pickWander(b); ai.think = 0; }
  } else if (ai.mode === 'wander') {
    ai.wanderT -= dt;
    if (ai.wanderT <= 0 || Math.hypot(gx - b.x, gz - b.z) < 3) { pickWander(b); gx = ai.gx; gz = ai.gz; }
  }
  const dx = gx - b.x, dz = gz - b.z, d = Math.hypot(dx, dz);
  if (d < 0.6) want = false;
  let sx = 0, sz = 0;
  if (want) { sx = dx / d; sz = dz / d; }
  const wx = sx, wz = sz;
  for (const o of ents.values()) {
    if (o === b || !o.alive || o.id === ai.enemy || o.kind === 4) continue;
    const ox = b.x - o.x, oz = b.z - o.z, od = Math.hypot(ox, oz) || 0.01, min = 3.4 + o.r;
    if (od < min) { const w = (min - od) / min * 2; sx += ox / od * w; sz += oz / od * w; }
  }
  if (want) for (const o of obs) {
    if (ai.mode === 'obs' && o.id === ai.obs) continue;
    let ox, oz, od;
    if (o.hw) {
      if (Math.abs(b.x - o.x) > o.hw + 3 || Math.abs(b.z - o.z) > o.hd + 3) continue;
      ox = Math.max(o.x - o.hw, Math.min(b.x, o.x + o.hw)) - b.x; oz = Math.max(o.z - o.hd, Math.min(b.z, o.z + o.hd)) - b.z;
      od = Math.hypot(ox, oz) || 0.01;
    } else {
      ox = o.x - b.x; if (ox > 8 || ox < -8) continue;
      oz = o.z - b.z; const c = Math.hypot(ox, oz) || 0.01; od = Math.max(0.01, c - o.r); ox = ox / c * od; oz = oz / c * od;
    }
    const clear = b.r + 1.7;
    if (od > clear || ox * wx + oz * wz <= 0) continue;
    let tx = -oz / od, tz = ox / od;
    const dot = tx * wx + tz * wz;
    if (dot < -0.05 || (Math.abs(dot) <= 0.05 && ai.str < 0)) { tx = -tx; tz = -tz; }
    const w = (clear - od) / clear * 2.6;
    sx += tx * w - ox / od * w * 0.5; sz += tz * w - oz / od * w * 0.5;
  }
  if (ai.sideT > 0) { ai.sideT -= dt; sx += ai.sdx * 2.5; sz += ai.sdz * 2.5; }
  const sl = Math.hypot(sx, sz);
  b.climb = false;
  if (sl > 0.08) {
    sx /= sl; sz /= sl;
    let sp = want ? speed : speed * 0.5;
    const slope = (world.H(b.x + sx, b.z + sz) - world.H(b.x, b.z));
    if (slope > 0.3) sp /= 1 + slope * 1.3;
    b.climb = slope > CFG.slopeLimit;
    b.x += sx * sp * dt; b.z += sz * sp * dt;
    if (face === null) b.yaw = lerpAngle(b.yaw, Math.atan2(sx, sz), dt * 10);
  }
  if (face !== null) b.yaw = lerpAngle(b.yaw, face, dt * 12);
  ai.stT -= dt;
  if (ai.stT <= 0) {
    ai.stT = 1;
    if (want && Math.hypot(b.x - ai.lx, b.z - ai.lz) < 0.6 && ai.mode !== 'fight') {
      const a = Math.random() * 6.28; ai.sdx = Math.sin(a); ai.sdz = Math.cos(a); ai.sideT = 0.8;
      if (ai.mode === 'wander') pickWander(b);
    }
    ai.lx = b.x; ai.lz = b.z;
  }
}
function bossAI(b, dt) {
  const ai = b.ai, W = BOSS_W[b.kind], c = ai.camp;
  let t = ai.target ? ents.get(ai.target) : null;
  if (t && (!t.alive || Math.hypot(t.x - c.x, t.z - c.z) > 24)) { t = null; ai.target = 0; }
  if (!t) {
    let bd = 11;
    for (const o of ents.values()) {
      if (o.kind >= 2 || !o.alive || Math.abs(o.y - b.y) > 5) continue;
      const d = Math.hypot(o.x - b.x, o.z - b.z);
      if (d < bd) { bd = d; t = o; }
    }
    if (t) ai.target = t.id;
  }
  if (t) {
    const dx = t.x - b.x, dz = t.z - b.z, d = Math.hypot(dx, dz) || 0.01, reach = W.range + (b.r - PLAYER_R) + t.r;
    b.yaw = lerpAngle(b.yaw, Math.atan2(dx, dz), dt * 8);
    if (d > reach * 0.8) { const sp = b.kind === 3 ? 4.8 : 5.4; b.x += dx / d * sp * dt; b.z += dz / d * sp * dt; }
    if (d < reach && now >= b.atkT) { b.yaw = Math.atan2(dx, dz); startAttack(b, W, false, null); }
  } else {
    const dx = c.x - b.x, dz = c.z - b.z, d = Math.hypot(dx, dz);
    if (d > 1.5) { b.x += dx / d * 4 * dt; b.z += dz / d * 4 * dt; b.yaw = lerpAngle(b.yaw, Math.atan2(dx, dz), dt * 8); }
    b.hp = Math.min(b.mhp, b.hp + 8 * dt);
  }
}
// ---------- Dragón ----------
function moveTo3(d, tx, ty, tz, sp, dt) {
  const dx = tx - d.x, dy = ty - d.y, dz = tz - d.z, l = Math.hypot(dx, dy, dz) || 0.01, s = Math.min(l, sp * dt);
  d.x += dx / l * s; d.y += dy / l * s; d.z += dz / l * s;
  if (Math.hypot(dx, dz) > 0.5) d.yaw = lerpAngle(d.yaw, Math.atan2(dx, dz), dt * 5);
  return l - s;
}
function dragonAI(d, dt) {
  const ai = d.ai, W = BOSS_W[4];
  let tg = ai.target ? ents.get(ai.target) : null;
  if (tg && (!tg.alive || Math.hypot(tg.x, tg.z) > 75)) { tg = null; ai.target = 0; }
  if (!tg) {
    let bd = 58;
    for (const o of ents.values()) {
      if (o.kind >= 2 || !o.alive) continue;
      const dd = Math.hypot(o.x, o.z) * (o.kind === 0 ? 0.7 : 1);
      if (dd < bd) { bd = dd; tg = o; }
    }
    if (tg) ai.target = tg.id;
  }
  if (ai.st === 'fly') {
    ai.ang += dt * 0.42;
    const tx = Math.sin(ai.ang) * 38, tz = Math.cos(ai.ang) * 38;
    moveTo3(d, tx, Math.max(world.H(tx, tz) + 22, 27), tz, 17, dt);
    if (tg) {
      ai.fireT -= dt;
      if (ai.fireT <= 0) {
        ai.fireT = 2.8;
        const ox = d.x + Math.sin(d.yaw) * 4, oy = d.y + 1, oz = d.z + Math.cos(d.yaw) * 4;
        const dx = tg.x - ox, dy = tg.y + 0.5 - oy, dz = tg.z - oz, T = Math.max(0.5, Math.hypot(dx, dy, dz) / 34);
        grenades.push({ id: nextId++, k: 1, owner: d, x: ox, y: oy, z: oz, vx: dx / T, vy: dy / T, vz: dz / T, t: T + 0.3 });
        broadcast({ t: 'dfire', x: r2(ox), y: r2(oy), z: r2(oz) });
        if (++ai.shots >= 3) { ai.shots = 0; ai.st = 'swoop'; }
      }
    }
  } else if (ai.st === 'swoop') {
    if (!tg) ai.st = 'fly';
    else if (moveTo3(d, tg.x, tg.y + 1.2, tg.z, 30, dt) < 5.5) {
      broadcast({ t: 'swing', id: d.id, w: 0.1, s: 'bite' });
      knock(tg, tg.x - d.x, tg.z - d.z, 17, 7); damage(tg, 30, d, 'sword', 1);
      ai.st = 'land'; ai.t = 8; ai.atk = 1.2;
    }
  } else if (ai.st === 'land') {
    const gy = world.H(d.x, d.z);
    d.y += (gy - d.y) * Math.min(1, dt * 4);
    ai.t -= dt; ai.atk -= dt;
    if (tg) {
      const dx = tg.x - d.x, dz = tg.z - d.z, dd = Math.hypot(dx, dz) || 0.01;
      d.yaw = lerpAngle(d.yaw, Math.atan2(dx, dz), dt * 3);
      if (dd > 7) { d.x += dx / dd * 5 * dt; d.z += dz / dd * 5 * dt; }
      if (ai.atk <= 0 && dd < W.range + d.r + tg.r) { startAttack(d, W, false, null); ai.atk = W.cd; }
    }
    if (ai.t <= 0) ai.st = 'rise';
  } else {
    d.y += 13 * dt;
    if (d.y >= world.H(d.x, d.z) + 22) { ai.st = 'fly'; ai.ang = Math.atan2(d.x, d.z); ai.fireT = 2; }
  }
}

// ---------- Torres ----------
function towerReward(e, T) {
  const { x, z } = T, y = T.y + T.top, got = [], inv = e.inv;
  const give = (k, n = 1) => { inv[k] += n; got.push(`${ITEMS[k].icon} ${ITEMS[k].name}${n > 1 ? ' x' + n : ''}`); };
  const passive = () => { const c = ['claws', 'djump', 'picks'].filter(k => !inv[k]); if (c.length) give(pick(c)); else give('vessel'); };
  if (T.tier === 1) { give('stam', 2); e.gren = Math.min(6, e.gren + 2); got.push('💩 Granadas x2'); e.hp = Math.min(e.mhp, e.hp + 40); got.push('🍔 +40 de vida'); }
  else if (T.tier === 2) { give('vessel'); give('elixir'); const p = randArmor(x, z, y, [2]); got.push('🛡️ ' + armorName((p.v / 10) | 0, 2)); }
  else if (T.tier === 3) { passive(); give('feather', 2); const p = randArmor(x, z, y, [3]); got.push('🛡️ ' + armorName((p.v / 10) | 0, 3)); spawnPickup('w', 4, x, z, y); got.push('🗡️ ' + WEAPONS[4].name); }
  else { give('vessel'); passive(); passive(); give('elixir', 2); spawnPickup('w', 7, x, z, y); got.push('⚔️ ' + WEAPONS[7].name + ' (LEGENDARIA)'); }
  return got;
}

// ---------- Bucle ----------
let tickN = 0, last = Date.now();
function tick() {
  const t = Date.now();
  const dt = Math.min(0.1, (t - last) / 1000); last = t; now += dt; tickN++;
  // golpes pendientes (sincronizados con la animación)
  for (const p of [...pending]) {
    if (now < p.t) continue;
    pending = pending.filter(x => x !== p);
    if (!p.e.alive || !ents.has(p.e.id) || state === 'ended') continue;
    if (p.special) explode(p.e.x + Math.sin(p.e.yaw) * 4, p.e.y + 0.5, p.e.z + Math.cos(p.e.yaw) * 4, p.e, CFG.specialRadius, CFG.specialDmg, 2, p.e);
    else meleeHit(p.e, p.W, p.heavy, p.pitch);
  }
  if (state === 'playing') {
    updateStorm(dt); matchT += dt;
    for (const e of ents.values()) {
      if (!e.alive || e.kind === 0) continue;
      if (e.kind === 4) { dragonAI(e, dt); continue; }
      if (e.kind === 1) botAI(e, dt); else bossAI(e, dt);
      e.x += e.kx * dt; e.z += e.kz * dt;
      const k = Math.exp(-6 * dt); e.kx *= k; e.kz *= k;
      [e.x, e.z] = collide(e.x, e.z, e.r, e.y, obs);
      e.y = world.H(e.x, e.z);
    }
    halfT -= dt;
    if (halfT <= 0) {
      halfT = 0.5;
      const dmg = PHASES[Math.min(storm.phase, PHASES.length - 1)].dmg * 0.5;
      for (const e of [...ents.values()]) {
        if (!e.alive) continue;
        if (e.kind < 2 && Math.hypot(e.x - storm.x, e.z - storm.z) > storm.r) damage(e, dmg, null, 'storm');
        if (e.alive && e.burn > 0) { e.burn -= 0.5; damage(e, CFG.burnDps * 0.5, e.burnSrc && ents.has(e.burnSrc.id) ? e.burnSrc : null, 'fire'); }
      }
    }
    const cs = contenders(), hs = humans();
    if (hs.length === 0) toLobby();
    else if (cs.length <= 1) endMatch(cs[0]);
    else if (!TEST && !hs.some(h => h.alive)) { noHumanT += dt; if (noHumanT > 5) endMatch(null); }
  } else if (state === 'ended') {
    endTimer -= dt;
    if (endTimer <= 0) toLobby();
  }
  if (state !== 'ended') {
    // pasajeros del sidecar: van pegados al vehículo
    for (const v of vehicles.values()) {
      const p = v.pass && ents.get(v.pass);
      if (p) { p.x = v.x - Math.cos(v.yaw) * 1.35; p.z = v.z + Math.sin(v.yaw) * 1.35; p.y = v.y; }
    }
    // recoger botín (consumibles automático; equipo: bots automático, humanos con E)
    for (const p of [...pickups.values()]) {
      for (const e of ents.values()) {
        if (!e.alive || e.kind >= 2 || Math.abs(e.y - p.y) > 2.2) continue;
        if (Math.hypot(e.x - p.x, e.z - p.z) > e.r + 1.0) continue;
        let ok = false;
        if (p.type === 'g') { if (e.gren < 6) { e.gren = Math.min(6, e.gren + p.v); ok = true; } }
        else if (p.type === 'b') { if (e.hp < e.mhp) { e.hp = Math.min(e.mhp, e.hp + 40); ok = true; } }
        else if (p.type === 'i') { if (e.kind === 0) { e.inv[p.v]++; sendInv(e); ok = true; } }
        else if (e.kind === 1 && usefulTo(e, p)) { equip(e, p); break; }
        if (ok) { pickups.delete(p.id); broadcast({ t: 'pk-', id: p.id, by: e.id, ty: p.type, v: p.v }); break; }
      }
    }
    updateGrenades(dt);
    for (const f of [...fuses]) {
      f.t -= dt;
      if (f.t <= 0) { fuses = fuses.filter(x => x !== f); const o = obsById.get(f.id); if (o && !deadObs.has(o.id)) breakObs(o, f.src); }
    }
  }
  if (tickN % 2 === 0) {
    broadcast({
      t: 's',
      e: [...ents.values()].map(e => [e.id, r2(e.x), r2(e.y), r2(e.z), r2(e.yaw), Math.ceil(e.hp), e.weapon,
        (e.alive ? 1 : 0) | (e.block ? 2 : 0) | (e.burn > 0 ? 4 : 0) | (e.climb ? 8 : 0) | (e.kind === 4 && e.ai.st === 'land' ? 16 : 0),
        e.gren, e.kills, e.arm[0][0] * 1000 + Math.ceil(e.arm[0][1]), e.arm[1][0] * 1000 + Math.ceil(e.arm[1][1]), e.arm[2][0] * 1000 + Math.ceil(e.arm[2][1]), e.veh]),
      g: grenades.map(g => [g.id, r2(g.x), r2(g.y), r2(g.z), g.k]),
      v: [...vehicles.values()].map(vehOf),
      st: [r2(storm.x), r2(storm.z), r2(storm.r), r2(storm.nx), r2(storm.nz), storm.nr, Math.ceil(storm.t), storm.mode],
      al: contenders().length,
    });
  }
}
// Equipa un arma o pieza de armadura del suelo y suelta la que llevaba.
function equip(e, p) {
  if (p.type === 'w') {
    if (e.weapon > 0) spawnPickup('w', e.weapon, e.x, e.z, e.y);
    e.weapon = p.v;
  } else {
    const z = (p.v / 10) | 0, old = e.arm[z];
    if (old[0] > 0 && old[1] > 0) armorPk(z, old[0], e.x, e.z, e.y, old[1]);
    e.arm[z] = [p.v % 10, p.dur];
  }
  pickups.delete(p.id);
  broadcast({ t: 'pk-', id: p.id, by: e.id, ty: p.type, v: p.v });
}
newWorld('lobby');
setInterval(tick, 1000 / 30);

// ---------- Red ----------
const wss = new WebSocketServer({ server });
wss.on('connection', (ws, req) => {
  let me = null;
  const addr = req.socket.remoteAddress || '';
  const local = addr === '::1' || addr.endsWith('127.0.0.1');
  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (!m || typeof m !== 'object') return;
    if (m.t === 'join' && !me) {
      if (humans().length >= MAX_PLAYERS) { send(ws, { t: 'full' }); return ws.close(); }
      const name = String(m.name || 'Gordo').replace(/[<>]/g, '').trim().slice(0, 14) || 'Gordo';
      me = makeEnt(0, name, 0, 45); me.ws = ws; me.local = local;
      if (!hostId || (local && !humans().some(h => h.id === hostId && h.local))) hostId = me.id;
      send(ws, { t: 'welcome', id: me.id, ips: lanIPs(), port: PORT });
      broadcast(worldMsg());
      if (state === 'lobby') placeLobby(me); else { me.alive = false; me.hp = 0; sendInv(me); }
      broadcast({ t: 'msg', m: `${name} ha entrado` });
      console.log(`+ ${name} conectado (${addr})`);
      return;
    }
    if (!me) return;
    const live = me.alive && state !== 'ended';
    switch (m.t) {
      case 'p': {
        if (!me.alive || ![m.x, m.y, m.z, m.yaw].every(Number.isFinite)) return;
        const v = me.veh && vehicles.get(me.veh);
        if (v && v.pass === me.id) { me.yaw = m.yaw; return; }
        const d = Math.hypot(m.x, m.z);
        if (d > WORLD_R) { m.x *= WORLD_R / d; m.z *= WORLD_R / d; }
        me.x = m.x; me.z = m.z; me.y = Math.max(-5, Math.min(200, m.y)); me.yaw = m.yaw;
        me.block = !!(m.f & 2) && WEAPONS[me.weapon].block && !v; me.climb = !!(m.f & 8);
        if (v && v.driver === me.id) { v.x = me.x; v.y = me.y; v.z = me.z; v.yaw = Number.isFinite(m.vy) ? m.vy : v.yaw; v.sp = Number.isFinite(m.vs) ? m.vs : 0; }
        break;
      }
      case 'atk': {
        if (!live || now < me.atkT - 0.08) return;
        const v = me.veh && vehicles.get(me.veh);
        if (v && v.driver === me.id) return;
        if (Number.isFinite(m.yaw)) me.yaw = m.yaw;
        startAttack(me, WEAPONS[me.weapon], !!m.h, Number.isFinite(m.pitch) ? Math.max(-1.3, Math.min(1.3, m.pitch)) : null);
        break;
      }
      case 'spc': {
        if (!live || !WEAPONS[me.weapon].fire || now < me.spcT) return;
        me.spcT = now + CFG.specialCd; me.atkT = now + 0.9;
        if (Number.isFinite(m.yaw)) me.yaw = m.yaw;
        broadcast({ t: 'swing', id: me.id, w: 0.45, s: 'slam' });
        pending.push({ t: now + 0.45, e: me, special: true });
        send(ws, { t: 'spc', cd: CFG.specialCd });
        break;
      }
      case 'thr': {
        if (!live || now < me.thrT || me.gren <= 0) return;
        if (!Number.isFinite(m.yaw) || !Number.isFinite(m.pitch)) return;
        me.thrT = now + 0.7; me.yaw = m.yaw;
        const p = Math.max(-1.2, Math.min(1.2, m.pitch)), cp = Math.cos(p);
        throwGrenade(me, Math.sin(m.yaw) * cp * 19, Math.sin(p) * 19 + 6, Math.cos(m.yaw) * cp * 19);
        break;
      }
      case 'take': {
        const p = pickups.get(m.id);
        if (!live || !p || (p.type !== 'w' && p.type !== 'a')) return;
        if (Math.hypot(p.x - me.x, p.z - me.z) > 4 || Math.abs(p.y - me.y) > 3.5) return;
        equip(me, p);
        break;
      }
      case 'use': {
        if (!live || !['stam', 'elixir', 'feather'].includes(m.k) || me.inv[m.k] <= 0) return;
        me.inv[m.k]--; sendInv(me);
        send(ws, { t: 'used', k: m.k }); broadcast({ t: 'fx', k: 'use', id: me.id, v: m.k });
        break;
      }
      case 'fall': {
        if (!live || !Number.isFinite(m.v) || m.v <= CFG.fallSafe) return;
        damage(me, (m.v - CFG.fallSafe) * CFG.fallDmg, null, 'fall');
        break;
      }
      case 'tower': {
        const T = world.towers.find(t => t.id === m.id);
        if (!live || !T || me.towers.has(T.id)) return;
        if (Math.hypot(T.x - me.x, T.z - me.z) > 5 || me.y < T.top - 1.5) return;
        me.towers.add(T.id);
        const got = towerReward(me, T);
        sendInv(me);
        send(ws, { t: 'twr', id: T.id, name: T.name, tier: T.tier, got });
        broadcast({ t: 'fx', k: 'tower', id: me.id, x: T.x, y: T.top, z: T.z });
        broadcast({ t: 'msg', m: `🗼 ${me.name} ha activado la ${T.name}` });
        break;
      }
      case 'tpt': {
        const T = world.towers.find(t => t.id === m.id);
        if (!live || !T || !me.towers.has(T.id) || now < me.tpT) return;
        me.tpT = now + CFG.tpCd; leaveVehicle(me);
        broadcast({ t: 'fx', k: 'tp', id: me.id, x: r2(me.x), y: r2(me.y), z: r2(me.z) });
        me.x = T.x + 1.5; me.z = T.z; me.y = T.top;
        send(ws, { t: 'tp', x: me.x, y: me.y, z: me.z, tower: T.name, cd: CFG.tpCd });
        broadcast({ t: 'fx', k: 'tp', id: me.id, x: me.x, y: me.y, z: me.z });
        break;
      }
      case 'mount': {
        const v = vehicles.get(m.id);
        if (!live || !v || me.veh || Math.hypot(v.x - me.x, v.z - me.z) > 5) return;
        if (!v.driver) v.driver = me.id; else if (v.type === 0 && !v.pass) v.pass = me.id; else return;
        me.veh = v.id; me.block = false;
        broadcast({ t: 'veh', id: v.id, driver: v.driver, pass: v.pass, who: me.id, on: 1, v: vehOf(v) });
        break;
      }
      case 'dismount': leaveVehicle(me); break;
      case 'dbg': // solo para pruebas automáticas (GR_DBG=1)
        if (!process.env.GR_DBG) return;
        if (m.arm) me.arm = m.arm; if (m.weapon !== undefined) me.weapon = m.weapon; if (m.hp) me.hp = m.hp;
        if (m.dhp) for (const d of ents.values()) if (d.kind === 4) d.hp = m.dhp;
        if (m.spawn) spawnPickup(m.spawn[0], m.spawn[1], me.x, me.z, me.y, m.spawn[2]);
        break;
      case 'start':
        if (me.id === hostId && state === 'lobby') { console.log('¡Empieza la partida!'); startMatch(); }
        break;
    }
  });
  ws.on('close', () => {
    if (!me) return;
    leaveVehicle(me);
    ents.delete(me.id);
    console.log(`- ${me.name} desconectado`);
    if (hostId === me.id) { const h = humans(); hostId = h.length ? (h.find(x => x.local) || h[0]).id : 0; }
    broadcast({ t: 'roster', roster: roster(), host: hostId });
    broadcast({ t: 'msg', m: `${me.name} se ha ido` });
  });
  ws.on('error', () => { });
});

server.on('error', e => {
  if (e.code === 'EADDRINUSE') console.error(`\nEl puerto ${PORT} ya está en uso. Cierra la otra ventana del servidor o usa: set PORT=3001`);
  else console.error(e);
  process.exit(1);
});
server.listen(PORT, '0.0.0.0', () => {
  console.log('\n==============================================');
  console.log('   GORDO ROYALE - servidor en marcha');
  console.log('==============================================');
  console.log(`\n Tú (host) juegas en:   http://localhost:${PORT}`);
  for (const ip of lanIPs()) console.log(` Tu amigo se conecta a: http://${ip}:${PORT}`);
  console.log('\n No cierres esta ventana mientras jugáis.\n');
  if (process.argv.includes('--open')) exec(`start "" http://localhost:${PORT}`);
});
