// Procedural prop builders. Units: cm.
// Convention: front faces +Z. Floor props are centred on the origin, base at y=0.
// Wall props have their back at z=0 and grow into +Z, base at y=0.
// Ceiling props hang from y=0 downwards.
import * as THREE from 'three';
import { rng, propFinishes, textures, std, QUALITY, addCaustics, causticUniforms, PHOTO_PROPS } from './materials.js?v=202611091207';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const PI = Math.PI;
const V = (a) => new THREE.Vector3(a[0], a[1], a[2]);

// ---------- materials ----------
// identical colour/options share one material (fewer programs/uniform uploads, lets mergeStatic batch them)
const S_CACHE = new Map();
const S = (color, o = {}) => {
  const k = color + JSON.stringify(o);
  let m = S_CACHE.get(k); if (!m) S_CACHE.set(k, m = new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0, ...o }));
  return m;
};
// release a canvas' backing store once its pixels are on the GPU
const releaseCanvas = (t) => { t.onUpdate = () => { const c = t.image; if (c && 'width' in c) { c.width = c.height = 0; } }; return t; };
const ledCache = new Map();
export function led(color, k = 2.6) {
  const key = color + ':' + k;
  if (!ledCache.has(key)) ledCache.set(key, new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: k, roughness: 0.4 }));
  return ledCache.get(key);
}
const M = {
  wood: S(0x6b4423), darkWood: S(0x3a2414), lightWood: S(0x9c7448), drift: S(0x8f8270),
  iron: S(0x2c2c30, { metalness: 0.8, roughness: 0.45 }), steel: S(0x9aa0a8, { metalness: 0.9, roughness: 0.3 }),
  gold: S(0xd4a64a, { metalness: 0.9, roughness: 0.3 }), brass: S(0xb08a3a, { metalness: 0.85, roughness: 0.35 }),
  bronze: S(0x8a5a2a, { metalness: 0.7, roughness: 0.45 }),
  stone: S(0x7d776e), darkStone: S(0x4a4640), mossStone: S(0x5c6650), sand: S(0xc8a46a),
  ice: S(0xc4e8fa, { roughness: 0.12, metalness: 0.1, transparent: true, opacity: 0.85, emissive: 0x204060, emissiveIntensity: 0.25 }),
  iceSolid: S(0xd6f0ff, { roughness: 0.2, metalness: 0.1, emissive: 0x30506a, emissiveIntensity: 0.3 }),
  plexi: S(0xffffff, { roughness: 0.05, transparent: true, opacity: 0.22, depthWrite: false }),
  milky: S(0xf0f6ff, { roughness: 0.3, transparent: true, opacity: 0.7 }),
  glass: S(0xe8f4ff, { roughness: 0.05, transparent: true, opacity: 0.25, depthWrite: false, side: THREE.DoubleSide }),
  paper: S(0xeadfc4), leatherRed: S(0x6e1a16), leather: S(0x5a3420), red: S(0x9a1e1e), velvet: S(0x6a0f1e),
  purple: S(0x4a2a5a, { metalness: 0.3 }), silver: S(0xcfd6de, { metalness: 0.85, roughness: 0.25 }),
  mirror: S(0xc0c8d0, { metalness: 1, roughness: 0.05 }),
  rope: S(0xa08458), bone: S(0xe3d8bf, { roughness: 0.7 }), bark: S(0x4a3626), leaf: S(0x2f6a2a), vine: S(0x3d5a26),
  moss: S(0x4f7a32), coral: S(0xe2735a), coral2: S(0xd94f8a), shell: S(0xf2dcc6), teal: S(0x1d7a7a), rock: S(0x3d5e62),
  black: S(0x111111), sash: S(0x3a5fb0), screen: new THREE.MeshStandardMaterial({ color: 0x0a1a2a, emissive: 0x3a7ab8, emissiveIntensity: 1.2 }),
  unknown: S(0xb03aa0, { wireframe: true }),
};
const BOOK_COLORS = [0x6e1a16, 0x1f3a5a, 0x2c4a22, 0x5a3a12, 0x3a1e40, 0x7a5a20, 0x24332e, 0x8a3a1a].map((c) => S(c, { roughness: 0.75 }));

// ---------- primitive helpers ----------
function mesh(geo, mat, p, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  // extruded / flat shapes carry UVs in raw cm: rescale to the finish's tile size
  if ((geo.type === 'ExtrudeGeometry' || geo.type === 'ShapeGeometry') && mat && !Array.isArray(mat) && mat.map?.userData?.T && !geo.userData.uvScaled) {
    const uv = geo.attributes.uv, T = mat.map.userData.T; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / T, uv.getY(i) / T); geo.userData.uvScaled = true;
  }
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); p.add(m); return m;
}
// box UVs in cm / T so textured finishes keep a real-world scale on every face
function boxGeo(w, h, d, T) {
  const g = new THREE.BoxGeometry(w, h, d); if (!T) return g;
  const uv = g.attributes.uv, dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, uv.getX(i) * dims[f][0] / T, uv.getY(i) * dims[f][1] / T); }
  return g;
}
const texT = (mat) => (mat && !Array.isArray(mat) && mat.map ? mat.map.userData.T || 40 : 0);
const box = (p, w, h, d, mat, x, y, z, rx, ry, rz) => mesh(boxGeo(w, h, d, texT(mat)), mat, p, x, y, z, rx, ry, rz);
// ---- photo faces (data/photos.js `props`, local experiment): the real photo on a prop's front; .png = cut-out ----
const photoOf = (p) => PHOTO_PROPS[p.id] || PHOTO_PROPS[p.kind];
const photoMats = new Map(), photoLoader = new THREE.TextureLoader();
function photoMat(src) {
  if (photoMats.has(src)) return photoMats.get(src);
  const m = new THREE.MeshStandardMaterial({ color: 0x777777, roughness: 0.8, metalness: 0, alphaTest: /\.png$/i.test(src) ? 0.5 : 0 });
  photoLoader.load(new URL('../' + src, import.meta.url).href, (t) => {
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = QUALITY.aniso; m.map = t; m.color.set(0xffffff); m.needsUpdate = true;
  }, undefined, () => console.warn('photo face missing', src));
  photoMats.set(src, m); return m;
}
// w x h plane facing +z (ry turns it, rx = -PI / 2 lays it flat facing up)
const photoFace = (g, src, w, h, x, y, z, ry = 0, rx = 0) => mesh(new THREE.PlaneGeometry(w, h), photoMat(src), g, x, y, z, rx, ry, 0);
function cylGeo(rt, rb, h, seg, T) {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg); if (!T) return g;
  const uv = g.attributes.uv, nr = g.attributes.normal, C = 2 * PI * Math.max(rt, rb), Dm = 2 * Math.max(rt, rb);
  for (let i = 0; i < uv.count; i++) { const cap = Math.abs(nr.getY(i)) > 0.99; uv.setXY(i, uv.getX(i) * (cap ? Dm : C) / T, uv.getY(i) * (cap ? Dm : h) / T); }
  return g;
}
const cyl = (p, rt, rb, h, mat, x, y, z, rx, ry, rz, seg = 20) => mesh(cylGeo(rt, rb, h, seg, texT(mat)), mat, p, x, y, z, rx, ry, rz);
const sph = (p, r, mat, x, y, z, sx = 1, sy = 1, sz = 1) => { const m = mesh(new THREE.SphereGeometry(r, 18, 12), mat, p, x, y, z); m.scale.set(sx, sy, sz); return m; };
const tor = (p, R, r, mat, x, y, z, rx, ry, rz, arc = PI * 2) => mesh(new THREE.TorusGeometry(R, r, 8, 40, arc), mat, p, x, y, z, rx, ry, rz);
const cone = (p, r, h, mat, x, y, z, rx, ry, rz, seg = 12) => mesh(new THREE.ConeGeometry(r, h, seg), mat, p, x, y, z, rx, ry, rz);
function tube(p, pts, r, mat, seg = 40) {
  const curve = new THREE.CatmullRomCurve3(pts.map(V)), g = new THREE.TubeGeometry(curve, seg, r, 6), T = texT(mat);
  if (T) { const L = curve.getLength(), uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * L / T, uv.getY(i) * 2 * PI * r / T); }
  return mesh(g, mat, p);
}
function rod(p, a, b, r, mat, r2 = r) {
  const A = V(a), B = V(b), d = B.clone().sub(A), L = d.length();
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r2, r, L, 12), mat);
  m.position.copy(A).addScaledVector(d, 0.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); p.add(m); return m;
}
const rock = (p, r, mat, x, y, z, sx = 1, sy = 1, sz = 1) => { const m = mesh(new THREE.DodecahedronGeometry(r, 0), mat, p, x, y, z, x, z, y); m.scale.set(sx, sy, sz); return m; };
function starShape(R, r, n = 5) {
  const s = new THREE.Shape();
  for (let i = 0; i < n * 2; i++) { const a = i * PI / n + PI / 2, rad = i % 2 ? r : R; i ? s.lineTo(Math.cos(a) * rad, Math.sin(a) * rad) : s.moveTo(Math.cos(a) * rad, Math.sin(a) * rad); }
  s.closePath(); return s;
}
const star = (p, R, d, mat, x, y, z, n = 5) => mesh(new THREE.ExtrudeGeometry(starShape(R, R * 0.45, n), { depth: d, bevelEnabled: false }), mat, p, x, y, z);
function snowflake(p, r, mat, x, y, z) {
  const g = new THREE.Group(); g.position.set(x, y, z); p.add(g);
  for (let i = 0; i < 3; i++) box(g, r * 2, r * 0.12, 0.8, mat, 0, 0, 0, 0, 0, i * PI / 3);
  for (let i = 0; i < 6; i++) { const a = i * PI / 3, cx = Math.cos(a) * r * 0.6, cy = Math.sin(a) * r * 0.6;
    for (const s of [-1, 1]) box(g, r * 0.45, r * 0.1, 0.8, mat, cx, cy, 0, 0, 0, a + s * 0.8); }
  return g;
}
function gear(p, r, teeth, th, mat, x, y, z) {
  const g = new THREE.Group(); g.position.set(x, y, z); p.add(g);
  cyl(g, r, r, th, mat, 0, 0, 0, PI / 2, 0, 0, 28); cyl(g, r * 0.25, r * 0.25, th + 1, M.iron, 0, 0, 0, PI / 2);
  for (let i = 0; i < teeth; i++) { const a = i * 2 * PI / teeth; box(g, r * 0.22, r * 0.3, th, mat, Math.cos(a) * r, Math.sin(a) * r, 0, 0, 0, a + PI / 2); }
  return g;
}
function books(p, x0, x1, y, zc, depth, r, hmax = 30) {
  let x = x0;
  while (x < x1 - 3) {
    const w = 2.5 + r() * 4, h = hmax * (0.65 + r() * 0.35); if (x + w > x1) break;
    box(p, w, h, depth * (0.8 + r() * 0.15), BOOK_COLORS[Math.floor(r() * BOOK_COLORS.length)], x + w / 2, y + h / 2, zc);
    x += w + 0.3;
  }
}
function shelfUnit(g, w, h, d, n, mat, r, skip = []) {
  box(g, 4, h, d, mat, -w / 2 + 2, h / 2, d / 2); box(g, 4, h, d, mat, w / 2 - 2, h / 2, d / 2);
  box(g, w + 4, 5, d + 2, mat, 0, h - 2.5, d / 2 + 1); box(g, w, 8, d, mat, 0, 4, d / 2); box(g, w, h, 2, mat, 0, h / 2, 1);
  const gap = (h - 13) / n;
  for (let i = 0; i < n; i++) {
    const y = 8 + i * gap; if (i > 0) box(g, w - 8, 3, d - 2, mat, 0, y, d / 2);
    if (!skip.includes(i)) books(g, -w / 2 + 5, w / 2 - 5, y + 1.5, d / 2 + 1, d * 0.75, r, Math.min(32, gap - 6));
  }
  return gap;
}
function canvasMat(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = releaseCanvas(new THREE.CanvasTexture(c)); t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.85 });
}
function frame(p, w, h, t, mat, x, y, z, d = 4) {
  box(p, w, t, d, mat, x, y + h / 2 - t / 2, z); box(p, w, t, d, mat, x, y - h / 2 + t / 2, z);
  box(p, t, h, d, mat, x - w / 2 + t / 2, y, z); box(p, t, h, d, mat, x + w / 2 - t / 2, y, z);
}
function padlock(p, x, y, z, mat = M.brass) { box(p, 7, 8, 3, mat, x, y, z); tor(p, 2.6, 0.7, M.steel, x, y + 4.5, z, 0, 0, 0, PI); }

// ---------- textured finishes (lib/materials.js, shared) ----------
const PF = propFinishes();
Object.assign(M, { wood: PF.wood, darkWood: PF.darkWood, lightWood: PF.lightWood, iron: PF.iron, steel: PF.steel, gold: PF.gold, brass: PF.brass,
  bronze: PF.bronze, stone: PF.stone, rope: PF.rope, silver: PF.silver, ice: PF.ice, iceSolid: PF.frost });
// ---------- extra materials from photos/props.json ----------
Object.assign(M, {
  birch: S(0xd9b98a, { roughness: 0.7 }), edge: S(0x1e1a17), stainBrown: S(0x3a2618), lecternWood: S(0x3a2a20),
  crackle: S(0x2a2826, { roughness: 0.6, metalness: 0.2 }), copper: S(0x8c5a36, { metalness: 0.6, roughness: 0.45 }),
  slate: S(0x3f4247), slate2: S(0x4b4f55), cream: S(0xd8cdb4), beigeStone: S(0xd6ccb8), mdf: S(0xf2f2ee, { roughness: 0.6 }),
  navy: S(0x1b2340), mint: S(0xcfe3d9), darkBronze: S(0x3a2a1e, { metalness: 0.4, roughness: 0.6 }), trunk: S(0x6e4a4a),
  crackGreen: S(0x3e4238), whiteRope: S(0xf0eee8), plywood: S(0xc9a77a), cloth: S(0x4a4744), velvetRed: S(0x9c1f2a),
  organzaOld: S(0xd8c8ff, { transparent: true, opacity: 0.45, emissive: 0x6a5aa0, emissiveIntensity: 0.4, side: THREE.DoubleSide, depthWrite: false }),
});
Object.assign(M, { birch: PF.birch, lecternWood: PF.lectern, crackle: PF.crackle, slate: PF.slate, slate2: PF.slate2, cream: PF.cream, beigeStone: PF.beigeStone,
  mdf: PF.mdf, crackGreen: PF.crackleGreen, whiteRope: PF.whiteRope, plywood: PF.birch, snow: PF.snow, stained: PF.stained, shelfWood: PF.shelfWood,
  organza: QUALITY.low ? S(0xe8dcff, { roughness: 0.25, transparent: true, opacity: 0.5, emissive: 0x4a3a80, emissiveIntensity: 0.4, side: THREE.DoubleSide, depthWrite: false })
  : new THREE.MeshPhysicalMaterial({ color: 0xe8dcff, roughness: 0.25, transparent: true, opacity: 0.5, iridescence: 1, iridescenceIOR: 1.6, iridescenceThicknessRange: [200, 900],
    sheen: 1, sheenColor: new THREE.Color(0x9fffe0), emissive: 0x4a3a80, emissiveIntensity: 0.35, side: THREE.DoubleSide, depthWrite: false }) });
const BOOK4 = [0xe3262b, 0xe3b04b, 0x5b8fcb, 0xf2f0ea].map((c) => S(c, { roughness: 0.75 }));
function drawers(g, w, n, y0, h, z, mat, knob = M.brass) {
  for (let i = 0; i < n; i++) { const y = y0 + h / 2 + i * h; box(g, w - 4, h - 2, 1, mat, 0, y, z); sph(g, 1.3, knob, 0, y, z + 1); }
}
function speakerBox(g, w = 40) {
  box(g, w, 20, 15, M.birch, 0, 10, 7.5); box(g, w + 0.5, 20.5, 1, M.edge, 0, 10, 0.5);
  for (const x of [-w / 4, w / 4]) { cyl(g, 6, 6, 0.6, M.black, x, 10, 15.1, PI / 2); tor(g, 6, 0.6, M.edge, x, 10, 15.2); }
}

