// GORDO ROYALE - modelos 3D y animaciones (personajes, armas, armaduras, dragón, vehículos, estructuras)
import * as THREE from '/vendor/three.module.js';
import { WEAPONS, ARMOR_T, ITEMS } from '/shared.js';

const matCache = new Map();
export function lam(color, emissive = 0) {
  const k = color + '_' + emissive;
  if (!matCache.has(k)) matCache.set(k, new THREE.MeshLambertMaterial({ color, emissive: emissive ? color : 0, emissiveIntensity: emissive }));
  return matCache.get(k);
}
export const G = {
  sph: new THREE.SphereGeometry(1, 20, 14),
  sphLo: new THREE.SphereGeometry(1, 8, 6),
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 14),
  cylHi: new THREE.CylinderGeometry(1, 1, 1, 24),
  cone: new THREE.ConeGeometry(1, 1, 14),
  cone4: new THREE.ConeGeometry(1, 1, 5),
  ico: new THREE.IcosahedronGeometry(1, 0),
  dod: new THREE.DodecahedronGeometry(1, 0),
};
export function mk(geo, mat, sx = 1, sy = 1, sz = 1, x = 0, y = 0, z = 0, shadow = true) {
  const m = new THREE.Mesh(geo, mat);
  m.scale.set(sx, sy, sz); m.position.set(x, y, z); m.castShadow = shadow;
  return m;
}
export const SHIRTS = [0xe74c3c, 0x3498db, 0x2ecc71, 0xf1c40f, 0x9b59b6, 0xe67e22, 0x1abc9c, 0xff7eb6, 0x34495e, 0xecf0f1, 0x8d6e63, 0x00bcd4];
const SKINS = [0xf2c29b, 0xe0a47a, 0xc68656, 0x9c6238, 0xf7d3b5, 0xd9a273];
const HAIRS = [0x2b1b0e, 0x6b3e1a, 0xd9b24c, 0x111111, 0xb5462a, 0x888888];
const lerp = (a, b, t) => a + (b - a) * t;

