// GORDO ROYALE - cliente: bucle de juego, red, controles, escalada, combate, vehículos y HUD
import * as THREE from '/vendor/three.module.js';
import { WORLD_R, PLAYER_R, STEP, CFG, WEAPONS, ARMOR_T, ITEMS, PIECES, ZONES, BIOMES, CLIMB, makeWorld, collide, groundAt, distTo, weightOf, speedMul, armorName, rng } from '/shared.js';
import { G, lam, mk, SHIRTS, makeWeapon, makePoop, makeBurger, makeItem, makeArmorPickup, makeFatty, setArmor, animate, makeDragon, animDragon, makeMoto, makeScooter, makeObs, makeTower } from '/models.js';
import { initFx, burst, flash, ring, floatText, boomFx, updateFx, initAudio, snd, jingle, engineSound } from '/fx.js';

const $ = id => document.getElementById(id);
const canvas = $('game');
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// ---------- Render ----------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8fd3ff);
scene.fog = new THREE.Fog(0xa8dcf5, 150, 420);
const camera = new THREE.PerspectiveCamera(68, 1, 0.3, 900);
function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();
scene.add(new THREE.HemisphereLight(0xdff1ff, 0x5a7a44, 1.25));
const sun = new THREE.DirectionalLight(0xfff2d6, 1.9);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, near: 1, far: 320 });
sun.shadow.bias = -0.0006;
scene.add(sun, sun.target);
{
  const sea = mk(new THREE.CircleGeometry(1400, 48), new THREE.MeshLambertMaterial({ color: 0x2f86d6 }), 1, 1, 1, 0, -0.5, 0, false);
  sea.rotation.x = -Math.PI / 2; scene.add(sea);
}

// ---------- Mundo ----------
let world = null, obsAlive = [], obsMesh = new Map(), fusing = new Set(), towerMesh = new Map(), miniBg = null;
const H = (x, z) => world ? world.H(x, z) : 0;
initFx(scene, H);
const BCOL = [0x4f9a3a, 0x8b8f86, 0xeef4fa, 0x7a5cc4, 0xe3c878, 0x7dc95a].map(c => new THREE.Color(c));
const ALWAYS = { wall: 1, keep: 1, ctower: 1, tower: 1 };
function biomeColor(x, z, h, out) {
  const w = world.weights(x, z), ice = w[2], mt = w[1];
  out.setRGB(0, 0, 0);
  for (let b = 0; b < 6; b++) { out.r += BCOL[b].r * w[b]; out.g += BCOL[b].g * w[b]; out.b += BCOL[b].b * w[b]; }
  return [ice, mt];
}
function buildTerrain() {
  const n = world.n, half = world.half, pos = new Float32Array(n * n * 3), col = new Float32Array(n * n * 3);
  const c = new THREE.Color(), cliff = new THREE.Color(0x77706a), iceC = new THREE.Color(0x9fd2ee), sand = new THREE.Color(0xe9d8a0), white = new THREE.Color(0xffffff), tmp = new THREE.Color();
  const R = rng(world.seed + 11);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const k = (j * n + i) * 3, x = -half + i * STEP, z = -half + j * STEP, h = world.grid[j * n + i];
    pos[k] = x; pos[k + 1] = h; pos[k + 2] = z;
    const [ice, mt] = biomeColor(x, z, h, c);
    c.lerp(tmp.copy(cliff).lerp(iceC, ice), smooth(0.7, 1.25, world.slopeAt(x, z)));
    if (mt > 0.3 && h > 34) c.lerp(white, smooth(34, 44, h) * mt);
    if (h < 0.9) c.lerp(sand, 1 - smooth(0.3, 0.9, h));
    const v = 0.93 + R() * 0.12;
    col[k] = c.r * v; col[k + 1] = c.g * v; col[k + 2] = c.b * v;
  }
  const idx = new Uint32Array((n - 1) * (n - 1) * 6);
  let q = 0;
  for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) {
    const a = j * n + i, b = a + 1, d = a + n, e = d + 1;
    idx[q++] = a; idx[q++] = d; idx[q++] = b; idx[q++] = b; idx[q++] = d; idx[q++] = e;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  m.receiveShadow = true;
  return m;
}
function buildMiniBg() {
  const S = 200, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const g = cv.getContext('2d'), c = new THREE.Color(), k = (S / 2 - 4) / (WORLD_R + 6);
  for (let py = 0; py < S; py += 4) for (let px = 0; px < S; px += 4) {
    const x = (S / 2 - px - 2) / k, z = (S / 2 - py - 2) / k;
    if (Math.hypot(x, z) > WORLD_R + 4) continue;
    biomeColor(x, z, 0, c);
    const sh = 0.75 + Math.min(0.35, world.H(x, z) / 90);
    g.fillStyle = `rgb(${c.r * 255 * sh | 0},${c.g * 255 * sh | 0},${c.b * 255 * sh | 0})`; g.fillRect(px, py, 4, 4);
  }
  g.fillStyle = '#5b5f66'; g.fillRect(S / 2 - 32 * k, S / 2 - 32 * k, 64 * k, 64 * k);
  g.fillStyle = '#c9b68a';
  for (const f of world.forts) g.fillRect(S / 2 - f.x * k - 3, S / 2 - f.z * k - 3, 6, 6);
  return cv;
}
function buildWorld(seed, dead) {
  if (world) scene.remove(world.group);
  world = makeWorld(seed);
  const group = new THREE.Group();
  group.add(buildTerrain());
  for (const c of world.camps) {
    if (c.king) continue;
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * 6.28, x = c.x + Math.sin(a) * 9, z = c.z + Math.cos(a) * 9;
      group.add(mk(G.cone, lam(0xd62828, 0.3), 0.35, 2.2, 0.35, x, world.H(x, z) + 1.1, z));
    }
  }
  const ds = new Set(dead);
  obsMesh = new Map(); obsAlive = []; fusing = new Set(); towerMesh = new Map();
  for (const o of world.obs) {
    if (ds.has(o.id)) continue;
    const m = o.t === 'tower' ? makeTower(o) : makeObs(o, world.biomeAt(o.x, o.z));
    m.userData.o = o;
    if (o.t === 'tower') towerMesh.set(o.id, m);
    group.add(m); obsMesh.set(o.id, m); obsAlive.push(o);
  }
  scene.add(group);
  world.group = group; world.byId = new Map(world.obs.map(o => [o.id, o]));
  miniBg = buildMiniBg();
  refreshTowers();
}
function refreshTowers() {
  for (const [id, m] of towerMesh) {
    const on = myTowers.has(id), u = m.userData;
    u.beacon.material.color.setHex(on ? 0x4fd8ff : 0xff8a1f); u.beacon.material.emissive.setHex(on ? 0x4fd8ff : 0xff8a1f);
    u.beam.visible = on;
  }
}
let cullT = 0;
function cullObstacles(dt, cx, cz) {
  cullT -= dt; if (cullT > 0) return; cullT = 0.4;
  for (const m of obsMesh.values()) {
    const o = m.userData.o;
    m.visible = ALWAYS[o.t] || (Math.abs(o.x - cx) < 260 && Math.abs(o.z - cz) < 260 && (o.x - cx) ** 2 + (o.z - cz) ** 2 < 67600);
  }
}

// ---------- Entidades ----------
const ents = new Map();
let myId = 0, hostId = 0, state = 'lobby';
function drawTag(e) {
  const c = e.tagC, x = c.getContext('2d');
  x.clearRect(0, 0, 256, 72);
  x.font = 'bold 30px Segoe UI, Arial'; x.textAlign = 'center';
  x.lineWidth = 6; x.strokeStyle = '#000'; x.strokeText(e.name, 128, 30);
  x.fillStyle = e.kind >= 2 ? '#ff6b6b' : e.kind === 0 ? '#7dd3fc' : '#fff'; x.fillText(e.name, 128, 30);
  x.fillStyle = '#000'; x.fillRect(38, 44, 180, 18);
  const f = Math.max(0, e.hp / e.mhp);
  x.fillStyle = f > 0.5 ? '#4ade80' : f > 0.25 ? '#facc15' : '#ef4444'; x.fillRect(41, 47, 174 * f, 12);
  e.tagT.needsUpdate = true;
}
function addEnt(id, kind, name, color, mhp) {
  const mesh = kind === 4 ? makeDragon() : makeFatty(kind, color);
  const e = {
    id, kind, name, color, mhp, hp: mhp, mesh, x: 0, y: 0, z: 0, yaw: 0, tx: 0, ty: 0, tz: 0, tyaw: 0, alive: true, shown: false, weapon: -1, wdef: null,
    gren: 0, kills: 0, swing: null, phase: Math.random() * 6, speed: 0, flash: 0, hurtT: 0, deadT: 0, fresh: true, block: false, climb: false, burning: false,
    landed: false, ride: 0, veh: 0, hopT: 0, fireT: 0, armv: [-1, -1, -1], arm: [[0, 0], [0, 0], [0, 0]],
  };
  e.tagC = document.createElement('canvas'); e.tagC.width = 256; e.tagC.height = 72;
  e.tagT = new THREE.CanvasTexture(e.tagC);
  e.tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: e.tagT, depthTest: false, transparent: true }));
  e.tag.scale.set(3.4, 0.95, 1); e.tag.renderOrder = 10;
  scene.add(mesh, e.tag);
  mesh.visible = false; e.tag.visible = false;
  ents.set(id, e); drawTag(e);
  return e;
}
function removeEnt(e) { scene.remove(e.mesh, e.tag); e.tagT.dispose(); ents.delete(e.id); }
function setRoster(list) {
  const ids = new Set(list.map(r => r[0]));
  for (const e of [...ents.values()]) if (!ids.has(e.id)) removeEnt(e);
  for (const [id, kind, name, color, mhp] of list) if (!ents.has(id)) addEnt(id, kind, name, color, mhp);
  refreshLobby();
}
function setWeapon(e, idx) {
  if (e.weapon === idx || e.kind === 4) return;
  e.weapon = idx;
  const h = e.mesh.userData.holder; h.clear();
  h.add(makeWeapon(e.kind === 3 ? 6 : e.kind === 2 ? 5 : idx));
  e.wdef = e.kind < 2 ? WEAPONS[idx] : null;
}
function lerpAngle(a, b, t) {
  const d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  return a + d * Math.min(1, t);
}
const entH = e => e.kind === 4 ? 6 : e.kind === 3 ? 6.5 : e.kind === 2 ? 5 : 3;