// ---------- builders ----------
export const BUILDERS = {
  // 01 + 04 workshop cabinet: birch 65x45x120, slanted top, lit book slots, wand window, locked drawer
  godmother_cabinet(g) {
    const w = 65, d = 45;
    box(g, w, 100, d, M.birch, 0, 50, 0); for (const s of [-1, 1]) box(g, 1.2, 100.5, d + 0.4, M.edge, s * w / 2, 50, 0);
    const s = new THREE.Shape(); s.moveTo(-d / 2, 0); s.lineTo(d / 2, 0); s.lineTo(d / 2, 8); s.lineTo(-d / 2, 24); s.closePath();
    mesh(new THREE.ExtrudeGeometry(s, { depth: w, bevelEnabled: false }), M.birch, g, -w / 2, 100, 0, 0, PI / 2, 0);
    // 2x2 lit book slots (upper front)
    BOOK4.forEach((m, i) => { const x = (i % 2 ? 1 : -1) * 15, y = 78 - Math.floor(i / 2) * 26;
      box(g, 27, 24, 2, M.black, x, y, d / 2 + 0.2); box(g, 22, 20, 4, m, x, y, d / 2 + 1.5); box(g, 6, 7, 0.6, M.silver, x, y, d / 2 + 3.8);
      box(g, 24, 1, 1, led([0xff3030, 0xffc040, 0x3090ff, 0xffffff][i], 2.5), x, y - 11.5, d / 2 + 1); });
    // glazed door with 4 oval windows + wand on red velvet
    box(g, 58, 32, 1, M.velvetRed, 0, 32, d / 2 + 0.2);
    for (let i = 0; i < 4; i++) { const m = cyl(g, 5.5, 5.5, 0.5, M.glass, -18 + i * 12, 32, d / 2 + 1.2, PI / 2); m.scale.z = 1.8; tor(g, 5.5, 0.7, M.edge, -18 + i * 12, 32, d / 2 + 1.3).scale.y = 1.8; }
    rod(g, [-22, 32, d / 2 + 0.8], [20, 32, d / 2 + 0.8], 0.8, M.darkWood, 0.5); sph(g, 1.4, led(0xfff0b0, 4), 21, 32, d / 2 + 0.8);
    box(g, 58, 13, 1, M.birch, 0, 8, d / 2 + 0.6); box(g, 58, 0.8, 1.2, M.edge, 0, 15, d / 2 + 0.6); cyl(g, 1.4, 1.4, 1, M.brass, 0, 8, d / 2 + 1.3, PI / 2);
  },
  // 02 round maze ~45 dia, light wood, blue plexi front; floor = lying on a small round table
  round_maze(g, p, r) {
    const m = new THREE.Group(); g.add(m);
    if (p.mount === 'floor') { cyl(g, 20, 20, 3, M.darkWood, 0, 72, 0); cyl(g, 3, 3, 70, M.darkWood, 0, 36, 0); cyl(g, 14, 14, 2, M.darkWood, 0, 1, 0); m.position.set(0, 75, 0); m.rotation.x = -PI / 2 + 0.25; }
    else m.position.set(0, 25, 0);
    const disc = new THREE.Group(); disc.position.set(0, p.mount === 'floor' ? 0 : 0, 0); m.add(disc);
    cyl(disc, 22.5, 22.5, 3, M.lightWood, 0, 0, 1.5, PI / 2); tor(disc, 22.5, 1.2, M.wood, 0, 0, 3);
    [6, 11, 16, 20.5].forEach((R) => tor(disc, R, 0.7, M.wood, 0, 0, 3.6, 0, 0, r() * PI * 2, PI * 2 - 0.6));
    for (let i = 0; i < 7; i++) { const a = r() * PI * 2, R = 8.5 + Math.floor(r() * 3) * 5; box(disc, 0.8, 5, 1.4, M.wood, Math.cos(a) * R, Math.sin(a) * R, 3.6, 0, 0, a + PI / 2); }
    sph(disc, 1, M.steel, 0, 0, 4.2); cyl(disc, 22, 22, 0.5, S(0x3060c0, { transparent: true, opacity: 0.35 }), 0, 0, 5.2, PI / 2);
  },
  // 03 bookshelf doors: Billy-type 80x30x200 dark brown, hinged, cyan strip under
  bookshelf_door(g, p, r) {
    const w = p.w || 80, sgn = p.mirror ? -1 : 1;
    const leaf = new THREE.Group(); leaf.position.set(-sgn * w / 2, 0, 0); leaf.rotation.y = -sgn * 0.35; g.add(leaf);
    const inner = new THREE.Group(); inner.position.x = sgn * w / 2; leaf.add(inner);
    shelfUnit(inner, w, 200, 30, 6, S(0x2e2119), r); box(inner, w - 6, 1, 2, led(0x19d3c5, 3), 0, 1, 29);
  },
  music_box(g) { speakerBox(g); },
  combo_box(g, p) {
    const ph = photoOf(p);
    if (ph && p.style !== 'crackle') { box(g, 28, 34, 15, M.birch, 0, 17, 0); photoFace(g, ph.front, 30, 36.8, 0, 18.4, 7.6); return; }
    if (p.style === 'crackle') { box(g, 35, 12, 25, M.crackle, 0, 6, 0); box(g, 36, 1, 26, M.gold, 0, 12.5, 0); padlock(g, 0, 7, 13); return; }
    box(g, 25, 20, 20, M.birch, 0, 10, 0); box(g, 26, 2, 21, M.edge, 0, 20.5, 0);
    for (let i = -2; i <= 2; i++) box(g, 1, 0.6, 20, M.edge, i * 4.5, 21.8, 0);
    padlock(g, 0, 12, 10.5);
  },
  // 05 vine wall: branch ~90 at 210 cm, 5 jute ropes crossing over 15 stones (digits / +- / digits)
  tangled_vines(g, p, r) {
    const w = p.w || 90;
    cyl(g, 7, 8, w, M.darkWood, 0, 212, 9, 0, 0, PI / 2, 10);
    for (let i = 0; i < 4; i++) rod(g, [-w / 2 + 15 + i * 22, 212, 9], [-w / 2 + 22 + i * 22, 222 + r() * 8, 12], 2, M.darkWood, 0.8);
    const sx = (c) => -w * 0.38 + c * w * 0.19, rows = [175, 130, 85];
    rows.forEach((y, ri) => { for (let c = 0; c < 5; c++) { rock(g, 5.5, ri === 1 ? M.slate2 : M.stone, sx(c), y, 4, 1, 1, 0.5); cyl(g, 2.4, 2.4, 0.5, M.paper, sx(c), y, 7, PI / 2); } });
    const perm = [[1, 0, 3, 2, 4], [0, 2, 4, 1, 3], [3, 4, 1, 2, 0]];
    for (let k = 0; k < 5; k++) {
      const pts = [[sx(k), 206, 10]]; rows.forEach((y, ri) => pts.push([sx(perm[ri][k]), y, 9]));
      pts.push([sx(perm[2][k]) + (r() - 0.5) * 6, 45, 10]); tube(g, pts, 1, M.rope, 60);
      for (let q = 1; q < 4; q++) sph(g, 2.6, M.leaf, pts[q][0] + 3, pts[q][1] + 10, 11, 1, 0.5, 0.4);
    }
  },
  // 05 ceiling board ~100x100 covered in foliage, LED paths, wooden discs
  led_ceiling_board(g, p, r) {
    box(g, 100, 3, 100, M.darkWood, 0, -2, 0);
    for (let i = 0; i < 120; i++) sph(g, 3 + r() * 3, r() < 0.3 ? S(0xc06a20) : M.leaf, (r() - 0.5) * 100, -4, (r() - 0.5) * 100, 1, 0.35, 0.8);
    [0xfff2d8, 0xffc0d8, 0xfff2d8, 0xffc0d8, 0xfff2d8].forEach((c, i) => { let x = -44, z = -36 + i * 18;
      for (let k = 0; k < 12; k++) { sph(g, 1, led(c, 3.5), x, -6, z); x += 8; z = Math.max(-46, Math.min(46, z + (r() - 0.5) * 16)); } });
    for (let i = 0; i < 5; i++) cyl(g, 4, 4, 1, M.lightWood, -40 + i * 20, -6.5, 44);
  },
  // 06 stone arch: 5 slate blocks with round emblems, opening ~80x190; iron gate with spikes; filler panels to span
  stone_arch_gate(g, p) {
    const ow = p.w || 80, span = p.span || 145, pw = 20, hw = ow / 2 + pw / 2;
    for (const s of [-1, 1]) {
      box(g, pw, 95, 30, M.slate, s * hw, 47.5, 0); box(g, pw, 95, 30, M.slate2, s * hw, 142.5, 0);
      [50, 140].forEach((y) => cyl(g, 6, 6, 1.5, M.slate2, s * hw, y, 15.5, PI / 2));
      const fill = span / 2 - (ow / 2 + pw); if (fill > 2) box(g, fill, 250, 10, S(0x2a3a22), s * (ow / 2 + pw + fill / 2), 125, 0);
    }
    tor(g, hw, pw / 2, M.slate, 0, 190, 0, 0, 0, 0, PI); box(g, 18, 26, 30, M.slate2, 0, 190 + hw, 0); cyl(g, 6, 6, 1.5, M.gold, 0, 190 + hw, 15.5, PI / 2);
    for (const s of [-1, 1]) {
      const leaf = new THREE.Group(); leaf.position.set(s * ow / 2, 0, 0); leaf.rotation.y = s * -0.9; g.add(leaf);
      for (let x = 4; x < ow / 2; x += 8) { cyl(leaf, 0.9, 0.9, 180, M.iron, -s * x, 92, 0, 0, 0, 0, 6); cone(leaf, 1.8, 6, M.iron, -s * x, 185, 0); }
      for (const y of [20, 95, 170]) box(leaf, ow / 2, 3, 1.5, M.iron, -s * ow / 4, y, 0);
    }
  },
  // 06 hollow trunk: S-shaped ~60w x 90h, brown-purple, 3 round holes, token slot on top
  hollow_trunk(g) {
    const pts = [[-12, 0, 0], [10, 25, 0], [-8, 55, 0], [6, 88, 0]];
    tube(g, pts, 17, M.trunk, 30); cyl(g, 15, 15, 1, M.black, 6, 88.5, 0);
    [[0, 15], [-3, 42], [4, 68]].forEach(([x, y]) => sph(g, 5, M.black, x, y, 15, 1, 1, 0.4));
    for (const x of [2, 10]) cyl(g, 3, 3, 0.8, M.stone, x, 89.3, 0);
    for (let i = 0; i < 5; i++) { const a = i * 1.3; box(g, 6, 6, 26, M.trunk, -12 + Math.sin(a) * 16, 3, Math.cos(a) * 16, 0, a, 0); }
  },
  // 07 square column of 4 crackle stone blocks with medallions + coloured leaf LED buttons; blue fireflies
  firefly_column(g, p, r) {
    const ph = photoOf(p);
    if (ph) {
      box(g, 25, 118, 25, M.crackGreen, 0, 59.5, 0); photoFace(g, ph.front, 25, 118, 0, 59.5, 12.55);
      [0x3070ff, 0xffd020, 0xff3030, 0x30d050].forEach((c, i) => sph(g, 3.2, led(c, 1.6), 0, 15 + i * 30, 12.6, 1, 1.2, 0.25));
    } else [0x30d050, 0xff3030, 0x3070ff, 0xffd020].forEach((c, i) => {
      const y = 15 + i * 30; box(g, 25, 29, 25, M.crackGreen, 0, y, 0);
      cyl(g, 7, 7, 2, M.stone, 0, y, 13.5, PI / 2); sph(g, 4, led(c, 2), 0, y, 15, 1, 1.4, 0.4);
    });
    const flies = [];
    for (let i = 0; i < 5; i++) { const f = sph(g, 1.6, led(0x3a6bff, 5), 0, 0, 0); Object.assign(f.userData, { ph: r() * 6, R: 25 + r() * 35, y: 150 + r() * 70 }); flies.push(f); }
    g.userData.animate = (t) => flies.forEach((f, i) => { const a = t * 0.3 + f.userData.ph; f.position.set(Math.cos(a) * f.userData.R, f.userData.y + Math.sin(t * 1.1 + i) * 6, Math.sin(a) * f.userData.R); f.visible = Math.sin(t * 2 + i * 1.7) > -0.5; });
  },
  trapdoor_box(g) {
    box(g, 32, 30, 32, M.crackle, 0, 15, 0); box(g, 33, 1, 33, M.gold, 0, 30.5, 0);
    const lid = new THREE.Group(); lid.position.set(0, 31, -16); lid.rotation.x = -0.5; g.add(lid); box(lid, 32, 2, 32, M.crackle, 0, 1, 16);
    cyl(g, 6, 5, 6, M.bronze, 0, 34, 2, 0, 0, 0, 16); for (let i = 0; i < 5; i++) { const a = i * 2 * PI / 5; cone(g, 1.2, 5, M.bronze, Math.cos(a) * 5.5, 39, 2 + Math.sin(a) * 5.5); }
    sph(g, 1.5, led(0xff2020, 1.5), 0, 34, 7.5);
  },
  ice_cabinet(g) {
    box(g, 50, 80, 40, M.mdf, 0, 40, 20); box(g, 52, 3, 42, M.silver, 0, 81.5, 21);
    drawers(g, 50, 2, 40, 18, 40.5, M.mdf, M.silver); box(g, 40, 1, 1, led(0xffc070, 2.5), 0, 2, 40.6);
    for (let i = 0; i < 4; i++) sph(g, 4, M.mdf, -18 + i * 12, 84, 30, 1.2, 0.6, 1);
  },
  lever(g, p) {
    const white = p.style === 'ice', mat = white ? M.mdf : M.iron;
    box(g, 12, 26, 3, mat, 0, 13, 1.5); cyl(g, 2.5, 2.5, 5, M.silver, 0, 13, 5, PI / 2);
    const arm = new THREE.Group(); arm.position.set(0, 13, 7); arm.rotation.x = 0.5; g.add(arm);
    cyl(arm, 1.2, 1.2, 22, white ? M.silver : M.steel, 0, 11, 0); sph(arm, 3, mat, 0, 23, 0);
  },
  // 08 stone side: wall block ~20x15 with 2 hanging chains (~100 cm)
  chain_block(g) {
    box(g, 20, 15, 12, M.crackle, 0, 0, 6);
    for (const x of [-5, 5]) { for (let i = 0; i < 18; i++) tor(g, 2, 0.5, M.steel, x, -10 - i * 5, 10, 0, i % 2 ? PI / 2 : 0, 0); cyl(g, 2.5, 2.5, 4, M.iron, x, -103, 10); }
  },
  // 08 stone lattice wall cabinet ~40x25x70 with crown display behind lattice
  lattice_cabinet(g) {
    box(g, 40, 70, 25, M.crackle, 0, 35, 12.5); box(g, 30, 30, 1, M.velvetRed, 0, 48, 25.2);
    for (let i = 0; i < 4; i++) { box(g, 1, 30, 1, M.gold, -11 + i * 7.3, 48, 26); box(g, 30, 1, 1, M.gold, 0, 37 + i * 7.3, 26); }
    drawers(g, 40, 1, 8, 20, 25.5, M.slate, M.gold);
  },
  // 09 collapsed mine door ~80x200: plank frame, black panel, sign on chains, TNT bundle with red wire
  mine_door_tnt(g, p, r) {
    const w = p.w || 80, ph = photoOf(p);
    if (ph) {
      box(g, w + 20, 220, 6, S(0x3b2a1c), 0, 110, 3); photoFace(g, ph.front, w + 20, 220, 0, 110, 6.05);
      tube(g, [[-6, 38, 7], [-2, 2, 16], [20, 1, 45], [50, 1, 70]], 0.6, M.red);
      for (let i = 0; i < 8; i++) rock(g, 4 + r() * 6, M.stone, (r() - 0.5) * w, 3 + r() * 6, 10 + r() * 15);
      return;
    }
    box(g, w, 200, 3, M.black, 0, 100, 1.5);
    for (const s of [-1, 1]) box(g, 10, 210, 8, S(0x3b2a1c), s * (w / 2 + 5), 105, 4);
    box(g, w + 30, 12, 9, S(0x3b2a1c), 0, 214, 4.5);
    for (const a of [0.35, -0.3]) box(g, w + 10, 10, 3, M.wood, 0, a > 0 ? 70 : 130, 8, 0, 0, a);
    box(g, 50, 16, 2, M.lightWood, 0, 165, 7); for (const s of [-1, 1]) for (let i = 0; i < 4; i++) tor(g, 1.4, 0.35, M.steel, s * 20 + s * i * 1.5, 175 + i * 3.5, 6, 0, i % 2 ? PI / 2 : 0, 0);
    for (let i = 0; i < 4; i++) cyl(g, 2.6, 2.6, 20, M.red, -14 + i * 5.4, 45, 10, 0, 0, 0, 10);
    box(g, 24, 3, 6, M.black, -6, 48, 10);
    tube(g, [[-6, 38, 12], [-2, 2, 20], [20, 1, 45], [50, 1, 70]], 0.6, M.red);
    for (let i = 0; i < 8; i++) rock(g, 4 + r() * 6, M.stone, (r() - 0.5) * w, 3 + r() * 6, 10 + r() * 15);
  },
  detonator(g) {
    box(g, 20, 20, 20, M.wood, 0, 10, 0); box(g, 14, 6, 0.5, M.red, 0, 11, 10.3);
    cyl(g, 1, 1, 16, M.steel, 0, 28, 0); cyl(g, 1.4, 1.4, 20, M.darkWood, 0, 36, 0, 0, 0, PI / 2);
    tube(g, [[8, 4, -10], [14, 1, -25], [6, 1, -60]], 0.6, M.red);
  },
  // 10 gear board on the Open Sesame door: 2 silver gears ~25 dia
  gear_board(g) {
    box(g, 60, 30, 1.5, M.mdf, 0, 15, 0.75);
    gear(g, 12, 12, 2, M.silver, -14, 15, 3); gear(g, 12, 12, 2, M.silver, 13, 15, 3).rotation.z = 0.25;
  },
  // 11 map ~90x70 navy ink on white, ornate silver frame
  framed_map(g, p) {
    const w = p.w || 90, h = w * 0.78, ph = photoOf(p);
    if (ph) { box(g, w, h, 3, M.silver, 0, h / 2, 1.5); photoFace(g, ph.front, w, h, 0, h / 2, 3.05); return; }
    box(g, w - 8, h - 8, 1, canvasMat(360, 280, (c, W, H) => {
      const r = rng('map'); c.fillStyle = '#f6f6f2'; c.fillRect(0, 0, W, H); c.strokeStyle = '#1b2a5a'; c.fillStyle = '#1b2a5a'; c.lineWidth = 2.5;
      c.beginPath(); c.moveTo(10, H * 0.3); for (let x = 10; x <= W - 10; x += 12) c.lineTo(x, H * 0.3 + Math.sin(x * 0.05) * 10 + r() * 5); c.stroke();
      for (let i = 0; i < 10; i++) { const x = 20 + r() * (W - 40), y = H * 0.4 + r() * H * 0.45; c.beginPath(); c.moveTo(x, y); c.lineTo(x + 10, y - 18); c.lineTo(x + 20, y); c.stroke(); }
      c.beginPath(); c.rect(W / 2 - 14, H / 2 - 10, 28, 22); c.stroke(); for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(W / 2 - 14 + i * 14, H / 2 - 10); c.lineTo(W / 2 - 7 + i * 14, H / 2 - 22); c.lineTo(W / 2 + i * 14, H / 2 - 10); c.stroke(); }
      for (let i = 0; i < 5; i++) { c.beginPath(); c.arc(30 + r() * (W - 60), 30 + r() * (H - 60), 6, 0, 7); c.fill(); }
      c.font = 'bold 22px serif'; c.textAlign = 'center'; c.fillText('N', W - 26, 30);
    }), 0, h / 2, 2);
    frame(g, w, h, 6, M.silver, 0, h / 2, 3, 4);
    for (let i = 0; i < 4; i++) sph(g, 4, M.mdf, -w / 2 + 10 + i * (w - 20) / 3, h + 1, 3, 1.4, 0.6, 1);
  },
  // 12 Ice Queen throne ~95w x 50d (footprint from the 12 plan), pillow, 2 sashes, heart + tear, drawer
  ice_throne(g, p, r) {
    const w = p.w || 95;
    box(g, w, 25, 50, M.mdf, 0, 12.5, 0); box(g, w * 0.5, 12, 1, M.silver, 0, 12, 25.2); sph(g, 1.3, M.silver, 0, 12, 26);
    box(g, w * 0.7, 20, 40, M.mdf, 0, 35, 2); box(g, w * 0.66, 6, 36, S(0x9fc8e8), 0, 48, 4);
    box(g, w * 0.7, 120, 10, M.mdf, 0, 105, -18);
    for (let i = 0; i < 7; i++) { const x = -w * 0.33 + i * w * 0.11, hh = 18 + (3 - Math.abs(i - 3)) * 10 + r() * 6; cone(g, 4, hh, M.iceSolid, x, 165 + hh / 2, -18, 0, 0, 0, 6); }
    for (const s of [-1, 1]) box(g, 10, 22, 40, M.mdf, s * w * 0.38, 51, 2);
    box(g, 7, 120, 0.8, S(0x3a5fb0), -12, 103, -12.6, 0, 0, 0.25); box(g, 7, 110, 0.8, S(0xc8d8f0), 12, 103, -12.6, 0, 0, -0.25);
    sph(g, 3, led(0xd02040, 1), -2, 72, -12.2, 1, 1, 0.5); sph(g, 3, led(0xd02040, 1), 2, 72, -12.2, 1, 1, 0.5); cone(g, 4, 5, led(0xd02040, 1), 0, 69, -12.2, PI);
    sph(g, 2, led(0x80c8ff, 1.5), 12, 80, -12.2, 1, 1.4, 0.5);
  },
  // 13 white door ~80x200 with silver moulding; scarab plate ~40x40 cream with dark-brown wings at ~110
  scarab_door(g, p) {
    const w = p.w || 75, ph = photoOf(p);
    if (ph) { box(g, w + 16, 208, 5, M.mdf, 0, 104, 2.5); photoFace(g, ph.front, w + 16, 208, 0, 104, 5.05); return; }
    box(g, w, 200, 4, M.mdf, 0, 100, 2); frame(g, w + 16, 208, 8, M.silver, 0, 104, 2, 5);
    frame(g, w - 16, 70, 2, M.silver, 0, 160, 4.6, 1.2); frame(g, w - 16, 50, 2, M.silver, 0, 35, 4.6, 1.2);
    box(g, 40, 40, 1.5, M.cream, 0, 110, 4.8);
    const sc = new THREE.Group(); sc.position.set(0, 110, 5.6); g.add(sc);
    sph(sc, 7, M.darkBronze, 0, -2, 0, 1, 1.3, 0.3); sph(sc, 3.5, M.darkBronze, 0, 9, 0, 1, 0.8, 0.3);
    for (const s of [-1, 1]) { const wing = sph(sc, 8, S(0x4a2e1a), s * 9, 2, 0, 1.3, 0.6, 0.2); wing.rotation.z = s * 0.4; }
    sph(sc, 2.6, M.gold, 0, 14, 0.3, 1, 1, 0.4);
    for (let i = 0; i < 4; i++) sph(g, 4, M.mdf, -w / 2 - 4 + i * (w + 8) / 3, 210, 3, 1.3, 0.7, 1);
  },
  // 14 brass spyglass ~30 cm lying on the floor (carried by the skeleton)
  spyglass(g) {
    rod(g, [-15, 2.2, 0], [5, 2.2, 0], 2.2, M.brass, 1.8); rod(g, [5, 1.8, 0], [15, 1.8, 0], 1.6, M.brass, 1.3);
    tor(g, 2.3, 0.4, M.gold, -15, 2.2, 0, 0, PI / 2);
  },
  clue_board(g, p) {
    const w = p.w || 50;
    box(g, w, w * 0.56, 2, M.darkWood, 0, w * 0.28, 1);
    box(g, w - 4, w * 0.56 - 4, 0.6, canvasMat(256, 140, (c, W, H) => {
      c.fillStyle = '#d9c08a'; c.fillRect(0, 0, W, H); c.strokeStyle = '#3a2410'; c.fillStyle = '#3a2410'; c.lineWidth = 4;
      for (let i = 0; i < 5; i++) { const x = 30 + i * 49; c.beginPath(); c.arc(x, 55, 14, PI, 0); c.lineTo(x + 14, 85); c.lineTo(x - 14, 85); c.closePath(); c.stroke(); }
      c.font = 'bold 30px serif'; c.textAlign = 'center'; c.fillText('?  ?  ?', W / 2, 125);
    }), 0, w * 0.28, 2.3);
  },
  // 15 board above door: onion arch ~90x40, bronze-black, monkey, elephant, parrot, tiger
  symbol_board(g, p) {
    const w = p.w || 90, ph = photoOf(p);
    if (ph) { photoFace(g, ph.front, w, w * 408 / 805, 0, w * 204 / 805, 1.5); return; }
    const s = new THREE.Shape(); s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(w / 2, 22); s.bezierCurveTo(w / 2, 34, w / 8, 32, 0, 42); s.bezierCurveTo(-w / 8, 32, -w / 2, 34, -w / 2, 22); s.closePath();
    mesh(new THREE.ExtrudeGeometry(s, { depth: 2, bevelEnabled: false }), S(0x4a3a22, { metalness: 0.4 }), g, 0, 0, 0);
    for (let i = 0; i < 4; i++) { const x = -w * 0.33 + i * w * 0.22; cyl(g, 7, 7, 1, M.gold, x, 15, 2.5, PI / 2); sph(g, 3.2, M.darkBronze, x, 15, 3.2, 1, 1, 0.3); }
  },
  // 16 table ~60x60x100 beige stone with silver-crackle top; wooden bowl with LED crystals; golden lamp
  adventurer_table(g0, p, r) {
    const g = new THREE.Group(), k = (p.w || 60) / 60; g.scale.set(k, 1, k); g0.add(g);
    box(g, 54, 96, 54, M.beigeStone, 0, 48, 0); box(g, 60, 4, 60, M.silver, 0, 98, 0);
    for (const s of [-1, 1]) { box(g, 20, 14, 1, M.cream, s * 13, 70, 27.2); sph(g, 1.2, M.brass, s * 13, 70, 28); }
    mesh(new THREE.SphereGeometry(17, 24, 12, 0, PI * 2, PI / 2, PI / 2), S(0x7a5030, { side: THREE.DoubleSide }), g, 0, 112, -4);
    [0xff3030, 0x30e060, 0x3080ff, 0xffd020, 0xff3030, 0x3080ff, 0x30e060].forEach((c, i) => {
      const m = mesh(new THREE.OctahedronGeometry(2.6), led(c, 2.4), g, (r() - 0.5) * 18, 100 + r() * 3, -4 + (r() - 0.5) * 18); m.scale.y = 1.7; });
    const lamp = new THREE.Group(); lamp.position.set(18, 100, 16); lamp.rotation.y = -0.6; g.add(lamp);
    sph(lamp, 5, M.gold, 0, 4, 0, 1.4, 0.7, 1); rod(lamp, [5, 4, 0], [14, 7, 0], 1, M.gold, 0.6); cyl(lamp, 2, 3, 3, M.gold, 0, 8, 0);
  },
  // 17 cream stone wheel ~75 dia, 6 segments with relief gems, centre hub, black lattice arrow plate on the right
  jewel_wheel(g, p) {
    const R = 37.5, cy = R, z = 4, cols = [0xff3030, 0xff8a20, 0xffe030, 0x30e060, 0x3080ff, 0xb050ff], ph = photoOf(p);
    cyl(g, R, R, 5, M.cream, 0, cy, z, PI / 2, 0, 0, 36);
    if (ph) photoFace(g, ph.front, 2 * R, 2 * R, 0, cy, z + 2.55);
    else { tor(g, R, 2, M.beigeStone, 0, cy, z + 2.5); cyl(g, 8, 8, 4, M.beigeStone, 0, cy, z + 3, PI / 2); }
    cols.forEach((c, i) => { const a = i * PI / 3; if (!ph) box(g, R - 8, 1.5, 1.5, M.beigeStone, Math.cos(a) * (R / 2 + 4), cy + Math.sin(a) * (R / 2 + 4), z + 3, 0, 0, a);
      const ga = a + PI / 6; mesh(new THREE.OctahedronGeometry(4), led(c, 1.2), g, Math.cos(ga) * R * 0.62, cy + Math.sin(ga) * R * 0.62, z + 4); });
    box(g, 12, 22, 1.5, M.black, R + 7, cy, 2); cone(g, 4, 8, M.black, R + 1, cy, 3, 0, 0, PI / 2, 3);
    for (const x of [-46, 46]) { box(g, 3, 3, 14, M.iron, x, 2 * R + 20, 7); cone(g, 4, 8, M.iron, x, 2 * R + 16, 14, PI * 0.8); sph(g, 2, led(0xfff0c0, 3), x, 2 * R + 12, 16); }
    box(g, 50, 1, 1, led(0x3a7bff, 2.5), 0, -2, 1);
  },
  // 17 hexagonal shelf ~30x20 with Indian-arch back plate; dome = cream arch frame on octagonal base with gem
  jewel_shelf(g, p) {
    const col = [0xff3030, 0xff8a20, 0xffe030, 0x30e060, 0x3080ff, 0xb050ff][(p.jewel ?? 0) % 6];
    cyl(g, 15, 15, 3, M.cream, 0, 0, 10, 0, 0, 0, 6).scale.z = 0.66;
    const s = new THREE.Shape(); s.moveTo(-13, 0); s.lineTo(13, 0); s.lineTo(13, 22); s.bezierCurveTo(13, 30, 3, 30, 0, 38); s.bezierCurveTo(-3, 30, -13, 30, -13, 22); s.closePath();
    mesh(new THREE.ExtrudeGeometry(s, { depth: 1.5, bevelEnabled: false }), M.cream, g, 0, 1.5, 0);
    cyl(g, 6, 6, 2.5, M.beigeStone, 0, 2.8, 11, 0, 0, 0, 8); for (const x of [-4.5, 4.5]) box(g, 1.5, 15, 1.5, M.cream, x, 11, 11);
    tor(g, 4.5, 0.9, M.cream, 0, 18.5, 11, 0, 0, 0, PI); mesh(new THREE.OctahedronGeometry(2.6), led(col, 1.8), g, 0, 8, 11);
  },
  // 17 rising pedestal: hexagonal cream stone column ~40w x 90h
  pedestal(g, p) {
    const R = p.r || 20;
    cyl(g, R + 2, R + 2, 6, M.beigeStone, 0, 3, 0, 0, 0, 0, 6); cyl(g, R, R, 84, M.cream, 0, 48, 0, 0, 0, 0, 6); cyl(g, R + 2, R + 2, 4, M.beigeStone, 0, 92, 0, 0, 0, 0, 6);
    box(g, R * 1.4, 1, 1, led(0x3a7bff, 2), 0, 6.5, R * 0.95);
  },
  // 18 six floor pads (2 rows x 3) lit by a floor projector at the wall
  floor_pads(g, p, r) {
    for (let i = 0; i < 6; i++) { const x = (i % 3 - 1) * 52, z = (Math.floor(i / 2) % 2 ? 1 : -1) * 0 + (i < 3 ? -25 : 25);
      const pad = cyl(g, 22, 22, 2, S(0xa9c4b8), x, 1, z, 0, 0, 0, 24); pad.scale.z = 0.9; tor(g, 22, 1.2, S(0x8a8f92), x, 2, z, PI / 2).scale.y = 0.9;
      sph(g, 6 + r() * 6, led(0x6fd8ff, 0.3), x + (r() - 0.5) * 10, 2.2, z, 1, 0.05, 1); }
    box(g, 40, 14, 30, M.black, 0, 7, -70); box(g, 30, 1, 1, led(0xffffff, 3), 0, 12, -54.8);
  },
  // 18 coral console ~80w x 35d x 90h black/silver crackle, backboard ~70x45 with 15 animal reliefs, 5 corals, foam balls
  coral_console(g, p, r) {
    const w = p.w || 80;
    box(g, w, 90, 35, M.crackle, 0, 45, 17.5); box(g, w + 2, 2, 37, M.silver, 0, 91, 18.5);
    const ph = photoOf(p);
    if (ph) photoFace(g, ph.board, w - 10, (w - 10) * 305 / 494, 0, 92 + (w - 10) * 305 / 988, 1.5);
    else box(g, w - 10, 45, 3, M.crackle, 0, 115, 1.5), frame(g, w - 10, 45, 2, M.silver, 0, 115, 3.2, 1.2);
    if (!ph) for (let i = 0; i < 15; i++) sph(g, 2.6, M.silver, -w / 2 + 12 + (i % 5) * (w - 24) / 4, 103 + Math.floor(i / 5) * 12, 3.5, 1.3, 1, 0.3);
    [0xff7ab8, 0x2ac8b8, 0x3a7bff, 0x3ac860, 0xff9a3c].forEach((c, i) => {
      const x = -w / 2 + 10 + i * (w - 20) / 4, base = [x, 92, 22], mat = S(c, { roughness: 0.6 });
      for (let k = 0; k < 4; k++) { const tip = [x + (r() - 0.5) * 12, 105 + r() * 14, 22 + (r() - 0.5) * 8]; rod(g, base, tip, 1.2, mat, 0.6); sph(g, 2.6, S(0xffffff), tip[0], tip[1] + 3 + r() * 6, tip[2]); }
      cyl(g, 1.6, 2, 3, M.iron, x, 93, 30);
    });
  },
  // 19 black crackle wall shelf ~30x20 with silver-grey conch; Morse plaque above
  seashell_shelf(g, p) {
    box(g, 30, 3, 20, M.crackle, 0, 0, 10); box(g, 3, 12, 3, M.crackle, 0, -7, 2);
    const sh = new THREE.Group(); sh.position.set(0, 9, 10); sh.rotation.set(0, 0, PI / 2 + 0.2); g.add(sh);
    cone(sh, 8, 30, S(0xb8bcc0, { metalness: 0.3, roughness: 0.4 }), 0, 0, 0, 0, 0, 0, 16); for (let i = 0; i < 4; i++) tor(sh, 7 - i * 1.6, 1, S(0xa8acb0), 0, -10 + i * 6, 0, PI / 2);
    const ph = photoOf(p);
    if (ph) { photoFace(g, ph.plaque, 25, 35, 0, 60, 0.8); return; }
    box(g, 25, 35, 1.5, M.cream, 0, 60, 0.75); frame(g, 25, 35, 2, M.black, 0, 60, 1.6, 1);
    for (let i = 0; i < 6; i++) box(g, 8 + (i % 3) * 3, 1.2, 0.4, M.black, 0, 50 + i * 4, 2);
  },
  button_shelf(g) {
    box(g, 25, 3, 18, M.crackle, 0, 0, 9); box(g, 3, 10, 3, M.crackle, 0, -6, 2);
    cyl(g, 5, 5.5, 4, M.black, 0, 3.5, 9); cyl(g, 4, 4.2, 2.5, led(0x40e0ff, 2.6), 0, 6.5, 9);
  },
  // 20 tall wall cabinet ~55x20x120 (rope rungs = invisible harp), steering wheel on door, staff frame on top
  harp_cabinet(g, p, r) {
    const w = p.w || 55;
    box(g, w, 120, 20, S(0x4e3a2a), 0, 60, 10); for (const s of [-1, 1]) box(g, 6, 6, 18, M.darkWood, s * 20, -3 + 3, 10);
    const door = new THREE.Group(); door.position.set(-w / 2, 0, 20); door.rotation.y = -0.6; g.add(door);
    box(door, w / 2 - 1, 116, 1.5, S(0x5a4432), w / 4, 60, 0.75);
    for (let i = 0; i < 6; i++) rod(g, [-w / 2 + 6, 15 + i * 18, 14], [w / 2 - 6, 15 + i * 18, 14], 0.8, M.rope);
    box(g, w / 2 - 1, 116, 1.5, S(0x5a4432), w / 4, 60, 20.75);
    const wh = new THREE.Group(); wh.position.set(w / 4, 72, 22); g.add(wh);
    tor(wh, 20, 1.6, S(0x8a8c90), 0, 0, 0); cyl(wh, 4, 4, 3, S(0x8a8c90), 0, 0, 1, PI / 2);
    for (let i = 0; i < 8; i++) { const a = i * PI / 4; rod(wh, [Math.cos(a) * 4, Math.sin(a) * 4, 1], [Math.cos(a) * 27, Math.sin(a) * 27, 1], 1, S(0x8a8c90), 1.6); }
    box(g, 60, 35, 3, M.bronze, 0, 140, 6); for (let i = 0; i < 5; i++) box(g, 50, 0.6, 0.6, M.black, 0, 132 + i * 4, 7.8);
    [[-15, 134], [-5, 140], [5, 136], [15, 144]].forEach(([x, y]) => sph(g, 2, M.plexi, x, y, 8.4, 1.3, 1, 0.4));
  },
  open_a_box(g) {
    box(g, 35, 12, 25, M.crackle, 0, 6, 0); const lid = box(g, 35, 2, 25, M.crackle, 0, 13, 0);
    cyl(g, 5, 5, 0.6, M.silver, 0, 14.3, 0); tor(g, 3, 0.5, M.teal, 0, 14.7, 0, PI / 2);
  },
  jellyfish(g, p, r) {
    const drop = p.drop || 70, y = -drop + 20;
    rod(g, [0, 0, 0], [0, y + 12, 0], 0.2, M.whiteRope);
    mesh(new THREE.SphereGeometry(16, 20, 10, 0, PI * 2, 0, PI / 2), M.organza, g, 0, y, 0);
    for (let i = 0; i < 9; i++) { const a = i * 0.7, x = Math.cos(a) * 9, z = Math.sin(a) * 9; tube(g, [[x, y, z], [x * 1.2, y - 20, z + 3], [x * 0.8, y - 40, z - 2], [x, y - 55 - r() * 15, z]], 0.4, M.organza, 16); }
    sph(g, 3, led(0xb090ff, 1.2), 0, y + 4, 0);
  },
  ivy_mat(g, p, r) {
    const w = p.w || 80, h = p.hgt || 120;
    for (let i = 0; i < w * h / 40; i++) sph(g, 3 + r() * 3, S(0x2f5a2a + Math.floor(r() * 3) * 0x050a05), (r() - 0.5) * w, r() * h, 2, 1, 0.8, 0.35);
  },
  rug(g, p) { const w = p.w || 140, d = p.d || 90; box(g, w, 0.6, d, S(0xc9a46a), 0, 0.3, 0); const f = new THREE.Group(); f.rotation.x = -PI / 2; f.position.y = 0.7; g.add(f); frame(f, w - 8, d - 8, 4, S(0x8a3a1a), 0, 0, 0, 0.2); },
};