// ---------- Armas y objetos ----------
export function makeWeapon(i) {
  const s = WEAPONS[i], g = new THREE.Group(), big = s.len > 2.3;
  const bw = i === 1 ? 0.07 : big ? 0.3 : 0.16;
  g.add(mk(G.box, lam(s.color, s.glow), bw, big ? 0.07 : 0.05, s.len, 0, 0, 0.28 + s.len / 2));
  const tip = mk(G.cone, lam(s.color, s.glow), bw / 2 + 0.005, 0.3 + s.len * 0.05, 0.03, 0, 0, 0.28 + s.len + 0.14 + s.len * 0.025); tip.rotation.x = Math.PI / 2; g.add(tip);
  g.add(mk(G.box, lam(i >= 3 ? 0xb8860b : 0x4a3a2a), big ? 0.9 : i === 1 ? 0.3 : 0.55, 0.1, 0.12, 0, 0, 0.26));
  const h = mk(G.cyl, lam(0x3a2414), 0.06, big ? 0.7 : 0.4, 0.06, 0, 0, big ? -0.08 : 0.05); h.rotation.x = Math.PI / 2; g.add(h);
  if (i === 6) g.add(mk(G.sph, lam(0xff3ef5, 1), 0.1, 0.1, 0.1, 0, 0, -0.18, false));
  if (i === 5) g.add(mk(G.box, lam(s.color, s.glow), 0.4, 0.05, s.len * 0.5, 0.12, 0, 0.28 + s.len * 0.7));
  if (s.fire) { // Colmillo de Dragón: hoja dentada y brasa
    for (let k = 0; k < 4; k++) { const t = mk(G.cone, lam(0xffb300, 1.5), 0.07, 0.3, 0.03, 0.13, 0, 0.6 + k * 0.42); t.rotation.z = -Math.PI / 2; g.add(t); }
    g.add(mk(G.sph, lam(0xffe066, 2), 0.11, 0.11, 0.11, 0, 0, -0.18, false));
  }
  return g;
}
export function makePoop(s = 1) {
  const g = new THREE.Group(), m = lam(0x6b3f1d);
  g.add(mk(G.sphLo, m, 0.3, 0.2, 0.3, 0, 0, 0), mk(G.sphLo, m, 0.22, 0.17, 0.22, 0, 0.2, 0), mk(G.sphLo, m, 0.13, 0.15, 0.13, 0.03, 0.38, 0));
  g.scale.setScalar(s); return g;
}
export function makeBurger() {
  const g = new THREE.Group();
  g.add(mk(G.cyl, lam(0xe0a458), 0.45, 0.16, 0.45, 0, 0.08, 0), mk(G.cyl, lam(0x5c3317), 0.48, 0.13, 0.48, 0, 0.22, 0),
    mk(G.cyl, lam(0x4caf50), 0.52, 0.05, 0.52, 0, 0.31, 0), mk(G.cyl, lam(0xffd23f), 0.5, 0.04, 0.5, 0, 0.36, 0),
    mk(G.sph, lam(0xe0a458), 0.46, 0.26, 0.46, 0, 0.4, 0));
  return g;
}
export function makeItem(key) {
  const g = new THREE.Group(), c = ITEMS[key].color;
  if (key === 'stam' || key === 'elixir') {
    g.add(mk(G.sph, lam(c, 0.8), 0.3, 0.3, 0.3, 0, 0.3, 0), mk(G.cyl, lam(0xdfefff), 0.1, 0.3, 0.1, 0, 0.68, 0), mk(G.cyl, lam(0x8a5a2b), 0.12, 0.1, 0.12, 0, 0.86, 0));
  } else if (key === 'feather') {
    const f = mk(G.cone, lam(c, 0.6), 0.18, 1.0, 0.04, 0, 0.6, 0); f.rotation.z = 0.5; g.add(f, mk(G.cyl, lam(0xffffff), 0.02, 1.1, 0.02, 0, 0.55, 0));
    g.children[1].rotation.z = 0.5;
  } else if (key === 'vessel') {
    g.add(mk(G.sph, lam(c, 0.9), 0.36, 0.42, 0.36, 0, 0.45, 0), mk(G.cyl, lam(0xffd23f, 0.4), 0.2, 0.12, 0.2, 0, 0.9, 0));
  } else if (key === 'djump') {
    for (const x of [-0.22, 0.22]) g.add(mk(G.box, lam(c, 0.5), 0.26, 0.5, 0.3, x, 0.45, 0), mk(G.box, lam(c, 0.5), 0.26, 0.2, 0.55, x, 0.2, 0.12), mk(G.cone, lam(0xffffff, 1), 0.12, 0.3, 0.05, x, 0.6, -0.22));
  } else if (key === 'claws') {
    g.add(mk(G.sph, lam(0x8a5a2b), 0.3, 0.3, 0.22, 0, 0.45, 0));
    for (let i = -1; i <= 1; i++) { const k = mk(G.cone, lam(c, 0.6), 0.06, 0.45, 0.06, i * 0.17, 0.85, 0); g.add(k); }
  } else {
    const h = mk(G.cyl, lam(0x8a5a2b), 0.05, 1.0, 0.05, 0, 0.55, 0); const p = mk(G.cone, lam(c, 0.5), 0.09, 0.7, 0.09, 0, 1.0, 0); p.rotation.z = Math.PI / 2;
    g.add(h, p);
  }
  return g;
}
// Pieza de armadura en coordenadas del cuerpo. frac = durabilidad restante (0..1)
function armorMat(tier, frac) {
  const c = new THREE.Color(ARMOR_T[tier].color).lerp(new THREE.Color(0x4a2f2a), (1 - frac) * 0.65);
  return lam(c.getHex(), 0);
}
function helmPiece(tier, frac) {
  const g = new THREE.Group(), m = armorMat(tier, frac);
  g.add(mk(G.sph, m, 0.53, 0.42, 0.52, 0, 0.13, -0.02));
  if (tier >= 2) g.add(mk(G.box, m, 0.08, 0.34, 0.06, 0, 0.0, 0.47));
  if (tier === 3) { g.add(mk(G.box, lam(0xc0392b), 0.08, 0.34, 0.7, 0, 0.6, -0.05)); g.add(mk(G.box, m, 0.5, 0.12, 0.06, 0, 0.16, 0.46)); }
  return g;
}
function chestPiece(tier, frac) {
  const g = new THREE.Group(), m = armorMat(tier, frac);
  g.add(mk(G.sph, m, 1.08, 0.78, 1.04, 0, 1.42, 0));
  if (tier >= 2) g.add(mk(G.sph, m, 0.32, 0.26, 0.32, 0.92, 1.95, 0), mk(G.sph, m, 0.32, 0.26, 0.32, -0.92, 1.95, 0));
  if (tier === 3) g.add(mk(G.box, lam(0xffd23f, 0.3), 0.25, 0.25, 0.08, 0, 1.6, 1.0));
  return g;
}
function legPiece(tier, frac) { return mk(G.cyl, armorMat(tier, frac), 0.27, 0.52, 0.27, 0, -0.3, 0); }
export function makeArmorPickup(zone, tier) {
  const g = new THREE.Group();
  if (zone === 0) { const p = helmPiece(tier, 1); p.position.y = 0.45; p.scale.setScalar(1.2); g.add(p); }
  else if (zone === 1) { const p = chestPiece(tier, 1); p.position.y = -0.25; p.scale.setScalar(0.62); g.add(p); }
  else { for (const x of [-0.3, 0.3]) { const p = legPiece(tier, 1); p.position.set(x, 0.75, 0); p.scale.multiplyScalar(1.3); g.add(p); } }
  return g;
}