// ---------- Botín, granadas y vehículos ----------
const pickups = new Map(), grenMesh = new Map(), vehs = new Map();
function addPickup([id, type, v, x, y, z]) {
  const g = new THREE.Group(); g.position.set(x, y, z);
  const inner = new THREE.Group(); g.add(inner);
  let col = 0xffffff, beam = 0;
  if (type === 'w') { const sw = makeWeapon(v); sw.rotation.x = -Math.PI / 2; sw.position.y = 0.5; inner.add(sw); col = WEAPONS[v].color; beam = v >= 6 ? 30 : v >= 3 ? 9 : 0; }
  else if (type === 'a') { const p = makeArmorPickup((v / 10) | 0, v % 10); p.position.y = 0.2; inner.add(p); col = ARMOR_T[v % 10].color; beam = v % 10 === 3 ? 6 : 0; }
  else if (type === 'g') { const p = makePoop(1.5); p.position.y = 0.6; inner.add(p); col = 0xb5651d; }
  else if (type === 'b') { const b = makeBurger(); b.position.y = 0.55; b.scale.setScalar(1.2); inner.add(b); col = 0x4ade80; }
  else { const it = makeItem(v); it.position.y = 0.35; it.scale.setScalar(1.25); inner.add(it); col = ITEMS[v].color; beam = ITEMS[v].passive ? 14 : 0; }
  const rg = mk(new THREE.RingGeometry(0.75, 0.95, 24), new THREE.MeshBasicMaterial({ color: col, side: THREE.DoubleSide }), 1, 1, 1, 0, 0.08, 0, false);
  rg.rotation.x = -Math.PI / 2; g.add(rg);
  if (beam) g.add(mk(G.cyl, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.28, depthWrite: false }), 0.35, beam, 0.35, 0, beam / 2, 0, false));
  scene.add(g); pickups.set(id, { id, type, v, x, y, z, g, inner });
}
function clearPickups() { for (const p of pickups.values()) scene.remove(p.g); pickups.clear(); }
function pickupLabel(p) {
  if (p.type === 'w') { const W = WEAPONS[p.v]; return `${W.name} · daño ${W.dmg} · cada ${W.cd}s · peso ${W.w}${W.block ? '' : ' · no bloquea'}`; }
  const z = (p.v / 10) | 0, t = p.v % 10, A = ARMOR_T[t];
  return `${armorName(z, t)} · protege ${A.prot * 100}% · peso ${A.w[z]}`;
}
function syncVehicles(list) {
  const seen = new Set();
  for (const [id, type, x, y, z, yaw, driver, pass, sp] of list) {
    seen.add(id);
    let v = vehs.get(id);
    if (!v) {
      const mesh = type ? makeScooter() : makeMoto(); mesh.rotation.order = 'YXZ'; scene.add(mesh);
      v = { id, type, mesh, x, y, z, yaw, sp: 0, dust: 0 }; vehs.set(id, v);
    }
    v.driver = driver; v.pass = pass;
    if (driver === myId && me.lv) continue; // el mío lo simulo en local
    v.tx = x; v.ty = y; v.tz = z; v.tyaw = yaw; v.tsp = sp;
  }
  for (const [id, v] of vehs) if (!seen.has(id)) { scene.remove(v.mesh); vehs.delete(id); }
}
function updateVehicles(dt) {
  for (const v of vehs.values()) {
    if (!(v.driver === myId && me.lv) && v.tx !== undefined) {
      const k = Math.min(1, dt * 12);
      v.x += (v.tx - v.x) * k; v.y += (v.ty - v.y) * k; v.z += (v.tz - v.z) * k; v.yaw = lerpAngle(v.yaw, v.tyaw, dt * 12); v.sp = v.tsp;
    }
    const m = v.mesh, fx = Math.sin(v.yaw), fz = Math.cos(v.yaw), L = v.type ? 0.8 : 1.2;
    const pitch = Math.atan2(H(v.x + fx * L, v.z + fz * L) - H(v.x - fx * L, v.z - fz * L), L * 2);
    const roll = Math.atan2(H(v.x + fz, v.z - fx) - H(v.x - fz, v.z + fx), 2);
    m.position.set(v.x, v.y, v.z);
    m.rotation.set(-pitch, v.yaw, clamp(-roll, -0.5, 0.5) + (v.type ? (v.lean || 0) : 0));
    for (const w of m.userData.wheels) w.rotation.x += v.sp * dt / (v.type ? 0.24 : 0.5);
    m.userData.body.position.y = v.driver ? Math.sin(time * 30) * 0.012 * (v.type ? 0.3 : 1) : 0;
    if (Math.abs(v.sp) > 6) {
      v.dust -= dt;
      if (v.dust <= 0) { v.dust = 0.07; const b = world.biomeAt(v.x, v.z); burst(v.x - fx * 1.2, v.y + 0.2, v.z - fz * 1.2, 1, [[0x8a6b45, 0x9a9a9a, 0xffffff, 0xb79cff, 0xe3c878, 0x9c8055][b]], 2.5, 0.3, 0.6, 4); }
    }
  }
}

// ---------- Jugador local ----------
const me = {
  x: 0, y: 0, z: 45, vx: 0, vz: 0, vy: 0, kx: 0, kz: 0, yaw: Math.PI, pitch: -0.25, grounded: true, jumps: 0,
  stam: 100, tired: false, stamIdle: 0, elixirT: 0, atkT: 0, atkDur: 0.5, atkReady: true, thrT: 0, spcT: 0, spcDur: 1, tpT: 0, tpDur: 1,
  climbing: false, wall: null, climbYaw: 0, climbJumpT: 0, terrainClimb: false, blocking: false, lv: null, iceT: 0,
};
let inv = { stam: 0, elixir: 0, feather: 0, vessel: 0, djump: 0, claws: 0, picks: 0 }, myTowers = new Set();
let time = 0, shake = 0, joined = false, ws = null, specId = 0, storm = [0, 0, 250, 0, 0, 250, 0, 'off'], aliveN = 0, ips = [], port = 3000, hasDragon = false;
const keys = {};
let mouseDown = false, rmbDown = false, spaceEdge = false, locked = false, fallbackLook = false, interact = null, tpOpen = false;
const myEnt = () => ents.get(myId);
const stamMax = () => CFG.stamMax + inv.vessel * CFG.vesselBonus + (me.elixirT > 0 ? CFG.elixirBonus : 0);
function wsSend(o) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); }
function useStam(n) { me.stam = Math.max(0, me.stam - n); me.stamIdle = 0; }
function myVeh() { const e = myEnt(); return e && e.veh ? vehs.get(e.veh) : null; }