// ======================================================================
// Upgraded builders (books merged into one draw call per unit, instanced
// leaves, new throne, cave rocks, reef buttons, animated jellyfish).
// ======================================================================
const BOOK_PAL = [0x6e1a16, 0x1f3a5a, 0x2c4a22, 0x5a3a12, 0x3a1e40, 0x7a5a20, 0x24332e, 0x8a3a1a, 0x1c1a18, 0xc8b890, 0x4a1010, 0x2a3550, 0x7a2030, 0x3c5a3a]
  .map((c) => new THREE.Color(c));
let BOOK_MAT = null;
const bookMaterial = () => (BOOK_MAT ??= std(PF.spines, { vertexColors: true }));
function addBook(list, w, h, d, x, y, z, rz, ry, r) {
  const g = new THREE.BoxGeometry(w, h, d); if (ry) g.rotateY(ry); if (rz) g.rotateZ(rz); g.translate(x, y, z);
  const c = BOOK_PAL[Math.floor(r() * BOOK_PAL.length)].clone().multiplyScalar(0.75 + r() * 0.45);
  const n = g.attributes.position.count, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3)); list.push(g);
}
function bookRow(list, x0, x1, y, zc, depth, r, hmax) {
  let x = x0;
  while (x < x1 - 2) {
    const roll = r();
    if (roll < 0.07 && x1 - x > 26) { // lying stack
      const bw = 18 + r() * 6; let yy = y; const n = 2 + Math.floor(r() * 3);
      for (let k = 0; k < n; k++) { const th = 2.5 + r() * 2; addBook(list, bw, th, depth * (0.8 + r() * 0.15), x + bw / 2, yy + th / 2, zc, 0, (r() - 0.5) * 0.15, r); yy += th; }
      x += bw + 1; continue;
    }
    const w = 2 + r() * 4.5, h = Math.min(hmax, hmax * (0.62 + r() * 0.38)); if (x + w > x1) break;
    if (roll > 0.95 && x > x0 + 8) { const a = 0.28 + r() * 0.15; addBook(list, w, h, depth * 0.85, x + Math.sin(a) * h / 2 + w / 2, y + Math.cos(a) * h / 2, zc, -a, 0, r); x += Math.sin(a) * h + w + 0.5; continue; }
    addBook(list, w, h, depth * (0.78 + r() * 0.18), x + w / 2, y + h / 2, zc + (r() - 0.5) * 1.5, 0, 0, r);
    x += w + 0.15 + (r() < 0.08 ? 3 + r() * 6 : 0);
  }
}
const mergedBooks = (p, list) => { if (list.length) { const m = new THREE.Mesh(mergeGeometries(list), bookMaterial()); p.add(m); } };
// small set-dressing objects seen on the Library shelves (goblet, red shoes)
function goblet(p, x, y, z) { cyl(p, 3, 3, 0.8, M.gold, x, y + 0.4, z); cyl(p, 0.6, 0.6, 7, M.gold, x, y + 4, z); mesh(new THREE.SphereGeometry(3.4, 14, 8, 0, PI * 2, PI / 2, PI / 2), M.gold, p, x, y + 10.5, z, PI); }
function shoes(p, x, y, z) { for (const s of [-1, 1]) { sph(p, 2.6, M.velvetRed, x + s * 3, y + 2, z, 0.8, 0.6, 2.2); box(p, 1, 5, 1, M.velvetRed, x + s * 3, y + 2.5, z - 4.5); } }
function shelfUnit2(g, w, h, d, n, r, opts = {}) {
  const mat = M.shelfWood;
  box(g, 2.5, h, d, mat, -w / 2 + 1.25, h / 2, d / 2); box(g, 2.5, h, d, mat, w / 2 - 1.25, h / 2, d / 2);
  box(g, w + 2, 4, d + 1.5, mat, 0, h - 2, d / 2 + 0.75); box(g, w, 8, d, mat, 0, 4, d / 2); box(g, w, h, 1.2, mat, 0, h / 2, 0.6);
  const gap = (h - 12) / n, list = [];
  for (let i = 0; i < n; i++) {
    const y = 8 + i * gap; if (i > 0) box(g, w - 5, 2.2, d - 1.5, mat, 0, y, d / 2 + 0.2);
    const yb = y + 1.1, hm = Math.min(31, gap - 5);
    if (opts.decor && r() < 0.35) { const half = w / 2 - 3; bookRow(list, -half, half * (0.2 + r() * 0.3), yb, d * 0.5, d * 0.72, r, hm); (r() < 0.5 ? goblet : shoes)(g, half * 0.6, yb, d * 0.55); }
    else if (!opts.sparse || r() < 0.6) bookRow(list, -w / 2 + 3.5, w / 2 - 3.5, yb, d * 0.5, d * 0.72, r, hm);
  }
  mergedBooks(g, list);
  return gap;
}