// ---------- Personaje gordo ----------
export function makeFatty(kind, ci) {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const shirt = lam(kind === 3 ? 0x7a2fd0 : kind === 2 ? 0xf4f4f4 : SHIRTS[ci % SHIRTS.length]);
  const skin = lam(kind >= 2 ? 0xe09a78 : SKINS[ci % SKINS.length]);
  const pants = lam(kind === 3 ? 0x3b1466 : kind === 2 ? 0x333333 : 0x2f3e63);
  const belly = mk(G.sph, shirt, 1.02, 0.95, 0.98, 0, 1.3, 0); body.add(belly);
  body.add(mk(G.sph, pants, 0.95, 0.55, 0.9, 0, 0.86, 0));
  body.add(mk(G.sph, skin, 0.16, 0.1, 0.1, 0, 1.0, 0.93, false));
  const head = new THREE.Group(); head.position.y = 2.45; body.add(head);
  head.add(mk(G.sph, skin, 0.47, 0.45, 0.45));
  head.add(mk(G.sphLo, lam(0x111111), 0.06, 0.08, 0.05, 0.16, 0.08, 0.4, false), mk(G.sphLo, lam(0x111111), 0.06, 0.08, 0.05, -0.16, 0.08, 0.4, false));
  head.add(mk(G.sphLo, skin, 0.09, 0.08, 0.1, 0, -0.03, 0.45, false));
  head.add(mk(G.sphLo, lam(0xff9aa2), 0.1, 0.07, 0.05, 0.27, -0.1, 0.33, false), mk(G.sphLo, lam(0xff9aa2), 0.1, 0.07, 0.05, -0.27, -0.1, 0.33, false));
  head.add(mk(G.box, lam(0x7a1f1f), 0.2, 0.04, 0.05, 0, -0.2, 0.41, false));
  let hair = null;
  if (kind === 2) {
    head.add(mk(G.cyl, lam(0xffffff), 0.36, 0.4, 0.36, 0, 0.55, 0), mk(G.sph, lam(0xffffff), 0.5, 0.3, 0.5, 0, 0.85, 0));
  } else if (kind === 3) {
    head.add(mk(G.cyl, lam(0xffd23f, 0.4), 0.42, 0.22, 0.42, 0, 0.45, 0));
    for (let i = 0; i < 6; i++) head.add(mk(G.cone, lam(0xffd23f, 0.4), 0.09, 0.3, 0.09, Math.sin(i / 6 * 6.28) * 0.38, 0.68, Math.cos(i / 6 * 6.28) * 0.38));
  } else { hair = mk(G.sph, lam(HAIRS[(ci * 7 + 3) % HAIRS.length]), 0.49, 0.36, 0.48, 0, 0.16, -0.05); head.add(hair); }
  const leg = x => {
    const p = new THREE.Group(); p.position.set(x, 0.62, 0);
    p.add(mk(G.cyl, pants, 0.21, 0.62, 0.21, 0, -0.3, 0), mk(G.box, lam(0x3a2414), 0.36, 0.17, 0.56, 0, -0.55, 0.1));
    body.add(p); return p;
  };
  const arm = x => {
    const p = new THREE.Group(); p.position.set(x, 1.78, 0);
    p.add(mk(G.cyl, shirt, 0.18, 0.7, 0.18, 0, -0.38, 0), mk(G.sphLo, skin, 0.2, 0.2, 0.2, 0, -0.82, 0));
    body.add(p); return p;
  };
  const legL = leg(0.42), legR = leg(-0.42), armL = arm(1.0), armR = arm(-1.0);
  const holder = new THREE.Group(); holder.position.set(0, -0.82, 0); armR.add(holder);
  const slots = [new THREE.Group(), new THREE.Group(), [new THREE.Group(), new THREE.Group()]];
  head.add(slots[0]); body.add(slots[1]); legL.add(slots[2][0]); legR.add(slots[2][1]);
  // llamas (quemadura)
  const fire = new THREE.Group(); fire.visible = false; body.add(fire);
  for (let i = 0; i < 5; i++) fire.add(mk(G.cone4, lam(i % 2 ? 0xffd60a : 0xff5a1f, 2), 0.3, 0.9, 0.3, Math.sin(i * 1.3) * 0.8, 1.2 + (i % 3) * 0.5, Math.cos(i * 1.3) * 0.8, false));
  root.userData = { body, belly, head, legL, legR, armL, armR, holder, slots, hair, fire, base: kind === 3 ? 2.4 : kind === 2 ? 1.75 : 1 };
  root.scale.setScalar(root.userData.base);
  return root;
}
export function setArmor(mesh, zone, tier, frac) {
  const u = mesh.userData, list = zone === 2 ? u.slots[2] : [u.slots[zone]];
  for (const s of list) { s.clear(); if (tier > 0) s.add(zone === 0 ? helmPiece(tier, frac) : zone === 1 ? chestPiece(tier, frac) : legPiece(tier, frac)); }
  if (zone === 0 && u.hair) u.hair.visible = tier === 0;
}
// Animación procedural del gordo. e: {speed, phase, swing, block, climb, ride, hurtT, flash, deadT, wdef, burning}
export function animate(e, dt, time) {
  const u = e.mesh.userData, W = e.wdef, w = Math.min(1, e.speed / 6);
  if (e.speed > 0.5 && !e.ride) e.phase += dt * (5 + e.speed * 0.9);
  const s = Math.sin(e.phase);
  let legL = s * 0.9 * w, legR = -s * 0.9 * w, bZ = s * 0.1 * w, bY = Math.abs(s) * 0.1 * w, bX = 0, bRy = 0;
  let aLx = -s * 0.7 * w, aLz = 0.25, aRx = -0.6 + s * 0.2 * w, aRz = -0.25, hz = 0;
  if (W && W.two) { aRx = -1.0; aLx = -1.15; aLz = -0.55; }
  if (e.ride === 1 || e.ride === 2) { legL = legR = -1.35; aLx = aRx = e.ride === 1 ? -1.25 : -0.45; aLz = e.ride === 1 ? -0.1 : 0.25; bX = e.ride === 1 ? 0.12 : 0; bZ = 0; bY = -0.3; }
  else if (e.ride === 3) { legL = -0.15; legR = 0.3 + (e.speed < 5 ? Math.max(0, Math.sin(time * 8)) * 0.8 : 0); aLx = aRx = -1.3; aLz = -0.15; bX = 0.2; bZ = 0; bY = 0; }
  else if (e.climb) { const c = Math.sin(time * 7 + e.id); aLx = -2.6 + c * 0.5; aRx = -2.6 - c * 0.5; legL = -0.6 - c * 0.5; legR = -0.6 + c * 0.5; bX = -0.12; bZ = c * 0.06; bY = 0; }
  else if (e.block) { aRx = -1.5; aRz = 0.95; aLx = -1.2; aLz = -0.6; bX = -0.05; }
  const sw = e.swing;
  if (sw) {
    sw.t += dt;
    const a = sw.t / sw.wind;
    let pb = 1, st = 1, rec = 0;
    if (a < 1) { pb = Math.min(1, a / 0.45); st = a < 0.45 ? 0 : (a - 0.45) / 0.55; st *= st; } else rec = Math.min(1, (sw.t - sw.wind) / sw.rec);
    const k = pb * (1 - st), f = st * (1 - rec);
    const m3 = (b, wv, sv) => b + (wv - b) * k + (sv - b) * f;
    if (sw.s === 'stab') { aRx = lerp(aRx, -1.5, Math.max(k, f)); hz = -0.5 * k + 0.8 * f; bRy = 0.3 * k - 0.25 * f; bX = 0.15 * f; }
    else if (sw.s === 'heavy') { aRx = m3(aRx, -3.2, -0.15); aLx = aRx; aLz = -0.55; bX = -0.3 * k + 0.45 * f; bY += 0.3 * k; }
    else if (sw.s === 'sweep') { aRx = -1.55; aLx = -1.4; aLz = -0.55; bRy = (1.7 * pb - 3.4 * st) * (1 - rec); bX = 0.1; }
    else if (sw.s === 'spin') { aRx = -1.55; aRz = -0.6; bRy = rec > 0 ? 0 : 0.7 * pb * (1 - st) - st * Math.PI * 2; bY += 0.15 * k; }
    else if (sw.s === 'slam') { aRx = m3(aRx, -3.1, -0.1); aLx = aRx; aLz = -0.4; aRz = 0.2; bY += 1.3 * k; bX = -0.2 * k + 0.5 * f; }
    else { aRx = m3(aRx, -3.0, -0.3); bX = -0.15 * k + 0.25 * f; bRy = 0.35 * k - 0.3 * f; }
    if (sw.t >= sw.wind + sw.rec) e.swing = null;
  }
  if (e.hurtT > 0) { e.hurtT -= dt; bX -= 0.4 * Math.max(0, e.hurtT / 0.25); }
  if (e.deadT > 0) { const d = Math.min(1, e.deadT / 0.55); bX = -Math.PI / 2 * d * d; bY = 0.5 * d; aLx = aRx = -2.6 * d; legL = legR = 0; bZ = bRy = 0; }
  u.legL.rotation.x = legL; u.legR.rotation.x = legR;
  u.body.rotation.set(bX, bRy, bZ); u.body.position.y = bY;
  u.armL.rotation.set(aLx, 0, aLz); u.armR.rotation.set(aRx, 0, aRz);
  u.holder.position.z = hz;
  u.belly.scale.y = 0.95 + Math.sin(time * 2.2 + e.id) * 0.02 + Math.abs(Math.cos(e.phase)) * 0.05 * w;
  if (e.flash > 0) e.flash -= dt;
  const f = Math.max(0, e.flash) * 1.6;
  e.mesh.scale.set(u.base * (1 + f), u.base * (1 - f * 0.6), u.base * (1 + f));
  u.fire.visible = !!e.burning;
  if (e.burning) for (let i = 0; i < u.fire.children.length; i++) { const c = u.fire.children[i]; c.scale.y = 0.6 + Math.abs(Math.sin(time * 9 + i * 2)) * 0.8; c.rotation.y = time * 3 + i; }
}