function deny(msg) {
  snd('deny'); hud.cd.classList.remove('deny'); void hud.cd.offsetWidth; hud.cd.classList.add('deny');
  if (msg) toast(msg, 1.2);
}
function tryAttack(heavy, fresh) {
  const e = myEnt(); if (!e || !e.alive || state === 'ended') return;
  const v = myVeh(); if (v && v.driver === myId) return;
  if (me.climbing) { if (fresh) deny('No puedes atacar mientras escalas'); return; }
  if (time < me.atkT) { if (fresh) deny(); return; }
  const W = WEAPONS[Math.max(0, e.weapon)];
  if (heavy) { if (me.stam < CFG.heavyCost || me.tired) { deny('Sin resistencia para el ataque fuerte'); return; } useStam(CFG.heavyCost); }
  const dur = W.cd * (heavy ? 1.7 : 1), wind = W.wind * (heavy ? 1.6 : 1);
  me.atkT = time + dur; me.atkDur = dur; me.atkReady = false;
  e.swing = { t: 0, wind, rec: Math.min(0.32, Math.max(0.12, dur - wind)), s: heavy ? 'spin' : W.style };
  snd(W.two || heavy ? 'swingH' : 'swing');
  wsSend({ t: 'atk', yaw: me.yaw, pitch: me.pitch, h: heavy ? 1 : 0 });
}
function trySpecial() {
  const e = myEnt(); if (!e || !e.alive || state === 'ended' || !WEAPONS[Math.max(0, e.weapon)].fire) return;
  if (time < me.spcT) { deny(`Llamarada recargando: ${Math.ceil(me.spcT - time)} s`); return; }
  if (me.climbing || myVeh()) return;
  me.spcT = time + CFG.specialCd; me.spcDur = CFG.specialCd; me.atkT = time + 0.9; me.atkDur = 0.9; me.atkReady = false;
  e.swing = { t: 0, wind: 0.45, rec: 0.4, s: 'slam' };
  snd('fire'); wsSend({ t: 'spc', yaw: me.yaw });
}
function tryThrow() {
  const e = myEnt(); if (!e || !e.alive || state === 'ended' || time < me.thrT || me.climbing) return;
  if (e.gren <= 0) { deny('¡No te quedan granadas de caca!'); return; }
  me.thrT = time + 0.75; e.swing = { t: 0, wind: 0.14, rec: 0.2, s: 'chop' }; snd('swing');
  wsSend({ t: 'thr', yaw: me.yaw, pitch: me.pitch + 0.12 });
}
function useItem(k) {
  const e = myEnt(); if (!e || !e.alive) return;
  if (inv[k] <= 0) { deny(`No tienes ${ITEMS[k].name}`); return; }
  wsSend({ t: 'use', k });
}
function doInteract() {
  if (!interact) return;
  if (interact.k === 'dismount') wsSend({ t: 'dismount' });
  else if (interact.k === 'tower') wsSend({ t: 'tower', id: interact.id });
  else if (interact.k === 'take') wsSend({ t: 'take', id: interact.id });
  else if (interact.k === 'mount') wsSend({ t: 'mount', id: interact.id });
}
function findInteract() {
  const e = myEnt(); if (!e || !e.alive || !world) return null;
  if (e.veh) return { k: 'dismount', label: 'Bajarse del vehículo' };
  for (const T of world.towers) if (!myTowers.has(T.id) && me.y >= T.top - 1 && Math.hypot(T.x - me.x, T.z - me.z) < 4.5) return { k: 'tower', id: T.id, label: `Activar la ${T.name}` };
  let best = null, bd = 2.9;
  for (const p of pickups.values()) {
    if (p.type !== 'w' && p.type !== 'a') continue;
    const d = Math.hypot(p.x - me.x, p.z - me.z);
    if (d < bd && Math.abs(p.y - me.y) < 3) { bd = d; best = p; }
  }
  if (best) return { k: 'take', id: best.id, label: 'Equipar ' + pickupLabel(best) };
  let bv = null; bd = 4;
  for (const v of vehs.values()) {
    if (v.driver && (v.type === 1 || v.pass)) continue;
    const d = Math.hypot(v.x - me.x, v.z - me.z);
    if (d < bd && Math.abs(v.y - me.y) < 3) { bd = d; bv = v; }
  }
  if (bv) return { k: 'mount', id: bv.id, label: bv.driver ? 'Subir al sidecar' : bv.type ? 'Montar en el patinete eléctrico' : 'Conducir la moto con sidecar' };
  return null;
}
function tryTeleport(i) {
  const list = world.towers.filter(t => myTowers.has(t.id));
  if (!list[i]) return;
  if (time < me.tpT) { deny(`Teletransporte recargando: ${Math.ceil(me.tpT - time)} s`); return; }
  wsSend({ t: 'tpt', id: list[i].id }); setTp(false);
}
function setTp(on) {
  tpOpen = on;
  const list = world ? world.towers.filter(t => myTowers.has(t.id)) : [];
  hud.tpp.style.display = on ? 'block' : 'none';
  if (on) hud.tpp.innerHTML = `<h3>🗼 Teletransporte</h3>` + (list.length ? list.map((t, i) => `<div class="row"><b>${i + 1}</b> · ${t.name} <small>${BIOMES[t.biome]} · ${Math.round(t.top - t.y)} m de altura</small></div>`).join('') + `<div style="margin-top:8px;opacity:.8">Pulsa el número de la torre · T para cerrar</div>` : '<div>Aún no has activado ninguna torre. Escala una hasta la cima y pulsa E.</div>');
}
function showInv(on) {
  hud.invp.style.display = on ? 'block' : 'none';
  if (!on) return;
  const e = myEnt(); if (!e) return;
  const W = WEAPONS[Math.max(0, e.weapon)], wt = weightOf(Math.max(0, e.weapon), e.arm);
  let h = `<h3>🎒 Inventario</h3><div class="row"><b>🗡️ ${W.name}</b><small>Daño ${W.dmg} · un golpe cada ${W.cd} s · alcance ${W.range} m · peso ${W.w}${W.block ? ' · puede bloquear' : ' · no puede bloquear'}${W.fire ? ' · quema al enemigo · R: Llamarada en área' : ''}</small></div>`;
  for (let z = 0; z < 3; z++) {
    const [t, d] = e.arm[z];
    h += t ? `<div class="row"><b>${['⛑️', '🛡️', '🦵'][z]} ${armorName(z, t)}</b><small>Absorbe el ${ARMOR_T[t].prot * 100}% del daño en ${ZONES[z].toLowerCase()} · durabilidad ${d}/${ARMOR_T[t].dur[z]} · peso ${ARMOR_T[t].w[z]}</small></div>`
      : `<div class="row off"><b>${['⛑️', '🛡️', '🦵'][z]} ${PIECES[z]}: nada</b><small>${ZONES[z]} sin protección (daño x${CFG.zoneMult[z]})</small></div>`;
  }
  h += `<div class="row"><b>⚖️ Peso total ${wt}</b><small>Velocidad de movimiento y escalada al ${Math.round(speedMul(wt) * 100)}%</small></div>`;
  for (const k in ITEMS) {
    const I = ITEMS[k], n = inv[k];
    h += `<div class="row ${n ? '' : 'off'}"><b>${I.icon} ${I.name}${I.passive ? (n > 1 ? ' x' + n : '') : ' x' + n}${I.key ? ` · tecla ${I.key}` : ''}</b><small>${I.desc}</small></div>`;
  }
  hud.invp.innerHTML = h;
}

addEventListener('keydown', ev => {
  if (!joined) return;
  if (!keys[ev.code]) {
    if (ev.code === 'Space') spaceEdge = true;
    if (ev.code === 'KeyQ' || ev.code === 'KeyG') tryThrow();
    if (ev.code === 'KeyF') tryAttack(true, true);
    if (ev.code === 'KeyR') trySpecial();
    if (ev.code === 'KeyE') doInteract();
    if (ev.code === 'KeyT') setTp(!tpOpen);
    if (ev.code === 'Tab') showInv(true);
    if (/^Digit[1-9]$/.test(ev.code)) {
      const n = +ev.code[5];
      if (tpOpen) tryTeleport(n - 1); else if (n <= 3) useItem(['stam', 'elixir', 'feather'][n - 1]);
    }
    if (ev.code === 'Enter' && state === 'lobby' && myId === hostId) wsSend({ t: 'start' });
  }
  keys[ev.code] = true;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(ev.code)) ev.preventDefault();
});
addEventListener('keyup', ev => { keys[ev.code] = false; if (ev.code === 'Tab') showInv(false); });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; mouseDown = rmbDown = false; });
function lockPointer() {
  if (locked) return;
  try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => { fallbackLook = true; }); } catch { fallbackLook = true; }
}
document.addEventListener('pointerlockchange', () => { locked = document.pointerLockElement === canvas; if (!locked) mouseDown = rmbDown = false; });
document.addEventListener('pointerlockerror', () => { fallbackLook = true; });
addEventListener('mousedown', ev => {
  if (!joined) return;
  initAudio();
  if (!locked && !fallbackLook) { lockPointer(); return; }
  if (!locked) lockPointer();
  const e = myEnt();
  if (e && !e.alive) { cycleSpec(); return; }
  if (ev.button === 0) { mouseDown = true; tryAttack(false, true); }
  else if (ev.button === 2) rmbDown = true;
});
addEventListener('mouseup', ev => { if (ev.button === 0) mouseDown = false; if (ev.button === 2) rmbDown = false; });
addEventListener('contextmenu', ev => ev.preventDefault());
addEventListener('mousemove', ev => {
  if (!joined || (!locked && !fallbackLook)) return;
  const mx = ev.movementX || 0, my = ev.movementY || 0;
  if (Math.abs(mx) > 400 || Math.abs(my) > 400) return;
  me.yaw -= mx * 0.0026;
  me.pitch = clamp(me.pitch - my * 0.0026, -1.15, 0.6);
});
function cycleSpec() {
  const list = [...ents.values()].filter(e => e.alive && e.kind < 2);
  if (!list.length) { specId = 0; return; }
  const i = list.findIndex(e => e.id === specId);
  specId = list[(i + 1) % list.length].id;
}

// --- Conducción ---
function driveVehicle(v, dt) {
  const lv = me.lv, type = v.type;
  const b = world.biomeAt(me.x, me.z);
  const grip = type ? [0.85, 0.6, 0.5, 0.8, 0.5, 1][b] : [0.9, 0.75, 0.7, 0.85, 0.8, 1][b];
  const thr = state === 'ended' ? 0 : (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0), steer = (keys.KeyA ? 1 : 0) - (keys.KeyD ? 1 : 0);
  const fx = Math.sin(lv.yaw), fz = Math.cos(lv.yaw);
  const slope = (H(me.x + fx * 1.2, me.z + fz * 1.2) - H(me.x - fx * 1.2, me.z - fz * 1.2)) / 2.4;
  if (thr > 0) lv.sp += (type ? 13 : 11) * dt; else if (thr < 0) lv.sp -= (lv.sp > 0 ? 26 : 8) * dt;
  lv.sp -= slope * 14 * dt;
  lv.sp -= lv.sp * (thr ? 0.25 : 0.9) * dt;
  lv.sp = clamp(lv.sp, -6, (type ? 17 : 26) * grip);
  if (slope > 1.0 && lv.sp > 0) lv.sp = 0;
  const dyaw = steer * (type ? 2.6 : 1.9) * clamp(lv.sp / 7, -1, 1) * dt;
  lv.yaw += dyaw; me.yaw += dyaw;
  v.lean = (v.lean || 0) + (-steer * Math.min(1, Math.abs(lv.sp) / 12) * 0.3 - (v.lean || 0)) * Math.min(1, dt * 8);
  const nx = me.x + fx * lv.sp * dt, nz = me.z + fz * lv.sp * dt;
  const [cx, cz, hit] = collide(nx, nz, type ? 0.9 : 1.7, me.y, obsAlive);
  if (hit) { if (Math.abs(lv.sp) > 8) { shake = Math.max(shake, 0.4); snd('break'); } lv.sp *= 0.2; }
  me.x = cx; me.z = cz;
  const g = groundAt(world, me.x, me.z, me.y, obsAlive);
  me.y += (g - me.y) * Math.min(1, dt * 18);
  me.vx = me.vz = me.vy = 0; me.grounded = true;
  v.x = me.x; v.y = me.y; v.z = me.z; v.yaw = lv.yaw; v.sp = lv.sp;
  engineSound(type, lv.sp);
}