// leaf card textures (alpha-tested) shared by ivy mats and the foliage ceiling
let LEAF = null;
function leafMat(kind) {
  LEAF ??= {};
  if (LEAF[kind]) return LEAF[kind];
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
  x.translate(64, 64);
  if (kind === 'ivy') { // 3-lobed ivy leaf
    x.fillStyle = '#ffffff'; x.beginPath(); x.moveTo(0, 58);
    x.bezierCurveTo(-20, 40, -60, 30, -56, 2); x.bezierCurveTo(-52, -18, -30, -10, -24, -14); x.bezierCurveTo(-30, -40, -10, -60, 0, -60);
    x.bezierCurveTo(10, -60, 30, -40, 24, -14); x.bezierCurveTo(30, -10, 52, -18, 56, 2); x.bezierCurveTo(60, 30, 20, 40, 0, 58); x.fill();
  } else { x.fillStyle = '#ffffff'; x.beginPath(); x.moveTo(0, 60); x.bezierCurveTo(-46, 20, -36, -40, 0, -62); x.bezierCurveTo(36, -40, 46, 20, 0, 60); x.fill(); }
  x.globalCompositeOperation = 'source-atop'; const gr = x.createRadialGradient(0, 0, 4, 0, 0, 70); gr.addColorStop(0, '#ffffff'); gr.addColorStop(1, '#9a9a9a'); x.fillStyle = gr; x.fillRect(-64, -64, 128, 128);
  x.strokeStyle = 'rgba(255,255,230,0.9)'; x.lineWidth = 2.5; x.beginPath(); x.moveTo(0, 58); x.lineTo(0, -50); x.moveTo(0, 10); x.lineTo(-34, -6); x.moveTo(0, 10); x.lineTo(34, -6); x.stroke();
  const t = releaseCanvas(new THREE.CanvasTexture(c)); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return (LEAF[kind] = new THREE.MeshStandardMaterial({ map: t, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.6 }));
}
const _d = new THREE.Object3D();
function leaves(p, n, kind, size, place, colors, r) {
  const im = new THREE.InstancedMesh(new THREE.PlaneGeometry(size, size), leafMat(kind), n), c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    _d.userData.k = 1; place(_d, i); _d.scale.setScalar((0.6 + r() * 0.7) * _d.userData.k); _d.updateMatrix(); im.setMatrixAt(i, _d.matrix);
    im.setColorAt(i, c.set(colors[Math.floor(r() * colors.length)]).multiplyScalar(0.7 + r() * 0.5));
  }
  p.add(im); return im;
}
const IVY_COLS = [0x2f5a2a, 0x3d6e2c, 0x264a22, 0x4f7a32, 0x1f3d1c];
function ribbon(p, pts, width, mat, seg = 30, dir = [0, 0, 1]) {
  const curve = new THREE.CatmullRomCurve3(pts.map(V)), pos = [], idx = [], D = V(dir).multiplyScalar(width / 2);
  for (let i = 0; i <= seg; i++) { const q = curve.getPoint(i / seg); pos.push(q.x - D.x, q.y - D.y, q.z - D.z, q.x + D.x, q.y + D.y, q.z + D.z); if (i) { const a = (i - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return mesh(g, mat, p);
}
const rbox = (p, w, h, d, rad, mat, x, y, z) => mesh(new RoundedBoxGeometry(w, h, d, 2, rad), mat, p, x, y, z);
function heartShape(k) { const s = new THREE.Shape(); s.moveTo(0, -k); s.bezierCurveTo(-k * 1.6, 0, -k * 0.9, k * 1.2, 0, k * 0.45); s.bezierCurveTo(k * 0.9, k * 1.2, k * 1.6, 0, 0, -k); return s; }
function tearShape(k) { const s = new THREE.Shape(); s.moveTo(0, k * 1.4); s.bezierCurveTo(k * 0.3, k * 0.6, k, 0, k * 0.8, -k * 0.5); s.absarc(0, -k * 0.5, k * 0.8, 0, -PI, true); s.bezierCurveTo(-k, 0, -k * 0.3, k * 0.6, 0, k * 1.4); return s; }
// displaced icosahedron rock (faceted), merged into clusters
function rockGeo(R, seed, flat = 0.75) {
  const g = new THREE.IcosahedronGeometry(R, 1), p = g.attributes.position, a = seed * 1.7;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = 1 + 0.22 * Math.sin(x * 0.31 + a) * Math.cos(z * 0.27 - a) + 0.12 * Math.sin(y * 0.5 + a * 2); p.setXYZ(i, x * k, Math.max(y * k * flat, -R * 0.15), z * k); }
  g.computeVertexNormals(); return g;
}
let CAVE_MAT = null;

Object.assign(BUILDERS, {
  // 03 bookshelf doors: dark Billy-type unit full of books (one merged mesh), cyan LED strip
  bookshelf_door(g, p, r) {
    const w = p.w || 80, sgn = p.mirror ? -1 : 1;
    const leaf = new THREE.Group(); leaf.position.set(-sgn * w / 2, 0, 0); leaf.rotation.y = -sgn * 0.35; g.add(leaf);
    const inner = new THREE.Group(); inner.position.x = sgn * w / 2; leaf.add(inner);
    shelfUnit2(inner, w, 200, 30, 6, r, { decor: true }); box(inner, w - 6, 1, 2, led(0x19d3c5, 3), 0, 1, 29);
  },
  // decorative full bookshelf (Library walls)
  bookshelf(g, p, r) { shelfUnit2(g, p.w || 80, p.hgt || 200, 30, 6, r, { decor: true }); if (p.led !== false) box(g, (p.w || 80) - 6, 1, 2, led(0x19d3c5, 3), 0, 1, 29); },
  // 05 ceiling board covered in foliage (instanced leaves), LED paths, wooden discs
  led_ceiling_board(g, p, r) {
    const W = p.w || 100, D = p.d || 100;
    box(g, W, 3, D, M.darkWood, 0, -2, 0);
    leaves(g, Math.round(W * D / 22), 'leaf', 9, (o) => { o.position.set((r() - 0.5) * W * 1.1, -4 - r() * 6, (r() - 0.5) * D * 1.1); o.rotation.set(PI / 2 + (r() - 0.5) * 0.9, (r() - 0.5) * 0.6, r() * 7); }, [0xc06a20, 0xd88a30, 0x5a8a2a, 0x3d6e2c, 0xb85a18], r);
    [0xfff2d8, 0xffc0d8, 0xfff2d8, 0xffc0d8, 0xfff2d8].forEach((c, i) => { let x = -W * 0.44, z = -D * 0.36 + i * D * 0.18; const pts = [];
      for (let k = 0; k < 12; k++) { pts.push([x, -9, z]); x += W * 0.08; z = Math.max(-D * 0.46, Math.min(D * 0.46, z + (r() - 0.5) * 16)); }
      tube(g, pts, 0.5, led(c, 3.5), 40); });
    for (let i = 0; i < 6; i++) cyl(g, 4, 4, 1, M.lightWood, (r() - 0.5) * W * 0.8, -9.5, (r() - 0.5) * D * 0.8);
  },
  // ivy / boxwood mat: backing + instanced leaf cards
  ivy_mat(g, p, r) {
    const w = p.w || 80, h = p.hgt || 120;
    box(g, w * 0.9, h * 0.95, 1, S(0x1a2e16), 0, h / 2, 0.5);
    // mat + 4 trailing strands below, all in one instanced draw call (strand leaves are 6/8 the size)
    const n0 = Math.round(w * h / 9), strands = [0, 1, 2, 3].map(() => [(r() - 0.5) * w * 0.8, 20 + r() * 40]);
    leaves(g, n0 + 40, 'ivy', 8, (o, i) => {
      if (i < n0) { o.position.set((r() - 0.5) * w, r() * h, 2 + r() * 7); o.rotation.set((r() - 0.5) * 1.1, (r() - 0.5) * 1.1, r() * 7); return; }
      const j = (i - n0) % 10, [x, L] = strands[Math.floor((i - n0) / 10)];
      o.position.set(x + Math.sin(j) * 3, -j * L / 10, 4 + r() * 3); o.rotation.set((r() - 0.5) * 0.8, (r() - 0.5) * 0.8, r() * 7); o.userData.k = 0.75;
    }, IVY_COLS, r);
  },
  // 06 hollow S-trunk standing against the wall (flat, per plan 14x90 footprint)
  hollow_trunk(g) {
    const t = new THREE.Group(); t.scale.set(1, 1, 0.55); g.add(t);
    const mat = std2('trunkBark');
    tube(t, [[-12, 0, 0], [10, 25, 0], [-8, 55, 0], [6, 88, 0]], 17, mat, 30); cyl(t, 15, 15, 1, M.black, 6, 88.5, 0);
    [[0, 15], [-3, 42], [4, 68]].forEach(([x, y]) => sph(t, 5, M.black, x, y, 15, 1, 1, 0.4));
    for (const x of [2, 10]) cyl(g, 3, 3, 0.8, M.stone, x, 89.3, 0);
    for (let i = 0; i < 5; i++) { const a = i * 1.3; box(t, 6, 6, 26, mat, -12 + Math.sin(a) * 16, 3, Math.cos(a) * 16, 0, a, 0); }
  },
  // 18 six reef buttons on the side wall (plan 18: 6 squares along the wall)
  reef_buttons(g, p, r) {
    const w = p.w || 125, rockM = S(0x4a5a5c, { roughness: 0.9 });
    for (let i = 0; i < 6; i++) {
      const x = -w / 2 + 10 + i * (w - 20) / 5, y = 80 + (i % 2) * 18 + r() * 8;
      const rk = mesh(rockGeo(8, i + 1, 0.9), rockM, g, x, y, 6); rk.scale.set(1, 1.1, 0.75);
      for (let k = 0; k < 3; k++) { const a = r() * 7; rod(g, [x + Math.cos(a) * 5, y + Math.sin(a) * 5, 8], [x + Math.cos(a) * 11, y + Math.sin(a) * 11 + 4, 10], 1, [M.coral, M.coral2, M.teal][k], 0.4); }
      cyl(g, 3.6, 3.8, 2, M.black, x, y, 12, PI / 2); cyl(g, 3, 3, 1.5, led(0x40e0ff, 2.2), x, y, 13.2, PI / 2);
    }
  },
  // rock outcrop cluster (Mermaid Cave corners), one merged mesh
  cave_rocks(g, p, r) {
    CAVE_MAT ??= std2('caveRockProp');
    const n = p.n || 6, R = p.r || 30, list = [];
    for (let i = 0; i < n; i++) { const rr = R * (0.35 + r() * 0.55), a = r() * 7, d = r() * R * 0.8; const geo = rockGeo(rr, i + r() * 9, 0.6 + r() * 0.5); geo.rotateY(r() * 7); geo.translate(Math.cos(a) * d, rr * 0.35, Math.sin(a) * d); list.push(geo); }
    mesh(mergeGeometries(list), CAVE_MAT, g);
  },
  // 12 Winter Throne: dais with drawer, cushioned seat, carved armrests with sashes, tall carved ice back
  ice_throne(g, p, r) {
    const w = p.w || 95, D = 50, W = M.mdf, Sv = M.silver;
    const cushion = S(0x9cc6e6, { roughness: 0.55 }), satinB = S(0x2f56a8, { roughness: 0.32, metalness: 0.15, side: THREE.DoubleSide }), satinW = S(0xe8eef8, { roughness: 0.3, metalness: 0.15, side: THREE.DoubleSide });
    // dais + drawer (crown inside)
    rbox(g, w, 24, D, 2, W, 0, 12, 0); box(g, w + 1.5, 2, D + 1.5, Sv, 0, 25, 0); box(g, w + 1.5, 2, D + 1.5, Sv, 0, 1, 0);
    box(g, w * 0.55, 13, 1, W, 0, 12, D / 2 + 0.4); frame(g, w * 0.55, 13, 1.2, Sv, 0, 12, D / 2 + 0.9, 1); box(g, 12, 1.6, 1.6, Sv, 0, 12, D / 2 + 1.8);
    box(g, w * 0.5, 0.8, 0.6, led(0xffc070, 2), 0, 3, D / 2 + 0.5);
    // seat
    const sw = w * 0.66, sd = 38, sz = 4;
    rbox(g, sw, 20, sd, 2, W, 0, 36, sz); box(g, sw + 1, 1.4, sd + 1, Sv, 0, 46.3, sz);
    rbox(g, sw - 4, 8, sd - 4, 3.5, cushion, 0, 50.5, sz + 1);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) sph(g, 0.9, Sv, (i - 1) * sw * 0.28, 54.5, sz + 1 + (j - 0.5) * sd * 0.45, 1, 0.5, 1);
    // armrests with scrolls, sashes draped over them, heart / tear under the ribbons
    for (const s of [-1, 1]) {
      const ax = s * (sw / 2 + 6);
      rbox(g, 11, 30, sd, 3, W, ax, 41, sz); box(g, 12, 1.6, sd + 1, Sv, ax, 56.6, sz);
      cyl(g, 6.5, 6.5, 12.5, W, ax, 52, sz + sd / 2 - 1, 0, 0, PI / 2, 24); tor(g, 6.5, 0.9, Sv, ax + s * 6.3, 52, sz + sd / 2 - 1, 0, PI / 2, 0);
      tor(g, 3.2, 0.7, Sv, ax + s * 6.4, 52, sz + sd / 2 - 1, 0, PI / 2, 0);
      const zc = sz + 2, top = 57.5;
      ribbon(g, [[ax - s * 7, top - 4, zc], [ax - s * 4, top + 0.4, zc], [ax + s * 4, top + 0.4, zc], [ax + s * 6.4, top - 4, zc], [ax + s * 7.5, 30, zc + 1], [ax + s * 8.5, 6, zc - 1]], 8, s < 0 ? satinB : satinW);
      ribbon(g, [[ax + s * 6.6, 40, zc + 1], [ax + s * 9, 22, zc + 5], [ax + s * 11, 9, zc + 7]], 6, s < 0 ? satinB : satinW, 14);
      const sym = mesh(new THREE.ExtrudeGeometry(s < 0 ? heartShape(2.6) : tearShape(2.2), { depth: 0.6, bevelEnabled: false }), Sv, g, ax, top - 0.2, zc + 10, -PI / 2);
      sym.rotation.z = s < 0 ? 0 : PI;
    }
    // tall carved back: crown-like silhouette, frosted inner panel, silver piping, snowflake, ice crystals
    const outline = (k) => { const R = [[37, 0], [37, 118], [38, 136], [31, 146], [28, 166], [21, 156], [16, 184], [9, 170], [0, 202]]; const pts = R.map(([x, y]) => [x * k, y * k]); return [...pts, ...pts.slice(0, -1).reverse().map(([x, y]) => [-x, y])]; };
    const shp = new THREE.Shape(outline(1).map(([x, y]) => new THREE.Vector2(x, y)));
    const bz = sz - sd / 2 - 6, by = 26;
    mesh(new THREE.ExtrudeGeometry(shp, { depth: 7, bevelEnabled: true, bevelSize: 1.2, bevelThickness: 1.2, bevelSegments: 2, curveSegments: 6 }), W, g, 0, by, bz - 3.5);
    const inner = new THREE.Shape(outline(0.78).map(([x, y]) => new THREE.Vector2(x, y + 18)));
    mesh(new THREE.ExtrudeGeometry(inner, { depth: 1, bevelEnabled: false }), M.iceSolid, g, 0, by, bz + 4.8);
    const pipe = outline(0.78).map(([x, y]) => [x, y + 18 + by, bz + 6]); pipe.push(pipe[0]);
    tube(g, pipe, 0.7, Sv, 120);
    snowflake(g, 13, Sv, 0, by + 112, bz + 6.2); sph(g, 2.6, led(0x9fe8ff, 2.2), 0, by + 112, bz + 6.5);
    for (let i = 0; i < 4; i++) snowflake(g, 3.5, Sv, (i < 2 ? -1 : 1) * 15, by + 60 + (i % 2) * 90, bz + 6.1);
    // ice crystals sprouting from the crown points
    outline(1).forEach(([x, y], i) => { if (y < 140) return; const hh = 10 + (y - 140) * 0.35 + r() * 8; const c = cone(g, 2.2 + r() * 1.4, hh, M.ice, x, by + y + hh / 2 - 3, bz + (r() - 0.5) * 3, 0, 0, -x * 0.006, 6); c.rotation.x = (r() - 0.5) * 0.2; });
    for (let i = 0; i < 9; i++) { const x = (r() - 0.5) * 60, hh = 12 + r() * 22; cone(g, 2 + r() * 2, hh, M.ice, x, by + 150 + Math.max(0, 40 - Math.abs(x)) * 0.9 + hh / 2 - 8, bz - 3 + (r() - 0.5) * 4, 0, 0, -x * 0.008, 6); }
    // ice-blue gems set in the crown points
    for (const [x, y] of [[-28, 160], [-16, 178], [0, 194], [16, 178], [28, 160]]) sph(g, 1.7, led(0x9fe8ff, 2.2), x, by + y, bz + 4.8, 1, 1.3, 0.6);
    // side ice columns with finials
    for (const s of [-1, 1]) { cyl(g, 3.2, 3.8, 120, M.iceSolid, s * 41, by + 60, bz + 1, 0, 0, 0, 8); mesh(new THREE.OctahedronGeometry(4.5), M.ice, g, s * 41, by + 126, bz + 1).scale.y = 1.8; tor(g, 4, 0.8, Sv, s * 41, by + 2, bz + 1, PI / 2); }
    // cotton snow tufts at the foot
    for (let i = 0; i < 7; i++) sph(g, 4 + r() * 4, M.snow, (r() < 0.5 ? -1 : 1) * (w / 2 - r() * 6), 3, (r() - 0.5) * D, 1.2, 0.6, 1);
  },
  // iridescent organza jellyfish (ruffled bell, frilly arms, gentle sway)
  jellyfish(g, p, r) {
    const drop = p.drop || 70, y = -drop + 20;
    rod(g, [0, 0, 0], [0, y + 14, 0], 0.15, M.whiteRope);
    const body = new THREE.Group(); body.position.y = y; g.add(body);
    const bell = new THREE.SphereGeometry(16, 36, 12, 0, PI * 2, 0, PI / 2 + 0.25), bp = bell.attributes.position;
    for (let i = 0; i < bp.count; i++) { const x = bp.getX(i), yy = bp.getY(i), z = bp.getZ(i), a = Math.atan2(z, x), rim = clamp((4 - yy) / 8, 0, 1); bp.setXYZ(i, x * (1 + rim * 0.12 * Math.sin(a * 9)), yy * 0.8 - rim * 2 * Math.cos(a * 9), z * (1 + rim * 0.12 * Math.sin(a * 9))); }
    bell.computeVertexNormals(); mesh(bell, M.organza, body);
    sph(body, 8, led(0xb090ff, 0.9), 0, 3, 0, 1, 0.6, 1);
    const arms = [];
    for (let i = 0; i < 4; i++) { const a = i * PI / 2 + 0.4, x = Math.cos(a) * 4, z = Math.sin(a) * 4, pts = [];
      for (let k = 0; k <= 8; k++) pts.push([x + Math.sin(k * 1.3 + i) * 3, -2 - k * 7, z + Math.cos(k * 1.1 + i) * 3]);
      arms.push(ribbon(body, pts, 3, M.organza, 40, [Math.cos(a + 1), 0, Math.sin(a + 1)])); }
    for (let i = 0; i < 12; i++) { const a = i * PI / 6, x = Math.cos(a) * 14, z = Math.sin(a) * 14, L = 45 + r() * 25;
      arms.push(tube(body, [[x, -3, z], [x * 1.1, -L * 0.35, z + 2], [x * 0.9, -L * 0.7, z - 2], [x, -L, z]], 0.25, M.organza, 16)); }
    mergeStatic(body); // bell + arms + tentacles only move together with `body`
    const ph = r() * 6;
    g.userData.animate = (t) => { body.position.y = y + Math.sin(t * 0.7 + ph) * 3; body.rotation.y = Math.sin(t * 0.2 + ph) * 0.4; body.rotation.z = Math.sin(t * 0.5 + ph) * 0.05; body.scale.set(1 + Math.sin(t * 1.4 + ph) * 0.03, 1 - Math.sin(t * 1.4 + ph) * 0.03, 1 + Math.sin(t * 1.4 + ph) * 0.03); };
  },
  // 07 column + 5 fireflies that drift and flicker (each its own emissive so it can fade)
  firefly_column(g, p, r) {
    const col = new THREE.Group(); g.add(col); // static column, merged; the flies below animate
    [0x30d050, 0xff3030, 0x3070ff, 0xffd020].forEach((c, i) => {
      const y = 15 + i * 30; box(col, 25, 29, 25, M.crackGreen, 0, y, 0);
      cyl(col, 7, 7, 2, M.stone, 0, y, 13.5, PI / 2); sph(col, 4, led(c, 2), 0, y, 15, 1, 1.4, 0.4);
    });
    mergeStatic(col);
    const flies = [];
    for (let i = 0; i < 5; i++) {
      const m = new THREE.MeshStandardMaterial({ color: 0x3a6bff, emissive: 0x3a6bff, emissiveIntensity: 5 });
      const f = sph(g, 1.4, m, 0, 0, 0); const halo = sph(f, 4, new THREE.MeshBasicMaterial({ color: 0x3a6bff, transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending }), 0, 0, 0);
      Object.assign(f.userData, { ph: r() * 6, R: 8 + r() * 18, y: 140 + r() * 70, m, halo }); flies.push(f);
    }
    g.userData.animate = (t) => flies.forEach((f, i) => {
      const u = f.userData, a = t * 0.3 + u.ph; f.position.set(Math.cos(a) * u.R, u.y + Math.sin(t * 1.1 + i) * 6, 40 + Math.sin(a) * u.R); // orbit in front of the column, inside the room
      const fl = Math.max(0, Math.sin(t * 2 + i * 1.7)) * (0.75 + 0.25 * Math.sin(t * 23 + i * 5));
      u.m.emissiveIntensity = 0.3 + fl * 6; u.halo.material.opacity = fl * 0.25;
    });
  },
});
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
// lazily built textured materials from the theme texture library
const STD2 = {};
function std2(key) {
  if (STD2[key]) return STD2[key];
  if (key === 'trunkBark') STD2[key] = std(textures.bark(), { color: 0xd6b0b0, ns: 1.4 });
  if (key === 'caveRockProp') STD2[key] = addCaustics(std(textures.caveRock(), { color: 0x9aa0a6, ns: 1.2 }), 0xe8f4ff, 0.28); // same colour/strength as the cave walls (data/themes.js): shares their shader program
  return STD2[key];
}

// ======================================================================
// Room dressing pass (photos in reference/best/<room>). Scattered decor is
// built in plan coordinates by "dressing" props placed at [0, 0] with rot 0
// (local x/z = plan x/y, y = height) and flagged nopick. Repeated small parts
// are one InstancedMesh per kind; the rest merges per material.
// ======================================================================
const noRay = () => {};
const lsph = (p, r, mat, x, y, z, sx = 1, sy = 1, sz = 1) => { const m = mesh(new THREE.SphereGeometry(r, 9, 6), mat, p, x, y, z); m.scale.set(sx, sy, sz); return m; };
const rnd = (r, a, b) => a + r() * (b - a);
let GLOW_TEX = null;
function glowTex() {
  if (GLOW_TEX) return GLOW_TEX;
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
  const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.22, 'rgba(255,255,255,0.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
  return (GLOW_TEX = releaseCanvas(new THREE.CanvasTexture(c)));
}
// additive glow sprites (candle halos, fireflies, snow motes): one draw call per call
function glowPoints(p, pts, color, size, opacity = 0.8, colors = null) {
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pts.flat(), 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors || new Array(pts.length * 3).fill(1), 3));
  const m = new THREE.PointsMaterial({ map: glowTex(), color, size, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, vertexColors: true });
  const o = new THREE.Points(geo, m); o.raycast = noRay; p.add(o); return o;
}
// MeshStandardMaterial whose vertices sway with height (seaweed); shares the caustic clock
function swayMat(color) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.55, side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = causticUniforms.uTime;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
{ float k = clamp(transformed.y / 90.0, 0.0, 1.0); k *= k;
  transformed.x += sin(uTime * 1.2 + transformed.z * 0.07 + transformed.y * 0.05) * 7.0 * k;
  transformed.z += cos(uTime * 0.9 + transformed.x * 0.06 + transformed.y * 0.03) * 4.0 * k; }`);
  };
  m.customProgramCacheKey = () => 'sway';
  return m;
}
const ivyBack = S(0x1a2e16);
const _o = new THREE.Object3D(); _o.rotation.order = 'YXZ';
// ivy/boxwood mats on walls, all in one instanced draw. strip: [x0, y0, x1, y1, h0, h1, nx, ny] (plan cm, facing n)
function ivyWalls(g, strips, r, per) {
  const counts = strips.map(([x0, y0, x1, y1, h0, h1]) => Math.round(Math.hypot(x1 - x0, y1 - y0) * (h1 - h0) / per));
  const im = new THREE.InstancedMesh(new THREE.PlaneGeometry(8, 8), leafMat('ivy'), counts.reduce((a, b) => a + b, 0)), c = new THREE.Color();
  let i = 0;
  strips.forEach(([x0, y0, x1, y1, h0, h1, nx, ny], si) => {
    const L = Math.hypot(x1 - x0, y1 - y0), yaw = Math.atan2(nx, ny);
    box(g, L, h1 - h0, 1, ivyBack, (x0 + x1) / 2 + nx * 0.6, (h0 + h1) / 2, (y0 + y1) / 2 + ny * 0.6, 0, yaw, 0);
    for (let k = 0; k < counts[si]; k++, i++) {
      const t = r(), d = 1.5 + r() * 6.5, hy = h0 + r() * (h1 - h0);
      _o.position.set(x0 + (x1 - x0) * t + nx * d, hy, y0 + (y1 - y0) * t + ny * d);
      _o.rotation.set((r() - 0.5) * 1.1, yaw + (r() - 0.5) * 1.1, r() * 7); _o.scale.setScalar(0.6 + r() * 0.7); _o.updateMatrix();
      im.setMatrixAt(i, _o.matrix); im.setColorAt(i, c.set(IVY_COLS[Math.floor(r() * IVY_COLS.length)]).multiplyScalar(0.7 + r() * 0.5));
    }
  });
  g.add(im); return im;
}
// oriental rug canvas (library: red/navy/gold; djinn: indigo/rust/sand)
const RUG_MATS = {};
function rugMat(style) {
  if (RUG_MATS[style]) return RUG_MATS[style];
  const P = style === 'djinn' ? { field: '#2a2f5a', border: '#8a2a1a', band: '#d8b070', motif: '#c8562a', med: '#e2c27a' } : { field: '#7a1a18', border: '#1d2440', band: '#c9a046', motif: '#2a3a6a', med: '#d8b25a' };
  const W = 256, H = 160, cv = document.createElement('canvas'); cv.width = W; cv.height = H; const c = cv.getContext('2d'), r = rng('rug' + style);
  c.fillStyle = P.border; c.fillRect(0, 0, W, H);
  c.fillStyle = P.band; c.fillRect(10, 10, W - 20, H - 20); c.fillStyle = P.border; c.fillRect(14, 14, W - 28, H - 28);
  for (let x = 20; x < W - 20; x += 12) { c.fillStyle = P.band; c.beginPath(); c.arc(x, 20, 3, 0, 7); c.arc(x, H - 20, 3, 0, 7); c.fill(); }
  c.fillStyle = P.band; c.fillRect(26, 26, W - 52, H - 52); c.fillStyle = P.field; c.fillRect(29, 29, W - 58, H - 58);
  // central lozenge medallion + corner spandrels + small field motifs
  const lz = (cx, cy, rx, ry, col) => { c.fillStyle = col; c.beginPath(); c.moveTo(cx - rx, cy); c.lineTo(cx, cy - ry); c.lineTo(cx + rx, cy); c.lineTo(cx, cy + ry); c.closePath(); c.fill(); };
  lz(W / 2, H / 2, 58, 40, P.band); lz(W / 2, H / 2, 50, 33, P.motif); lz(W / 2, H / 2, 30, 20, P.med); lz(W / 2, H / 2, 12, 8, P.border);
  for (const [x, y] of [[29, 29], [W - 29, 29], [29, H - 29], [W - 29, H - 29]]) { c.fillStyle = P.motif; c.beginPath(); c.moveTo(x, y); c.lineTo(x + (x < W / 2 ? 34 : -34), y); c.lineTo(x, y + (y < H / 2 ? 24 : -24)); c.fill(); }
  for (let i = 0; i < 26; i++) { const x = 40 + r() * (W - 80), y = 38 + r() * (H - 76); if (Math.abs(x - W / 2) < 64 && Math.abs(y - H / 2) < 44) continue; lz(x, y, 5, 4, i % 2 ? P.med : P.motif); }
  for (let i = 0; i < 700; i++) { c.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.12)' : 'rgba(255,240,210,0.07)'; c.fillRect(r() * W, r() * H, 1 + r() * 3, 1); } // worn pile
  const t = releaseCanvas(new THREE.CanvasTexture(cv)); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return (RUG_MATS[style] = new THREE.MeshStandardMaterial({ map: t, roughness: 0.97 }));
}
function rugAt(g, x, z, w, d, rot, style) {
  const top = new THREE.BoxGeometry(w, 0.8, d); const m = mesh(top, [M.cloth, M.cloth, rugMat(style), M.cloth, M.cloth, M.cloth], g, x, 0.4, z, 0, rot, 0);
  for (const s of [-1, 1]) for (let k = -w / 2 + 2; k < w / 2 - 1; k += 3.2) box(g, 0.8, 0.3, 4, M.whiteRope, x + Math.cos(rot) * k + Math.sin(rot) * s * (d / 2 + 2), 0.2, z - Math.sin(rot) * k + Math.cos(rot) * s * (d / 2 + 2), 0, rot, 0);
  return m;
}
// gold genie lamp (lathe body), ~30 cm long
function genieLamp(p, x, y, z, ry = 0, k = 1) {
  const L = new THREE.Group(); L.position.set(x, y, z); L.rotation.y = ry; L.scale.setScalar(k); p.add(L);
  const prof = [[0, 0], [4, 0], [4.5, 1], [3, 2], [7, 3.5], [9.5, 6], [9, 8.5], [6, 10], [3.5, 11], [3, 12.5], [4, 13.5], [2, 15], [0.8, 17], [0, 17.5]].map(([a, b]) => new THREE.Vector2(a, b));
  const body = mesh(new THREE.LatheGeometry(prof, 18), M.gold, L, 0, 0, 0); body.scale.z = 0.75;
  tube(L, [[8, 6, 0], [14, 8, 0], [19, 12, 0], [22, 14.5, 0]], 1.3, M.gold, 12); cyl(L, 1.5, 1, 1.6, M.gold, 22.4, 14.9, 0, 0, 0, -0.9);
  tor(L, 4.5, 0.9, M.gold, -10.5, 8.5, 0, 0, 0, 0.3, PI * 1.4);
  lsph(L, 1.1, M.gold, 0, 18, 0);
}
function inPoly2([x, y], poly) {
  let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; }
  return c;
}
// walk the inner side of a room outline: fn(x, z, nx, nz, s, edgeIndex) every `step` cm
function alongWalls(poly, step, fn) {
  poly.forEach((a, i) => {
    const b = poly[(i + 1) % poly.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]), ux = (b[0] - a[0]) / L, uz = (b[1] - a[1]) / L;
    let nx = -uz, nz = ux; const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2; if (!inPoly2([mx + nx * 5, mz + nz * 5], poly)) { nx = -nx; nz = -nz; }
    for (let s = step / 2; s < L; s += step) fn(a[0] + ux * s, a[1] + uz * s, nx, nz, s, i);
  });
}
// pointed/forked velvet cloth hanging down from y=0 (UVs 0..1 over the cloth, or a column of an atlas)
function clothGeo(w, L, { tail = 18, fork = false, fold = 1.2, ph = 0, col = 0, cols = 1 } = {}) {
  const g = new THREE.PlaneGeometry(w, L, 8, 18); g.translate(0, -L / 2, 0);
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), t = -y / L, e = Math.abs(x) / (w / 2), lo = Math.max(0, (t - 0.75) / 0.25);
    uv.setXY(i, (col + x / w + 0.5) / cols, 1 - t);
    const dy = fork ? lo * (1 - e) * tail : -lo * (1 - e) * tail;
    p.setXYZ(i, x, y + dy, Math.sin(x * 0.42 + ph) * fold * (0.5 + t));
  }
  g.computeVertexNormals(); return g;
}

Object.assign(BUILDERS, {
  // ---------------- Library ----------------
  // 00 lectern: dark plywood pedestal with mouldings + bronze cartouche, slanted top, grey book with page block, brass corners, ribbon
  lectern_book(g, p) {
    const ph = photoOf(p);
    if (ph) {
      box(g, 42, 9, 42, M.lecternWood, 0, 4.5, 0); box(g, 35, 92, 35, M.lecternWood, 0, 54, 0); box(g, 39, 4, 39, M.lecternWood, 0, 101, 0);
      for (let i = 0; i < 4; i++) { const a = i * PI / 2, s = Math.sin(a), c = Math.cos(a);
        photoFace(g, ph.base, 42, 9, s * 21.05, 4.5, c * 21.05, a); photoFace(g, ph.front, 35, 92, s * 17.55, 54, c * 17.55, a); }
      const top = new THREE.Group(); top.position.set(0, 106, 0); top.rotation.x = 0.35; g.add(top);
      box(top, 55, 4, 40, M.lecternWood); box(top, 55, 4, 2.5, M.lecternWood, 0, 3, 19);
      box(top, 30, 4, 37, M.paper, -2, 4, -1); photoFace(top, ph.book, 30, 37, -2, 6.05, -1, 0, -PI / 2);
      star(top, 2.6, 0.6, M.silver, 19, 2.1, -10).rotation.x = -PI / 2;
      return;
    }
    box(g, 42, 5, 42, M.lecternWood, 0, 2.5, 0); box(g, 38, 3, 38, M.lecternWood, 0, 6.5, 0); box(g, 35, 92, 35, M.lecternWood, 0, 54, 0);
    box(g, 39, 4, 39, M.lecternWood, 0, 101, 0); frame(g, 24, 50, 2, M.darkWood, 0, 52, 18, 1.2);
    const cart = new THREE.Shape(); cart.absellipse(0, 0, 8, 5.5, 0, PI * 2); mesh(new THREE.ExtrudeGeometry(cart, { depth: 0.8, bevelEnabled: false }), M.bronze, g, 0, 66, 17.6);
    const top = new THREE.Group(); top.position.set(0, 106, 0); top.rotation.x = 0.35; g.add(top);
    box(top, 55, 4, 40, M.lecternWood); box(top, 55, 4, 2.5, M.lecternWood, 0, 3, 19);
    box(top, 32, 4, 45, M.cloth, 0, 4, -1, 0, PI / 2, 0); box(top, 30.5, 3.2, 43.5, M.paper, 0.6, 4, -1, 0, PI / 2, 0); // page block shows between the covers
    box(top, 14, 0.8, 10, M.bronze, 0, 6.3, -1);
    [[-9, 6], [9, 6], [-9, -8], [9, -8]].forEach(([x, z]) => cyl(top, 2, 2, 0.6, M.bronze, x, 6.3, z));
    for (const [x, z] of [[-21.5, 14], [21.5, 14], [-21.5, -16], [21.5, -16]]) box(top, 3.5, 4.8, 3.5, M.brass, x, 4, z); // brass corner guards
    box(top, 1.6, 0.3, 22, M.velvetRed, 6, 1, 22.5, 0.5, 0, 0); // ribbon bookmark over the front edge
    box(g, 26, 4, 1, M.screen, 0, 92, 17.6);
  },
  // 04 Final Chapter order plaque (the 4 books themselves sit in cabinet 01): bronze cartouche with shell, apple, lamp, snowflake
  order_plaque(g, p) {
    const ph = photoOf(p);
    if (ph) { photoFace(g, ph.front, 52, 30, 0, 9, 1.2); return; }
    const s = new THREE.Shape(); s.moveTo(-22, 0); s.bezierCurveTo(-26, 6, -26, 12, -22, 18); s.bezierCurveTo(-12, 22, 12, 22, 22, 18); s.bezierCurveTo(26, 12, 26, 6, 22, 0); s.bezierCurveTo(12, -4, -12, -4, -22, 0);
    mesh(new THREE.ExtrudeGeometry(s, { depth: 1.5, bevelEnabled: true, bevelSize: 0.8, bevelThickness: 0.6, bevelSegments: 1 }), M.bronze, g, 0, 0, 0.5);
    const z = 2.8, y = 9;
    mesh(new THREE.CircleGeometry(4.2, 12, 0, PI), M.gold, g, -14, y - 2, z); for (let i = 0; i < 5; i++) box(g, 0.4, 4, 0.3, M.darkBronze, -14 + Math.cos(0.3 + i * 0.63) * 2, y - 2 + Math.sin(0.3 + i * 0.63) * 2, z + 0.1, 0, 0, 0.3 + i * 0.63 - PI / 2);
    lsph(g, 3, M.gold, -4.5, y, z, 1, 1, 0.35); box(g, 0.5, 2, 0.4, M.gold, -4.5, y + 3.6, z);
    genieLamp(g, 5, y - 3, z - 0.2, 0, 0.32);
    snowflake(g, 3.5, M.gold, 15, y, z);
  },
  // 03 fake door ~120x205 (photo album_007 / IMG_7721): black panel, mottled-copper filigree border, arched
  // window over 4 carved scenes (lamp, shell, castle+snowflake, apple tree) that glow faintly; 5 silver stars; cyan strip
  fake_door_books(g, p) {
    const w = p.w || 120, H = 205, ph = photoOf(p);
    box(g, w, H, 3, M.edge, 0, H / 2, 1.5);
    if (ph) { photoFace(g, ph.front, w, H, 0, H / 2, 3.05); box(g, w, 1.5, 3, led(0x19d3c5, 3), 0, 0.8, 6); return; }
    const face = new THREE.PlaneGeometry(w, H); mesh(face, fakeDoorMat(), g, 0, H / 2, 3.1);
    box(g, 1.2, H * 0.72, 1.2, M.copper, 0, H * 0.4, 3.6);
    [[-20, 176], [-46, 150], [16, 171], [-38, 100], [26, 101]].forEach(([x, y]) => star(g, 4.2, 1, M.silver, x * w / 120, y, 3.3));
    box(g, w, 1.5, 3, led(0x19d3c5, 3), 0, 0.8, 6);
  },
  // decorative full bookshelf (Library walls)
  bookshelf(g, p, r) { shelfUnit2(g, p.w || 80, p.hgt || 200, 30, 6, r, { decor: true }); if (p.led) box(g, (p.w || 80) - 6, 1, 2, led(0x19d3c5, 3), 0, 1, 29); },
  // black 5-arm chandelier: candles with wax drips, bobeches, flickering flames + halos
  chandelier(g, p, r) {
    const body = new THREE.Group(); g.add(body);
    rod(body, [0, 0, 0], [0, -45, 0], 0.6, M.iron); cyl(body, 6, 6, 1.5, M.iron, 0, -0.8, 0); cyl(body, 3, 5, 10, M.iron, 0, -50, 0); lsph(body, 3, M.iron, 0, -57, 0); cone(body, 1.5, 6, M.iron, 0, -61, 0, PI);
    const flameM = new THREE.MeshStandardMaterial({ color: 0xffc070, emissive: 0xffa040, emissiveIntensity: 4, roughness: 0.4 });
    const pts = [], fl = new THREE.Group(); g.add(fl);
    for (let i = 0; i < 5; i++) {
      const a = i * 2 * PI / 5, x = Math.cos(a) * 32, z = Math.sin(a) * 32;
      tube(body, [[0, -52, 0], [x * 0.5, -60, z * 0.5], [x, -50, z]], 0.8, M.iron, 12); cyl(body, 3, 2, 3, M.iron, x, -48, z); cyl(body, 4, 4, 0.6, M.iron, x, -46.4, z);
      const ch = 7 + r() * 3; cyl(body, 1.2, 1.2, ch, M.paper, x, -46 + ch / 2, z);
      for (let k = 0; k < 2; k++) { const da = r() * 7; cyl(body, 0.35, 0.25, 2 + r() * 2, M.paper, x + Math.cos(da) * 1.2, -46 + ch - 1.5, z + Math.sin(da) * 1.2); }
      mesh(new THREE.SphereGeometry(1, 8, 6), flameM, fl, x, -46 + ch + 1.8, z).scale.set(0.9, 1.8, 0.9);
      pts.push([x, -46 + ch + 2.2, z]);
    }
    mergeStatic(body); mergeStatic(fl);
    const halo = glowPoints(g, pts, 0xffb060, 16, 0.75);
    const ph = r() * 9;
    g.userData.animate = (t) => { const f = 0.85 + 0.1 * Math.sin(t * 9 + ph) + 0.05 * Math.sin(t * 23); flameM.emissiveIntensity = 3.4 * f; halo.material.opacity = 0.7 * f; };
  },
  // brass wall sconce with a candle (glow added by the room's `glows` prop)
  sconce(g) {
    const pl = new THREE.Shape(); pl.moveTo(-4, 0); pl.lineTo(4, 0); pl.lineTo(5, 10); pl.quadraticCurveTo(0, 20, -5, 10); pl.closePath();
    mesh(new THREE.ExtrudeGeometry(pl, { depth: 1, bevelEnabled: false }), M.brass, g, 0, 0, 0);
    tube(g, [[0, 6, 1], [0, 3, 6], [0, 8, 11], [0, 14, 13]], 0.7, M.brass, 12); cyl(g, 3.5, 1.5, 2.5, M.brass, 0, 15, 13); cyl(g, 4, 4, 0.5, M.brass, 0, 16.3, 13);
    cyl(g, 1.2, 1.2, 9, M.paper, 0, 21, 13); lsph(g, 0.9, led(0xffb050, 4), 0, 27, 13, 1, 1.8, 1);
  },
  // 27 Onyx extra puzzle: wooden box with a row of marine-animal buttons on the lid edge (sits on the open-a-box)
  marine_box(g, p) {
    box(g, 44, 18, 30, M.lightWood, 0, 9, 0); box(g, 46, 2, 32, M.brass, 0, 19, 0);
    [M.coral, M.coral2, M.brass, M.coral, M.coral2].forEach((m, i) => cyl(g, 3, 3, 1.4, m, -16 + i * 8, 10, 15.4, Math.PI / 2, 0, 0, 14));
  },
  // oriental rug (floor)
  rug(g, p) { rugAt(g, 0, 0, p.w || 140, p.d || 90, 0, p.style || 'library'); },
  // static additive halos at absolute points [[x, h, y], ...] (prop at [0, 0])
  glows(g, p) { glowPoints(g, p.pts.map(([x, h, y]) => [x, h, y]), p.color ?? 0xffb060, p.size || 14, p.opacity ?? 0.7); },

  // ---------------- Sleepy Forest ----------------
  // twilight forest set dressing: wall ivy, two trunks framing the gate, mushrooms, grass tufts, moss, fallen leaves
  forest_dressing(g, p, r) {
    const low = QUALITY.low, [BX0, BZ0, BX1, BZ1] = p.box || [475, 436, 620, 620], W = BX0, E = BX1, S0 = BZ1;
    // positions authored for the 145x184 box of the original plan; X/Z map them into p.box
    const X = (x) => BX0 + (x - 475) * (BX1 - BX0) / 145, Z = (z) => BZ0 + (z - 436) * (BZ1 - BZ0) / 184;
    ivyWalls(g, p.ivy || [
      [E, 442, E, 482, 10, 250, -1, 0], [E, 482, E, 585, 112, 250, -1, 0], [E, 585, E, S0, 0, 250, -1, 0],
      [586, S0, E, S0, 0, 250, 0, -1], [W, S0, 495, S0, 0, 250, 0, -1], [497, S0, 586, S0, 228, 250, 0, -1],
      [W, 442, W, 462, 0, 250, 1, 0], [W, 462, W, 543, 233, 250, 1, 0], [W, 543, W, S0, 18, 250, 1, 0],
    ], r, low ? 18 : 9);
    // two trunks framing the gate, roots into the room, branches spreading over the ceiling
    const bark = std2('trunkBark');
    for (const [x, z, s] of p.trunks || [[X(483), Z(457), 1], [X(611.5), Z(457), -1]]) {
      tube(g, [[x, -2, z], [x + s * 1.5, 70, z + 1], [x - s * 1, 150, z], [x + s * 0.5, 252, z]], 7.5, bark, 18);
      for (const a of [0.15, 0.75, 1.35]) { const dx = s * Math.cos(a), dz = Math.sin(a); tube(g, [[x, 16, z], [x + dx * 9, 5, z + dz * 9], [x + dx * 15, 0.5, z + dz * 15]], 2.6, bark, 8); }
      tube(g, [[x, 205, z], [x + s * 20, 232, z + 14], [x + s * 50, 246, z + 42], [x + s * 62, 248, z + 80]], 3, bark, 14);
      tube(g, [[x, 225, z], [x + s * 8, 244, z + 30], [x + s * 4, 248, z + 70]], 2.2, bark, 10);
    }
    // mushrooms: red/white spotted + a few glowing blue ones
    const cap = S(0xa8281e, { roughness: 0.55 }), glowCap = led(0x7fd8ff, 1.1);
    for (const [cx, cz, n, glow] of [[604, 606, 4, 0], [597, 475, 3, 1], [562, 611, 3, 0], [489, 576, 4, 1], [531, 612, 2, 1]].map(([x, z, n, gl]) => [X(x), Z(z), n, gl])) {
      for (let i = 0; i < n; i++) {
        const x = cx + (r() - 0.5) * 10, z = cz + (r() - 0.5) * 8, h = 4 + r() * 8, R = 2.2 + r() * 3;
        cyl(g, R * 0.28, R * 0.36, h, M.bone, x, h / 2, z, 0, 0, 0, 8);
        mesh(new THREE.SphereGeometry(R, 12, 5, 0, PI * 2, 0, PI / 2), glow ? glowCap : cap, g, x, h - 0.4, z).scale.y = 0.6;
        if (!glow) for (let k = 0; k < 4; k++) { const a = k * 1.7 + r(); lsph(g, R * 0.14, M.paper, x + Math.cos(a) * R * 0.55, h + R * 0.36, z + Math.sin(a) * R * 0.55, 1, 0.5, 1); }
      }
    }
    // moss patches (darker / yellower than the grass floor)
    for (let i = 0; i < 9; i++) { const R = 10 + r() * 14; mesh(new THREE.CircleGeometry(R, 14), i % 2 ? S(0x24401a, { roughness: 1 }) : S(0x5a6a24, { roughness: 1 }), g, X(rnd(r, 485, 610)), 0.35 + i * 0.02, Z(rnd(r, 448, 612)), -PI / 2).scale.y = 0.6 + r() * 0.5; }
    // grass tufts: clusters of thin blades, mostly along the walls
    const blade = new THREE.PlaneGeometry(2.2, 1); blade.translate(0, 0.5, 0); // stretched leaf card = grass blade, same instanced program as the ivy
    const nc = low ? 26 : 55, per = 11, grass = new THREE.InstancedMesh(blade, leafMat('leaf'), nc * per), c = new THREE.Color();
    const GC = [0x4a7a2a, 0x6a8a30, 0x3a5a22, 0x8a8a40, 0x2f5a2a, 0x5f7f28];
    for (let k = 0, i = 0; k < nc; k++) {
      const wall = r() < 0.7, side = Math.floor(r() * 4);
      const cx = wall ? [W + 4, E - 4, X(rnd(r, 480, 615)), X(rnd(r, 480, 615))][side] : X(rnd(r, 480, 615)), cz = wall ? [Z(rnd(r, 545, 615)), Z(rnd(r, 445, 615)), S0 - 4, S0 - 4][side] : Z(rnd(r, 445, 615));
      for (let j = 0; j < per; j++, i++) {
        _o.position.set(cx + (r() - 0.5) * 9, 0, cz + (r() - 0.5) * 9); _o.rotation.set((r() - 0.5) * 0.7, r() * 7, (r() - 0.5) * 0.7); _o.scale.set(1, 5 + r() * 12, 1); _o.updateMatrix();
        grass.setMatrixAt(i, _o.matrix); grass.setColorAt(i, c.set(GC[Math.floor(r() * GC.length)]).multiplyScalar(0.7 + r() * 0.5));
      }
    }
    g.add(grass);
    // fallen leaves on the floor
    leaves(g, low ? 40 : 90, 'leaf', 6, (o) => { o.position.set(X(rnd(r, 480, 615)), 0.6 + r() * 0.4, Z(rnd(r, 445, 616))); o.rotation.set(-PI / 2 + (r() - 0.5) * 0.3, 0, r() * 7); }, [0xb85a18, 0xc06a20, 0x8a4a1a, 0xd88a30, 0x6a5a20], r);
  },
  // LED foliage ceiling over the twilight forest (overhead): leaves, warm/pink fairy strips, wooden discs, hanging strands
  forest_canopy(g, p, r) {
    const [x0, z0, x1, z1] = p.rect, hole = p.hole, inHole = (x, z) => hole && x > hole[0] && x < hole[2] && z > hole[1] && z < hole[3];
    const n = Math.round((x1 - x0) * (z1 - z0) / (QUALITY.low ? 50 : 24)), strands = [], ns = 9;
    for (let i = 0; i < ns; i++) { let x, z; do { x = rnd(r, x0 + 8, x1 - 8); z = rnd(r, z0 + 8, z1 - 8); } while (inHole(x, z)); strands.push([x, z, 25 + r() * 35]); }
    leaves(g, n + ns * 8, 'leaf', 10, (o, i) => {
      if (i >= n) { const [x, z, L] = strands[Math.floor((i - n) / 8)], k = (i - n) % 8; o.position.set(x + Math.sin(k * 1.3) * 3, -6 - k * L / 8, z + Math.cos(k) * 3); o.rotation.set((r() - 0.5) * 1.4, r() * 7, (r() - 0.5) * 1.4); o.userData.k = 0.7; return; }
      let x, z; do { x = rnd(r, x0, x1); z = rnd(r, z0, z1); } while (inHole(x, z));
      o.position.set(x, -3 - r() * 9, z); o.rotation.set(PI / 2 + (r() - 0.5) * 0.9, (r() - 0.5) * 0.6, r() * 7);
    }, [0x2f5a2a, 0x3d6e2c, 0x5a8a2a, 0xc06a20, 0xb85a18, 0x264a22, 0x4f7a32], r);
    for (const [x, z] of strands) tube(g, [[x, -4, z], [x + 2, -20, z + 1], [x - 1, -40, z]], 0.35, M.vine, 8);
    [0xfff2d8, 0xffc0d8, 0xfff2d8, 0xffc0d8].forEach((col, i) => {
      let z = z0 + 14 + i * (z1 - z0 - 28) / 3, x = x0 + 6; const pts = [];
      while (x < x1 - 4) { pts.push([x, -11, z]); x += 12; z = Math.max(z0 + 6, Math.min(z1 - 6, z + (r() - 0.5) * 22)); }
      tube(g, pts, 0.5, led(col, 3.5), 60);
    });
    for (let i = 0; i < 10; i++) { const x = rnd(r, x0 + 8, x1 - 8), z = rnd(r, z0 + 8, z1 - 8); if (!inHole(x, z)) cyl(g, 4, 4, 1, M.lightWood, x, -12, z); }
  },
  // drifting, blinking fireflies inside a box [x0, z0, x1, z1] between heights p.y0..p.y1
  fireflies(g, p, r) {
    const [x0, z0, x1, z1] = p.box, n = QUALITY.low ? Math.ceil((p.n || 24) / 2) : p.n || 24, base = [];
    for (let i = 0; i < n; i++) base.push([rnd(r, x0 + 15, x1 - 15), rnd(r, p.y0 || 40, p.y1 || 210), rnd(r, z0 + 15, z1 - 15), r() * 7, 0.25 + r() * 0.4]);
    const pts = glowPoints(g, base.map(([x, y, z]) => [x, y, z]), 0xffffff, p.size || 7, 1, new Array(n * 3).fill(0));
    pts.frustumCulled = false;
    const P = pts.geometry.attributes.position, C = pts.geometry.attributes.color, col = new THREE.Color(p.color ?? 0xc8ff60);
    g.userData.animate = (t) => {
      for (let i = 0; i < n; i++) {
        const [x, y, z, ph, sp] = base[i]; P.setXYZ(i, x + Math.sin(t * sp + ph) * 14, y + Math.sin(t * sp * 1.4 + ph * 2) * 8, z + Math.cos(t * sp * 0.8 + ph) * 14);
        const b = Math.pow(Math.max(0, Math.sin(t * 1.3 + ph * 3)), 2) * (0.8 + 0.2 * Math.sin(t * 19 + i)); C.setXYZ(i, col.r * b, col.g * b, col.b * b);
      }
      P.needsUpdate = C.needsUpdate = true;
    };
  },
  // castle: Evil Queen banner, crimson velvet with gold apple or crown, hung from a gold rod
  queen_banner(g, p) {
    const bw = p.w || 40, L = p.len || 105;
    cyl(g, 1, 1, bw + 10, M.gold, 0, 0, 5, 0, 0, PI / 2, 10); for (const s of [-1, 1]) { lsph(g, 2, M.gold, s * (bw / 2 + 6), 0, 5); box(g, 2, 4, 5, M.iron, s * (bw / 2 - 2), 0, 2.5); }
    mesh(clothGeo(bw, L, { tail: 16, ph: p.symbol || 0 }), S(0x5a0f22, { roughness: 0.92, side: THREE.DoubleSide }), g, 0, -1.5, 6);
    for (const s of [-1, 1]) box(g, 1.6, L - 4, 0.4, M.gold, s * (bw / 2 - 2.5), -L / 2, 6.5 + Math.sin(s * (bw / 2 - 2.5) * 0.42 + (p.symbol || 0)) * 1.2 * 0.9);
    cone(g, 1.8, 7, M.gold, 0, -L - 18, 6 + Math.sin(p.symbol || 0) * 1.2 * 1.5, PI);
    const y = -L * 0.4, z = 8.2;
    if (p.symbol) { box(g, 18, 5, 1, M.gold, 0, y - 4, z); for (let i = 0; i < 5; i++) cone(g, 2, 7 + (i % 2 ? 0 : 3), M.gold, -8 + i * 4, y + 2 + (i % 2 ? 0 : 1.5), z); lsph(g, 1.6, led(0xd02040, 1), 0, y - 4, z + 0.8); }
    else { lsph(g, 7, M.gold, 0, y, z, 1, 1, 0.3); box(g, 1, 4, 1, M.darkBronze, 0, y + 8, z); mesh(new THREE.CircleGeometry(3, 8), M.gold, g, 3, y + 8.5, z + 0.2, 0, 0, 0.6).scale.y = 0.5; }
  },
  // castle wall torch: iron bracket + cup + flame (halo from `glows`)
  wall_torch(g) {
    box(g, 6, 16, 1.5, M.iron, 0, 8, 0.75); rod(g, [0, 8, 1], [0, 18, 11], 1, M.iron); cone(g, 4, 9, M.iron, 0, 22, 12, PI, 0, 0, 10); cyl(g, 4.2, 4.2, 1, M.bronze, 0, 26.5, 12);
    mesh(new THREE.ConeGeometry(2.4, 8, 8), led(0xff8a30, 4), g, 0, 31, 12);
  },

  // ---------------- Evil Queen side of the two-queens wall ----------------
  // 08 stone dresser 50x40x90: crackle body with plinth, pilasters and cornice, 4 drawers, apple relief; candle + roses on top
  stone_dresser(g) {
    box(g, 50, 90, 40, M.crackle, 0, 45, 20); box(g, 54, 6, 43, M.slate, 0, 3, 21); box(g, 54, 4, 42, M.gold, 0, 92, 21); box(g, 56, 3, 44, M.slate, 0, 95.5, 21);
    for (const s of [-1, 1]) { box(g, 4, 84, 3, M.slate2, s * 24, 47, 40.6); lsph(g, 2.2, M.gold, s * 24, 86, 42); }
    drawers(g, 44, 4, 6, 20, 40.5, M.slate, M.gold);
    lsph(g, 4, M.red, 0, 88, 41.5, 1, 1, 0.4);
    // candle stick + roses + poisoned apple on top
    cyl(g, 4, 4, 1, M.brass, 17, 97.5, 28); cyl(g, 0.8, 1.2, 9, M.brass, 17, 102.5, 28); cyl(g, 2.5, 2, 1.2, M.brass, 17, 107.5, 28);
    cyl(g, 1.3, 1.3, 9, M.paper, 17, 112.5, 28); lsph(g, 0.9, led(0xffb050, 4), 17, 118, 28, 1, 1.8, 1);
    for (const [x, z] of [[-14, 28], [-9, 33], [-17, 34]]) { lsph(g, 2.8, M.velvetRed, x, 99.5, z, 1, 0.8, 1); tor(g, 1.6, 0.6, M.velvetRed, x, 101.5, z, PI / 2); }
    lsph(g, 3.2, S(0xb01818, { roughness: 0.35 }), 2, 100, 30); box(g, 0.5, 2, 0.5, M.darkBronze, 2, 103.8, 30);
  },
  // 08 frame in the shared opening: mirror in a carved stone frame with a pointed crest, or the Ice Queen portrait
  mirror_painting(g, p) {
    const w = p.w || 40, h = p.hgt || 60, ice = p.style === 'ice';
    const ph = photoOf(p);
    if (ice && ph) { box(g, w, h, 3, M.silver, 0, h / 2, 1.5); photoFace(g, ph.front, w, h, 0, h / 2, 3.05); snowflake(g, 6, M.silver, 0, h + 7, 3); return; }
    if (ice) {
      box(g, w - 6, h - 6, 1, portraitMat(), 0, h / 2, 2);
      frame(g, w, h, 4, M.silver, 0, h / 2, 3, 3); frame(g, w - 7, h - 7, 0.8, M.silver, 0, h / 2, 4.5, 1);
      for (const [x, y] of [[-1, 0], [1, 0], [-1, 1], [1, 1]]) lsph(g, 2.6, M.silver, x * w / 2, y * h, 4.6, 1, 1, 0.5);
      snowflake(g, 6, M.silver, 0, h + 7, 3); for (let i = 0; i < 3; i++) lsph(g, 3.5, M.mdf, -w / 3 + i * w / 3, h + 1, 3, 1.3, 0.7, 1);
      return;
    }
    box(g, w - 6, h - 6, 1, M.mirror, 0, h / 2, 2);
    for (let i = 0; i < 6; i++) { box(g, 9, 10, 5, i % 2 ? M.slate : M.slate2, -w / 2 - 1, 5 + i * h / 6, 2.5); box(g, 9, 10, 5, i % 2 ? M.slate2 : M.slate, w / 2 + 1, 5 + i * h / 6, 2.5); }
    box(g, w + 12, 10, 5, M.slate, 0, h + 3, 2.5); box(g, w + 14, 3, 6, M.slate2, 0, h + 8.5, 3);
    const crest = new THREE.Shape(); crest.moveTo(-w / 2 - 4, 0); crest.lineTo(w / 2 + 4, 0); crest.quadraticCurveTo(w / 4, 4, 0, 16); crest.quadraticCurveTo(-w / 4, 4, -w / 2 - 4, 0);
    mesh(new THREE.ExtrudeGeometry(crest, { depth: 4, bevelEnabled: false }), M.slate, g, 0, h + 10, 0.5);
    lsph(g, 2.6, M.gold, 0, h + 27.5, 3); box(g, 12, 2.2, 1, M.gold, 0, h + 14, 4.8); for (let i = 0; i < 3; i++) cone(g, 1.2, 4, M.gold, -4 + i * 4, h + 17, 4.8);
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) lsph(g, 0.9, M.gold, s * (w / 2 + 1), 12 + i * h / 3, 5.2);
  },

  // ---------------- Frozen Kingdom ----------------
  // 10 slim white pillar: plinth/capital, silver-trimmed frosted panel, hand star at ~110, star wreath + glowing snowflake, numeral medallion
  frost_pillar(g, p, r) {
    box(g, 25, 200, 14, M.mdf, 0, 100, 7); box(g, 29, 9, 17, M.mdf, 0, 4.5, 8.5); box(g, 29, 6, 17, M.mdf, 0, 197, 8.5);
    box(g, 27.5, 1.2, 16, M.silver, 0, 9.6, 8.5); box(g, 27.5, 1.2, 16, M.silver, 0, 193.4, 8.5);
    frame(g, 17, 160, 1.3, M.silver, 0, 100, 14.3, 0.8); box(g, 15, 157, 0.4, M.iceSolid, 0, 100, 14.2);
    for (let i = 0; i < 4; i++) snowflake(g, 2.5 + r() * 1.5, M.silver, (r() - 0.5) * 9, 35 + i * 40 + r() * 15, 14.7);
    star(g, 10, 1.5, M.silver, 0, 110, 14.5, 6); lsph(g, 4, M.mdf, 0, 110, 16, 0.8, 1, 0.3);
    const cy = 212;
    snowflake(g, 11, led(0x9fe8ff, 2.8), 0, cy, 9); cyl(g, 15, 15, 1, M.milky, 0, cy, 11, PI / 2); tor(g, 15.5, 1.1, M.silver, 0, cy, 10);
    for (let i = 0; i < 14; i++) { const a = i * 2 * PI / 14; star(g, 4, 1.2, M.silver, Math.cos(a) * 19, cy + Math.sin(a) * 19, 8.5).rotation.z = a - PI / 2; }
    cyl(g, 5, 5, 1.2, M.silver, 0, cy + 29, 8, PI / 2); for (let i = 0; i < 3; i++) box(g, 0.9, 5, 0.5, M.navy, -2 + i * 2, cy + 29, 8.9);
  },
  // 11 navy velvet banner with swallowtail and a white symbol (one atlas texture for all 5), hung from a plank; compass below on floor
  banner(g, p) {
    const sym = p.symbol ?? 0, bw = 42;
    box(g, bw + 12, 6, 4, M.lightWood, 0, 0, 2); for (const x of [-bw / 2 + 4, bw / 2 - 4]) cyl(g, 1, 1, 6, M.silver, x, -3, 4.5);
    mesh(clothGeo(bw, 150, { tail: 22, fork: true, ph: sym, col: sym, cols: 5, fold: 1.1 }), bannerAtlas(), g, 0, -4, 5);
    for (const s of [-1, 1]) { const z = 5 + Math.sin(s * bw / 2 * 0.42 + sym) * 1.1 * 1.5; cone(g, 1.5, 6, M.silver, s * bw / 2, -157, z, PI); lsph(g, 1.2, M.silver, s * bw / 2, -153.5, z); }
    const cy = -(p.h ?? 230) + 1; cyl(g, 7, 7, 2, M.silver, 0, cy, 15); box(g, 0.8, 0.6, 11, M.red, 0, cy + 1.2, 15, 0, sym, 0);
  },
  // icicles along the top of the walls, snow drifts in the corners, ice crystal clusters, pale-blue runner before the throne
  frozen_dressing(g, p, r) {
    const poly = p.poly, ic = [];
    alongWalls(poly, QUALITY.low ? 9 : 6, (x, z, nx, nz) => ic.push([x + nx * (2 + r() * 3), z + nz * (2 + r() * 3), 5 + Math.pow(r(), 2) * 20]));
    const cones = ic.map(([x, z, L]) => { const k = 0.8 + r() * 1.2, c = new THREE.ConeGeometry(k, L, 5); c.rotateX(PI); c.translate(x, 250 - L / 2, z); return c; });
    mesh(mergeGeometries(cones), M.ice, g); // one merged mesh (M.ice is transparent, so it is never batched with other props)
    for (const [x, z, R, n] of p.drifts) for (let k = 0; k < n; k++) sph(g, R * (0.5 + r() * 0.5), M.snow, x + (r() - 0.5) * R * 1.4, 0, z + (r() - 0.5) * R * 1.4, 1.3, 0.4 + r() * 0.2, 1);
    for (const [x, z] of p.crystals) for (let k = 0; k < 5; k++) { const c = mesh(new THREE.OctahedronGeometry(2 + r() * 2.5, 0), M.iceSolid, g, x + (r() - 0.5) * 9, 3, z + (r() - 0.5) * 9, (r() - 0.5) * 0.6, r() * 3, (r() - 0.5) * 0.6); c.scale.y = 2 + r() * 1.8; }
    if (p.runner) { const [x, z, w, d] = p.runner; box(g, w, 0.6, d, S(0xa8cce6, { roughness: 0.6 }), x, 0.3, z); for (const s of [-1, 1]) box(g, 2, 0.8, d, M.silver, x + s * (w / 2 - 3), 0.4, z); }
  },
  // floating snow motes over the Frozen Kingdom (slow fall + drift)
  snowfall(g, p, r) {
    const n = QUALITY.low ? 30 : 70, base = [];
    for (let i = 0; i < n; i++) { const [x0, z0, x1, z1] = p.rects[Math.floor(r() * p.rects.length)]; base.push([rnd(r, x0 + 10, x1 - 10), r() * 230, rnd(r, z0 + 10, z1 - 10), r() * 7, 6 + r() * 6]); }
    const pts = glowPoints(g, base.map(([x, y, z]) => [x, y, z]), 0xdff4ff, 3.2, 0.85); pts.frustumCulled = false;
    const P = pts.geometry.attributes.position;
    g.userData.animate = (t) => { for (let i = 0; i < n; i++) { const [x, y, z, ph, sp] = base[i]; P.setXYZ(i, x + Math.sin(t * 0.4 + ph) * 8, 8 + ((y - t * sp) % 230 + 230) % 230, z + Math.cos(t * 0.33 + ph) * 8); } P.needsUpdate = true; };
  },

  // ---------------- Djinn's Vault ----------------
  // 15 Sacred Animals: 2 white ropes over 4 ceiling pulleys above the door; each rope's two ends hang on opposite
  // sides of the door, with a hexagonal birch lantern weight on every end and black quatrefoil marks along the strands
  ropes_weights(g, p) {
    const drop = (p.ceil || 250) - 45, xs = p.ends || [[-42, 42], [-62, 62]];
    xs.forEach(([a, b], ri) => {
      const z = ri ? -3.5 : 3.5;
      box(g, b - a + 14, 2.5, 3, M.darkWood, (a + b) / 2, -1.25, z);
      for (const [x, s] of [[a, -1], [b, 1]]) {
        box(g, 6, 5, 8, M.darkWood, x, -4, z); tor(g, 4, 1, M.iron, x, -9, z); cyl(g, 0.8, 0.8, 9, M.steel, x, -9, z, PI / 2);
        const sx = x + s * 4; rod(g, [sx, -9, z], [sx, -drop, z], 0.7, M.whiteRope);
        for (let k = 0; k < 6; k++) { const y = -30 - k * (drop - 40) / 6; for (let q = 0; q < 4; q++) lsph(g, 1.5, M.black, sx + Math.cos(q * PI / 2) * 1.8, y + Math.sin(q * PI / 2) * 1.8, z + 1.5, 1, 1, 0.4); }
        cyl(g, 7.5, 7.5, 20, M.birch, sx, -drop - 10, z, 0, 0, 0, 6); cyl(g, 4, 7.5, 4, M.edge, sx, -drop + 2, z, 0, 0, 0, 6); lsph(g, 3, led(0xffb050, 2), sx, -drop - 10, z);
      }
      rod(g, [a, -5, z], [b, -5, z], 0.7, M.whiteRope); // the run over the door
    });
  },
  // 16 adventurer skeleton (dark bronze) slumped against the wall: skull with jaw, spine, ribs, pelvis, limbs; gold necklace with gems
  skeleton(g) {
    const b = M.darkBronze;
    // pelvis + spine leaning back
    box(g, 20, 7, 10, b, 0, 7, -6); for (const s of [-1, 1]) lsph(g, 5, b, s * 7, 9, -7, 1, 0.8, 0.6);
    for (let i = 0; i < 9; i++) { const t = i / 8; lsph(g, 1.9, b, 0, 12 + t * 40, -9 - t * 7, 1, 0.7, 1); }
    for (let i = 0; i < 6; i++) { const y = 30 + i * 4, z = -12 - i * 0.8, R = 8.5 - Math.abs(i - 2) * 0.9; const t = tor(g, R, 0.8, b, 0, y, z + 3, PI / 2 - 0.25, 0, 0, PI * 1.5); t.rotation.z = -PI * 0.25; t.scale.set(1, 0.75, 1); }
    box(g, 2.5, 12, 1.5, b, 0, 40, -4.5, -0.2, 0, 0); rod(g, [-9, 54, -14], [9, 54, -14], 1, b);
    // skull + jaw, tilted down
    const sk = new THREE.Group(); sk.position.set(0, 63, -14); sk.rotation.x = 0.35; g.add(sk);
    lsph(sk, 7.5, b, 0, 1, 0, 0.9, 1, 1.05); box(sk, 8, 3.5, 6, b, 0, -6, 3.5); lsph(sk, 1.9, M.black, -2.8, 1, 6.6); lsph(sk, 1.9, M.black, 2.8, 1, 6.6); cone(sk, 1, 2, M.black, 0, -2, 7.2, PI);
    for (let i = 0; i < 6; i++) box(sk, 0.9, 1.2, 0.6, M.bone, -2.6 + i * 1.05, -4.4, 6.4);
    cyl(sk, 13, 13, 1, M.leather, 0, 7, -1, -0.15); cyl(sk, 8, 9, 7, M.leather, 0, 10.5, -1, -0.15);
    // legs splayed forward, arms resting
    for (const s of [-1, 1]) {
      rod(g, [s * 7, 8, -4], [s * 12, 18, 26], 1.8, b); lsph(g, 2.2, b, s * 12, 18, 26); rod(g, [s * 12, 18, 26], [s * 11, 3, 46], 1.5, b); box(g, 5, 2, 10, b, s * 11, 1.5, 51);
      rod(g, [s * 10, 52, -14], [s * 16, 30, -2], 1.4, b); lsph(g, 1.8, b, s * 16, 30, -2); rod(g, [s * 16, 30, -2], [s * 11, 16, 14], 1.2, b);
      for (let k = 0; k < 4; k++) rod(g, [s * 11, 16, 14], [s * (10 + k * 1.2), 14, 19], 0.4, b);
    }
    // necklace: chain of gold beads round the neck with a big amulet + 4 coloured crystals (puzzle 16 clue)
    for (let i = 0; i <= 16; i++) { const a = PI * (0.1 + i / 16 * 0.8); lsph(g, 0.8, M.gold, Math.cos(a) * 7.5, 52 - Math.sin(a) * 9, -12 + Math.sin(a) * 9.5); }
    cyl(g, 3, 3, 1, M.gold, 0, 42.5, -2.4, PI / 2 - 0.3); lsph(g, 1.6, led(0xff3030, 2), 0, 42.5, -1.6, 1, 1, 0.6);
    [0xff3030, 0x30e060, 0x3080ff, 0xffd020].forEach((c, i) => lsph(g, 1.1, led(c, 2), -4.5 + i * 3, 45.5 - Math.abs(i - 1.5) * 0.8, -3.6));
  },
  // cushion pile: velvet cushions with gold tassels (items: [x, z, w, d, h, rotY, colour])
  cushions(g, p) {
    const VC = [M.velvetRed, M.purple, S(0x1f4a5a, { roughness: 0.9 }), S(0xb07a20, { roughness: 0.8 })];
    let top = 0;
    for (const [x, z, w, d, h, ry, ci, y = 0] of p.items) {
      const m = rbox(g, w, h, d, Math.min(h * 0.45, 4), VC[ci], x, y + h / 2, z); m.rotation.y = ry;
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const ox = (sx * w / 2) * Math.cos(ry) + (sz * d / 2) * Math.sin(ry), oz = -(sx * w / 2) * Math.sin(ry) + (sz * d / 2) * Math.cos(ry); cone(g, 1.2, 4, M.gold, x + ox, y + h / 2 - 1, z + oz, PI); }
      top = Math.max(top, y + h);
    }
    if (p.lamp) genieLamp(g, p.lamp[0], top - 0.5, p.lamp[1], p.lamp[2] || 0, 1);
  },
  // treasure + sand: coin piles with gems, instanced loose coins, open chest, sand dunes, drape valance along the wall tops
  djinn_dressing(g, p, r) {
    const sand = S(0xc9a873, { roughness: 1 });
    for (const [x, z, w, d, hh, ry] of p.dunes) {
      const geo = new THREE.PlaneGeometry(w, d, 20, 14); geo.rotateX(-PI / 2); const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) { const u = pos.getX(i) / (w / 2), v = pos.getZ(i) / (d / 2), e = Math.max(0, 1 - u * u - v * v); pos.setY(i, 0.3 + hh * e * e * (1 + 0.15 * Math.sin(pos.getX(i) * 0.45 + pos.getZ(i) * 0.2))); }
      geo.computeVertexNormals(); mesh(geo, sand, g, x, 0, z, 0, ry, 0);
    }
    // coin piles: lumpy gold mounds with gems; loose coins scattered round them
    const coins = [], gems = [0xff3030, 0x30e060, 0x3080ff, 0xffd020, 0xb050ff];
    for (const [x, z, R] of p.piles) {
      const geo = new THREE.SphereGeometry(R, 14, 6, 0, PI * 2, 0, PI / 2), ps = geo.attributes.position;
      for (let i = 0; i < ps.count; i++) { const k = 1 + 0.08 * Math.sin(ps.getX(i) * 0.9) * Math.cos(ps.getZ(i) * 1.1); ps.setXYZ(i, ps.getX(i) * k, ps.getY(i) * 0.42 * k, ps.getZ(i) * k); }
      geo.computeVertexNormals(); mesh(geo, M.gold, g, x, 0, z);
      for (let k = 0; k < 4; k++) { const a = r() * 7, d = r() * R * 0.6; mesh(new THREE.OctahedronGeometry(1.4 + r()), led(gems[Math.floor(r() * gems.length)], 1.6), g, x + Math.cos(a) * d, R * 0.42 * Math.sqrt(1 - (d / R) ** 2) + 0.6, z + Math.sin(a) * d); }
      for (let k = 0; k < 30; k++) { const a = r() * 7, d = R * (0.3 + r() * 0.9); coins.push([x + Math.cos(a) * d, Math.max(0.3, R * 0.42 * Math.sqrt(Math.max(0, 1 - (d / R) ** 2))) + 0.2, z + Math.sin(a) * d]); }
    }
    for (const [x, z] of p.chests || []) {
      box(g, 28, 14, 18, M.darkWood, x, 7, z); box(g, 28.6, 2, 18.6, M.brass, x, 1, z); box(g, 28.6, 2, 18.6, M.brass, x, 13, z);
      for (const s of [-1, 1]) box(g, 2, 14.4, 18.6, M.brass, x + s * 9, 7, z);
      const lid = new THREE.Group(); lid.position.set(x, 14, z - 9); lid.rotation.x = -1.1; g.add(lid);
      mesh(new THREE.CylinderGeometry(9, 9, 28, 12, 1, false, 0, PI), M.darkWood, lid, 0, 0, 9, 0, 0, PI / 2);
      const heap = new THREE.SphereGeometry(12, 12, 5, 0, PI * 2, 0, PI / 2); heap.scale(1.1, 0.35, 0.7); mesh(heap, M.gold, g, x, 13, z);
      for (let k = 0; k < 10; k++) coins.push([x + (r() - 0.5) * 22, 15.5 + r() * 2, z + (r() - 0.5) * 12]);
    }
    for (const [x, y, z] of coins) cyl(g, 1.4, 1.4, 0.3, M.gold, x, y, z, (r() - 0.5) * 1.2, r() * 7, (r() - 0.5) * 1.2, 8);
    // scalloped drape valance under the tent, along the top of every wall (skips p.skip ranges [edge, s0, s1])
    const cloth = S(0x8a1c1c, { roughness: 0.95, side: THREE.DoubleSide }), trim = M.gold, top = [], fr = [];
    alongWalls(p.poly, 2, (x, z, nx, nz, s, e) => {
      if ((p.skip || []).some(([ei, a, b]) => ei === e && s > a && s < b)) { top.push(null); fr.push(null); return; }
      const sag = 7 * Math.abs(Math.sin(PI * s / 30)), y1 = 240 - sag, o = 1.5 + 1.2 * Math.abs(Math.sin(PI * s / 30));
      top.push([x + nx * 1.2, 250, z + nz * 1.2, x + nx * o, y1, z + nz * o]); fr.push([x + nx * o, y1 + 0.6, z + nz * o, x + nx * (o + 0.3), y1 - 1.6, z + nz * (o + 0.3)]);
    });
    const strip = (list, mat) => {
      const pos = [], idx = [];
      list.forEach((q, i) => { pos.push(...(q || [0, 0, 0, 0, 0, 0])); if (i && q && list[i - 1]) { const a = (i - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } });
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals(); mesh(geo, mat, g);
    };
    strip(top, cloth); strip(fr, trim);
  },

  // ---------------- Mermaid Cave ----------------
  // 09 Mermaid side of the mine door: plain grey door leaf in a grey frame (album_121), no rock fill
  plain_door(g, p) {
    const w = p.w || 75, grey = S(0x8e9296, { roughness: 0.7 });
    box(g, w, 200, 2, grey, 0, 100, 1); for (const s of [-1, 1]) box(g, 5, 205, 3, S(0xb8bcc0, { roughness: 0.6 }), s * (w / 2 + 2.5), 102.5, 1.5);
    box(g, w + 10, 5, 3, S(0xb8bcc0, { roughness: 0.6 }), 0, 202.5, 1.5); frame(g, w - 14, 80, 1.2, grey, 0, 145, 2.4, 0.8); frame(g, w - 14, 90, 1.2, grey, 0, 52, 2.4, 0.8);
    for (let i = 0; i < 6; i++) box(g, 1.5, 3, 1.5, M.steel, w / 2 - 2, 25 + i * 30, 2.5);
  },
  // cave set dressing: extra rocks, branching corals, brain corals, shells + starfish, seaweed that sways, a fishing net with floats
  mermaid_dressing(g, p, r) {
    CAVE_MAT ??= std2('caveRockProp');
    const rocks = [];
    for (const [x, z, R, n] of p.rocks) for (let i = 0; i < n; i++) { const rr = R * (0.4 + r() * 0.6), a = r() * 7, d = r() * R * 0.7, geo = rockGeo(rr, i + r() * 9, 0.6 + r() * 0.4); geo.rotateY(r() * 7); geo.translate(x + Math.cos(a) * d, rr * 0.3, z + Math.sin(a) * d); rocks.push(geo); }
    mesh(mergeGeometries(rocks), CAVE_MAT, g);
    const CM = [M.coral, M.coral2, S(0xf0a040, { roughness: 0.7 }), S(0x9a5ac8, { roughness: 0.7 })];
    const branch = (a, dir, len, rad, depth, mat) => {
      const b = [a[0] + dir[0] * len, a[1] + dir[1] * len, a[2] + dir[2] * len]; rod(g, a, b, rad, mat, rad * 0.7); lsph(g, rad * 0.75, mat, ...b);
      if (depth) for (let k = 0; k < 2 + (r() < 0.4 ? 1 : 0); k++) { const d = [dir[0] + (r() - 0.5) * 1.1, dir[1] + 0.25, dir[2] + (r() - 0.5) * 1.1], L = Math.hypot(...d); branch(b, d.map((v) => v / L), len * 0.72, rad * 0.7, depth - 1, mat); }
    };
    for (const [x, y, z, k, ci] of p.corals) branch([x, y, z], [0, 1, 0], 7 * k, 1.3 * k, 2, CM[ci]);
    for (const [x, y, z, R, ci] of p.brains) { const geo = new THREE.SphereGeometry(R, 16, 8, 0, PI * 2, 0, PI / 2), ps = geo.attributes.position; for (let i = 0; i < ps.count; i++) { const k = 1 + 0.07 * Math.sin(ps.getX(i) * 2.2 + ps.getZ(i) * 1.7); ps.setXYZ(i, ps.getX(i) * k, ps.getY(i) * 0.7 * k, ps.getZ(i) * k); } geo.computeVertexNormals(); mesh(geo, CM[ci], g, x, y, z); }
    // shells + starfish
    for (const [x, y, z, kind, rot] of p.shells) {
      if (kind === 0) { const s = mesh(new THREE.SphereGeometry(3.2, 10, 5, 0, PI, 0, PI / 2), M.shell, g, x, y, z, -PI / 2, rot, 0); s.scale.z = 0.35; }
      else if (kind === 1) { const c = cone(g, 2, 8, M.shell, x, y + 2, z, 0, rot, PI / 2 - 0.3, 10); c.scale.z = 0.8; lsph(g, 2.2, M.shell, x + Math.cos(rot) * 3.5, y + 2, z - Math.sin(rot) * 3.5); }
      else star(g, 5, 1.2, M.coral, x, y + 0.6, z).rotation.set(-PI / 2, 0, rot);
    }
    // seaweed: wavy ribbons rising from the floor, swaying in the vertex shader
    const kelpA = swayMat(0x2f6a3a), kelpB = swayMat(0x6a7a2a);
    for (const [x, z, n, hmax] of p.kelp) for (let i = 0; i < n; i++) {
      const bx = x + (r() - 0.5) * 12, bz = z + (r() - 0.5) * 10, H = hmax * (0.5 + r() * 0.5), a = r() * PI, pts = [];
      for (let k = 0; k <= 8; k++) pts.push([bx + Math.sin(k * 0.9 + i) * 3, k * H / 8, bz + Math.cos(k * 0.8 + i) * 2.5]);
      ribbon(g, pts, 3 + r() * 2.5, i % 3 ? kelpA : kelpB, 24, [Math.cos(a), 0, Math.sin(a)]);
    }
    // fishing net draped from the ceiling of a wall: diagonal jute strands over a sagging surface, floats and a starfish
    if (p.net) {
      const [x, z, w, hgt, nx, nz] = p.net, yaw = Math.atan2(nx, nz);
      const at = (lx, ly, lz) => [x + Math.cos(yaw) * lx + Math.sin(yaw) * lz, ly, z - Math.sin(yaw) * lx + Math.cos(yaw) * lz];
      const surf = (u, v) => at((u - 0.5) * w * (1 - v * 0.25), 249 - v * hgt - Math.sin(PI * u) * 7 * (1 - v), 2 + Math.sin(PI * u) * 7 * v + Math.sin(u * 19) * 1.2);
      for (let k = -6; k <= 6; k++) for (const d of [1, -1]) {
        const pts = []; for (let v = 0; v <= 1.001; v += 0.1) { const u = 0.5 + k / 12 + d * v * 0.45; if (u >= 0 && u <= 1) pts.push(surf(u, v)); }
        if (pts.length > 2) tube(g, pts, 0.25, M.rope, pts.length * 2);
      }
      for (const [u, v] of [[0.2, 0.7], [0.55, 0.9], [0.82, 0.55]]) { const [px, py, pz] = surf(u, v); lsph(g, 3.5, M.lightWood, px + nx * 3, py, pz + nz * 3); }
      const [sx, sy, sz] = surf(0.65, 0.45); star(g, 6, 1.2, M.coral2, sx + nx * 2, sy, sz + nz * 2).rotation.set(0, yaw, 0.4);
    }
  },
});
// mottled-copper relief for the fake door, drawn once on a 480x820 canvas set (colour / bump / emissive)
let FAKE_DOOR = null;
function fakeDoorMat() {
  if (FAKE_DOOR) return FAKE_DOOR;
  const W = 480, Hh = 820, mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = Hh; return c; };
  const L = mk(), x = L.getContext('2d'), r = rng('fakedoor');
  x.fillStyle = x.strokeStyle = '#fff'; x.lineCap = x.lineJoin = 'round';
  const spiral = (cx, cy, s, flip, turns = 9) => { x.beginPath(); for (let a = 0; a < turns; a += 0.15) { const rr = s * (1 - a / (turns + 1)); x.lineTo(cx + Math.cos(a) * rr * flip, cy + Math.sin(a) * rr); } x.stroke(); };
  // filigree border band: solid copper with cut-out scrolls (cut later), inner arch window
  x.fillRect(0, 0, W, Hh);
  const AX0 = 46, AX1 = W - 46, AY = 70, SPR = 210, BOT = Hh - 34, MID = Hh * 0.58;
  const archPath = () => { x.beginPath(); x.moveTo(AX0, BOT); x.lineTo(AX0, SPR); x.bezierCurveTo(AX0, AY + 10, W / 2 - 80, AY, W / 2, AY); x.bezierCurveTo(W / 2 + 80, AY, AX1, AY + 10, AX1, SPR); x.lineTo(AX1, BOT); x.closePath(); };
  x.globalCompositeOperation = 'destination-out'; x.lineWidth = 6;
  for (let i = 0; i < 8; i++) spiral(28 + i * 61, 26 + (i % 2) * 6, 17, i % 2 ? 1 : -1, 7);
  for (let k = 0; k < 13; k++) for (const sx of [22, W - 22]) spiral(sx, 90 + k * 56, 13, sx < W / 2 ? 1 : -1, 6);
  for (const [cx, cy, f] of [[80, 70, 1], [W - 80, 70, -1], [120, 45, -1], [W - 120, 45, 1]]) spiral(cx, cy, 22, f);
  archPath(); x.fill();
  x.globalCompositeOperation = 'source-over'; x.lineWidth = 12; archPath(); x.stroke();
  x.fillRect(W / 2 - 6, AY, 12, BOT - AY); x.fillRect(AX0, MID - 6, AX1 - AX0, 12); x.fillRect(AX0, BOT - 4, AX1 - AX0, 40);
  // TL: genie lamp on dunes, smoke swirl, crescent moon
  x.beginPath(); x.ellipse(130, 330, 48, 20, 0, 0, 7); x.fill(); x.beginPath(); x.moveTo(170, 325); x.quadraticCurveTo(205, 318, 222, 290); x.lineTo(228, 296); x.quadraticCurveTo(210, 334, 172, 342); x.fill();
  x.lineWidth = 7; x.beginPath(); x.arc(78, 328, 16, 1.2, 5.2); x.stroke(); x.beginPath(); x.moveTo(110, 312); x.lineTo(130, 285); x.lineTo(150, 312); x.fill(); x.beginPath(); x.arc(130, 282, 5, 0, 7); x.fill();
  x.lineWidth = 6; x.beginPath(); x.moveTo(226, 286); x.bezierCurveTo(240, 250, 190, 240, 200, 205); x.bezierCurveTo(210, 175, 175, 160, 185, 130); x.stroke(); spiral(185, 125, 14, 1, 6);
  x.beginPath(); x.arc(92, 160, 22, 0, 7); x.fill(); x.globalCompositeOperation = 'destination-out'; x.beginPath(); x.arc(104, 152, 19, 0, 7); x.fill(); x.globalCompositeOperation = 'source-over';
  for (let k = 0; k < 3; k++) { x.beginPath(); x.moveTo(AX0, 395 + k * 40); for (let xx = AX0; xx <= W / 2; xx += 6) x.lineTo(xx, 395 + k * 40 + Math.sin(xx * 0.03 + k * 1.7) * 14); x.lineTo(W / 2, 395 + k * 40 + 14); x.lineTo(AX0, 395 + k * 40 + 14); x.fill(); }
  // TR: scallop shell over curling waves
  const sx = W * 0.74, sy = 330; x.beginPath(); x.moveTo(sx, sy + 50); x.arc(sx, sy + 50, 70, PI * 1.08, PI * 1.92); x.closePath(); x.fill();
  x.globalCompositeOperation = 'destination-out'; x.lineWidth = 5; for (let k = 0; k < 7; k++) { const a = PI * 1.14 + k * PI * 0.105; x.beginPath(); x.moveTo(sx + Math.cos(a) * 14, sy + 50 + Math.sin(a) * 14); x.lineTo(sx + Math.cos(a) * 66, sy + 50 + Math.sin(a) * 66); x.stroke(); }
  x.globalCompositeOperation = 'source-over'; x.fillRect(sx - 14, sy + 44, 28, 14);
  x.lineWidth = 7; for (const [cx, cy, f] of [[W / 2 + 60, 190, 1], [W - 90, 160, -1], [W / 2 + 110, 235, 1]]) spiral(cx, cy, 24, f, 7);
  for (let k = 0; k < 2; k++) { x.beginPath(); x.moveTo(W / 2 + 6, 420 + k * 34); for (let xx = W / 2 + 6; xx <= AX1; xx += 6) x.lineTo(xx, 420 + k * 34 + Math.sin(xx * 0.05 + k) * 10); x.lineTo(AX1, 434 + k * 34); x.lineTo(W / 2 + 6, 434 + k * 34); x.fill(); }
  // BL: castle with spires between pine trees, snowflake below
  const by = MID + 170; x.fillRect(92, by - 70, 70, 70); for (const [tx, th] of [[92, 60], [127, 95], [150, 70]]) { x.fillRect(tx, by - 70 - th + 30, 16, th); x.beginPath(); x.moveTo(tx - 4, by - 70 - th + 30); x.lineTo(tx + 8, by - 70 - th - 6); x.lineTo(tx + 20, by - 70 - th + 30); x.fill(); }
  for (const [tx, th] of [[66, 80], [190, 100], [214, 70]]) { x.beginPath(); x.moveTo(tx, by - th); x.lineTo(tx + 22, by); x.lineTo(tx - 22, by); x.fill(); }
  x.fillRect(AX0, by, W / 2 - AX0, 14);
  x.lineWidth = 7; for (let k = 0; k < 3; k++) { const a = k * PI / 3; x.beginPath(); x.moveTo(140 - Math.cos(a) * 42, by + 95 - Math.sin(a) * 42); x.lineTo(140 + Math.cos(a) * 42, by + 95 + Math.sin(a) * 42); x.stroke(); }
  for (let k = 0; k < 6; k++) { const a = k * PI / 3, cx = 140 + Math.cos(a) * 26, cy = by + 95 + Math.sin(a) * 26; for (const s of [-1, 1]) { x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx + Math.cos(a + s * 0.7) * 13, cy + Math.sin(a + s * 0.7) * 13); x.stroke(); } }
  // BR: apple tree with a big apple below
  const ax = W * 0.74; x.beginPath(); x.arc(ax, MID + 110, 62, 0, 7); x.fill(); x.fillRect(ax - 9, MID + 160, 18, 60);
  x.globalCompositeOperation = 'destination-out'; for (let k = 0; k < 9; k++) { x.beginPath(); x.arc(ax + (r() - 0.5) * 80, MID + 110 + (r() - 0.5) * 80, 6 + r() * 6, 0, 7); x.fill(); }
  x.globalCompositeOperation = 'source-over'; x.beginPath(); x.arc(ax - 18, MID + 262, 34, 0, 7); x.arc(ax + 18, MID + 262, 34, 0, 7); x.fill(); x.lineWidth = 6; x.beginPath(); x.moveTo(ax, MID + 232); x.lineTo(ax + 6, MID + 210); x.stroke();
  x.beginPath(); x.ellipse(ax + 22, MID + 214, 14, 7, -0.5, 0, 7); x.fill();
  // compose: colour (mottled copper on black), bump, emissive (quadrant colour in the cut-outs)
  const col = mk(), c = col.getContext('2d'); c.fillStyle = '#0d0b0a'; c.fillRect(0, 0, W, Hh);
  const cu = mk(), u = cu.getContext('2d'); u.drawImage(L, 0, 0); u.globalCompositeOperation = 'source-in'; u.fillStyle = '#74462a'; u.fillRect(0, 0, W, Hh);
  u.globalCompositeOperation = 'source-atop'; for (let i = 0; i < 900; i++) { u.fillStyle = r() < 0.5 ? `rgba(30,18,10,${0.15 + r() * 0.3})` : `rgba(190,120,70,${0.08 + r() * 0.2})`; u.beginPath(); u.arc(r() * W, r() * Hh, 3 + r() * 14, 0, 7); u.fill(); }
  c.drawImage(cu, 0, 0);
  const bump = mk(), b = bump.getContext('2d'); b.fillStyle = '#000'; b.fillRect(0, 0, W, Hh); b.filter = 'blur(2px)'; b.drawImage(L, 0, 0);
  const emi = mk(), e = emi.getContext('2d'); e.fillStyle = '#000'; e.fillRect(0, 0, W, Hh);
  [['#30d060', 0, 0], ['#3080ff', 1, 0], ['#5a8cff', 0, 1], ['#ff3030', 1, 1]].forEach(([cc, qx, qy]) => { e.fillStyle = cc; e.fillRect(qx ? W / 2 : AX0, qy ? MID : AY, qx ? AX1 - W / 2 : W / 2 - AX0, qy ? BOT - MID : MID - AY); });
  e.globalCompositeOperation = 'destination-out'; e.drawImage(L, 0, 0);
  const T = (cv, srgb) => { const t = releaseCanvas(new THREE.CanvasTexture(cv)); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; };
  return (FAKE_DOOR = new THREE.MeshStandardMaterial({ map: T(col, true), bumpMap: T(bump), bumpScale: 3, emissiveMap: T(emi, true), emissive: 0xffffff, emissiveIntensity: 0.008, metalness: 0.45, roughness: 0.55 }));
}
// one navy-velvet atlas for the 5 Frozen Kingdom banners (column = symbol), so they share a material and batch
let BANNER_ATLAS = null;
function bannerAtlas() {
  if (BANNER_ATLAS) return BANNER_ATLAS;
  const CW = 128, W = CW * 5, H = 512, cv = document.createElement('canvas'); cv.width = W; cv.height = H; const c = cv.getContext('2d'), r = rng('banners');
  c.fillStyle = '#1b2340'; c.fillRect(0, 0, W, H);
  for (let i = 0; i < 260; i++) { c.fillStyle = r() < 0.5 ? 'rgba(10,14,30,0.35)' : 'rgba(60,72,120,0.18)'; c.fillRect(r() * W, 0, 1 + r() * 3, H); }
  c.fillStyle = c.strokeStyle = '#eef2f6'; c.lineCap = c.lineJoin = 'round';
  const draw = [
    (x, y) => { c.lineWidth = 6; for (let k = 0; k < 6; k++) { const a = k * PI / 3; c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * 44, y + Math.sin(a) * 44); c.stroke(); for (const d of [20, 32]) for (const s of [-1, 1]) { c.beginPath(); c.moveTo(x + Math.cos(a) * d, y + Math.sin(a) * d); c.lineTo(x + Math.cos(a) * d + Math.cos(a + s * 0.8) * 12, y + Math.sin(a) * d + Math.sin(a + s * 0.8) * 12); c.stroke(); } } },
    (x, y) => { c.lineWidth = 5; c.beginPath(); c.arc(x, y - 14, 22, 0, 7); c.fill(); c.strokeStyle = '#1b2340'; c.lineWidth = 3; for (let k = 0; k < 3; k++) { c.beginPath(); c.arc(x + 2, y - 15, 6 + k * 6, k, k + 4.2); c.stroke(); } c.strokeStyle = '#eef2f6'; c.lineWidth = 5; c.beginPath(); c.moveTo(x, y + 8); c.quadraticCurveTo(x + 6, y + 30, x - 2, y + 54); c.stroke(); for (const s of [-1, 1]) { c.beginPath(); c.ellipse(x + s * 13, y + 30, 11, 5, s * 0.5, 0, 7); c.fill(); } },
    (x, y) => { for (const s of [-1, 1]) { c.lineWidth = 7; c.beginPath(); c.moveTo(x - s * 34, y + 40); c.quadraticCurveTo(x - s * 10, y - 4, x + s * 30, y - 40); c.stroke(); c.lineWidth = 6; c.beginPath(); c.moveTo(x - s * 40, y + 28); c.lineTo(x - s * 24, y + 46); c.stroke(); c.beginPath(); c.arc(x - s * 38, y + 46, 5, 0, 7); c.fill(); } },
    (x, y) => { c.beginPath(); c.ellipse(x, y + 6, 11, 22, 0, 0, 7); c.fill(); c.beginPath(); c.arc(x, y - 22, 9, 0, 7); c.fill(); c.beginPath(); c.moveTo(x + 6, y - 24); c.lineTo(x + 16, y - 20); c.lineTo(x + 6, y - 16); c.fill();
      for (const s of [-1, 1]) { c.beginPath(); c.moveTo(x, y - 6); c.lineTo(x + s * 54, y - 32); for (let k = 0; k < 4; k++) { c.lineTo(x + s * (50 - k * 11), y - 8 + k * 4); c.lineTo(x + s * (44 - k * 11), y - 16 + k * 5); } c.lineTo(x + s * 8, y + 10); c.fill(); }
      c.beginPath(); c.moveTo(x - 10, y + 24); c.lineTo(x, y + 46); c.lineTo(x + 10, y + 24); c.fill(); },
    (x, y) => { c.beginPath(); c.moveTo(x - 12, y); c.quadraticCurveTo(x, y + 44, x + 12, y); c.quadraticCurveTo(x, y - 12, x - 12, y); c.fill(); for (const s of [-1, 1]) { c.beginPath(); c.ellipse(x + s * 14, y - 4, 10, 4, s * 0.6, 0, 7); c.fill(); }
      c.lineWidth = 5; for (const s of [-1, 1]) { c.beginPath(); c.moveTo(x + s * 6, y - 6); c.quadraticCurveTo(x + s * 18, y - 30, x + s * 14, y - 54); c.stroke(); for (const [t, a] of [[0.35, 1], [0.6, 0.6], [0.85, 1]]) { const px = x + s * (6 + t * 10), py = y - 6 - t * 46; c.beginPath(); c.moveTo(px, py); c.lineTo(px + s * 16 * a, py - 8); c.stroke(); } } },
  ];
  draw.forEach((fn, i) => fn(i * CW + CW / 2, H * 0.37));
  const t = releaseCanvas(new THREE.CanvasTexture(cv)); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return (BANNER_ATLAS = new THREE.MeshStandardMaterial({ map: t, roughness: 0.95 })); // back faces the wall: front side only
}
// Ice Queen portrait (photo album_065): queen in a pale-blue gown with an ice crown before a frozen castle
function portraitMat() {
  return canvasMat(160, 240, (c, W, H) => {
    const gr = c.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#9fd0ee'); gr.addColorStop(0.6, '#5d8fbf'); gr.addColorStop(1, '#2f4f78'); c.fillStyle = gr; c.fillRect(0, 0, W, H);
    c.fillStyle = 'rgba(230,245,255,0.45)'; for (const [x, w, h] of [[18, 14, 90], [40, 10, 60], [124, 14, 96], [142, 10, 64]]) { c.fillRect(x, H * 0.62 - h, w, h); c.beginPath(); c.moveTo(x - 3, H * 0.62 - h); c.lineTo(x + w / 2, H * 0.62 - h - 20); c.lineTo(x + w + 3, H * 0.62 - h); c.fill(); }
    c.fillStyle = '#eaf4fb'; c.beginPath(); c.moveTo(W * 0.18, H); c.quadraticCurveTo(W * 0.3, H * 0.55, W * 0.42, H * 0.42); c.lineTo(W * 0.58, H * 0.42); c.quadraticCurveTo(W * 0.7, H * 0.55, W * 0.82, H); c.fill();
    c.fillStyle = '#7fb2de'; c.beginPath(); c.moveTo(W * 0.28, H); c.quadraticCurveTo(W * 0.4, H * 0.6, W * 0.5, H * 0.45); c.quadraticCurveTo(W * 0.6, H * 0.6, W * 0.72, H); c.fill();
    c.fillStyle = '#f4f0e8'; c.beginPath(); c.moveTo(W * 0.36, H * 0.2); c.quadraticCurveTo(W * 0.28, H * 0.42, W * 0.34, H * 0.56); c.lineTo(W * 0.66, H * 0.56); c.quadraticCurveTo(W * 0.72, H * 0.42, W * 0.64, H * 0.2); c.fill();
    c.fillStyle = '#f6e6dc'; c.beginPath(); c.ellipse(W / 2, H * 0.28, W * 0.1, H * 0.085, 0, 0, 7); c.fill(); c.fillRect(W * 0.46, H * 0.34, W * 0.08, H * 0.06);
    c.fillStyle = '#3a5a8a'; c.fillRect(W * 0.45, H * 0.27, 4, 2); c.fillRect(W * 0.53, H * 0.27, 4, 2); c.fillStyle = '#b06070'; c.fillRect(W * 0.48, H * 0.32, 8, 2);
    c.fillStyle = '#dff6ff'; for (let i = 0; i < 7; i++) { const x = W * 0.38 + i * W * 0.04, h = 12 + (3 - Math.abs(i - 3)) * 6; c.beginPath(); c.moveTo(x - 4, H * 0.2); c.lineTo(x, H * 0.2 - h); c.lineTo(x + 4, H * 0.2); c.fill(); }
    c.fillStyle = 'rgba(255,255,255,0.8)'; for (let i = 0; i < 24; i++) { c.beginPath(); c.arc((i * 53) % W, (i * 97) % H, 1.5, 0, 7); c.fill(); }
  });
}

BUILDERS.padlock_box = BUILDERS.combo_box;

// Merge every static mesh under `root` that shares a material into one mesh (one draw call
// per material instead of one per primitive). Multi-material meshes are split by group.
// Skips instanced/skinned/morph meshes, mirrored transforms, hidden or renderOrder'd parts
// and anything flagged userData.noMerge. Geometry ends up in root's local space.
const _inv = new THREE.Matrix4();
export function mergeStatic(root) {
  root.updateMatrixWorld(true); _inv.copy(root.matrixWorld).invert();
  const buckets = new Map(), victims = [];
  const shown = (o) => { for (let q = o; q && q !== root; q = q.parent) if (!q.visible) return false; return true; };
  root.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || o.morphTargetInfluences || o.userData.noMerge || o.renderOrder || !shown(o)) return;
    const m = new THREE.Matrix4().multiplyMatrices(_inv, o.matrixWorld); if (m.determinant() <= 0) return;
    const g = o.geometry, multi = Array.isArray(o.material);
    if (multi && !g.groups.length) return;
    const attrs = Object.keys(g.attributes).sort().join(',');
    if (!g.attributes.position || g.morphAttributes.position) return;
    const parts = multi ? g.groups.map((gr) => [o.material[gr.materialIndex], gr]) : [[o.material, null]];
    if (parts.some(([mat]) => !mat)) return;
    for (const [mat, gr] of parts) {
      const key = mat.uuid + '|' + attrs + '|' + o.castShadow + o.receiveShadow;
      let b = buckets.get(key); if (!b) buckets.set(key, (b = { mat, items: [], cast: o.castShadow, recv: o.receiveShadow }));
      b.items.push({ g, gr, m });
    }
    victims.push(o);
  });
  if (!victims.length) return root;
  for (const b of buckets.values()) {
    const geos = b.items.map(({ g, gr, m }) => {
      const c = new THREE.BufferGeometry();
      for (const k in g.attributes) c.setAttribute(k, g.attributes[k].clone());
      const n = g.attributes.position.count, src = g.index ? g.index.array : null;
      const start = gr ? gr.start : 0, count = gr ? gr.count : (src ? src.length : n), idx = new Uint32Array(count);
      for (let i = 0; i < count; i++) idx[i] = src ? src[start + i] : start + i;
      c.setIndex(new THREE.BufferAttribute(idx, 1)); c.applyMatrix4(m); return c;
    });
    const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
    for (const geo of merged ? [merged] : geos) { // incompatible attributes: keep them as separate (already transformed) meshes
      const mesh = new THREE.Mesh(geo, b.mat); mesh.castShadow = b.cast; mesh.receiveShadow = b.recv; mesh.userData.merged = true; root.add(mesh);
    }
  }
  for (const o of victims) o.removeFromParent();
  return root;
}

// Cross-prop batching: every opaque static mesh whose material is used by 2+ props is merged
// into one world-space mesh under `root` (one draw call per material for the whole game).
// The per-prop originals move to PICK_LAYER: no longer rendered, still raycastable
// (the picking raycaster enables that layer), so selection/hover keep working per prop.
export const PICK_LAYER = 1;
const noRaycast = () => {};
export function batchStatic(root, objs) {
  root.updateMatrixWorld(true); _inv.copy(root.matrixWorld).invert();
  const buckets = new Map();
  for (const obj of objs) {
    if (!obj.visible) continue;
    obj.traverse((o) => {
      if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || Array.isArray(o.material) || o.material.transparent || o.userData.noMerge || o.renderOrder) return;
      for (let q = o; q && q !== obj; q = q.parent) if (!q.visible) return;
      const m = new THREE.Matrix4().multiplyMatrices(_inv, o.matrixWorld); if (m.determinant() <= 0) return;
      const g = o.geometry; if (g.morphAttributes.position) return;
      const key = o.material.uuid + '|' + Object.keys(g.attributes).sort().join(',') + '|' + (g.index ? 1 : 0);
      let b = buckets.get(key); if (!b) buckets.set(key, (b = { mat: o.material, items: [] }));
      b.items.push({ o, m });
    });
  }
  let n = 0;
  for (const b of buckets.values()) {
    if (b.items.length < 2) continue;
    const geos = b.items.map(({ o, m }) => {
      const g = o.geometry, c = new THREE.BufferGeometry();
      for (const k in g.attributes) c.setAttribute(k, g.attributes[k].clone());
      if (g.index) c.setIndex(g.index.clone());
      return c.applyMatrix4(m);
    });
    const merged = mergeGeometries(geos, false); if (!merged) continue;
    const mesh = new THREE.Mesh(merged, b.mat); mesh.raycast = noRaycast; mesh.userData.batched = true; root.add(mesh);
    for (const { o } of b.items) o.layers.set(PICK_LAYER);
    n++;
  }
  return n;
}

export function buildProp(p) {
  const g = new THREE.Group();
  const fn = BUILDERS[p.kind];
  if (fn) fn(g, p, rng(p.id + p.kind));
  else { box(g, 40, 40, 40, M.unknown, 0, 20, p.mount === 'wall' ? 20 : 0); console.warn('No builder for kind', p.kind, 'prop', p.id); }
  if (!g.userData.animate) mergeStatic(g); // animated props move individual parts: keep those separate
  if (p.nopick) g.traverse((o) => { o.raycast = noRaycast; }); // room-wide dressing: never selectable (would draw a room-sized box)
  if (p.scale) g.scale.setScalar(p.scale);
  return g;
}