// ---------- Dragón ----------
export function makeDragon() {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const red = lam(0xb3261e), dark = lam(0x7a1712), bellyM = lam(0xe8b04a), horn = lam(0xf3e9d2);
  body.add(mk(G.sph, red, 2.1, 1.6, 3.6, 0, 2.6, 0), mk(G.sph, bellyM, 1.7, 1.2, 3.1, 0, 2.2, 0.1));
  for (let i = 0; i < 6; i++) body.add(mk(G.cone4, dark, 0.3, 0.9, 0.3, 0, 4.3 - Math.abs(i - 2.5) * 0.12, 2.4 - i * 1.0));
  // cuello y cabeza (cadena)
  const neck = []; let parent = body, py = 3.2, pz = 3.0;
  for (let i = 0; i < 4; i++) {
    const seg = new THREE.Group(); seg.position.set(0, py, pz); seg.rotation.x = -0.35;
    seg.add(mk(G.sph, red, 1.0 - i * 0.12, 0.95 - i * 0.1, 1.1, 0, 0, 0.5));
    parent.add(seg); neck.push(seg); parent = seg; py = 0; pz = 1.2;
  }
  const head = new THREE.Group(); head.position.set(0, 0, 1.3); head.rotation.x = 1.3; parent.add(head);
  head.add(mk(G.sph, red, 0.95, 0.75, 1.35, 0, 0.1, 0.7), mk(G.box, red, 1.1, 0.5, 1.3, 0, 0.15, 1.7));
  const jaw = new THREE.Group(); jaw.position.set(0, -0.2, 0.6); head.add(jaw);
  jaw.add(mk(G.box, dark, 0.95, 0.25, 1.9, 0, -0.1, 0.85));
  for (let i = 0; i < 4; i++) for (const x of [-0.4, 0.4]) jaw.add(mk(G.cone4, horn, 0.08, 0.3, 0.08, x, 0.15, 0.4 + i * 0.4, false));
  const mouthFire = mk(G.sph, lam(0xffb300, 2.5), 0.4, 0.3, 0.6, 0, 0.05, 1.5, false); mouthFire.visible = false; head.add(mouthFire);
  for (const x of [-0.5, 0.5]) {
    head.add(mk(G.sphLo, lam(0xffe14a, 2), 0.16, 0.16, 0.16, x * 0.95, 0.5, 1.1, false));
    const h = mk(G.cone, horn, 0.16, 1.4, 0.16, x, 0.9, -0.1); h.rotation.x = -0.9; head.add(h);
  }
  // alas
  const wingGeo = new THREE.BufferGeometry();
  wingGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 1.2, 7.5, 0, 2.2, 8.5, 0, -1.5, 0, 0, 1.2, 8.5, 0, -1.5, 5.5, 0, -3.6, 0, 0, 1.2, 5.5, 0, -3.6, 2.6, 0, -3.2, 0, 0, 1.2, 2.6, 0, -3.2, 0, 0, -2.4], 3));
  wingGeo.computeVertexNormals();
  const wingMat = new THREE.MeshLambertMaterial({ color: 0x8e1f18, side: THREE.DoubleSide });
  const wings = [];
  for (const sx of [1, -1]) {
    const p = new THREE.Group(); p.position.set(sx * 1.5, 3.6, 0.6);
    const m = new THREE.Mesh(wingGeo, wingMat); m.scale.x = sx; m.castShadow = true; p.add(m);
    const b = mk(G.cyl, dark, 0.14, 8, 0.14, sx * 4, 0, 1.7); b.rotation.z = Math.PI / 2; b.rotation.y = -sx * 0.13; p.add(b);
    body.add(p); wings.push(p);
  }
  // cola (cadena)
  const tail = []; parent = body; py = 2.5; pz = -3.0;
  for (let i = 0; i < 7; i++) {
    const seg = new THREE.Group(); seg.position.set(0, py, pz);
    const r = 1.0 - i * 0.12;
    seg.add(mk(G.sph, red, r, r * 0.9, 1.0, 0, 0, -0.5));
    if (i === 6) { const sp = mk(G.cone4, dark, 0.5, 1.4, 0.2, 0, 0, -1.4); sp.rotation.x = -Math.PI / 2; seg.add(sp); }
    parent.add(seg); tail.push(seg); parent = seg; py = 0; pz = -1.0;
  }
  const legs = [];
  for (const [x, z] of [[1.3, 1.8], [-1.3, 1.8], [1.4, -1.6], [-1.4, -1.6]]) {
    const p = new THREE.Group(); p.position.set(x, 1.9, z);
    p.add(mk(G.cyl, red, 0.42, 1.7, 0.42, 0, -0.85, 0), mk(G.box, dark, 0.8, 0.3, 1.1, 0, -1.75, 0.25));
    body.add(p); legs.push(p);
  }
  root.userData = { body, neck, head, jaw, wings, tail, legs, mouthFire, base: 1 };
  return root;
}
export function animDragon(e, dt, time) {
  const u = e.mesh.userData, land = e.landed;
  e.landK = lerp(e.landK || 0, land ? 1 : 0, Math.min(1, dt * 3));
  const flap = Math.sin(time * (land ? 2 : 5.5));
  for (let i = 0; i < 2; i++) u.wings[i].rotation.z = (i ? -1 : 1) * (lerp(flap * 0.75, -1.0 + flap * 0.08, e.landK));
  u.body.position.y = lerp(-1.6 + flap * -0.35, 0, e.landK);
  for (const l of u.legs) l.rotation.x = lerp(0.9, Math.sin(time * 6 + l.position.z) * 0.35 * Math.min(1, e.speed / 3), e.landK);
  for (let i = 0; i < u.tail.length; i++) { u.tail[i].rotation.y = Math.sin(time * 2.2 - i * 0.6) * 0.16; u.tail[i].rotation.x = lerp(0.04, -0.03, e.landK) + Math.sin(time * 1.7 - i * 0.5) * 0.04; }
  let lunge = 0, open = 0.08 + Math.sin(time * 1.5) * 0.04;
  const sw = e.swing;
  if (sw) {
    sw.t += dt; const a = Math.min(1, sw.t / sw.wind);
    lunge = sw.t < sw.wind ? -0.25 * a : Math.max(0, 1 - (sw.t - sw.wind) / sw.rec);
    open = sw.t < sw.wind ? 0.7 * a : 0.7 * (1 - lunge) * 0.3;
    if (sw.t >= sw.wind + sw.rec) e.swing = null;
  }
  if (e.fireT > 0) { e.fireT -= dt; open = 0.8; }
  u.mouthFire.visible = e.fireT > 0;
  for (let i = 0; i < u.neck.length; i++) { u.neck[i].rotation.x = -0.35 + lunge * 0.42 + Math.sin(time * 1.3 + i) * 0.04; u.neck[i].rotation.y = Math.sin(time * 0.9 + i * 0.7) * 0.07; }
  u.head.rotation.x = 1.3 - lunge * 0.9;
  u.jaw.rotation.x = open;
  if (e.hurtT > 0) { e.hurtT -= dt; u.body.rotation.z = Math.sin(time * 40) * 0.07; } else u.body.rotation.z = 0;
  if (e.deadT > 0) { const d = Math.min(1, e.deadT / 1.2); u.body.rotation.z = d * 1.4; u.body.position.y = -d * 0.8; for (const wg of u.wings) wg.rotation.z *= (1 - d); }
  if (e.flash > 0) e.flash -= dt;
  const f = Math.max(0, e.flash);
  e.mesh.scale.setScalar(1 + f * 0.5);
}