// --- Movimiento a pie, escalada y resistencia ---
let sendAcc = 0;
function updateMe(dt) {
  const e = myEnt();
  if (keys.ArrowLeft) me.yaw += dt * 2.4;
  if (keys.ArrowRight) me.yaw -= dt * 2.4;
  if (keys.ArrowUp) me.pitch = Math.min(0.6, me.pitch + dt * 1.5);
  if (keys.ArrowDown) me.pitch = Math.max(-1.15, me.pitch - dt * 1.5);
  if (me.elixirT > 0) { me.elixirT -= dt; if (me.elixirT <= 0) { notify('El elixir de aguante se ha agotado', 'bad'); me.stam = Math.min(me.stam, stamMax()); } }
  if (!me.atkReady && time >= me.atkT) { me.atkReady = true; snd('ready', 0.6); hud.cd.classList.add('ready'); setTimeout(() => hud.cd.classList.remove('ready'), 200); }
  if (!e || !e.alive || !world) { spaceEdge = false; engineSound(0, -1); return; }
  const v = myVeh();
  let flags = 0, sendYaw = me.yaw;
  if (v && me.lv) {
    me.climbing = false; me.blocking = false;
    if (v.driver === myId) { driveVehicle(v, dt); sendYaw = me.lv.yaw; }
    else { me.x = v.x - Math.cos(v.yaw) * 1.35; me.z = v.z + Math.sin(v.yaw) * 1.35; me.y = v.y; me.vy = 0; if (mouseDown) tryAttack(false, false); }
    me.stamIdle += dt; if (me.stamIdle > CFG.stamDelay) me.stam = Math.min(stamMax(), me.stam + CFG.stamRegen * dt);
  } else {
    const W = WEAPONS[Math.max(0, e.weapon)], wmul = speedMul(weightOf(Math.max(0, e.weapon), e.arm));
    const fx = Math.sin(me.yaw), fz = Math.cos(me.yaw), rx = -fz, rz = fx;
    const ix = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0), iz = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0);
    let dx = fx * iz + rx * ix, dz = fz * iz + rz * ix;
    const dl = Math.hypot(dx, dz); if (dl > 0) { dx /= dl; dz /= dl; }
    const smax = stamMax(), climbSp = CFG.climbSpeed * wmul * (inv.claws ? 1.5 : 1), drainMul = (inv.claws ? 0.6 : 1) * (2 - wmul);
    let draining = false;
    me.terrainClimb = false;
    if (me.climbing) {
      // --- agarrado a una pared ---
      const o = me.wall;
      let nx, nz;
      if (o.hw) { const px = clamp(me.x, o.x - o.hw, o.x + o.hw), pz = clamp(me.z, o.z - o.hd, o.z + o.hd); nx = px - me.x; nz = pz - me.z; }
      else { nx = o.x - me.x; nz = o.z - me.z; }
      const nl = Math.hypot(nx, nz) || 1; nx /= nl; nz /= nl;
      me.climbYaw = Math.atan2(nx, nz);
      let up = iz, side = ix;
      if (state === 'ended') up = side = 0;
      if (me.climbJumpT > 0) { me.climbJumpT -= dt; me.y += 13 * dt; }
      else if (spaceEdge && me.stam > CFG.climbJumpCost) { me.climbJumpT = 0.27; useStam(CFG.climbJumpCost); snd('jump2'); burst(me.x, me.y + 1, me.z, 6, [0xffffff], 2, 0.12, 0.4); }
      me.y += up * climbSp * dt;
      me.x += -nz * side * climbSp * dt + nx * 2 * dt; me.z += nx * side * climbSp * dt + nz * 2 * dt;
      useStam(CFG.climbDrain * drainMul * (up || side ? 1 : 0.4) * dt); draining = true;
      const topY = o.y + o.top;
      const [cx, cz, hit] = collide(me.x, me.z, PLAYER_R, me.y, obsAlive);
      me.x = cx; me.z = cz; me.vx = me.vz = me.vy = 0; me.grounded = false;
      const g = groundAt(world, me.x, me.z, me.y, obsAlive);
      if (me.y >= topY - 0.7) { // cima: encaramarse
        me.x += nx * 1.1; me.z += nz * 1.1; me.y = Math.max(topY, groundAt(world, me.x, me.z, topY, obsAlive)); me.climbing = false; me.grounded = true; me.jumps = 0;
        burst(me.x, me.y + 0.2, me.z, 6, [0xdddddd], 2, 0.12, 0.4);
      } else if (me.y <= g) { me.y = g; me.climbing = false; me.grounded = true; }
      else if (me.stam <= 0 || distTo(o, me.x, me.z) > PLAYER_R + 0.4 || !obsAlive.includes(o)) { me.climbing = false; me.kx = -nx * 4; me.kz = -nz * 4; }
      else if (keys.KeyC) { me.climbing = false; }
    } else {
      // --- a pie ---
      me.blocking = rmbDown && W.block && state !== 'ended';
      const gx = (H(me.x + 1, me.z) - H(me.x - 1, me.z)) / 2, gz = (H(me.x, me.z + 1) - H(me.x, me.z - 1)) / 2, sl = Math.hypot(gx, gz);
      const onTerrain = me.y - H(me.x, me.z) < 1.0;
      const ds = gx * dx + gz * dz;
      const ice = world.biomeAt(me.x, me.z) === 2 && !inv.picks;
      const wantSprint = (keys.ShiftLeft || keys.ShiftRight) && dl > 0 && !me.tired && me.grounded && !me.blocking;
      let sp = state === 'ended' ? 0 : (wantSprint ? CFG.sprint : CFG.walk) * wmul;
      if (me.blocking) sp *= 0.45;
      if (e.swing && W.two) sp *= 0.5;
      let steepBlock = false;
      if (onTerrain && dl > 0 && ds > CFG.slopeLimit) {
        if (!me.tired && !ice) { me.terrainClimb = true; sp = climbSp / Math.sqrt(1 + ds * ds) * 1.6; useStam(CFG.climbDrain * drainMul * dt); draining = true; }
        else { steepBlock = true; if (ice && time > me.iceT) { me.iceT = time + 4; toast('🧊 Pared de hielo: necesitas Piolets de hielo', 2.5); snd('deny'); } }
      } else if (wantSprint) { useStam(CFG.sprintDrain * dt); draining = true; }
      const acc = Math.min(1, dt * (me.grounded ? 14 : 5));
      me.vx += (dx * sp - me.vx) * acc; me.vz += (dz * sp - me.vz) * acc;
      if (onTerrain && sl > 0.01 && (steepBlock || (sl > 1.35 && !me.terrainClimb))) {
        const ux = gx / sl, uz = gz / sl, comp = me.vx * ux + me.vz * uz;
        if (comp > 0) { me.vx -= comp * ux; me.vz -= comp * uz; }
        if (sl > 1.35 || steepBlock) { me.x -= ux * 7 * dt; me.z -= uz * 7 * dt; } // resbalar
      }
      if (spaceEdge && state !== 'ended') {
        if (me.grounded) { me.vy = CFG.jump * (0.75 + 0.25 * wmul); me.grounded = false; me.jumps = 1; }
        else if (inv.djump && me.jumps < 2) { me.vy = CFG.jump * 0.95; me.jumps = 2; snd('jump2'); ring(me.x, me.y, me.z, 1.6, 0x7dd3fc, 0.35); burst(me.x, me.y, me.z, 10, [0x7dd3fc, 0xffffff], 3, 0.14, 0.5); }
      }
      me.vy -= CFG.gravity * dt;
      const oldG = me.grounded;
      me.x += (me.vx + me.kx) * dt; me.z += (me.vz + me.kz) * dt; me.y += me.vy * dt;
      const kd = Math.exp(-5 * dt); me.kx *= kd; me.kz *= kd;
      const [cx, cz, hit] = collide(me.x, me.z, PLAYER_R, me.y, obsAlive);
      me.x = cx; me.z = cz;
      const g = groundAt(world, me.x, me.z, me.y, obsAlive);
      if (me.y <= g) {
        if (!oldG && -me.vy > CFG.fallSafe) { wsSend({ t: 'fall', v: -me.vy }); shake = Math.max(shake, 0.8); burst(me.x, g + 0.2, me.z, 14, [0xc9b68a, 0xffffff], 4, 0.2, 0.6); }
        me.y = g; me.vy = 0; me.grounded = true; me.jumps = 0;
      } else if (oldG && me.vy <= 0 && me.y - g < 0.7) { me.y = g; me.vy = 0; me.grounded = true; }
      else me.grounded = false;
      // empezar a escalar una pared
      if (hit && CLIMB[hit.t] && iz > 0 && !me.tired && state !== 'ended' && hit.y + hit.top - me.y > 1.3) {
        let nx, nz;
        if (hit.hw) { nx = clamp(me.x, hit.x - hit.hw, hit.x + hit.hw) - me.x; nz = clamp(me.z, hit.z - hit.hd, hit.z + hit.hd) - me.z; } else { nx = hit.x - me.x; nz = hit.z - me.z; }
        const nl = Math.hypot(nx, nz) || 1;
        if ((nx * dx + nz * dz) / nl > 0.35) { me.climbing = true; me.wall = hit; me.vy = 0; me.blocking = false; me.climbJumpT = 0; snd('step'); }
      }
    }
    // resistencia
    if (!draining && (me.grounded || me.climbing)) { me.stamIdle += dt; if (me.stamIdle > CFG.stamDelay) me.stam = Math.min(smax, me.stam + CFG.stamRegen * dt); }
    else if (draining) me.stamIdle = 0;
    if (me.stam <= 0 && !me.tired) { me.tired = true; snd('tired'); toast('😮‍💨 ¡Agotado!', 1.5); }
    else if (me.tired && me.stam >= smax * 0.3) { me.tired = false; snd('rested'); hud.stb.classList.add('full'); setTimeout(() => hud.stb.classList.remove('full'), 500); }
    if (mouseDown) tryAttack(false, false);
    if (me.blocking) flags |= 2;
    if (me.climbing || me.terrainClimb) flags |= 8;
    if (me.climbing) sendYaw = me.climbYaw;
    engineSound(0, -1);
  }
  spaceEdge = false;
  sendAcc += dt;
  if (sendAcc >= 0.05) {
    sendAcc = 0;
    const m = { t: 'p', x: +me.x.toFixed(2), y: +me.y.toFixed(2), z: +me.z.toFixed(2), yaw: +sendYaw.toFixed(3), f: flags };
    if (v && me.lv && v.driver === myId) { m.vy = +me.lv.yaw.toFixed(3); m.vs = +me.lv.sp.toFixed(1); }
    wsSend(m);
  }
}
function updateEnts(dt) {
  for (const e of ents.values()) {
    const ox = e.x, oz = e.z, mine = e.id === myId;
    if (mine && e.alive) {
      e.x = me.x; e.y = me.y; e.z = me.z;
      e.yaw = me.climbing ? me.climbYaw : me.lv && e.veh ? (vehs.get(e.veh) || {}).yaw ?? me.yaw : me.yaw;
      e.block = me.blocking; e.climb = me.climbing || me.terrainClimb;
    } else if (e.fresh) { e.x = e.tx; e.y = e.ty; e.z = e.tz; e.yaw = e.tyaw; e.fresh = false; }
    else {
      const k = Math.min(1, dt * 13);
      e.x += (e.tx - e.x) * k; e.y += (e.ty - e.y) * k; e.z += (e.tz - e.z) * k; e.yaw = lerpAngle(e.yaw, e.tyaw, dt * 14);
    }
    const sp = Math.hypot(e.x - ox, e.z - oz) / Math.max(dt, 0.001);
    e.speed += (Math.min(30, sp) - e.speed) * Math.min(1, dt * 10);
    if (e.deadT > 0) {
      e.deadT += dt;
      if (e.deadT > (e.kind === 4 ? 3 : 1.5) && e.shown) { e.shown = false; burst(e.x, e.y + 1, e.z, e.kind === 4 ? 80 : 26, e.kind === 4 ? [0xb3261e, 0xffb300, 0x333333] : [SHIRTS[e.color % 12], 0xf2c29b, 0xffffff], 9, e.kind === 4 ? 0.6 : 0.3, 1.2); }
    } else e.shown = e.alive;
    e.mesh.visible = e.shown; e.tag.visible = e.alive && !mine && e.kind !== 4;
    if (!e.shown) continue;
    let px = e.x, py = e.y, pz = e.z, yaw = e.yaw;
    const v = e.veh ? vehs.get(e.veh) : null;
    e.ride = 0;
    if (v && e.alive) {
      const drv = v.driver === e.id, s = drv ? v.mesh.userData.seat : v.mesh.userData.seat2, c = Math.cos(v.yaw), sn = Math.sin(v.yaw);
      e.ride = drv ? (v.type ? 3 : 1) : 2; yaw = v.yaw;
      px = v.x + s[0] * c + s[2] * sn; pz = v.z - s[0] * sn + s[2] * c; py = v.y + s[1];
    }
    if (e.hopT > 0) { e.hopT -= dt; py += Math.sin(Math.max(0, e.hopT) / 0.35 * Math.PI) * 1.0; }
    if (e.kind === 4 && e.deadT > 0) py = Math.max(H(e.x, e.z), py - e.deadT * 9);
    e.mesh.position.set(px, py, pz); e.mesh.rotation.y = yaw;
    e.tag.position.set(e.x, py + entH(e) + 0.6, e.z);
    if (e.kind === 4) animDragon(e, dt, time); else animate(e, dt, time);
    if (e.burning && Math.random() < dt * 14) burst(e.x, e.y + 1.5, e.z, 1, [0xff5a1f, 0xffd60a], 1.5, 0.22, 0.6, -5);
  }
}
const camPos = new THREE.Vector3();
function updateCam(dt) {
  let tx = me.x, ty = me.y, tz = me.z;
  const e = myEnt();
  if (e && !e.alive) {
    let s = ents.get(specId);
    if (!s || !s.alive) { cycleSpec(); s = ents.get(specId); }
    if (s) { tx = s.x; ty = s.y; tz = s.z; }
  }
  const cp = Math.cos(me.pitch), dx = Math.sin(me.yaw) * cp, dy = Math.sin(me.pitch), dz = Math.cos(me.yaw) * cp;
  const rx = -Math.cos(me.yaw), rz = Math.sin(me.yaw);
  const px = tx + rx * 0.9, py = ty + 2.9, pz = tz + rz * 0.9;
  let dist = e && e.veh ? 9.5 : e && WEAPONS[Math.max(0, e.weapon)].len > 4 ? 10 : 7;
  for (; dist > 1.5; dist -= 0.5) {
    const cx = px - dx * dist, cz = pz - dz * dist, cy = py - dy * dist;
    if (cy < H(cx, cz) + 0.5) continue;
    let blocked = false;
    for (const o of obsAlive) {
      if (o.top < 2.5 || o.t === 'tree' || o.t === 'pine') continue;
      if (Math.abs(o.x - cx) > o.r + 1) continue;
      if (cy < o.y + o.top + 0.4 && distTo(o, cx, cz) < 0.35) { blocked = true; break; }
    }
    if (!blocked) break;
  }
  camPos.set(px - dx * dist, Math.max(H(px - dx * dist, pz - dz * dist) + 0.5, py - dy * dist), pz - dz * dist);
  if (shake > 0.01) { camPos.x += (Math.random() - 0.5) * shake; camPos.y += (Math.random() - 0.5) * shake; camPos.z += (Math.random() - 0.5) * shake; shake *= Math.exp(-6 * dt); }
  camera.position.copy(camPos);
  camera.lookAt(px + dx * 20, py + dy * 20, pz + dz * 20);
  sun.position.set(tx + 55, ty + 100, tz + 38); sun.target.position.set(tx, ty, tz);
  cullObstacles(dt, tx, tz);
}