// ---------- Vehículos ----------
function wheel(r, w, x, y, z) {
  const p = new THREE.Group(); p.position.set(x, y, z);
  const t = mk(G.cylHi, lam(0x1c1c1c), r, w, r); t.rotation.z = Math.PI / 2;
  const hub = mk(G.box, lam(0xcccccc), w + 0.02, r * 1.5, 0.08), hub2 = mk(G.box, lam(0xcccccc), w + 0.02, 0.08, r * 1.5);
  p.add(t, hub, hub2); return p;
}
export function makeMoto() {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const red = lam(0xc0392b), blk = lam(0x222222), chrome = lam(0xbfc7cf);
  body.add(mk(G.box, blk, 0.45, 0.5, 2.0, 0, 0.75, 0), mk(G.sph, red, 0.42, 0.36, 0.7, 0, 1.15, 0.45), mk(G.box, lam(0x3a2414), 0.5, 0.18, 0.9, 0, 1.1, -0.45));
  const fork = mk(G.cyl, chrome, 0.06, 1.3, 0.06, 0, 1.0, 1.15); fork.rotation.x = -0.35; body.add(fork);
  const bar = mk(G.cyl, chrome, 0.05, 1.1, 0.05, 0, 1.6, 0.95); bar.rotation.z = Math.PI / 2; body.add(bar);
  body.add(mk(G.sph, lam(0xfff2a8, 1.5), 0.2, 0.2, 0.12, 0, 1.3, 1.3, false));
  const ex = mk(G.cyl, chrome, 0.08, 1.3, 0.08, 0.32, 0.5, -0.7); ex.rotation.x = Math.PI / 2; body.add(ex);
  body.add(mk(G.box, red, 0.5, 0.08, 0.7, 0, 1.02, -1.15));
  // sidecar (a la derecha del piloto: -X)
  body.add(mk(G.sph, red, 0.72, 0.5, 1.35, -1.35, 0.72, 0), mk(G.box, lam(0x3a2414), 0.8, 0.2, 0.7, -1.35, 0.95, -0.25), mk(G.sph, lam(0x9fd8ff), 0.5, 0.35, 0.1, -1.35, 1.15, 0.75));
  const b1 = mk(G.cyl, chrome, 0.05, 1.2, 0.05, -0.65, 0.6, 0.4); b1.rotation.z = Math.PI / 2; const b2 = b1.clone(); b2.position.z = -0.5; body.add(b1, b2);
  const wheels = [wheel(0.5, 0.22, 0, 0.5, 1.25), wheel(0.5, 0.26, 0, 0.5, -1.05), wheel(0.42, 0.2, -2.0, 0.42, -0.2)];
  g.add(...wheels);
  g.userData = { body, wheels, seat: [0, 0.78, -0.35], seat2: [-1.35, 0.5, -0.2] };
  return g;
}
export function makeScooter() {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const blk = lam(0x2b2b2b), cy = lam(0x21e6c1, 1.2);
  body.add(mk(G.box, blk, 0.38, 0.09, 1.5, 0, 0.3, 0), mk(G.box, cy, 0.4, 0.03, 1.3, 0, 0.36, 0, false));
  const stem = mk(G.cyl, blk, 0.05, 1.7, 0.05, 0, 1.1, 0.72); stem.rotation.x = -0.12; body.add(stem);
  const bar = mk(G.cyl, blk, 0.04, 0.9, 0.04, 0, 1.95, 0.62); bar.rotation.z = Math.PI / 2; body.add(bar);
  body.add(mk(G.sph, lam(0xffffff, 2), 0.08, 0.08, 0.05, 0, 1.5, 0.75, false), mk(G.box, lam(0xff3b3b, 1.5), 0.2, 0.06, 0.05, 0, 0.42, -0.78, false));
  const wheels = [wheel(0.24, 0.12, 0, 0.24, 0.8), wheel(0.24, 0.12, 0, 0.24, -0.75)];
  g.add(...wheels);
  g.userData = { body, wheels, seat: [0, 0.36, -0.15] };
  return g;
}

// ---------- Estructuras y vegetación ----------
const STONE = [0x9aa0a6, 0x8a8f98];
function merlons(len, alongX, y, mat, half) {
  const n = Math.max(2, Math.floor(len / 2.2)), im = new THREE.InstancedMesh(G.box, mat, n * 2), m = new THREE.Matrix4();
  for (let i = 0; i < n; i++) for (let s = 0; s < 2; s++) {
    const p = -len / 2 + (i + 0.5) * len / n, q = (s ? 1 : -1) * (half - 0.25);
    m.makeScale(alongX ? 1.1 : 0.5, 0.9, alongX ? 0.5 : 1.1); m.setPosition(alongX ? p : q, y + 0.45, alongX ? q : p);
    im.setMatrixAt(i * 2 + s, m);
  }
  im.castShadow = true; return im;
}
// b = bioma (0 bosque, 1 montaña, 2 nieve, 3 mística, 4 desierto, 5 llanura)
export function makeObs(o, b) {
  const g = new THREE.Group(); g.position.set(o.x, o.y, o.z);
  const t = o.t, rot = () => { g.rotation.y = o.s * 6.28; };
  if (t === 'tree') {
    rot(); g.scale.setScalar(0.85 + o.s * 0.5);
    g.add(mk(G.cyl, lam(0x7a4a21), 0.38, 3.4, 0.38, 0, 1.1, 0));
    g.add(mk(G.ico, lam(o.s > 0.5 ? 0x2f8f3a : 0x3fa34d), 1.9, 1.7, 1.9, 0, 3.5, 0));
    g.add(mk(G.ico, lam(o.s > 0.5 ? 0x3fa34d : 0x57b85c), 1.3, 1.3, 1.3, 0.2, 4.9, 0.1));
  } else if (t === 'pine') {
    g.scale.setScalar(0.9 + o.s * 0.5); const snow = b === 2;
    g.add(mk(G.cyl, lam(0x5b3a1e), 0.3, 2.6, 0.3, 0, 0.8, 0));
    for (let i = 0; i < 3; i++) {
      g.add(mk(G.cone, lam(0x1f6b45), 1.9 - i * 0.45, 2.2, 1.9 - i * 0.45, 0, 2.6 + i * 1.3, 0));
      if (snow) g.add(mk(G.cone, lam(0xffffff), 1.2 - i * 0.3, 1.0, 1.2 - i * 0.3, 0, 3.3 + i * 1.3, 0, false));
    }
  } else if (t === 'cactus') {
    rot(); const m = lam(0x3f9b52);
    g.add(mk(G.cyl, m, 0.42, 3.4, 0.42, 0, 1.3, 0), mk(G.sph, m, 0.42, 0.42, 0.42, 0, 3.0, 0));
    g.add(mk(G.cyl, m, 0.22, 1.2, 0.22, 0.8, 2.0, 0), mk(G.cyl, m, 0.22, 0.9, 0.22, -0.75, 1.5, 0));
    const a = mk(G.cyl, m, 0.2, 0.7, 0.2, 0.45, 1.5, 0); a.rotation.z = Math.PI / 2; const c = a.clone(); c.position.set(-0.45, 1.15, 0); g.add(a, c);
  } else if (t === 'shroom') {
    g.scale.setScalar(0.8 + o.s * 0.7); const col = o.s > 0.5 ? 0xd94fd0 : 0x4fd9c8;
    g.add(mk(G.cyl, lam(0xefe6d0), 0.45, 3.4, 0.45, 0, 1.2, 0), mk(G.sph, lam(col, 0.5), 2.1, 0.9, 2.1, 0, 3.1, 0));
    for (let i = 0; i < 5; i++) g.add(mk(G.sphLo, lam(0xffffff, 0.8), 0.25, 0.12, 0.25, Math.sin(i * 1.26) * 1.3, 3.75, Math.cos(i * 1.26) * 1.3, false));
  } else if (t === 'crystal') {
    rot(); const col = o.s > 0.5 ? 0x6ff2ff : 0xff6ff0;
    for (let i = 0; i < 4; i++) { const c = mk(G.cone4, lam(col, 1.1), 0.4 - i * 0.05, 2.8 - i * 0.5, 0.4 - i * 0.05, Math.sin(i * 1.7) * 0.45, 1.0 - i * 0.15, Math.cos(i * 1.7) * 0.45); c.rotation.z = Math.sin(i * 2.1) * 0.35; g.add(c); }
  } else if (t === 'rock') {
    rot(); const col = b === 2 ? 0xbfe3f5 : b === 4 ? 0xc9a36b : b === 3 ? 0x5b4a82 : STONE[o.s > 0.5 ? 0 : 1];
    g.add(mk(G.dod, lam(col), o.r * 1.12, o.top * 1.15, o.r * 1.12, 0, o.top * 0.42, 0));
  } else if (t === 'crate') {
    rot(); g.add(mk(G.box, lam(0xb7823f), 1.4, 1.4, 1.4, 0, 0.7, 0), mk(G.box, lam(0x8a5a22), 1.46, 0.18, 1.46, 0, 0.7, 0, false), mk(G.box, lam(0x8a5a22), 0.18, 1.46, 1.46, 0, 0.7, 0, false));
  } else if (t === 'chest') {
    rot(); const gold = o.rich ? 1 : 0.25;
    g.add(mk(G.box, lam(o.rich ? 0x5a1e6e : 0x7a3e12), 1.5, 0.8, 1.05, 0, 0.4, 0));
    const lid = mk(G.cyl, lam(0xffc93c, gold), 0.53, 1.5, 0.53, 0, 0.8, 0); lid.rotation.z = Math.PI / 2; g.add(lid);
    g.add(mk(G.box, lam(0xffe680, 0.5 + gold), 0.22, 0.3, 1.12, 0, 0.72, 0, false));
    if (o.rich) g.scale.setScalar(1.3);
  } else if (t === 'barrel') {
    g.add(mk(G.cyl, lam(0xd62828), 0.6, 1.35, 0.6, 0, 0.68, 0), mk(G.cyl, lam(0xffd60a), 0.63, 0.22, 0.63, 0, 0.7, 0, false), mk(G.cyl, lam(0x222222), 0.45, 0.06, 0.45, 0, 1.37, 0, false));
  } else if (t === 'hut') {
    rot(); const wall = b === 4 ? 0xd9b98a : b === 2 ? 0xc9d6df : 0xe8d5a8, roof = b === 2 ? 0xf5f9fc : b === 3 ? 0x6b3fa0 : b === 4 ? 0xc48a4a : 0xa8482e;
    g.add(mk(G.cyl, lam(wall), 3.5, 5.6, 3.5, 0, 1.4, 0), mk(G.cyl, lam(roof), 3.9, 0.5, 3.9, 0, 4.2, 0), mk(G.cone, lam(roof), 2.6, 1.6, 2.6, 0, 5.2, 0));
    g.add(mk(G.box, lam(0x5b3413), 1.3, 2.2, 0.2, 0, 1.1, 3.45, false));
  } else if (t === 'wall' || t === 'ruin' || t === 'keep') {
    const col = t === 'ruin' ? (b === 4 ? 0xb89a6a : 0x7d8a78) : t === 'keep' ? 0x8d939b : 0xa3a8ae, m = lam(col);
    g.add(mk(G.box, m, o.hw * 2, o.top + 3, o.hd * 2, 0, (o.top - 3) / 2, 0));
    if (t === 'wall') g.add(merlons(Math.max(o.hw, o.hd) * 2, o.hw > o.hd, o.top, m, Math.min(o.hw, o.hd)));
    if (t === 'keep') {
      g.add(merlons(o.hw * 2, true, o.top, m, o.hd), merlons(o.hd * 2, false, o.top, m, o.hw));
      g.add(mk(G.box, lam(0x3a2414), 3, 4.5, 0.3, 0, 2.25, o.hd, false));
      for (const y of [8, 14]) for (const x of [-4, 0, 4]) g.add(mk(G.box, lam(0x22262b), 0.9, 1.8, 0.2, x, y, o.hd, false));
      g.add(mk(G.cyl, lam(0x5b3413), 0.12, 7, 0.12, 0, o.top + 3.5, 0), mk(G.box, lam(0xc0392b), 2.6, 1.5, 0.08, 1.4, o.top + 6, 0));
    }
  } else if (t === 'ctower') {
    const m = lam(0x9aa0a6);
    g.add(mk(G.cylHi, m, o.r, o.top + 3, o.r, 0, (o.top - 3) / 2, 0), mk(G.cylHi, m, o.r + 0.35, 0.8, o.r + 0.35, 0, o.top - 0.4, 0));
    for (let i = 0; i < 8; i++) { const c = mk(G.box, m, 0.9, 0.9, 0.6, Math.sin(i * 0.785) * (o.r + 0.05), o.top + 0.45, Math.cos(i * 0.785) * (o.r + 0.05)); c.rotation.y = i * 0.785; g.add(c); }
  } else if (t === 'col') {
    const m = lam(b === 4 ? 0xcdb07a : 0xb9bcae);
    g.add(mk(G.cyl, m, 0.55, o.top + 1.5, 0.55, 0, (o.top - 1.5) / 2, 0), mk(G.box, m, 1.5, 0.3, 1.5, 0, o.top - 0.15, 0));
  }
  return g;
}
// Torre de exploración (estilo torre de avistamiento). Devuelve el grupo; userData.beacon/beam/light para activarla.
export function makeTower(o) {
  const g = new THREE.Group(); g.position.set(o.x, o.y, o.z);
  const h = o.top, m = lam(0x6f7780), m2 = lam(0x4d545c);
  g.add(mk(G.cylHi, m, 3.0, h + 4, 3.0, 0, h / 2 - 2, 0));
  const rings = Math.floor(h / 5);
  for (let i = 1; i <= rings; i++) g.add(mk(G.cylHi, i % 2 ? m2 : lam(0xffa53d, 0.6), 3.12, 0.35, 3.12, 0, i * 5 - 0.5, 0, false));
  g.add(mk(G.cylHi, m2, 3.4, 0.7, 3.4, 0, h - 0.35, 0));
  for (let i = 0; i < 6; i++) g.add(mk(G.box, m2, 0.5, 1.1, 0.5, Math.sin(i * 1.047) * 3.15, h + 0.55, Math.cos(i * 1.047) * 3.15));
  g.add(mk(G.cyl, m2, 0.7, 1.0, 0.7, 0, h + 0.5, 0));
  const beacon = new THREE.Mesh(G.sph, new THREE.MeshLambertMaterial({ color: 0xff8a1f, emissive: 0xff8a1f, emissiveIntensity: 1.2 }));
  beacon.scale.setScalar(0.45); beacon.position.y = h + 1.5; g.add(beacon);
  const beam = new THREE.Mesh(G.cyl, new THREE.MeshBasicMaterial({ color: 0x4fd8ff, transparent: true, opacity: 0.35, depthWrite: false, fog: false }));
  beam.scale.set(0.5, 160, 0.5); beam.position.y = h + 81; beam.visible = false; g.add(beam);
  g.userData = { beacon, beam };
  return g;
}