// ---------- Tormenta visual ----------
const stormMesh = mk(new THREE.CylinderGeometry(1, 1, 1, 72, 1, true), new THREE.MeshBasicMaterial({ color: 0x9b30ff, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false, fog: false }), 1, 180, 1, 0, 70, 0, false);
stormMesh.renderOrder = 5; scene.add(stormMesh);

// ---------- HUD ----------
const hud = {};
for (const id of ['hpf', 'hpt', 'stb', 'stf', 'wpn', 'wst', 'info', 'stormtxt', 'feed', 'center', 'lobby', 'banner', 'dead', 'vig', 'firevig', 'stormvig', 'cross', 'click', 'cd', 'cdf', 'prompt', 'notes', 'boss', 'bossf', 'biome', 'invp', 'tpp', 'spc', 'tpi', 'a0', 'a1', 'a2', 'i1', 'i2', 'i3', 'i4']) hud[id] = $(id);
const cache = new Map();
function setTxt(el, s) { if (cache.get(el) !== s) { cache.set(el, s); el.textContent = s; } }
function setCls(el, c, on) { if (el.classList.contains(c) !== !!on) el.classList.toggle(c, !!on); }
let toastT = 0, biomeNow = -1, biomeT = 0, promptT = 0;
function toast(m, dur = 2.5) { hud.center.textContent = m; toastT = dur; }
function notify(html, cls = '', dur = 5500) {
  const d = document.createElement('div'); d.className = 'note ' + cls; d.innerHTML = html; hud.notes.prepend(d);
  while (hud.notes.children.length > 5) hud.notes.lastChild.remove();
  setTimeout(() => d.remove(), dur);
}
function feed(html) {
  const d = document.createElement('div'); d.innerHTML = html; hud.feed.prepend(d);
  while (hud.feed.children.length > 6) hud.feed.lastChild.remove();
  setTimeout(() => d.remove(), 7000);
}
const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
function refreshLobby() {
  if (state !== 'lobby') { hud.lobby.innerHTML = ''; return; }
  const hs = [...ents.values()].filter(e => e.kind === 0);
  let h = `<div class="big">SALA DE ESPERA</div>Jugadores: ${hs.map(e => esc(e.name)).join(', ')} (${hs.length}/20 · el resto serán bots) · puedes explorar mientras tanto<br>`;
  if (myId === hostId) {
    h += `Eres el anfitrión: pulsa <span class="big">ENTER</span> para empezar<br>`;
    if (ips.length) h += `Tu amigo debe abrir: ` + ips.map(i => `<span class="url">http://${i}:${port}</span>`).join(' o ');
  } else h += 'Esperando a que el anfitrión empiece la partida…';
  hud.lobby.innerHTML = h;
}
const mini = $('mini').getContext('2d');
function drawMini() {
  const S = 200, c = S / 2, k = (c - 4) / (WORLD_R + 6);
  mini.clearRect(0, 0, S, S);
  if (miniBg) mini.drawImage(miniBg, 0, 0);
  const P = (x, z) => [c - x * k, c - z * k];
  if (world) for (const T of world.towers) {
    const [x, y] = P(T.x, T.z), on = myTowers.has(T.id);
    mini.fillStyle = on ? '#4fd8ff' : '#ff8a1f'; mini.strokeStyle = '#000'; mini.lineWidth = 1;
    mini.beginPath(); mini.moveTo(x, y - 5 - T.tier); mini.lineTo(x + 3.5, y + 3); mini.lineTo(x - 3.5, y + 3); mini.closePath(); mini.fill(); mini.stroke();
  }
  if (storm[7] !== 'off') {
    let [x, y] = P(storm[3], storm[4]);
    mini.strokeStyle = '#fff'; mini.lineWidth = 1.5; mini.setLineDash([4, 3]); mini.beginPath(); mini.arc(x, y, Math.max(1, storm[5] * k), 0, 6.29); mini.stroke(); mini.setLineDash([]);
    [x, y] = P(storm[0], storm[1]);
    mini.strokeStyle = '#c04bff'; mini.lineWidth = 3; mini.beginPath(); mini.arc(x, y, Math.max(1, storm[2] * k), 0, 6.29); mini.stroke();
  }
  for (const v of vehs.values()) if (!v.driver) { const [x, y] = P(v.x, v.z); mini.fillStyle = v.type ? '#21e6c1' : '#ffffff'; mini.fillRect(x - 1.5, y - 1.5, 3, 3); }
  for (const p of pickups.values()) if (p.type === 'w' && p.v >= 5) { const [x, y] = P(p.x, p.z); mini.fillStyle = '#ffe14a'; mini.fillRect(x - 2.5, y - 2.5, 5, 5); }
  for (const e of ents.values()) {
    if (!e.alive || e.id === myId) continue;
    const [x, y] = P(e.x, e.z);
    if (e.kind >= 2) { mini.fillStyle = e.kind === 4 ? '#ff7a1a' : '#ff2d2d'; mini.beginPath(); mini.arc(x, y, e.kind >= 3 ? 5 : 3.5, 0, 6.29); mini.fill(); }
    else if (state === 'lobby' || e.kind === 0 && Math.hypot(e.x - me.x, e.z - me.z) < 40) { mini.fillStyle = '#7dd3fc'; mini.beginPath(); mini.arc(x, y, 3, 0, 6.29); mini.fill(); }
  }
  const [x, y] = P(me.x, me.z);
  mini.save(); mini.translate(x, y); mini.rotate(-me.yaw);
  mini.fillStyle = '#fff'; mini.strokeStyle = '#000'; mini.lineWidth = 1.5;
  mini.beginPath(); mini.moveTo(0, -8); mini.lineTo(5.5, 6); mini.lineTo(0, 3); mini.lineTo(-5.5, 6); mini.closePath(); mini.fill(); mini.stroke();
  mini.restore();
}
let hitT = 0;
const ASHORT = ['', 'Cuero', 'Malla', 'Placas'], AICON = ['⛑️', '🛡️', '🦵'];
function updateHud(dt) {
  const e = myEnt();
  if (e) {
    hud.hpf.style.width = Math.max(0, e.hp / e.mhp * 100) + '%'; setTxt(hud.hpt, String(Math.max(0, e.hp)));
    const smax = stamMax();
    hud.stb.style.width = Math.min(420, smax * 2.64) + 'px'; hud.stf.style.width = clamp(me.stam / smax * 100, 0, 100) + '%';
    setCls(hud.stb, 'tired', me.tired); setCls(hud.stb, 'boost', me.elixirT > 0);
    const wi = Math.max(0, e.weapon), W = WEAPONS[wi], wt = weightOf(wi, e.arm);
    setTxt(hud.wpn, (W.fire ? '🔥 ' : '🗡️ ') + W.name); hud.wpn.style.color = '#' + W.color.toString(16).padStart(6, '0');
    setTxt(hud.wst, `Daño ${W.dmg} · golpe cada ${W.cd}s · Peso total ${wt} · Velocidad ${Math.round(speedMul(wt) * 100)}%`);
    for (let z = 0; z < 3; z++) {
      const el = hud['a' + z], [t, d] = e.arm[z];
      setTxt(el.firstElementChild, t ? `${AICON[z]} ${ASHORT[t]} ${d}` : `${AICON[z]} Sin ${PIECES[z].toLowerCase()}`);
      const fr = t ? d / ARMOR_T[t].dur[z] : 0;
      el.querySelector('i').style.width = fr * 100 + '%'; setCls(el, 'none', !t); setCls(el, 'low', t && fr < 0.35);
    }
    const cnt = [inv.stam, inv.elixir, inv.feather, e.gren];
    for (let i = 0; i < 4; i++) { const el = hud['i' + (i + 1)]; setTxt(el.querySelector('b'), String(cnt[i])); setCls(el, 'zero', !cnt[i]); }
    setCls(hud.i2, 'on', me.elixirT > 0);
    // cooldown del arma
    const left = Math.max(0, me.atkT - time), fr = 1 - left / me.atkDur;
    hud.cdf.style.width = clamp(fr * 100, 0, 100) + '%'; setCls(hud.cd, 'busy', left > 0);
    // habilidad especial
    hud.spc.style.display = W.fire ? 'block' : 'none';
    if (W.fire) { const l = Math.max(0, me.spcT - time); hud.spc.querySelector('.cdo').style.height = l / me.spcDur * 100 + '%'; setCls(hud.spc, 'rdy', l <= 0); setTxt(hud.spc.querySelector('b'), l > 0 ? Math.ceil(l) + ' s' : 'Llamarada'); }
    hud.tpi.style.display = myTowers.size ? 'block' : 'none';
    if (myTowers.size) { const l = Math.max(0, me.tpT - time); hud.tpi.querySelector('.cdo').style.height = l / me.tpDur * 100 + '%'; setTxt(hud.tpi.querySelector('b'), l > 0 ? Math.ceil(l) + ' s' : String(myTowers.size)); }
    hud.firevig.style.opacity = e.burning && e.alive ? 1 : 0;
  }
  if (state === 'lobby') { setTxt(hud.info, ''); setTxt(hud.stormtxt, ''); }
  else {
    setTxt(hud.info, `👥 ${aliveN} vivos · ☠️ ${e ? e.kills : 0}`);
    setTxt(hud.stormtxt, storm[7] === 'wait' ? `Tormenta en ${storm[6]} s` : storm[7] === 'shrink' ? `¡Tormenta cerrándose! ${storm[6]} s` : storm[7] === 'done' ? '¡Tormenta total!' : '');
  }
  const out = state === 'playing' && e && e.alive && Math.hypot(me.x - storm[0], me.z - storm[1]) > storm[2];
  hud.stormvig.style.opacity = out ? 1 : 0;
  if (toastT > 0) { toastT -= dt; if (toastT <= 0) hud.center.textContent = ''; }
  if (hitT > 0) { hitT -= dt; if (hitT <= 0) hud.cross.classList.remove('hit'); }
  hud.click.style.display = (!locked && !fallbackLook) ? 'block' : 'none';
  // interacción
  promptT -= dt;
  if (promptT <= 0) {
    promptT = 0.12; interact = findInteract();
    const h = interact ? `<kbd>E</kbd>${esc(interact.label)}` : me.climbing ? '<kbd>W/S</kbd>subir o bajar · <kbd>Espacio</kbd>impulso · <kbd>C</kbd>soltarse' : '';
    if (cache.get(hud.prompt) !== h) { cache.set(hud.prompt, h); hud.prompt.innerHTML = h; }
  }
  // bioma
  if (world && e && e.alive) {
    const b = world.biomeAt(me.x, me.z);
    if (b !== biomeNow) { biomeNow = b; hud.biome.textContent = BIOMES[b].toUpperCase(); hud.biome.style.opacity = 1; biomeT = 2.6; }
    if (biomeT > 0) { biomeT -= dt; if (biomeT <= 0) hud.biome.style.opacity = 0; }
  }
  // dragón
  let dr = null; for (const d of ents.values()) if (d.kind === 4 && d.alive) dr = d;
  const showBoss = dr && Math.hypot(dr.x - me.x, dr.z - me.z) < 120;
  hud.boss.style.display = showBoss ? 'block' : 'none';
  if (showBoss) hud.bossf.style.width = dr.hp / dr.mhp * 100 + '%';
  stormMesh.visible = storm[7] !== 'off';
  stormMesh.position.set(storm[0], 70, storm[1]); stormMesh.scale.set(Math.max(0.5, storm[2]), 180, Math.max(0.5, storm[2]));
  drawMini();
}

// ---------- Red ----------
function onInv(m) {
  const old = inv; inv = m.inv; myTowers = new Set(m.tw);
  if (joined && old) for (const k in ITEMS) {
    if (inv[k] > old[k] && ITEMS[k].passive) {
      notify(`<h4>⬆️ MEJORA DESBLOQUEADA</h4>${ITEMS[k].icon} <b>${ITEMS[k].name}</b><br>${ITEMS[k].desc}`, 'gold', 7000);
      jingle(); ring(me.x, me.y, me.z, 5, ITEMS[k].color, 0.8); burst(me.x, me.y + 1.5, me.z, 30, [ITEMS[k].color, 0xffffff], 5, 0.18, 1, 6);
      if (k === 'vessel') me.stam = stamMax();
    }
  }
  refreshTowers();
}
function onMsg(m) {
  switch (m.t) {
    case 'welcome': myId = m.id; ips = m.ips || []; port = m.port; break;
    case 'full': $('err').textContent = 'La sala está llena (20 jugadores).'; break;
    case 'world': {
      state = m.state; hostId = m.host; hasDragon = m.dragon;
      myTowers = new Set();
      buildWorld(m.seed, m.dead);
      clearPickups(); m.pk.forEach(addPickup);
      for (const g of grenMesh.values()) scene.remove(g); grenMesh.clear();
      for (const v of vehs.values()) scene.remove(v.mesh); vehs.clear();
      setRoster(m.roster);
      for (const e of ents.values()) { e.fresh = true; e.deadT = 0; e.swing = null; }
      hud.banner.style.display = 'none'; hud.dead.style.display = 'none';
      Object.assign(me, { kx: 0, kz: 0, stam: CFG.stamMax, tired: false, climbing: false, lv: null, elixirT: 0, atkT: 0, spcT: 0, tpT: 0, atkReady: true });
      biomeNow = -1; setTp(false);
      if (state === 'playing') toast('¡A ZAMPAR! Último gordo en pie gana', 4);
      refreshLobby();
      break;
    }
    case 'roster': hostId = m.host; setRoster(m.roster); break;
    case 'inv': onInv(m); break;
    case 'tp':
      Object.assign(me, { x: m.x, z: m.z, y: m.y ?? H(m.x, m.z), vx: 0, vz: 0, vy: 0, kx: 0, kz: 0, climbing: false, grounded: true, lv: null });
      if (m.tower) { me.tpT = time + m.cd; me.tpDur = m.cd; toast(`🗼 ${m.tower}`, 2.5); snd('tp'); }
      else me.yaw = Math.atan2(-m.x, -m.z);
      break;
    case 'kb': me.kx += m.x; me.kz += m.z; if (m.y > 0 && !me.lv) { me.vy = Math.max(me.vy, m.y); me.grounded = false; me.climbing = false; } break;
    case 's': {
      for (const a of m.e) {
        const e = ents.get(a[0]); if (!e) continue;
        e.tx = a[1]; e.ty = a[2]; e.tz = a[3]; e.tyaw = a[4];
        const was = e.alive, f = a[7];
        if (e.hp !== a[5]) { e.hp = a[5]; drawTag(e); }
        setWeapon(e, a[6]); e.alive = !!(f & 1); e.gren = a[8]; e.kills = a[9]; e.burning = !!(f & 4); e.landed = !!(f & 16);
        if (e.id !== myId) { e.block = !!(f & 2); e.climb = !!(f & 8); }
        if (!was && e.alive) { e.fresh = true; e.deadT = 0; }
        for (let z = 0; z < 3; z++) {
          const val = a[10 + z];
          if (e.armv[z] === val) continue;
          const t = (val / 1000) | 0, d = val % 1000, bucket = t ? t * 10 + Math.ceil(d / ARMOR_T[t].dur[z] * 3) : 0;
          e.arm[z] = [t, d]; e.armv[z] = val;
          if (e.kind < 2 && e.armb?.[z] !== bucket) { (e.armb ||= [])[z] = bucket; setArmor(e.mesh, z, t, t ? d / ARMOR_T[t].dur[z] : 0); }
        }
        e.veh = a[13];
      }
      const seen = new Set();
      for (const [id, x, y, z, k] of m.g) {
        seen.add(id);
        let g = grenMesh.get(id);
        if (!g) { g = k ? mk(G.sph, lam(0xffb300, 2.5), 0.7, 0.7, 0.7, x, y, z, false) : makePoop(1.3); scene.add(g); grenMesh.set(id, g); g.position.set(x, y, z); g.userData.k = k; }
        g.position.lerp(new THREE.Vector3(x, y, z), 0.6); g.rotation.x += 0.4; g.rotation.z += 0.3;
        if (k) burst(x, y, z, 2, [0xff5a1f, 0xffd60a], 1.5, 0.3, 0.4, -2);
      }
      for (const [id, g] of grenMesh) if (!seen.has(id)) { scene.remove(g); grenMesh.delete(id); }
      syncVehicles(m.v);
      storm = m.st; aliveN = m.al;
      break;
    }
    case 'swing': {
      const e = ents.get(m.id); if (!e || m.id === myId) break;
      e.swing = { t: 0, wind: m.w, rec: 0.3, s: m.s };
      const d = Math.hypot(e.x - me.x, e.z - me.z);
      if (d < 30) snd(e.kind === 4 ? 'roar' : 'swing', 0.5);
      break;
    }
    case 'thr': { const e = ents.get(m.id); if (e && m.id !== myId) e.swing = { t: 0, wind: 0.14, rec: 0.2, s: 'chop' }; break; }
    case 'hit': {
      const e = ents.get(m.id); if (!e) break;
      e.flash = 0.14; e.hurtT = 0.25;
      const h = entH(e), mine = m.by === myId, onMe = m.id === myId, head = m.z === 0, fire = m.c === 'fire';
      const txt = (head ? '¡CABEZA! ' : '') + '-' + m.d + (m.ar ? ' 🛡' : '') + (fire && m.z < 0 ? ' 🔥' : '');
      floatText(txt, onMe ? '#ff5555' : head ? '#ffd23f' : m.ar ? '#a9c7dd' : mine ? '#ffe14a' : '#ffffff', e.x, e.y + h, e.z, (e.kind >= 2 ? 1.5 : 1) * (head ? 1.25 : 1));
      const zy = e.y + (m.z === 0 ? 2.5 : m.z === 2 ? 0.6 : 1.5) * (e.kind >= 2 ? 1.8 : 1);
      burst(e.x, zy, e.z, m.ar ? 8 : 5, m.ar ? [0xdfe6ee, 0xffe14a, 0xffffff] : fire ? [0xff5a1f, 0xffd60a] : [0xff4444, 0xffaaaa], 5, 0.14, 0.5);
      if (onMe) {
        hud.vig.style.opacity = 1; setTimeout(() => hud.vig.style.opacity = 0, 180); snd(m.ar ? 'clang' : 'hurt'); shake = Math.max(shake, 0.25);
        if (m.z >= 0) { const el = hud['a' + m.z]; el.classList.remove('hitz'); void el.offsetWidth; el.classList.add('hitz'); }
      } else if (mine) { snd(head ? 'head' : m.ar ? 'clang' : 'hit'); hud.cross.classList.add('hit'); hitT = 0.15; }
      break;
    }
    case 'abreak': {
      const e = ents.get(m.id); if (!e) break;
      const col = ARMOR_T[m.tier].color, y = e.y + [2.5, 1.5, 0.6][m.z];
      burst(e.x, y, e.z, 22, [col, 0x555555, 0xffffff], 7, 0.2, 0.9); flash(e.x, y, e.z, 1.6, 0xffffff, 0.2, 0.6);
      floatText(`¡${PIECES[m.z].toUpperCase()} ROTO!`, '#ff8a3d', e.x, e.y + 3.6, e.z, 1.2);
      if (Math.hypot(e.x - me.x, e.z - me.z) < 30) snd('abreak');
      if (m.id === myId) { notify(`<h4>💥 ARMADURA ROTA</h4>Has perdido: <b>${armorName(m.z, m.tier)}</b>. Tu ${ZONES[m.z].toLowerCase()} recibe ahora daño directo (x${CFG.zoneMult[m.z]}).`, 'bad', 6000); shake = Math.max(shake, 0.5); }
      else if (e.kind < 2 && Math.hypot(e.x - me.x, e.z - me.z) < 12) toast(`¡Le has roto ${m.z === 2 ? 'las grebas' : m.z ? 'el peto' : 'el casco'} a ${e.name}!`, 1.8);
      break;
    }
    case 'blk': {
      const e = ents.get(m.id); if (!e) break;
      burst(e.x + Math.sin(e.yaw), e.y + 1.8, e.z + Math.cos(e.yaw), 10, [0xffe14a, 0xffffff], 6, 0.1, 0.35);
      if (Math.hypot(e.x - me.x, e.z - me.z) < 30) snd('clang');
      if (m.id === myId) { useStam(CFG.blockCost); floatText('¡BLOQUEADO!', '#7dd3fc', e.x, e.y + 3.4, e.z); }
      break;
    }
    case 'die': {
      const e = ents.get(m.id);
      if (e) { e.alive = false; e.deadT = 0.001; e.burning = false; if (e.kind === 4) { snd('roar'); shake = Math.max(shake, 1); } }
      const why = { storm: 'murió en la tormenta 🌪️', poop: `fue reventado a cacazos por <b>${esc(m.kn)}</b> 💩`, fall: 'se estampó contra el suelo 🪂', fire: m.kn ? `fue achicharrado por <b>${esc(m.kn)}</b> 🔥` : 'murió abrasado 🔥', barrel: m.kn ? `voló por los aires gracias a <b>${esc(m.kn)}</b> 💥` : 'voló por los aires 💥' }[m.c] || `fue rebanado por <b>${esc(m.kn)}</b> 🗡️`;
      feed(`<b>${esc(m.vn)}</b> ${why}`);
      if (m.k === 2 || m.k === 3) toast(`¡${m.kn} ha derrotado a ${m.vn}!`, 4);
      if (m.id === myId) {
        snd('die'); specId = m.by || 0; engineSound(0, -1); me.lv = null;
        hud.dead.style.display = 'block';
        hud.dead.innerHTML = `HAS MUERTO · Puesto #${m.pl}<br><span style="font-size:17px">Clic para cambiar de jugador al que ver</span>`;
      } else if (m.by === myId && m.k < 2) toast(`¡Has eliminado a ${m.vn}!`);
      break;
    }
    case 'boom': {
      boomFx(m.x, m.y, m.z, m.r, m.k);
      const dist = Math.hypot(m.x - me.x, m.z - me.z);
      shake = Math.max(shake, Math.max(0, 1 - dist / 45) * 1.1); snd(m.k === 2 ? 'fire' : 'boom', Math.max(0.06, 1 - dist / 110));
      break;
    }
    case 'dfire': {
      for (const e of ents.values()) if (e.kind === 4) e.fireT = 0.6;
      const dist = Math.hypot(m.x - me.x, m.z - me.z); snd('roar', Math.max(0, 1 - dist / 140)); flash(m.x, m.y, m.z, 3, 0xffa200, 0.3);
      break;
    }
    case 'fuse': fusing.add(m.id); break;
    case 'ob-': {
      const o = world && world.byId.get(m.id), mesh = obsMesh.get(m.id);
      if (mesh) { world.group.remove(mesh); obsMesh.delete(m.id); }
      fusing.delete(m.id);
      if (o) {
        obsAlive = obsAlive.filter(x => x.id !== m.id);
        const cols = { tree: [0x2f8f3a, 0x7a4a21, 0x57b85c], pine: [0x1f6b45, 0x5b3a1e, 0xffffff], cactus: [0x3f9b52], shroom: [0xd94fd0, 0xefe6d0], crystal: [0x6ff2ff, 0xff6ff0, 0xffffff], barrel: [0xd62828, 0xffd60a], chest: [0xffc93c, 0x7a3e12] }[o.t] || [0xb7823f, 0x8a5a22];
        burst(o.x, o.y + 1, o.z, o.t === 'crate' ? 14 : 22, cols, 7, 0.28, 1);
        if (Math.hypot(o.x - me.x, o.z - me.z) < 30) snd('break', 0.7);
      }
      break;
    }
    case 'pk+': addPickup(m.p); break;
    case 'pk-': {
      const p = pickups.get(m.id); if (p) { scene.remove(p.g); pickups.delete(m.id); }
      if (m.by !== myId) break;
      snd('pick'); ring(me.x, me.y, me.z, 1.8, 0xffffff, 0.3);
      if (m.ty === 'w') {
        const W = WEAPONS[m.v];
        if (m.v >= 6) { notify(`<h4>✨ RECOMPENSA LEGENDARIA</h4>🗡️ <b>${W.name}</b><br>Daño ${W.dmg} · peso ${W.w}${W.fire ? ' · R: Llamarada en área' : ''}`, 'gold', 8000); jingle([523, 659, 784, 1047, 1319, 1568], 0.1, 0.22); burst(me.x, me.y + 2, me.z, 50, [W.color, 0xffffff, 0xffd23f], 7, 0.2, 1.4, 5); }
        else toast(`🗡️ ${W.name} equipada`, 2);
      } else if (m.ty === 'a') toast(`🛡️ ${armorName((m.v / 10) | 0, m.v % 10)} equipado`, 2);
      else if (m.ty === 'g') toast(`+${m.v} granadas de caca 💩`, 2);
      else if (m.ty === 'b') toast('🍔 +40 de vida', 2);
      else if (!ITEMS[m.v].passive) toast(`${ITEMS[m.v].icon} ${ITEMS[m.v].name}`, 2);
      break;
    }
    case 'used': {
      snd('drink'); me.stamIdle = 0;
      if (m.k === 'stam') { me.stam = stamMax(); me.tired = false; toast('🧪 Resistencia restaurada', 1.8); }
      else if (m.k === 'elixir') { me.elixirT = CFG.elixirTime; me.stam = stamMax(); me.tired = false; notify(`⚗️ <b>Elixir de aguante</b>: +${CFG.elixirBonus} de resistencia máxima durante ${CFG.elixirTime} s`, 'gold'); }
      else { me.vy = 17; me.grounded = false; me.climbing = false; me.jumps = 1; snd('whoosh'); toast('🪶 ¡Impulso!', 1.2); }
      break;
    }
    case 'fx': {
      const e = ents.get(m.id);
      if (m.k === 'use' && e) { const c = ITEMS[m.v].color; burst(e.x, e.y + 1.5, e.z, 16, [c, 0xffffff], 3, 0.14, 0.9, m.v === 'feather' ? 10 : -3); if (m.v === 'feather') ring(e.x, e.y, e.z, 2.5, c, 0.4); }
      else if (m.k === 'tower') { ring(m.x, m.y, m.z, 9, 0x4fd8ff, 1); flash(m.x, m.y + 2, m.z, 5, 0x4fd8ff, 0.6); burst(m.x, m.y + 1.5, m.z, 40, [0x4fd8ff, 0xffffff], 6, 0.2, 1.4, 4); }
      else if (m.k === 'tp') { ring(m.x, m.y, m.z, 3, 0x4fd8ff, 0.5); burst(m.x, m.y + 1.5, m.z, 26, [0x4fd8ff, 0xffffff], 4, 0.16, 0.9, -8); if (Math.hypot(m.x - me.x, m.z - me.z) < 40) snd('tp', 0.7); }
      break;
    }
    case 'twr': {
      myTowers.add(m.id); refreshTowers();
      notify(`<h4>🗼 ${esc(m.name)} ACTIVADA</h4>Punto de teletransporte desbloqueado (tecla T)<br><b>Recompensa (${['', 'básica', 'media', 'grande', 'LEGENDARIA'][m.tier]}):</b><br>${m.got.map(esc).join('<br>')}`, m.tier >= 3 ? 'gold' : '', 9000);
      jingle(m.tier >= 4 ? [523, 659, 784, 1047, 1319, 1568] : [523, 659, 784, 1047]); shake = Math.max(shake, 0.3);
      break;
    }
    case 'spc': me.spcT = time + m.cd; me.spcDur = m.cd; break;
    case 'veh': {
      const v = vehs.get(m.id), e = ents.get(m.who);
      if (e) { e.hopT = 0.35; if (Math.hypot(e.x - me.x, e.z - me.z) < 30) snd('mount'); }
      if (m.who !== myId) break;
      if (m.on) {
        const vv = v || { yaw: m.v[5] };
        me.lv = { sp: 0, yaw: vv.yaw }; me.climbing = false;
        if (m.driver === myId) { me.x = m.v[2]; me.y = m.v[3]; me.z = m.v[4]; }
        toast(m.driver === myId ? (m.v[1] ? '🛴 Patinete: W acelera · S frena · A/D gira' : '🏍️ Moto: W acelera · S frena · A/D gira') : '🏍️ Vas en el sidecar: puedes atacar y lanzar granadas', 3);
      } else {
        const yaw = me.lv ? me.lv.yaw : me.yaw; me.lv = null; engineSound(0, -1);
        const [x, z] = collide(me.x + Math.cos(yaw) * 2.2, me.z - Math.sin(yaw) * 2.2, PLAYER_R, me.y, obsAlive); me.x = x; me.z = z;
      }
      break;
    }
    case 'end': {
      state = 'ended';
      const win = m.id === myId;
      $('bh').textContent = win ? '¡VICTORIA GORDA!' : 'FIN DE LA PARTIDA';
      $('bp').textContent = (win ? 'Eres el último gordo en pie 🏆' : `Ha ganado ${m.name}`) + ` · ${m.kills} bajas · Volviendo a la sala…`;
      hud.banner.style.display = 'flex'; hud.dead.style.display = 'none';
      if (win) jingle([523, 659, 784, 1047, 1319], 0.14, 0.25);
      break;
    }
    case 'msg':
      if (m.big) { toast(m.m, 5); notify(esc(m.m), m.big === 2 ? 'gold' : 'bad', 8000); if (m.big === 2) jingle([392, 523, 659, 784, 1047, 1319], 0.12, 0.25); else snd('roar', 0.5); }
      else feed(esc(m.m));
      break;
  }
}
function connect(name) {
  ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host);
  ws.onopen = () => { ws.send(JSON.stringify({ t: 'join', name })); joined = true; $('menu').style.display = 'none'; $('hud').style.display = 'block'; };
  ws.onmessage = ev => { try { onMsg(JSON.parse(ev.data)); } catch (err) { console.error(err); } };
  ws.onclose = () => {
    joined = false; if (document.pointerLockElement) document.exitPointerLock();
    engineSound(0, -1);
    $('menu').style.display = 'flex'; $('hud').style.display = 'none';
    $('err').textContent = $('err').textContent || 'Conexión perdida con el anfitrión. Pulsa JUGAR para reconectar.';
    for (const e of [...ents.values()]) removeEnt(e);
  };
}
const nameIn = $('name');
try { nameIn.value = localStorage.getItem('gr_name') || ''; } catch { }
function play() {
  const name = nameIn.value.trim() || 'Gordo' + ((Math.random() * 90 + 10) | 0);
  try { localStorage.setItem('gr_name', name); } catch { }
  $('err').textContent = '';
  initAudio(); connect(name); lockPointer();
}
$('play').addEventListener('click', play);
nameIn.addEventListener('keydown', ev => { if (ev.code === 'Enter') { ev.stopPropagation(); play(); } });

// ---------- Bucle ----------
let lastT = performance.now();
buildWorld(1234, []);
function frame(t) {
  const dt = Math.min(0.05, (t - lastT) / 1000); lastT = t; time += dt;
  if (joined) { updateMe(dt); updateVehicles(dt); updateEnts(dt); updateCam(dt); updateHud(dt); }
  else { const a = time * 0.06; camera.position.set(Math.sin(a) * 150, 85, Math.cos(a) * 150); camera.lookAt(0, 8, 0); cullObstacles(dt, 0, 0); }
  for (const id of fusing) { const m = obsMesh.get(id); if (m) m.scale.setScalar(1 + Math.abs(Math.sin(time * 22)) * 0.25); }
  for (const p of pickups.values()) { p.inner.rotation.y += dt * 2; p.inner.position.y = Math.sin(time * 3 + p.id) * 0.15; }
  updateFx(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.__gr = { me, ents, keys, vehs, pickups, wsSend, tryAttack, tryThrow, get state() { return state; }, get world() { return world; }, get inv() { return inv; }, get towers() { return myTowers; }, get storm() { return storm; } };
