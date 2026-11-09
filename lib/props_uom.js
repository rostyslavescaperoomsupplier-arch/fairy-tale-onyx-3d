// Procedural prop builders - University of Magic (game-specific file; helpers + mergeStatic/batchStatic shared with the Fairy Tale engine). Units: cm.
// Convention: front faces +Z. Floor props are centred on the origin, base at y=0.
// Wall props have their back at z=0 and grow into +Z, base at y=0.
// Ceiling props hang from y=0 downwards.
import * as THREE from 'three';
import { rng, propFinishes, textures, std, QUALITY, causticUniforms, addCaustics } from './materials.js?v=202611091207';
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
const PF = propFinishes(); // lazy: only finishes used below get textures
Object.assign(M, { wood: PF.wood, darkWood: PF.darkWood, lightWood: PF.lightWood, iron: PF.iron, steel: PF.steel, gold: PF.gold, brass: PF.brass,
  bronze: PF.bronze, stone: PF.stone, rope: PF.rope, silver: PF.silver });
Object.assign(M, { birch: PF.birch, edge: S(0x1e1a17), slate: PF.slate, shelfWood: PF.shelfWood, velvetRed: S(0x9c1f2a) });
const BOOK4 = [0xe3262b, 0xe3b04b, 0x5b8fcb, 0xf2f0ea].map((c) => S(c, { roughness: 0.75 }));
function drawers(g, w, n, y0, h, z, mat, knob = M.brass) {
  for (let i = 0; i < n; i++) { const y = y0 + h / 2 + i * h; box(g, w - 4, h - 2, 1, mat, 0, y, z); sph(g, 1.3, knob, 0, y, z + 1); }
}
function speakerBox(g, w = 40) {
  box(g, w, 20, 15, M.birch, 0, 10, 7.5); box(g, w + 0.5, 20.5, 1, M.edge, 0, 10, 0.5);
  for (const x of [-w / 4, w / 4]) { cyl(g, 6, 6, 0.6, M.black, x, 10, 15.1, PI / 2); tor(g, 6, 0.6, M.edge, x, 10, 15.2); }
}


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
  } else if (kind === 'tuft') { // clump of grass blades, base at the bottom edge
    x.fillStyle = '#ffffff'; for (let i = 0; i < 9; i++) { const bx = -40 + i * 10, tx = bx + (i - 4) * 5, ty = -64 + (i % 3) * 14; x.beginPath(); x.moveTo(bx - 4, 64); x.quadraticCurveTo(bx, 0, tx, ty); x.quadraticCurveTo(bx + 2, 0, bx + 4, 64); x.fill(); }
  } else { x.fillStyle = '#ffffff'; x.beginPath(); x.moveTo(0, 60); x.bezierCurveTo(-46, 20, -36, -40, 0, -62); x.bezierCurveTo(36, -40, 46, 20, 0, 60); x.fill(); }
  x.globalCompositeOperation = 'source-atop'; const gr = x.createRadialGradient(0, 0, 4, 0, 0, 70); gr.addColorStop(0, '#ffffff'); gr.addColorStop(1, '#9a9a9a'); x.fillStyle = gr; x.fillRect(-64, -64, 128, 128);
  if (kind !== 'tuft') { x.strokeStyle = 'rgba(255,255,230,0.9)'; x.lineWidth = 2.5; x.beginPath(); x.moveTo(0, 58); x.lineTo(0, -50); x.moveTo(0, 10); x.lineTo(-34, -6); x.moveTo(0, 10); x.lineTo(34, -6); x.stroke(); }
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
export const BUILDERS = {};
// ======================================================================
// University of Magic builders (looks from reference/photos/props.json)
// ======================================================================
const UM = {
  walnut: PF.darkWood, wood: PF.wood, birch: PF.birch, iron: PF.iron, gold: PF.gold, brass: PF.brass, steel: PF.steel, silver: PF.silver,
  stone: PF.stone, slate: PF.slate, rope: PF.rope, shelf: PF.shelfWood, bronze: PF.bronze,
  armour: S(0x50525a, { metalness: 0.6, roughness: 0.3 }), armourDark: S(0x2a2a2e, { metalness: 0.5, roughness: 0.4 }),
  redWood: S(0x6a3424, { roughness: 0.6 }), burnt: S(0x2e2420, { roughness: 0.85 }), charred: S(0x231c18, { roughness: 0.95 }),
  pedestal: S(0x3c3c3e, { roughness: 0.7, metalness: 0.35 }), staveStone: S(0x4a4a4c, { roughness: 0.9 }),
  wax: S(0xf2eee2, { roughness: 0.6 }), waxRed: S(0xa8202a, { roughness: 0.6 }), velvetRed: S(0x8a1c24, { roughness: 1 }),
  velvetPurple: S(0x4a2068, { roughness: 1 }), velvetNavy: S(0x1e3a6a, { roughness: 1, side: THREE.DoubleSide }), leatherMat: S(0x6a3a2a, { roughness: 0.8 }),
  mirror: S(0x5a6674, { metalness: 0.3, roughness: 0.1, emissive: 0x1a222c, emissiveIntensity: 0.5 }), glass: S(0xe8f4ff, { roughness: 0.05, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide }),
  bone: S(0xe3d8bf, { roughness: 0.7 }), black: S(0x141414, { roughness: 0.7 }), porcelain: S(0xf4f2ee, { roughness: 0.35 }),
  pot: S(0x6e6e6c, { roughness: 0.9 }), trunk: S(0x5a5048, { roughness: 0.95, flatShading: true }), soil: S(0x2a1e14, { roughness: 1 }),
  grassTop: S(0x5a8a2a, { roughness: 1 }), plexi: S(0xffffff, { roughness: 0.05, transparent: true, opacity: 0.3, depthWrite: false }),
  string: S(0xf4f4ff, { roughness: 0.6, transparent: true, opacity: 0.55, emissive: 0x6060a0, emissiveIntensity: 0.25, depthWrite: false }),
  cloud: S(0xe4e6f0, { roughness: 1, emissive: 0x6a6a88, emissiveIntensity: 0.45 }),
};
const FLAME = () => flickerMat(0xffb050, 4, 0.28, 9);
const FLOWER_COLS = [0xf07a1e, 0xf2c21e, 0x8a3ac8, 0x3a6ad8, 0xe8406a];
// cached canvas-painted material (paintings, maps, dials); glow > 0 makes it self-lit
const PAINT = new Map();
function paintMat(key, w, h, draw, glow = 0, o = {}) {
  if (PAINT.has(key)) return PAINT.get(key);
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h, rng(key));
  const t = releaseCanvas(new THREE.CanvasTexture(c)); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  const m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.85, ...(glow ? { emissive: 0xffffff, emissiveMap: t, emissiveIntensity: glow } : {}), ...o });
  PAINT.set(key, m); return m;
}
// flat picture plane (front +Z) of w x h centred at (x, y, z)
const picture = (p, w, h, mat, x, y, z) => mesh(new THREE.PlaneGeometry(w, h), mat, p, x, y, z);
// ornate frame: thick moulding + thin inner lip + corner bosses
function ornateFrame(p, w, h, t, mat, x, y, z, d = 5) {
  frame(p, w, h, t, mat, x, y, z + d / 2, d); frame(p, w - t * 2 + 1, h - t * 2 + 1, 1.2, mat, x, y, z + d * 0.6, d * 1.2);
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) sph(p, t * 0.45, mat, x + sx * (w / 2 - t / 2), y + sy * (h / 2 - t / 2), z + d, 1, 1, 0.5);
}
// pointed (gothic) arch outline, base centred at 0
function archShape(w, h, k = 0.55) {
  const s = new THREE.Shape(), r = w / 2, sh = h - w * k;
  s.moveTo(-r, 0); s.lineTo(r, 0); s.lineTo(r, sh); s.quadraticCurveTo(r, h - w * 0.12, 0, h); s.quadraticCurveTo(-r, h - w * 0.12, -r, sh); s.closePath(); return s;
}
const arch = (p, w, h, d, mat, x, y, z) => mesh(new THREE.ExtrudeGeometry(archShape(w, h), { depth: d, bevelEnabled: false, curveSegments: 10 }), mat, p, x, y, z);
function candle(p, x, y, z, r0, h, mat = UM.wax, flame = true) {
  cyl(p, r0, r0, h, mat, x, y + h / 2, z, 0, 0, 0, 12);
  if (flame) { sph(p, r0 * 0.32, FLAME(), x, y + h + r0 * 0.4, z, 1, 1.8, 1); if (flame !== 'noglow') glow(p, x, y + h + r0 * 0.6, z, 9 + r0 * 3, 0xff9a40, 0.22, 8); }
}
function chain(p, a, b, n, mat = UM.steel, R = 1.8) {
  const A = V(a), B = V(b), d = B.clone().sub(A), q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), d.clone().normalize());
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(new THREE.TorusGeometry(R, R * 0.28, 6, 12), mat); m.position.copy(A).addScaledVector(d, (i + 0.5) / n);
    m.quaternion.copy(q); m.rotateX(i % 2 ? PI / 2 : 0); m.scale.set(1.5, 1, 1); p.add(m);
  }
}
function turnedLeg(p, x, z, h, mat) {
  cyl(p, 2.2, 2.6, h, mat, x, h / 2, z, 0, 0, 0, 10);
  for (const f of [0.2, 0.55, 0.85]) sph(p, 3.4, mat, x, h * f, z, 1, 0.7, 1);
}
// laser-cut birch scroll applique (C-scrolls + leaf) on a face, centred at (x, y, z), facing +Z
function scrolls(p, x, y, z, w, mat = UM.birch) {
  for (const s of [-1, 1]) { tor(p, w * 0.13, 0.6, mat, x + s * w * 0.2, y, z, 0, 0, s > 0 ? 0 : PI, PI * 1.4); tor(p, w * 0.07, 0.5, mat, x + s * w * 0.38, y + 1, z, 0, 0, s > 0 ? PI : 0, PI * 1.3); }
  sph(p, w * 0.05, mat, x, y, z, 1.6, 1, 0.3);
}
function flowersAt(p, pts, r, size = 3) {
  for (const [x, y, z] of pts) { const c = S(FLOWER_COLS[Math.floor(r() * FLOWER_COLS.length)], { roughness: 0.7 }); sph(p, size, c, x, y, z, 1, 1, 0.45); sph(p, size * 0.32, S(0xf2d24a), x, y, z + size * 0.3); }
}
// ivy along a list of points (leaves scattered around the polyline)
function ivy(p, pts, n, r, spread = 6, size = 6) {
  const curve = new THREE.CatmullRomCurve3(pts.map(V));
  leaves(p, n, 'ivy', size, (d, i) => { const q = curve.getPoint(r()); d.position.set(q.x + (r() - 0.5) * spread, q.y + (r() - 0.5) * spread, q.z + r() * spread * 0.5); d.rotation.set((r() - 0.5) * 1.2, (r() - 0.5) * 1.2, r() * 6.28); }, IVY_COLS, r);
}
function potion(p, x, y, z, col, h = 10, r0 = 2.6) {
  const m = S(col, { roughness: 0.15, metalness: 0.1, emissive: col, emissiveIntensity: 0.25 });
  cyl(p, r0, r0, h * 0.6, m, x, y + h * 0.3, z, 0, 0, 0, 12); sph(p, r0 * 1.15, m, x, y + h * 0.15 + r0 * 0.4, z, 1, 0.8, 1);
  cyl(p, r0 * 0.45, r0 * 0.45, h * 0.35, m, x, y + h * 0.75, z, 0, 0, 0, 8); cyl(p, r0 * 0.5, r0 * 0.5, 1.5, UM.wood, x, y + h * 0.95, z, 0, 0, 0, 8);
}
const crystal = (p, x, y, z, s, col) => { const m = mesh(new THREE.OctahedronGeometry(s, 0), S(col, { roughness: 0.1, emissive: col, emissiveIntensity: 0.35 }), p, x, y + s, z); m.scale.set(0.6, 1.4, 0.6); };
function trunkGeo(R, H, seed) {
  const g = new THREE.CylinderGeometry(R * 0.85, R * 1.15, H, 30, 16), pos = g.attributes.position, a = seed;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), ang = Math.atan2(z, x);
    const k = 1 + 0.09 * Math.sin(ang * 7 + a + y * 0.02) + 0.05 * Math.sin(ang * 17 - y * 0.05) + 0.04 * Math.cos(y * 0.11 + ang * 3);
    pos.setXYZ(i, x * k, y, z * k);
  }
  g.translate(0, H / 2, 0); g.computeVertexNormals(); return g;
}
const spellRunes = ['spiral', 'v', 'leaf', 'bolt', 'wave', 'eye'];

// ---------- glow + flicker (GPU-side, driven by the engine's shared clock causticUniforms.uTime) ----------
// glow(p, x, y, z, size, color, amp, speed): soft additive billboard halo. All halos of one prop become ONE
// THREE.Points (one draw call), so props stay static/mergeable (no userData.animate needed).
let GLOW_MAT = null, GLOW_LIST = null;
const _gs = new THREE.Vector2();
function glowMaterial() {
  return GLOW_MAT ??= new THREE.ShaderMaterial({
    uniforms: { uTime: causticUniforms.uTime, uH: { value: 900 } },
    vertexShader: `attribute vec3 gcol; attribute vec4 aux; uniform float uTime; uniform float uH; varying vec3 vC; varying float vA;
      void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
        float w = sin(uTime * aux.w + aux.y) * 0.6 + sin(uTime * aux.w * 2.3 + aux.y * 1.7) * 0.4;
        float f = 1.0 - aux.z * (0.5 + 0.5 * w); vC = gcol; vA = f;
        float k = projectionMatrix[3][3] > 0.5 ? 1.0 : 1.0 / max(1.0, -mv.z);
        gl_PointSize = clamp(aux.x * projectionMatrix[1][1] * uH * 0.5 * k * (0.8 + 0.2 * f), 1.0, 480.0); }`,
    fragmentShader: `varying vec3 vC; varying float vA;
      void main() { vec2 d = gl_PointCoord - 0.5; float r = dot(d, d) * 4.0; if (r > 1.0) discard;
        float a = (exp(-r * 5.0) * 0.85 + exp(-r * 40.0) * 0.6) * (1.0 - r); gl_FragColor = vec4(vC * a * vA, 1.0); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
}
function glow(p, x, y, z, size, color, amp = 0.12, speed = 7) {
  if (GLOW_LIST) GLOW_LIST.push({ o: p, v: new THREE.Vector3(x, y, z), size, c: new THREE.Color(color), amp, speed });
}
// Lazy cross-prop batching for halos: on the first rendered frame every prop's halo Points is baked into one
// Points (world space) - plus one for the walk-only overhead props, parented to an overhead prop so it follows
// its visibility. Result: 2 draw calls for all halos of the game.
let GLOWS_MERGED = false;
function mergeAllGlows(any) {
  GLOWS_MERGED = true;
  let scene = any; while (scene.parent) scene = scene.parent;
  scene.updateMatrixWorld(true);
  const sets = { base: [], over: [] };
  scene.traverse((o) => { if (o.isPoints && o.userData.glowPts) sets[o.userData.overhead ? 'over' : 'base'].push(o); });
  for (const [k, list] of Object.entries(sets)) {
    if (list.length < 2) continue;
    const host = k === 'over' ? list[0].parent : list[0].parent.parent; if (!host) continue;
    const inv = host.matrixWorld.clone().invert(), geos = list.map((o) => o.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld)));
    const merged = mergeGeometries(geos, false); if (!merged) continue;
    const pts = new THREE.Points(merged, glowMaterial()); pts.raycast = () => {}; pts.renderOrder = 2; pts.frustumCulled = false;
    pts.onBeforeRender = list[0].onBeforeRender; host.add(pts);
    list.forEach((o) => { o.visible = false; });
  }
}
function flushGlows(root, list, overhead = false) {
  if (!list.length) return;
  root.updateMatrixWorld(true); const inv = root.matrixWorld.clone().invert(), n = list.length;
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), aux = new Float32Array(n * 4);
  list.forEach((e, i) => {
    const v = e.v.clone().applyMatrix4(e.o.matrixWorld).applyMatrix4(inv); pos.set([v.x, v.y, v.z], i * 3);
    col.set([e.c.r, e.c.g, e.c.b], i * 3); aux.set([e.size, (v.x * 0.37 + v.z * 0.61 + v.y * 0.13) % 6.283, e.amp, e.speed], i * 4);
  });
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('gcol', new THREE.BufferAttribute(col, 3)); g.setAttribute('aux', new THREE.BufferAttribute(aux, 4));
  const pts = new THREE.Points(g, glowMaterial()); pts.raycast = () => {}; pts.renderOrder = 2; pts.userData.noMerge = true;
  pts.userData.glowPts = true; pts.userData.overhead = overhead;
  pts.onBeforeRender = (r) => { r.getDrawingBufferSize(_gs); GLOW_MAT.uniforms.uH.value = _gs.y; if (!GLOWS_MERGED) mergeAllGlows(pts); };
  root.add(pts);
}
// emissive flicker patch for flame meshes (phase from world position, so merged flames still flicker independently)
function flickerMat(color, k = 4, amp = 0.3, speed = 9) {
  const key = 'flk' + color + k + amp + speed;
  if (PAINT.has(key)) return PAINT.get(key);
  const m = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: k, roughness: 0.4 });
  const uAmp = { value: amp }, uSpd = { value: speed };
  m.onBeforeCompile = (sh) => { // one shared program for every flicker material: amp/speed are uniforms
    sh.uniforms.uTime = causticUniforms.uTime; sh.uniforms.uAmp = uAmp; sh.uniforms.uSpd = uSpd;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vFW;')
      .replace('#include <fog_vertex>', '#include <fog_vertex>\nvFW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vFW; uniform float uTime; uniform float uAmp; uniform float uSpd;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      { float ph = floor(vFW.x * 0.25) * 1.7 + floor(vFW.z * 0.25) * 2.3 + floor(vFW.y * 0.25) * 0.9;
        totalEmissiveRadiance *= 1.0 - uAmp * (0.5 + 0.5 * sin(uTime * uSpd + ph) * sin(uTime * uSpd * 1.93 + ph * 1.3)); }`);
  };
  m.customProgramCacheKey = () => 'umFlicker';
  PAINT.set(key, m); return m;
}
// tileable-ish canvas texture material (rugs, sky): repeat wrapping
function rugMat(key, draw, W = 512, H = 320) {
  return paintMat(key, QUALITY.low ? W / 2 : W, QUALITY.low ? H / 2 : H, (c, w, h, r) => { c.save(); if (QUALITY.low) c.scale(0.5, 0.5); draw(c, W, H, r); c.restore(); });
}

// ---------- extra UM materials / helpers (room polish pass) ----------
Object.assign(UM, {
  velvetFold: S(0x1c3672, { roughness: 1, side: THREE.DoubleSide }),
  staveLight: S(0x6e6e70, { roughness: 0.9 }), trunkPlate: S(0x4c443c, { roughness: 0.95, flatShading: true }),
  bandIron: S(0x2c2a28, { metalness: 0.7, roughness: 0.5, side: THREE.DoubleSide }),
  pebble: S(0xe8e6e0, { roughness: 0.8, flatShading: true }), crystalBall: S(0xcfe0ff, { roughness: 0.05, metalness: 0.1, emissive: 0x3a5a8a, emissiveIntensity: 0.45 }),
  paperFringe: S(0xe8dcc0, { roughness: 1 }), skyWhite: S(0xe8ecf2, { roughness: 0.9, emissive: 0xc8d4e2, emissiveIntensity: 0.08 }),
});
let WELL_WATER = null, FOUNTAIN_WATER = null;
// gothic arch plate with 0..1 UVs (painted materials)
function archPlate(p, w, h, d, mat, x, y, z, k = 0.55) {
  const g2 = new THREE.ExtrudeGeometry(archShape(w, h, k), { depth: d, bevelEnabled: false, curveSegments: 12 });
  const uv = g2.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) + w / 2) / w, uv.getY(i) / h); g2.userData.uvScaled = true;
  return mesh(g2, mat, p, x, y, z);
}
// arch-shaped frame ring: outer w x h, bar t
function archRing(p, w, h, t, d, mat, x, y, z) {
  const s = archShape(w, h), inner = archShape(w - 2 * t, h - t * 1.7).getPoints(12).map((q) => new THREE.Vector2(q.x, q.y + t));
  s.holes.push(new THREE.Path(inner.reverse()));
  return mesh(new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false, curveSegments: 12 }), mat, p, x, y, z);
}
// bead moulding along a w x h rectangle (inset from the edge)
const BEAD = new THREE.SphereGeometry(1, 8, 6);
function beadFrame(p, w, h, r, mat, x, y, z, step = 4) {
  const put = (bx, by) => { const m = mesh(BEAD, mat, p, bx, by, z); m.scale.setScalar(r); };
  for (let k = 0, n = Math.round(w / step); k <= n; k++) { put(x - w / 2 + k * w / n, y - h / 2); put(x - w / 2 + k * w / n, y + h / 2); }
  for (let k = 1, n = Math.round(h / step); k < n; k++) { put(x - w / 2, y - h / 2 + k * h / n); put(x + w / 2, y - h / 2 + k * h / n); }
}
const mirrorSheen = () => paintMat('mirrorSheen', 64, 256, (c, W, H) => {
  const gr = c.createLinearGradient(0, H, W, 0); gr.addColorStop(0, '#1e242c'); gr.addColorStop(0.42, '#5a6a7a'); gr.addColorStop(0.52, '#b4c2ce'); gr.addColorStop(0.6, '#56677a'); gr.addColorStop(0.78, '#2e3844'); gr.addColorStop(1, '#4a5868');
  c.fillStyle = gr; c.fillRect(0, 0, W, H); c.fillStyle = 'rgba(42,168,255,0.18)'; c.fillRect(0, H * 0.55, W, H * 0.45);
}, 0.4, { metalness: 0.3, roughness: 0.12 });
// planet glyph atlas (3x3) for the planetary table tokens
const PLANET_GLYPHS = ['☉', '☽', '☿', '♀', '♂', '♃', '♄', '♅', '♆'];
function glyphToken(p, x, y, z, rad, i) {
  const atlas = paintMat('planetGlyphs', 384, 384, (c, W) => {
    const S3 = W / 3; c.textAlign = 'center'; c.textBaseline = 'middle';
    for (let k = 0; k < 9; k++) {
      const cx = (k % 3) * S3 + S3 / 2, cy = Math.floor(k / 3) * S3 + S3 / 2, gr = c.createRadialGradient(cx, cy, 8, cx, cy, S3 / 2);
      gr.addColorStop(0, '#d9b47c'); gr.addColorStop(1, '#6e4a2a'); c.fillStyle = gr; c.fillRect(cx - S3 / 2, cy - S3 / 2, S3, S3);
      c.strokeStyle = '#3a2414'; c.lineWidth = 7; c.beginPath(); c.arc(cx, cy, S3 / 2 - 9, 0, 7); c.stroke();
      c.fillStyle = '#2a170a'; c.font = `bold ${Math.round(S3 * 0.52)}px "Apple Symbols", "Segoe UI Symbol", "DejaVu Sans", serif`; c.fillText(PLANET_GLYPHS[k] + '︎', cx, cy + 3);
    }
  });
  cyl(p, rad, rad, 1.2, UM.walnut, x, y + 0.6, z, 0, 0, 0, 16);
  const geo = new THREE.CircleGeometry(rad, 20), uv = geo.attributes.uv, col = i % 3, row = Math.floor(i / 3);
  for (let k = 0; k < uv.count; k++) uv.setXY(k, (col + uv.getX(k)) / 3, 1 - (row + 1) / 3 + uv.getY(k) / 3);
  mesh(geo, atlas, p, x, y + 1.25, z, -PI / 2);
}
Object.assign(BUILDERS, {
  // 00 Memory Well: hexagonal distressed pedestal with grey handprints, swirling glowing blue basin (caustics on the engine
  // clock), ~20 pillar candles, triple gothic mirror (sheen, black tracery frames, roundel crests), dark shrub, crystal ball
  memory_well(g, p, r) {
    const H = 100, R = 24, zc = 6;
    const side = paintMat('wellSide', 512, 128, (c, W, Hh, q) => {
      c.fillStyle = '#3c3c3e'; c.fillRect(0, 0, W, Hh);
      for (let i = 0; i < 350; i++) { c.fillStyle = `rgba(${q() < 0.5 ? '18,18,20' : '128,124,116'},${q() * 0.25})`; c.fillRect(q() * W, q() * Hh, 2 + q() * 16, 1 + q() * 3); }
      for (let i = 0; i < 7; i++) {
        const x = (i + 0.2 + q() * 0.6) * W / 7, y = Hh * (0.3 + q() * 0.4); c.fillStyle = 'rgba(176,170,160,0.32)';
        c.beginPath(); c.ellipse(x, y, 6, 8, 0, 0, 7); c.fill();
        for (let f = 0; f < 5; f++) { const a = -2.6 + f * 0.45; c.beginPath(); c.ellipse(x + Math.cos(a) * 11, y + Math.sin(a) * 12, 2, 4.6, a + PI / 2, 0, 7); c.fill(); }
      }
      c.fillStyle = 'rgba(0,0,0,0.45)'; for (let k = 0; k <= 6; k++) c.fillRect(k * W / 6 - 2, 0, 4, Hh);
    });
    cyl(g, R, R, H, side, 0, H / 2, zc, 0, PI / 6, 0, 6);
    cyl(g, R + 2, R + 2, 4, UM.iron, 0, H + 2, zc, 0, PI / 6, 0, 6); cyl(g, R + 1.5, R + 1.5, 6, UM.iron, 0, 3, zc, 0, PI / 6, 0, 6);
    const bz = zc + 6, by = H + 4;
    cyl(g, 13.6, 11, 3, UM.black, 0, by - 1.2, bz, 0, 0, 0, 28);
    WELL_WATER ??= addCaustics(new THREE.MeshStandardMaterial({ color: 0x0a3a7a, emissive: 0x2aa8ff, emissiveIntensity: 1.5, roughness: 0.15 }), 0xffffff, 1.2, 0.2);
    mesh(new THREE.CircleGeometry(12.3, 32), WELL_WATER, g, 0, by + 0.3, bz, -PI / 2);
    tor(g, 12.7, 1.1, UM.iron, 0, by + 0.4, bz, PI / 2);
    tor(g, 6, 0.45, led(0x9fe6ff, 2.2), 0, by + 0.5, bz, PI / 2, 0, 0, PI * 1.3); tor(g, 9, 0.35, led(0x9fe6ff, 2.2), 0, by + 0.5, bz, PI / 2, 0, 1.4, PI * 1.1);
    glow(g, 0, by + 6, bz, 40, 0x0a4ab0, 0.16, 1.4); glow(g, 0, by + 2, bz, 24, 0x5ab8f0, 0.22, 2.3);
    for (let i = 0; i < 5; i++) { const a = r() * 6.28, rr = r() * 9; glow(g, Math.cos(a) * rr, by + 1, bz + Math.sin(a) * rr, 3, 0xe8fbff, 0.9, 2 + r() * 3); }
    for (let i = 0; i < 26; i++) { // pillar candles on the back half of the top
      const a = PI + (r() - 0.5) * PI * 1.3, rad = 10 + r() * 12, x = Math.cos(a) * rad * 1.05, z = zc + Math.sin(a) * rad * 0.75 - 4;
      if (Math.hypot(x, z - bz) < 15.5) continue;
      candle(g, x, by, z, 2.2 + r() * 1.8, 5 + r() * 15, r() < 0.25 ? UM.waxRed : UM.wax);
    }
    tor(g, 2.6, 0.7, UM.brass, 14, by + 0.7, zc + 13, PI / 2); sph(g, 4, UM.crystalBall, 14, by + 4.6, zc + 13); // crystal ball
    const sheen = mirrorSheen();
    const panel = (w, h, x, z, ry) => {
      const q = new THREE.Group(); q.position.set(x, 98, z); q.rotation.y = ry; g.add(q);
      archPlate(q, w + 4, h + 3, 0.8, UM.black, 0, -1.5, -0.4); archPlate(q, w, h, 0.5, sheen, 0, 0, 0.5);
      archRing(q, w + 4, h + 3, 2.4, 1.6, UM.black, 0, -1.5, 1.0);
      const cy = h - w * 0.62; // roundel + quatrefoil tracery in the arch head, transom bar under it
      tor(q, w * 0.28, 0.75, UM.black, 0, cy, 1.8); for (let k = 0; k < 4; k++) tor(q, w * 0.12, 0.5, UM.black, Math.cos(k * PI / 2 + PI / 4) * w * 0.12, cy + Math.sin(k * PI / 2 + PI / 4) * w * 0.12, 1.9);
      box(q, w, 1.4, 1, UM.black, 0, cy - w * 0.36, 1.8);
      cone(q, 1.5, 7, UM.black, 0, h + 4.5, 0.8, 0, 0, 0, 8); sph(q, 1.7, UM.black, 0, h + 1.2, 0.8);
    };
    panel(22, 130, 0, -14.5, 0);
    for (const s of [-1, 1]) panel(18, 118, s * 17.4, -8.6, -s * PI / 4);
    cyl(g, 4, 3, 22, UM.black, -16, H + 4 + 11, zc - 8, 0, 0, 0, 10); // dark willow-like shrub in a vase
    leaves(g, 80, 'leaf', 9, (d) => { const a = r() * PI * 2, h2 = 30 + r() * 70; d.position.set(-16 + Math.cos(a) * (8 + r() * 18), H + 20 + h2, zc - 8 + Math.sin(a) * (6 + r() * 10)); d.rotation.set(r() * 3, r() * 3, r() * 3); }, [0x1e2a32, 0x26342e, 0x2a2a3a], r);
  },
  framed_mirror(g, p) { const w = p.w || 35; arch(g, w, w * 2, 0.6, UM.mirror, 0, 0, 1.5); arch(g, w + 4, w * 2 + 4, 1.4, UM.black, 0, -2, 0); },
  // 01 wand case: console table with birch scrolls + glass-lid case with red velvet and 6 wands
  wand_case(g, p, r) {
    const w = p.w || 66, d = p.d || 40, h = p.hgt || 75;
    box(g, w, 3, d, UM.walnut, 0, h - 1.5, 0); box(g, w - 6, 10, d - 6, UM.walnut, 0, h - 8, 0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) turnedLeg(g, sx * (w / 2 - 5), sz * (d / 2 - 5), h - 3, UM.walnut);
    scrolls(g, 0, h - 8, d / 2 - 2.9, w * 0.8);
    const cw = w - 6, cd = d - 8, y0 = h;
    box(g, cw, 4, cd, UM.walnut, 0, y0 + 2, 0); box(g, cw - 3, 0.6, cd - 3, UM.velvetRed, 0, y0 + 4.2, 0);
    frame(g, cw, cd, 2, UM.walnut, 0, 0, 0, 7); g.children.slice(-4).forEach((m) => { m.rotation.x = -PI / 2; m.position.set(m.position.x, y0 + 7.5, -m.position.y); });
    box(g, cw - 3, 0.4, cd - 3, UM.glass, 0, y0 + 11, 0);
    for (let i = 0; i < 6; i++) { const x = -cw / 2 + 6 + i * (cw - 12) / 5; rod(g, [x, y0 + 5.2, -cd / 2 + 5], [x + (r() - 0.5) * 3, y0 + 5.2, cd / 2 - 5], 0.6, i % 2 ? UM.walnut : UM.burnt, 0.9); }
    for (let i = 0; i < 3; i++) box(g, 8, 0.4, 7, UM.plexi, -10 + i * 10, y0 + 11.6, 0);
    padlock(g, 0, y0 + 6, cd / 2 + 1.5);
  },
  // 02 Poltergeist: black hexagonal lantern with pillar candle on a scrolled wall bracket, warm halo
  poltergeist_lantern(g) {
    box(g, 6, 14, 1.5, UM.iron, 0, 0, 0.75); tube(g, [[0, 4, 1], [0, 8, 8], [0, 6, 14], [0, 2, 16]], 0.7, UM.iron, 16);
    tor(g, 3, 0.5, UM.iron, 0, -4, 1.6);
    const L = new THREE.Group(); L.position.set(0, -14, 16); g.add(L);
    cyl(L, 9, 9, 26, UM.glass, 0, 13, 0, 0, 0, 0, 6);
    for (let k = 0; k < 6; k++) { const a = k * PI / 3; rod(L, [Math.cos(a) * 9, 0, Math.sin(a) * 9], [Math.cos(a) * 9, 26, Math.sin(a) * 9], 0.5, UM.iron); }
    cyl(L, 10, 10, 2, UM.iron, 0, 1, 0, 0, 0, 0, 6); cyl(L, 10.5, 10.5, 1.5, UM.iron, 0, 26.5, 0, 0, 0, 0, 6);
    cone(L, 10.5, 9, UM.iron, 0, 31.5, 0, 0, 0, 0, 6); tor(L, 2.4, 0.5, UM.iron, 0, 37.5, 0);
    candle(L, 0, 2, 0, 3.6, 13); glow(L, 0, 16, 0, 55, 0xff9030, 0.14, 5);
  },
  // 08 alchemy desk: dark desk, turned legs, birch scrolls, leather mat with an alchemy circle
  alchemy_desk(g, p) {
    const w = p.w || 89, d = p.d || 58, h = 78;
    box(g, w, 3.5, d, UM.walnut, 0, h - 1.75, 0); box(g, w - 6, 12, d - 6, UM.walnut, 0, h - 9.5, 0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) turnedLeg(g, sx * (w / 2 - 5), sz * (d / 2 - 5), h - 3.5, UM.walnut);
    scrolls(g, -w * 0.22, h - 9.5, d / 2 - 2.9, w * 0.4); scrolls(g, w * 0.22, h - 9.5, d / 2 - 2.9, w * 0.4);
    const mat = paintMat('alchemyMat', 256, 192, (c, W, H) => {
      c.fillStyle = '#6a3a2a'; c.fillRect(0, 0, W, H); c.strokeStyle = '#efe4cc'; c.lineWidth = 2.5;
      c.beginPath(); c.arc(W / 2, H / 2, 70, 0, 7); c.stroke(); c.beginPath(); c.arc(W / 2, H / 2, 54, 0, 7); c.stroke();
      c.beginPath(); for (let k = 0; k < 3; k++) { const a = -PI / 2 + k * 2 * PI / 3; c[k ? 'lineTo' : 'moveTo'](W / 2 + Math.cos(a) * 54, H / 2 + Math.sin(a) * 54); } c.closePath(); c.stroke();
      c.beginPath(); c.arc(W / 2, H / 2 + 8, 20, 0, 7); c.stroke();
      for (let k = 0; k < 4; k++) { const a = PI / 4 + k * PI / 2; c.beginPath(); c.arc(W / 2 + Math.cos(a) * 92, H / 2 + Math.sin(a) * 70, 10, 0, 7); c.stroke(); }
    });
    const m = picture(g, w * 0.7, d * 0.75, mat, 0, h + 0.15, 0); m.rotation.x = -PI / 2;
  },
  // 03 potion stand: dark test-tube rack with arched ends, 5 glitter tubes with aluminium caps
  potion_stand(g, p) {
    const w = p.w || 30, d = p.d || 15, cols = [0xb0202a, 0x2a3fa8, 0x2e8a3a, 0x8a7a2a, 0x1a1a1a];
    for (const s of [-1, 1]) { box(g, 1.5, 16, d, UM.walnut, s * (w / 2 - 0.75), 8, 0); cyl(g, d / 2, d / 2, 1.5, UM.walnut, s * (w / 2 - 0.75), 16, 0, 0, 0, PI / 2); }
    box(g, w, 1.2, d, UM.walnut, 0, 0.6, 0); box(g, w, 1.2, d * 0.7, UM.walnut, 0, 11, 0);
    cols.forEach((c, i) => { const x = -w / 2 + 4 + i * (w - 8) / 4, m = S(c, { roughness: 0.3, metalness: 0.4, emissive: c, emissiveIntensity: 0.2 });
      cyl(g, 2, 2, 18, m, x, 10, 0, 0, 0, 0, 12); cyl(g, 2.2, 2.2, 2.4, UM.silver, x, 20, 0, 0, 0, 0, 12); });
  },
  // 10 Celestowl painting = secret door: carved gold frame with bead moulding + crest, horned owl in a violet cosmos holding
  // a book, glowing gold medallion on its chest
  painting_passage(g, p) {
    const w = p.w || 100, h = p.hgt || 180;
    box(g, w - 4, h - 4, 3, UM.walnut, 0, h / 2, -3.5); // door leaf filling the opening
    const art = paintMat('owlPainting2', 320, 576, (c, W, H, r) => {
      const gr = c.createRadialGradient(W * 0.5, H * 0.36, 10, W * 0.5, H * 0.45, H * 0.72);
      gr.addColorStop(0, '#c07ae0'); gr.addColorStop(0.35, '#7a3aa8'); gr.addColorStop(0.7, '#3a1858'); gr.addColorStop(1, '#140a22'); c.fillStyle = gr; c.fillRect(0, 0, W, H);
      for (let i = 0; i < 7; i++) { const x = r() * W, y = r() * H, rr = 30 + r() * 60, n = c.createRadialGradient(x, y, 0, x, y, rr); n.addColorStop(0, `rgba(${r() < 0.5 ? '255,140,220' : '120,160,255'},0.22)`); n.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = n; c.fillRect(x - rr, y - rr, rr * 2, rr * 2); }
      for (let i = 0; i < 340; i++) { c.fillStyle = `rgba(255,255,255,${r() * 0.85})`; const s = r() < 0.06 ? 2.6 : 1.3; c.fillRect(r() * W, r() * H, s, s); }
      const cx = W / 2;
      c.fillStyle = '#2a1a12'; c.beginPath(); c.moveTo(0, H * 0.87); c.quadraticCurveTo(cx, H * 0.81, W, H * 0.89); c.lineTo(W, H * 0.93); c.quadraticCurveTo(cx, H * 0.86, 0, H * 0.92); c.fill(); // branch
      c.fillStyle = '#4a2a1e'; c.fillRect(W * 0.2, H * 0.78, W * 0.6, H * 0.06); c.fillStyle = '#e8d8b0'; c.fillRect(W * 0.22, H * 0.785, W * 0.56, H * 0.012); // book
      c.fillStyle = '#2a2230'; for (const s of [-1, 1]) { c.beginPath(); c.ellipse(cx + s * W * 0.2, H * 0.55, W * 0.17, H * 0.25, s * 0.18, 0, 7); c.fill(); } // wings
      c.fillStyle = '#3a3040'; c.beginPath(); c.ellipse(cx, H * 0.55, W * 0.27, H * 0.27, 0, 0, 7); c.fill(); // body
      c.fillStyle = '#6a5866'; c.beginPath(); c.ellipse(cx, H * 0.6, W * 0.16, H * 0.19, 0, 0, 7); c.fill(); // chest
      c.strokeStyle = 'rgba(40,30,44,0.8)'; c.lineWidth = 2;
      for (let row = 0; row < 9; row++) for (let k = -3; k <= 3; k++) { const x = cx + k * 11 + (row % 2) * 5, y = H * 0.48 + row * 13; if (Math.abs(x - cx) > W * 0.15 - row) continue; c.beginPath(); c.moveTo(x - 4, y - 3); c.lineTo(x, y + 2); c.lineTo(x + 4, y - 3); c.stroke(); }
      c.strokeStyle = 'rgba(120,100,120,0.55)'; c.lineWidth = 1.6;
      for (const s of [-1, 1]) for (let i = 0; i < 14; i++) { const y = H * 0.38 + i * 15; c.beginPath(); c.moveTo(cx + s * W * 0.08, y); c.quadraticCurveTo(cx + s * W * 0.3, y + 10, cx + s * W * 0.34, y + 30); c.stroke(); }
      c.fillStyle = '#3a3040'; c.beginPath(); c.ellipse(cx, H * 0.27, W * 0.25, H * 0.115, 0, 0, 7); c.fill(); // head
      for (const s of [-1, 1]) { c.beginPath(); c.moveTo(cx + s * W * 0.14, H * 0.2); c.lineTo(cx + s * W * 0.26, H * 0.08); c.lineTo(cx + s * W * 0.22, H * 0.21); c.fill(); } // ear tufts
      c.fillStyle = '#5a4a58'; for (const s of [-1, 1]) { c.beginPath(); c.arc(cx + s * 26, H * 0.27, 21, 0, 7); c.fill(); } // facial disc
      for (const s of [-1, 1]) { const e = c.createRadialGradient(cx + s * 26, H * 0.27, 2, cx + s * 26, H * 0.27, 13); e.addColorStop(0, '#fff2a0'); e.addColorStop(0.6, '#ffc030'); e.addColorStop(1, '#c86a10'); c.fillStyle = e; c.beginPath(); c.arc(cx + s * 26, H * 0.27, 13, 0, 7); c.fill();
        c.fillStyle = '#0a0a0a'; c.beginPath(); c.arc(cx + s * 26, H * 0.27, 5.5, 0, 7); c.fill(); c.fillStyle = '#fff'; c.fillRect(cx + s * 26 - 3, H * 0.27 - 4, 2.4, 2.4); }
      c.fillStyle = '#c89a40'; c.beginPath(); c.moveTo(cx - 6, H * 0.3); c.lineTo(cx + 6, H * 0.3); c.lineTo(cx, H * 0.345); c.fill();
      c.fillStyle = '#2a2018'; for (const s of [-1, 1]) for (let t = 0; t < 3; t++) { c.beginPath(); c.ellipse(cx + s * (22 + t * 7), H * 0.79, 2.4, 6, s * 0.4, 0, 7); c.fill(); } // talons
      c.strokeStyle = '#ffcf6a'; c.lineWidth = 2; c.beginPath(); c.moveTo(cx - 30, H * 0.34); c.lineTo(cx, H * 0.5); c.lineTo(cx + 30, H * 0.34); c.stroke(); // chain
      const m = c.createRadialGradient(cx, H * 0.53, 2, cx, H * 0.53, 34); m.addColorStop(0, 'rgba(255,230,140,0.9)'); m.addColorStop(1, 'rgba(255,180,60,0)'); c.fillStyle = m; c.fillRect(cx - 40, H * 0.53 - 40, 80, 80);
    }, 0.4);
    picture(g, w - 14, h - 14, art, 0, h / 2, 1.5);
    ornateFrame(g, w, h, 7, UM.gold, 0, h / 2, 0, 5);
    beadFrame(g, w - 15, h - 15, 1.1, UM.gold, 0, h / 2, 6.1, 4.5);
    scrolls(g, 0, h + 3, 4, 44, UM.gold); sph(g, 3.2, UM.gold, 0, h + 4, 5, 1, 1.3, 0.6); // crest
    const med = new THREE.Group(); med.position.set(0, h * 0.53, 3.2); g.add(med); // removable owl medallion
    cyl(med, 6, 6, 1, led(0xe0a030, 1.6), 0, 0, 0, PI / 2, 0, 0, 6); tor(med, 6, 0.5, UM.gold, 0, 0, 0.6, 0, 0, 0);
    glow(med, 0, 0, 2, 26, 0xffb040, 0.18, 1.8);
  },
  // 17 Knight's Door: gold-framed purple velvet panel (the door leaf) + 22b-side slat panel lives in token_panel
  knight_door(g, p) {
    const w = p.w || 100, h = 210;
    box(g, w - 6, h - 6, 3, UM.walnut, 0, h / 2, -3.5); // door leaf (plain back seen from the Duelling Room)
    box(g, w - 12, h - 12, 1, UM.velvetPurple, 0, h / 2, 0.5);
    ornateFrame(g, w, h, 6, UM.gold, 0, h / 2, 0, 4);
  },
  // 17b knight in black-steel plate armour on a semicircular wooden base: layered pauldrons, fauld, tassets, ridged
  // breastplate, gorget, closed visored helm; sword planted tip-down in the right gauntlet
  knight_armour(g, p, r) {
    const R = (p.w || 86) / 2, A = UM.armour, E = UM.steel, D = UM.armourDark;
    mesh(new THREE.CylinderGeometry(R, R, 14, 24, 1, false, -PI / 2, PI), UM.walnut, g, 0, 7, -(p.d || 46) / 2 + 2);
    tor(g, R, 0.8, UM.brass, 0, 14, -(p.d || 46) / 2 + 2, PI / 2, 0, 0, PI).rotation.z = 0;
    box(g, 30, 6, 16, UM.walnut, 0, 17, -4);
    const k = new THREE.Group(); k.position.set(0, 20, -2); g.add(k);
    for (const s of [-1, 1]) {
      const x = s * 8;
      rbox(k, 10, 5, 22, 2, A, x, 2.5, 4); for (let i = 0; i < 3; i++) box(k, 10.4, 1, 3.6, E, x, 4.6, -1 + i * 4.4); // sabaton + lames
      cyl(k, 5.4, 4.4, 36, A, x, 24, 0, 0, 0, 0, 12); box(k, 0.8, 32, 1.2, E, x, 24, 5.2); // greave + shin ridge
      sph(k, 6.2, A, x, 45, 1, 1, 0.85, 1.1); sph(k, 5, E, x + s * 4.6, 45, 1.5, 0.3, 1, 0.85); // poleyn + side wing
      cyl(k, 6.8, 5.8, 32, A, x, 65, 0, 0, 0, 0, 12); tor(k, 6.6, 0.5, E, x, 58, 0, PI / 2); tor(k, 6.9, 0.5, E, x, 70, 0, PI / 2); // cuisse
      const t = new THREE.Group(); t.position.set(x * 1.3, 84, 6); t.rotation.set(-0.12, 0, s * 0.12); k.add(t); // tasset
      rbox(t, 13, 17, 3, 1.5, A, 0, -8, 0); for (let i = 0; i < 3; i++) box(t, 13.4, 0.8, 3.4, E, 0, -14 + i * 5.5, 0.2);
      for (let i = 0; i < 3; i++) sph(k, 10.6 - i * 1.5, i % 2 ? E : A, s * (20.5 + i * 1.6), 145 - i * 5.2, 0, 1.12, 0.66, 1.04); // pauldron lames
      cyl(k, 4.6, 4.2, 26, A, s * 24, 122, 0, 0, 0, s * 0.12, 10); tor(k, 4.5, 0.45, E, s * 24.6, 116, 0, PI / 2); // rerebrace
      sph(k, 5, A, s * 26, 106, 1); sph(k, 4.4, E, s * 27.5, 106, -2.5, 0.4, 1, 1); // couter + fan
      cyl(k, 4.2, 3.5, 24, A, s * 27, 92, 4, 0.3, 0, s * 0.05, 10); // vambrace
      rbox(k, 6.5, 8.5, 6, 1.5, D, s * 28, 78, 8); for (let f = 0; f < 4; f++) box(k, 1.3, 5.5, 1.6, D, s * 28 + (f - 1.5) * 1.5, 72, 9.6); // gauntlet
    }
    for (let i = 0; i < 3; i++) cyl(k, 15.6 - i * 0.7, 15.2 - i * 0.7, 4.4, i % 2 ? E : A, 0, 86 + i * 4.2, 0, 0, 0, 0, 18).scale.z = 0.68; // fauld
    cyl(k, 15.4, 15.4, 2.4, UM.leatherMat, 0, 99, 0, 0, 0, 0, 18).scale.z = 0.7; box(k, 5, 4, 1.2, UM.brass, 0, 99, 10.8); // belt
    sph(k, 17, A, 0, 119, 0, 1, 1.12, 0.72); box(k, 1.2, 30, 2, E, 0, 121, 11.4); // breastplate + ridge
    for (let i = 0; i < 3; i++) box(k, 25 - i * 3, 0.9, 2, E, 0, 103 + i * 3.4, 9.6 - i * 0.6);
    cyl(k, 7.5, 9, 6, A, 0, 139, 0, 0, 0, 0, 14); tor(k, 8.4, 0.6, E, 0, 137, 0, PI / 2); tor(k, 7.6, 0.6, E, 0, 141, 0, PI / 2); // gorget
    sph(k, 10.4, A, 0, 154, 0, 0.95, 1.1, 1.08); // helm
    mesh(new THREE.CylinderGeometry(10.6, 10.2, 10, 16, 1, true, -PI * 0.42, PI * 0.84), A, k, 0, 153, 0.6); // visor
    box(k, 13, 1.3, 2, UM.black, 0, 156.5, 10.4); box(k, 13.4, 0.7, 1.4, E, 0, 158, 10.6);
    for (let i = 0; i < 6; i++) box(k, 0.6, 3.2, 1, UM.black, -4 + i * 1.6, 150, 10.6); // breaths
    box(k, 1.4, 3, 20, E, 0, 165, 0); sph(k, 1.6, E, 0, 166.5, 0);
    // sword: tip on the base, hilt in the right gauntlet (the sword recess puzzle)
    const sw = new THREE.Group(); sw.position.set(28, 21, 10); g.add(sw);
    box(sw, 3, 70, 0.6, UM.silver, 0, 35, 0); cone(sw, 1.5, 4, UM.silver, 0, -1.5, 0, PI, 0, 0, 4);
    box(sw, 14, 1.6, 2.2, UM.iron, 0, 71, 0); cyl(sw, 1.1, 1.1, 10, UM.leatherMat, 0, 77, 0, 0, 0, 0, 8); sph(sw, 1.8, UM.brass, 0, 83, 0);
  },
  // 22 Magic Token Stand: lectern post with a slanted top and 3 house-token recesses
  token_stand(g, p) {
    box(g, 30, 70, 18, UM.walnut, 0, 35, -2); for (let i = 0; i < 4; i++) box(g, 6, 68, 0.6, UM.burnt, -11.5 + i * 7.7, 35, 7.2);
    const t = new THREE.Group(); t.position.set(0, 78, 0); t.rotation.x = -0.45; g.add(t);
    box(t, 38, 3, 28, UM.walnut, 0, 0, 0); cyl(t, 15, 15, 0.8, UM.brass, 0, 1.8, 0, 0, 0, 0, 24);
    [[0x4a6ab0, -6.5, -3], [0xb04a3a, 6.5, -3], [0x4a8a3a, 0, 6]].forEach(([c, x, z]) => { cyl(t, 4.8, 4.8, 0.6, UM.black, x, 2.4, z, 0, 0, 0, 16); cyl(t, 4, 4, 1.4, S(c, { emissive: c, emissiveIntensity: 0.25 }), x, 3, z, 0, 0, 0, 16); });
    box(g, 26, 12, 3, UM.walnut, 0, 93, -12); cyl(g, 13, 13, 3, UM.walnut, 0, 99, -12, PI / 2, 0, 0, 20); // crested back
  },
  // 22b wall panel: vertical dark slat board with red/green/blue LED progress chains, plaque above
  token_panel(g, p) {
    const H = 100, W = 28;
    box(g, W, H, 2, UM.burnt, 0, H / 2, 1);
    for (let i = 0; i < 4; i++) box(g, 4.5, H - 4, 2, UM.walnut, -10.5 + i * 7, H / 2, 3);
    [0xff3030, 0x30ff60, 0x3080ff].forEach((c, i) => box(g, 1.2, H - 10, 1, led(c, 2.2), -7 + i * 7, H / 2, 3.2));
    box(g, W + 4, 3, 5, UM.walnut, 0, H + 1.5, 2.5);
    box(g, 30, 7, 2, UM.walnut, 0, H + 14, 1); scrolls(g, 0, H + 14, 2.2, 26, UM.gold);
  },
  // 13 framed Elvish alphabet (A3 print) - parchment with rune pairs
  alphabet_board(g, p) {
    const w = p.w || 33, h = p.hgt || 85;
    const m = paintMat('elvish', 160, 400, (c, W, H, r) => {
      c.fillStyle = '#e8d9b4'; c.fillRect(0, 0, W, H); c.strokeStyle = '#3a2a1a'; c.fillStyle = '#3a2a1a'; c.lineWidth = 2.2;
      c.font = 'bold 22px serif'; c.textAlign = 'center'; c.fillText('ELVISH', W / 2, 28);
      const L = 'ABCDEFGHIJKLMNOPRSTUWYZ'; c.font = '15px serif';
      for (let i = 0; i < L.length; i++) {
        const x = i % 2 ? W * 0.72 : W * 0.24, y = 52 + Math.floor(i / 2) * 29; c.fillText(L[i], x - 24, y + 5);
        c.beginPath(); c.moveTo(x - 4, y - 9); c.lineTo(x - 4 + (r() - 0.5) * 8, y + 9); c.moveTo(x - 4, y - 2 + (r() - 0.5) * 8); c.lineTo(x + 10, y - 6 + r() * 12); c.stroke();
      }
    });
    picture(g, w - 5, h - 5, m, 0, h / 2, 2.2); frame(g, w, h, 3, UM.black, 0, h / 2, 0, 3); box(g, w - 2, h - 2, 1, UM.walnut, 0, h / 2, 0.5);
  },
  // BC: tall walnut glass cabinet, 3 locked compartments (two glazed upper doors + the solid lower double door), the 6
  // magical books (book boxes with gold emblem + silver corners), curios on the top shelf, potions on top
  book_shelf(g, p, r) {
    const w = p.w || 80, d = p.d || 26, h = 190;
    box(g, w, h, 1.5, UM.walnut, 0, h / 2, -d / 2 + 0.75);
    for (const s of [-1, 1]) box(g, 3, h, d, UM.walnut, s * (w / 2 - 1.5), h / 2, 0);
    box(g, w + 4, 5, d + 3, UM.walnut, 0, h - 2.5, 1.5); box(g, w + 2, 6, d + 1, UM.walnut, 0, 3, 0.5); box(g, w - 6, 2, d - 2, UM.walnut, 0, 80, 0);
    box(g, 2, 112, d - 3, UM.walnut, 0, 136, -1); // divider: left/right upper compartments
    for (const y of [118, 152]) box(g, w - 6, 1.5, d - 3, UM.walnut, 0, y, 0);
    const cov = [0x2a4aa8, 0xa8202a, 0x6a2a8a, 0xc85a8a, 0x2a6a3a, 0x8a5a2a];
    cov.forEach((c, i) => { const sh = i < 3 ? 81 : 119.5, x = -w / 2 + 12 + (i % 3) * 9 + (i % 3 > 1 ? w / 2 - 6 : 0), m = S(c, { roughness: 0.6 });
      box(g, 6, 31, 19, m, x, sh + 15.5, 0); box(g, 6.4, 3, 2, UM.silver, x, sh + 28, 9); box(g, 6.4, 3, 2, UM.silver, x, sh + 3, 9);
      cyl(g, 1.7, 1.7, 0.6, UM.gold, x, sh + 15.5, 9.8, PI / 2, 0, 0, 12); box(g, 6.2, 0.8, 0.4, UM.gold, x, sh + 22, 9.7); box(g, 6.2, 0.8, 0.4, UM.gold, x, sh + 9, 9.7); });
    // curios on the top glazed shelf
    tor(g, 3.2, 0.8, UM.brass, -w / 2 + 14, 153.6, 0, PI / 2); sph(g, 5, UM.crystalBall, -w / 2 + 14, 158.6, 0); glow(g, -w / 2 + 14, 158.6, 0, 12, 0x6a9aff, 0.2, 1.5);
    sph(g, 4.6, UM.bone, -6, 157.6, 0, 1, 0.95, 1.15); box(g, 5, 3, 4, UM.bone, -6, 154.3, 3); for (const s of [-1, 1]) sph(g, 1.2, UM.black, -6 + s * 1.8, 157.6, 4.6);
    potion(g, 10, 152.75, 0, 0x2a8a6a, 13, 2.8); potion(g, 18, 152.75, 2, 0xb0402a, 10, 2.2); candle(g, w / 2 - 10, 152.75, 0, 2, 7, UM.wax, 'noglow');
    for (const s of [-1, 1]) { // glazed upper doors (compartments 1 + 2)
      const dx = s * w / 4; box(g, w / 2 - 4, h - 92, 0.5, UM.glass, dx, 81 + (h - 86) / 2, d / 2 - 0.5);
      frame(g, w / 2 - 3, h - 88, 2.5, UM.walnut, dx, 81 + (h - 86) / 2, d / 2 - 1, 2);
      box(g, 1.2, h - 92, 1.5, UM.walnut, dx, 81 + (h - 86) / 2, d / 2); for (const y of [117, 151]) box(g, w / 2 - 6, 1.2, 1.5, UM.walnut, dx, y, d / 2);
      padlock(g, s * 3.5, 128, d / 2 + 1.5);
      box(g, w / 2 - 3, 72, 2, UM.walnut, dx, 42, d / 2 - 0.5); scrolls(g, dx, 48, d / 2 + 0.6, w / 2 - 10); // lower double door (compartment 3)
    }
    box(g, 6, 3, 1, UM.iron, 0, 30, d / 2 + 0.8); padlock(g, 0, 26, d / 2 + 1.8);
    for (let i = 0; i < 6; i++) potion(g, -w / 2 + 8 + i * (w - 16) / 5, h, (r() - 0.5) * 8, [0x8a2a8a, 0x2a8a6a, 0xb0402a, 0x3a5ab0, 0xc8a030, 0x6a2a2a][i], 12 + r() * 8, 2.4 + r());
  },
  // combination box: dark wall code panel, one brass symbol button per code character + lock LED
  combo_box(g, p) {
    const code = (p.name.match(/\[(.+?)\]/) || [, '0000'])[1], n = code.length, W = Math.max(26, 8 + n * 6);
    box(g, W, 26, 7, UM.burnt, 0, 13, 3.5); frame(g, W, 26, 1.8, UM.walnut, 0, 13, 7, 1.2);
    for (let i = 0; i < n; i++) { const x = -((n - 1) * 6) / 2 + i * 6; cyl(g, 2.2, 2.2, 1.2, UM.brass, x, 15, 7.6, PI / 2, 0, 0, 14); box(g, 1.8, 0.6, 0.4, UM.black, x, 15, 8.3); }
    box(g, 6, 3, 1, UM.iron, 0, 6.5, 7.3); sph(g, 0.9, led(0x30ff60, 2), W / 2 - 4, 22, 7.4);
  },
  // chandelier: black wrought-iron 5-arm candle chandelier on a chain
  chandelier(g) {
    chain(g, [0, 0, 0], [0, -38, 0], 9, UM.iron, 1.6);
    cyl(g, 3, 5, 12, UM.iron, 0, -45, 0); sph(g, 3.5, UM.iron, 0, -54, 0);
    for (let i = 0; i < 5; i++) { const a = i * 2 * PI / 5, x = Math.cos(a) * 36, z = Math.sin(a) * 36;
      tube(g, [[0, -50, 0], [x * 0.35, -60, z * 0.35], [x * 0.85, -56, z * 0.85], [x, -46, z]], 0.9, UM.iron, 14);
      tube(g, [[x * 0.3, -52, z * 0.3], [x * 0.55, -44, z * 0.55], [x * 0.6, -48, z * 0.6]], 0.5, UM.iron, 8);
      cyl(g, 3.6, 2.2, 2, UM.iron, x, -45, z); candle(g, x, -44, z, 1.6, 9);
    }
  },
  // painted wall shelf: two dark tiers on S-scroll brackets with potions, candles, crystals, dried lavender
  wall_shelf(g, p, r) {
    const w = p.w || 51;
    for (const [y, dd] of [[0, 18], [32, 14]]) {
      box(g, w, 2.2, dd, UM.shelf, 0, y, dd / 2); box(g, w, 6, 1.2, UM.shelf, 0, y - 3, dd - 0.6);
      for (const s of [-1, 1]) tor(g, 5, 0.7, UM.iron, s * (w / 2 - 6), y - 6, 5, 0, PI / 2, 0, PI * 1.5);
      let x = -w / 2 + 4;
      while (x < w / 2 - 4) { const k = r(); if (k < 0.5) potion(g, x, y + 1.1, dd / 2, [0x8a2a8a, 0x2a8a6a, 0xb0402a, 0x3a5ab0, 0xc8a030][Math.floor(r() * 5)], 9 + r() * 7, 2 + r());
        else if (k < 0.75) candle(g, x, y + 1.1, dd / 2, 2 + r(), 6 + r() * 6); else crystal(g, x, y + 1.1, dd / 2, 2.5, 0xb080ff);
        x += 6 + r() * 4; }
    }
    for (let i = 0; i < 9; i++) rod(g, [w / 2 - 6, 33, 7], [w / 2 - 6 + (r() - 0.5) * 10, 52 + r() * 6, 7 + (r() - 0.5) * 6], 0.3, S(0x8a7acc));
  },
  // 04 garden gate: arched plank door filling the opening (seen from both sides), lattice top, ivy + flowers, peephole
  flower_gate(g, p, r) {
    const w = (p.w || 90) - 2, H = 200, z0 = -5;
    const n = 7; for (let i = 0; i < n; i++) box(g, w / n - 0.6, 158, 4, i % 2 ? UM.walnut : UM.burnt, -w / 2 + (i + 0.5) * w / n, 79, z0);
    for (const y of [25, 130]) box(g, w, 8, 2, UM.walnut, 0, y, z0 + 3); box(g, 6, 110, 2, UM.walnut, 0, 78, z0 + 3, 0, 0, 0.75);
    // lattice arch above 158
    for (const s of [-1, 1]) for (let k = 0; k < 6; k++) box(g, 1.5, 52, 1.5, UM.walnut, -w / 2 + 18 + k * (w - 36) / 5, 179, z0, 0, 0, s * 0.7);
    box(g, w, 2, 4, UM.walnut, 0, 159, z0);
    tor(g, 3.4, 1, UM.brass, 0, 150, z0 + 2.2); cyl(g, 2.6, 2.6, 4.4, UM.black, 0, 150, z0, PI / 2); // peephole
    box(g, 12, 3, 1, UM.iron, w / 2 - 12, 100, z0 + 2.5); padlock(g, w / 2 - 6, 96, z0 + 3.6);
    for (const side of [1, -1]) {
      const zz = z0 + side * 3;
      ivy(g, [[-w / 2, 10, zz], [-w / 2 + 6, 90, zz], [-w / 2 + 2, 170, zz], [0, 196, zz], [w / 2 - 2, 170, zz], [w / 2 - 4, 60, zz]], 90, r, 10, 7);
      const pts = []; for (let i = 0; i < 12; i++) { const t = r(); pts.push(t < 0.5 ? [-w / 2 + 4 + r() * 8, 40 + r() * 140, zz + side * 2] : [-w / 2 + 10 + r() * (w - 20), 168 + r() * 26, zz + side * 2]); }
      flowersAt(g, pts, r, 3.2);
    }
  },
  // 04b flower rack: dark ladder trellis wrapped in ivy with 21 flowers in 4 colours
  flower_rack(g, p, r) {
    const W = 40, H = 150;
    for (const s of [-1, 1]) box(g, 3, H, 3, UM.walnut, s * (W / 2 - 1.5), H / 2, 3);
    for (let i = 0; i < 8; i++) box(g, W, 2, 2, UM.walnut, 0, 8 + i * 19, 4);
    for (const s of [-1, 1]) box(g, 1.5, H * 1.05, 1.5, UM.walnut, 0, H / 2, 5, 0, 0, s * 0.27);
    ivy(g, [[-W / 2, 0, 6], [-W / 4, 50, 7], [-W / 2, 100, 6], [0, H, 7], [W / 2, 100, 6], [W / 4, 40, 7], [W / 2, 0, 6]], 120, r, 9, 6.5);
    const cols = [0xf07a1e, 0xf2c21e, 0x8a3ac8, 0x3a6ad8];
    for (let i = 0; i < 21; i++) { const c = S(cols[i % 4], { roughness: 0.7 }), x = (r() - 0.5) * W, y = 10 + r() * (H - 15);
      sph(g, 3.6, c, x, y, 9, 1, 1, 0.4); sph(g, 1.1, S(0xf2d24a), x, y, 10.3); }
  },
  // 05 mermaid fountain: dark dry-brushed stave column + stave basin; the one-way (Venetian) mirror sits in the basin
  // with an LED ring, reflecting a pink shimmer; 5 sensor stones on the rim. Compact so it stands clear of the wall.
  fountain(g, p, r) {
    const R = 14;
    cyl(g, R + 5, R + 6, 8, UM.staveStone, 0, 4, 0, 0, 0, 0, 20);
    cyl(g, R - 1.5, R - 1.5, 70, UM.black, 0, 43, 0, 0, 0, 0, 14);
    for (let i = 0; i < 12; i++) { const a = i * 2 * PI / 12; box(g, 2 * PI * R / 12 - 0.6, 70, 2.6, i % 3 ? UM.staveStone : UM.staveLight, Math.cos(a) * (R - 1.2), 43, Math.sin(a) * (R - 1.2), 0, -a + PI / 2, 0); }
    for (const y of [10, 76]) tor(g, R + 0.4, 1.1, UM.staveStone, 0, y, 0, PI / 2);
    const RB = R + 6;
    for (let i = 0; i < 18; i++) { const a = i * 2 * PI / 18; box(g, 2 * PI * RB / 18 - 0.5, 11, 3, i % 4 ? UM.staveStone : UM.staveLight, Math.cos(a) * (RB - 1.5), 83.5, Math.sin(a) * (RB - 1.5), 0, -a + PI / 2, 0); }
    cyl(g, RB - 1, RB - 2, 3, UM.black, 0, 79.5, 0, 0, 0, 0, 24); tor(g, RB, 1.5, UM.staveStone, 0, 89, 0, PI / 2);
    FOUNTAIN_WATER ??= addCaustics(new THREE.MeshStandardMaterial({ color: 0x2a3440, emissive: 0xc8306a, emissiveIntensity: 0.55, roughness: 0.05, metalness: 0.6 }), 0xffffff, 1.2, 0.2);
    mesh(new THREE.CircleGeometry(RB - 2.6, 32), FOUNTAIN_WATER, g, 0, 86.2, 0, -PI / 2); // one-way mirror in the basin
    const L = led(0xfff0f8, 2.6); for (let i = 0; i < 20; i++) { const a = i * PI / 10; sph(g, 0.7, L, Math.cos(a) * (RB - 3.2), 86.6, Math.sin(a) * (RB - 3.2)); }
    glow(g, 0, 89, 0, 34, 0xd0206a, 0.15, 1.6);
    for (let i = 0; i < 6; i++) { const a = r() * 6.28, rr = r() * (RB - 6); glow(g, Math.cos(a) * rr, 87, Math.sin(a) * rr, 3.5, 0xffe0f4, 0.85, 2 + r() * 3); }
    for (let i = 0; i < 5; i++) { const a = PI * (0.15 + i * 0.175); rock(g, 2.8, UM.slate, Math.cos(a) * RB, 90.5, Math.sin(a) * RB, 1, 0.6, 1); }
  },
  // 05b faux stained-glass mermaid window standing on the fountain rim: gothic arch, self-lit, pink LED strips + halo
  stained_glass(g, p) {
    const w = p.w || 50, h = p.hgt || 69;
    const m = paintMat('mermaidGlass', 200, 280, (c, W, H, r) => {
      const cols = ['#2aa8a0', '#6a2ac8', '#e85a1a', '#c82a4a', '#2a4ac8', '#e8b02a'];
      for (let i = 0; i < 70; i++) { c.fillStyle = cols[Math.floor(r() * cols.length)]; c.beginPath(); const x = r() * W, y = r() * H; c.moveTo(x, y); for (let k = 0; k < 4; k++) c.lineTo(x + (r() - 0.5) * 70, y + (r() - 0.5) * 70); c.fill(); }
      c.fillStyle = '#f0a070'; c.beginPath(); c.ellipse(W * 0.48, H * 0.3, 16, 20, 0, 0, 7); c.fill();
      c.fillStyle = '#e85a1a'; c.beginPath(); c.moveTo(W * 0.35, H * 0.2); c.quadraticCurveTo(W * 0.2, H * 0.5, W * 0.38, H * 0.6); c.lineTo(W * 0.45, H * 0.35); c.fill();
      c.fillStyle = '#f0a070'; c.fillRect(W * 0.4, H * 0.38, W * 0.18, H * 0.2);
      c.fillStyle = '#2aa8a0'; c.beginPath(); c.moveTo(W * 0.4, H * 0.56); c.quadraticCurveTo(W * 0.75, H * 0.7, W * 0.5, H * 0.85); c.lineTo(W * 0.3, H * 0.95); c.lineTo(W * 0.62, H * 0.95); c.lineTo(W * 0.56, H * 0.84); c.quadraticCurveTo(W * 0.85, H * 0.68, W * 0.58, H * 0.56); c.fill();
      c.strokeStyle = '#111'; c.lineWidth = 3; for (let i = 0; i < 40; i++) { c.beginPath(); c.moveTo(r() * W, r() * H); c.lineTo(r() * W, r() * H); c.stroke(); }
    }, 0.9);
    archPlate(g, w, h, 0.5, m, 0, 0, 3, 0.6);
    arch(g, w + 5, h + 4, 2.5, UM.black, 0, -2, 0.5);
    for (const s of [-1, 1]) { box(g, 1.2, h * 0.7, 1, led(0xff2a6a, 2.5), s * (w / 2 + 1.2), h * 0.35, 3.5); for (let i = 0; i < 5; i++) glow(g, s * (w / 2 + 1.2), h * (0.05 + i * 0.15), 4.5, 7, 0xff2a6a, 0.25, 3 + i); }
    glow(g, 0, h * 0.5, 8, 75, 0x7a2ab0, 0.1, 1.1);
  },
  // 05c Venetian mirror with white LEDs, silver frame
  venetian_mirror(g, p) {
    const w = p.w || 50, h = w * 1.4;
    arch(g, w - 6, h - 6, 0.6, UM.mirror, 0, 3, 2.5); arch(g, w, h, 2, UM.silver, 0, 0, 0.5);
    const L = led(0xfff4e0, 3);
    for (let i = 0; i < 5; i++) for (const s of [-1, 1]) sph(g, 0.9, L, s * (w / 2 - 1.5), 6 + i * (h * 0.6) / 4, 3);
    for (let i = 1; i < 6; i++) { const a = PI * i / 6; sph(g, 0.9, L, Math.cos(a) * (w / 2 - 1.5), h * 0.62 + Math.sin(a) * h * 0.34, 3); }
  },
  // 06 magic plant box: dark plank planter on short legs, grass top with 6 holes and RFID plants
  plant_box(g, p, r) {
    const w = p.w || 70, d = p.d || 34, h = p.hgt || 62;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(g, 5, h, 5, UM.walnut, sx * (w / 2 - 2.5), h / 2, sz * (d / 2 - 2.5));
    for (let i = 0; i < 4; i++) { box(g, w - 2, (h - 12) / 4 - 0.6, 2, UM.burnt, 0, 12 + (i + 0.5) * (h - 12) / 4, d / 2 - 1); box(g, w - 2, (h - 12) / 4 - 0.6, 2, UM.burnt, 0, 12 + (i + 0.5) * (h - 12) / 4, -d / 2 + 1); }
    for (const s of [-1, 1]) box(g, 2, h - 12, d - 2, UM.burnt, s * (w / 2 - 1), 6 + h / 2, 0);
    box(g, w - 2, 1, d - 2, UM.grassTop, 0, h - 0.5, 0);
    const pc = [0xe85aa8, 0x3a6ad8, 0xd02a2a, 0x2e8a3a, 0x8a3ac8, 0xf2c21e];
    for (let i = 0; i < 6; i++) { const x = (i % 3 - 1) * w * 0.28, z = (Math.floor(i / 3) - 0.5) * d * 0.45;
      cyl(g, 4, 4, 0.4, UM.soil, x, h + 0.2, z, 0, 0, 0, 14);
      if (i === 2) continue; // one hole still empty
      cyl(g, 3, 2.2, 6, S(0x8a5a3a), x, h + 3, z, 0, 0, 0, 10);
      leaves(g, 6, 'leaf', 6, (dd) => { dd.position.set(x + (r() - 0.5) * 4, h + 8 + r() * 6, z + (r() - 0.5) * 4); dd.rotation.set(r() * 2, r() * 6, r() * 2); }, [0x2e7a2e, 0x3d8a32], r);
      sph(g, 2.6, S(pc[i], { roughness: 0.7 }), x, h + 16, z);
    }
    box(g, 22, 12, 0.8, UM.walnut, -w / 2 + 14, h * 0.5, d / 2 + 0.4); // hidden side drawer front
  },
  // 07 gnome tree trunk in the corner: grey-brown bark with flat plates, knock hole lit UV inside, KNOCK sign, ivy,
  // red berries, toadstools at the foot, gnome on top
  tree_trunk(g, p, r) {
    const R = 30, H = 205;
    mesh(trunkGeo(R, H, 2.3), UM.trunk, g, 0, 0, -4);
    cyl(g, R * 0.95, R * 1.1, 4, UM.trunk, 0, H + 2, -4, 0, 0, 0, 20);
    for (let i = 0; i < 46; i++) { // bark plates
      const a = (r() - 0.5) * 2.8, y = 8 + r() * (H - 16); if (Math.abs(a) < 0.55 && Math.abs(y - 105) < 26) continue; if (Math.abs(a) < 0.6 && y > 62 && y < 82) continue;
      const pl = box(g, 9 + r() * 10, 16 + r() * 26, 2.4, UM.trunkPlate, Math.sin(a) * (R + 0.6), y, Math.cos(a) * (R + 0.6) - 4, 0, a, (r() - 0.5) * 0.25);
    }
    const hole = new THREE.Group(); hole.position.set(0, 105, R - 6); g.add(hole);
    cyl(hole, 15, 15, 8, UM.black, 0, 0, 2, PI / 2, 0, 0, 24); cyl(hole, 14, 14, 0.4, led(0x6a3bff, 1.6), 0, 0, -2.2, PI / 2, 0, 0, 24);
    tor(hole, 15.5, 2.4, UM.trunk, 0, 0, 6, 0, 0, 0);
    for (let i = 0; i < 4; i++) { const a = -PI / 2 + (i - 1.5) * 0.4; cyl(hole, 2.2, 0.8, 2, S(0xd8c0a0, { emissive: 0x6a3bff, emissiveIntensity: 0.5 }), Math.cos(a) * 8, -9, 2 + Math.sin(a) * 2); }
    glow(hole, 0, 0, 2, 40, 0x6a3bff, 0.15, 1.3); glow(hole, 0, -4, 5, 14, 0xb08aff, 0.4, 2.2);
    const sign = new THREE.Group(); sign.position.set(0, 72, R + 1); g.add(sign);
    box(sign, 30, 9, 1.2, UM.birch, 0, 0, 0); const sm = paintMat('knockSign', 160, 48, (c, W, H) => { c.fillStyle = '#d9c29a'; c.fillRect(0, 0, W, H); c.fillStyle = '#3a2a1a'; c.textAlign = 'center'; c.font = '11px serif'; c.fillText('The Hollow of Gnomfrey', W / 2, 16); c.font = 'bold 18px serif'; c.fillText('KNOCK', W / 2, 38); });
    picture(sign, 29, 8, sm, 0, 0, 0.7);
    ivy(g, [[-R, 0, 8], [-R * 0.7, 60, R * 0.6], [-R * 0.9, 130, R * 0.4], [-R * 0.3, 200, R * 0.7], [R * 0.5, 160, R * 0.7], [R * 0.9, 90, R * 0.5], [R, 10, 6]], 240, r, 12, 8);
    for (let i = 0; i < 16; i++) { const a = (r() - 0.5) * 2.4, y = 20 + r() * 180; sph(g, 1.1, S(0xc8202a, { roughness: 0.4 }), Math.sin(a) * (R + 3), y, Math.cos(a) * (R + 3) - 4); }
    for (let i = 0; i < 4; i++) { const a = -0.9 + i * 0.6 + (r() - 0.5) * 0.2, x = Math.sin(a) * (R + 5), z = Math.cos(a) * (R + 5) - 4, hh = 4 + r() * 4; // toadstools
      cyl(g, 0.9, 1.2, hh, UM.bone, x, hh / 2, z, 0, 0, 0, 8); mesh(new THREE.SphereGeometry(3 + r(), 12, 6, 0, PI * 2, 0, PI / 2), S(0xc8302a, { roughness: 0.5 }), g, x, hh, z).scale.y = 0.6; }
    const gn = new THREE.Group(); gn.position.set(-6, H + 4, 2); g.add(gn);
    cyl(gn, 6, 8, 12, S(0x2a5a8a), 0, 6, 0); sph(gn, 4.4, S(0xf0c8a0), 0, 15, 0); cone(gn, 4.8, 13, S(0xc8202a), 0, 23, 0, -0.2); sph(gn, 3.8, UM.wax, 0, 12, 3.5, 1, 1.2, 0.6);
  },
  // 09 Salamander's lair: ivy-wrapped rock planter, purple salamander with glowing glass wings, small open box with the token
  salamander_lair(g, p, r) {
    const R = 28;
    mesh(rockGeo(R, 3.1, 1.6), UM.slate, g, 0, 18, -2); cyl(g, R, R + 3, 18, UM.slate, 0, 9, -2, 0, 0, 0, 16);
    cyl(g, R * 0.8, R * 0.85, 2, UM.stone, 0, 52, -2, 0, 0, 0, 18);
    ivy(g, [[-R, 4, 0], [-R * 0.7, 40, R * 0.6], [0, 50, R * 0.8], [R * 0.7, 30, R * 0.6], [R, 4, 0]], 160, r, 12, 7);
    flowersAt(g, Array.from({ length: 14 }, () => { const a = (r() - 0.5) * 2.6; return [Math.sin(a) * (R + 2), 8 + r() * 40, Math.cos(a) * (R + 2) - 2]; }), r, 2.8);
    const s = new THREE.Group(); s.position.set(0, 53, 0); s.rotation.y = 0.5; g.add(s);
    const sm = S(0x6a2ac8, { roughness: 0.35, emissive: 0x3a1a80, emissiveIntensity: 0.5 });
    sph(s, 4.5, sm, 0, 3.5, 0, 2.2, 0.8, 1); sph(s, 3.2, sm, 10, 5, 0, 1.4, 0.9, 1); for (const z of [-1.6, 1.6]) sph(s, 0.7, led(0xffd040, 2), 13, 6.4, z);
    tube(s, [[-9, 3, 0], [-16, 2.5, 4], [-20, 2, -2], [-24, 2, 2]], 1.4, sm, 16);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) rod(s, [sx * 4, 2.5, sz * 3], [sx * 6, 0.5, sz * 6], 0.8, sm);
    const wing = S(0x9fe6ff, { transparent: true, opacity: 0.55, emissive: 0x2aa8ff, emissiveIntensity: 0.8, side: THREE.DoubleSide, depthWrite: false, roughness: 0.1 });
    for (const sz of [-1, 1]) { const m = mesh(new THREE.CircleGeometry(8, 16), wing, s, 0, 8, sz * 6, -PI / 2 + sz * 0.6, 0, 0); m.scale.set(1.4, 0.6, 1); glow(s, 0, 9, sz * 8, 16, 0x2aa8ff, 0.25, 1.8); }
    glow(s, 0, 4, 0, 60, 0x5a2ac8, 0.12, 1.2);
    const bx = new THREE.Group(); bx.position.set(14, 0, R + 4); g.add(bx); // open-a-box at the foot
    box(bx, 18, 9, 12, UM.walnut, 0, 4.5, 0); box(bx, 18, 1, 12, UM.walnut, 0, 13, -6.5, -1.2); cyl(bx, 3, 3, 1, S(0xf2c21e, { metalness: 0.6, roughness: 0.3 }), 0, 9.5, 0);
    glow(bx, 0, 10.5, 0, 9, 0xffc040, 0.3, 2.5);
    ivy(bx, [[-9, 9, 6], [0, 11, 6], [9, 9, 6]], 18, r, 5, 5);
  },
  // ceiling lamp: short rod + iron shade + warm bulb
  ceiling_lamp(g) {
    rod(g, [0, 0, 0], [0, -30, 0], 0.5, UM.iron); cone(g, 14, 12, UM.iron, 0, -36, 0, 0, 0, 0, 20);
    sph(g, 4.5, led(0xfff0d0, 3), 0, -43, 0);
  },
  // 16 planetary table: drum of dark staves with brass bands, burnt-wood top with growth rings, gold orbits + zodiac ring,
  // 9 wooden planet tokens with engraved glyphs
  planetary_table(g, p, r) {
    const R = (p.w || 70) / 2, H = 49;
    cyl(g, R * 0.72, R * 0.72, H - 4, UM.burnt, 0, (H - 4) / 2, 0, 0, 0, 0, 20);
    for (let i = 0; i < 20; i++) { const a = i * PI / 10; box(g, R * 0.2, H - 6, 1.2, UM.walnut, Math.cos(a) * R * 0.73, (H - 4) / 2, Math.sin(a) * R * 0.73, 0, -a + PI / 2, 0); }
    for (const y of [7, H - 12]) tor(g, R * 0.755, 0.6, UM.brass, 0, y, 0, PI / 2);
    cyl(g, R, R, 4, UM.burnt, 0, H - 2, 0, 0, 0, 0, 40); tor(g, R, 0.6, UM.brass, 0, H - 0.2, 0, PI / 2);
    const top = paintMat('planetTop2', 512, 512, (c, W) => {
      const cx = W / 2, gr = c.createRadialGradient(cx, cx, 20, cx, cx, cx);
      gr.addColorStop(0, '#5e4632'); gr.addColorStop(0.75, '#3a2a1e'); gr.addColorStop(1, '#1a120c'); c.fillStyle = gr; c.fillRect(0, 0, W, W);
      for (let k = 0; k < 70; k++) { c.strokeStyle = `rgba(${k % 2 ? '18,10,4' : '150,110,64'},${k % 5 ? 0.1 : 0.22})`; c.lineWidth = 1 + (k % 3); c.beginPath(); c.arc(cx + Math.sin(k) * 3, cx + Math.cos(k * 1.3) * 3, 4 + k * 3.6, 0, 7); c.stroke(); }
      c.strokeStyle = '#c89a58'; c.lineWidth = 3; for (let k = 1; k <= 9; k++) { c.beginPath(); c.arc(cx, cx, k * 23, 0, 7); c.stroke(); }
      c.lineWidth = 2; for (let k = 0; k < 12; k++) { const a = k * PI / 6; c.beginPath(); c.moveTo(cx + Math.cos(a) * 23, cx + Math.sin(a) * 23); c.lineTo(cx + Math.cos(a) * 250, cx + Math.sin(a) * 250); c.stroke(); }
      c.lineWidth = 5; c.beginPath(); c.arc(cx, cx, 250, 0, 7); c.stroke(); c.beginPath(); c.arc(cx, cx, 222, 0, 7); c.stroke();
      c.fillStyle = '#e0bc7a'; c.font = '22px "Apple Symbols", "Segoe UI Symbol", serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      for (let k = 0; k < 12; k++) { const a = (k + 0.5) * PI / 6; c.fillText(String.fromCodePoint(0x2648 + k) + '︎', cx + Math.cos(a) * 236, cx + Math.sin(a) * 236); }
      const s = c.createRadialGradient(cx, cx, 2, cx, cx, 18); s.addColorStop(0, '#ffe08a'); s.addColorStop(1, '#b07a2a'); c.fillStyle = s; c.beginPath(); c.arc(cx, cx, 16, 0, 7); c.fill();
    });
    mesh(new THREE.CircleGeometry(R - 0.5, 48), top, g, 0, H + 0.05, 0, -PI / 2);
    for (let i = 0; i < 9; i++) { const a = r() * PI * 2, rr = (i + 1) / 10 * R * 0.9; glyphToken(g, Math.cos(a) * rr, H, Math.sin(a) * rr, 2.6, i); }
    box(g, 14, 0.5, 9, UM.porcelain, R * 0.3, H + 0.3, -R * 0.55);
  },
  // 11 Midnight Clock: red-brown longcase, hood with turned columns, brass finials + crest, sky-blue sun/moon dial,
  // glass window showing the sword, drawer at the bottom
  clock(g, p) {
    const w = p.w || 58, d = p.d || 31, H = (p.hgt || 150) + 25, hb = H - 55;
    box(g, w, 8, d, UM.redWood, 0, 4, 0); box(g, w + 2, 2, d + 2, UM.walnut, 0, 8.5, 0); box(g, w - 10, hb - 8, 3, UM.burnt, 0, 8 + (hb - 8) / 2, -d / 2 + 3);
    for (const s of [-1, 1]) box(g, 4, hb - 8, d - 4, UM.redWood, s * (w / 2 - 7), 8 + (hb - 8) / 2, 0);
    box(g, w - 18, hb - 26, 0.4, S(0x182030, { roughness: 0.3, transparent: true, opacity: 0.22, depthWrite: false }), 0, 8 + (hb - 8) / 2, d / 2 - 3.6); frame(g, w - 16, hb - 24, 2, UM.walnut, 0, 8 + (hb - 8) / 2, d / 2 - 3, 1.4);
    const sw = new THREE.Group(); sw.position.set(0, 8 + hb / 2, 0); g.add(sw); // sword behind the glass
    box(sw, 4, hb * 0.6, 0.8, UM.silver, 0, -6, 0); box(sw, 16, 2.5, 2, UM.black, 0, hb * 0.24, 0); box(sw, 3, 14, 2.4, UM.black, 0, hb * 0.24 + 8, 0); sph(sw, 1.6, led(0xff2020, 1.8), 0, hb * 0.24, 1.3);
    box(g, w - 4, 4, d, UM.redWood, 0, hb + 2, 0); box(g, w - 6, 45, d - 2, UM.redWood, 0, hb + 26.5, -1);
    mesh(new THREE.CylinderGeometry((w - 6) / 2, (w - 6) / 2, d - 2, 24, 1, false, -PI / 2, PI), UM.redWood, g, 0, hb + 49, -1, -PI / 2, 0, 0);
    tor(g, (w - 6) / 2 + 0.6, 1, UM.walnut, 0, hb + 49, d / 2 - 1.4, 0, 0, 0, PI); // arch moulding
    const dial = paintMat('clockDial', 256, 256, (c, W) => {
      c.fillStyle = '#5a8ad0'; c.beginPath(); c.arc(W / 2, W / 2, W / 2, 0, 7); c.fill(); c.strokeStyle = '#e8eef8'; c.lineWidth = 6; c.stroke();
      c.fillStyle = '#f0d070'; c.beginPath(); c.arc(W * 0.5, W * 0.3, 26, 0, 7); c.fill(); for (let k = 0; k < 12; k++) { const a = k * PI / 6; c.fillRect(W * 0.5 + Math.cos(a) * 32 - 2, W * 0.3 + Math.sin(a) * 32 - 2, 4, 4); }
      c.fillStyle = '#e8eef8'; c.beginPath(); c.arc(W * 0.42, W * 0.7, 28, 0, 7); c.fill(); c.fillStyle = '#5a8ad0'; c.beginPath(); c.arc(W * 0.5, W * 0.66, 26, 0, 7); c.fill();
    });
    mesh(new THREE.CircleGeometry(16, 32), dial, g, 0, hb + 30, d / 2); tor(g, 16.5, 1.4, UM.silver, 0, hb + 30, d / 2 + 0.3);
    box(g, 1.4, 15, 0.6, UM.black, 3, hb + 33, d / 2 + 0.8, 0, 0, -0.4); sph(g, 1.6, UM.black, 0, hb + 30, d / 2 + 1);
    for (const s of [-1, 1]) { box(g, 3, hb - 4, 3, UM.walnut, s * (w / 2 - 6), 8 + (hb - 8) / 2, d / 2 - 1.5);
      cyl(g, 1.5, 1.5, 42, UM.walnut, s * (w / 2 - 5), hb + 26, d / 2 - 1, 0, 0, 0, 10); sph(g, 2.2, UM.walnut, s * (w / 2 - 5), hb + 5.5, d / 2 - 1); sph(g, 2.2, UM.walnut, s * (w / 2 - 5), hb + 47.5, d / 2 - 1);
      cyl(g, 0.8, 0.8, 5, UM.brass, s * (w / 2 - 5), hb + 51.5, d / 2 - 2, 0, 0, 0, 8); sph(g, 1.8, UM.brass, s * (w / 2 - 5), hb + 55, d / 2 - 2); }
    const top = hb + 49 + (w - 6) / 2; box(g, 8, 5, 3, UM.redWood, 0, top + 1.5, -1); cyl(g, 0.8, 0.8, 4, UM.brass, 0, top + 6, -1, 0, 0, 0, 8); sph(g, 2.2, UM.brass, 0, top + 9, -1);
    box(g, w - 18, 10, 1, UM.walnut, 0, 14, d / 2 - 2.6); sph(g, 1.3, UM.brass, 0, 14, d / 2 - 1.6); // drawer (planetary table output)
    cyl(g, 1.2, 1.2, 0.5, UM.brass, w / 2 - 12, 8 + hb / 2, d / 2 - 2.2, PI / 2, 0, 0, 10); // keyhole escutcheon
  },
  // 12 constellation board: burnt-wood board with bolt heads, key-like brass handle, round port and a telescope tube
  constellation_board(g, p, r) {
    const w = p.w || 90, h = 58;
    box(g, w, h, 4, UM.burnt, 0, h / 2, 2); frame(g, w, h, 2, UM.charred, 0, h / 2, 4.2, 1);
    for (let i = 0; i < 10; i++) cyl(g, 1.8, 1.8, 1.2, UM.iron, -w / 2 + 6 + r() * (w - 12), 6 + r() * (h - 12), 4.6, PI / 2, 0, 0, 10);
    tor(g, 8, 1.6, UM.brass, w * 0.18, h / 2, 4.6); cyl(g, 6.5, 6.5, 1, UM.black, w * 0.18, h / 2, 4.2, PI / 2);
    tor(g, 3.4, 0.9, UM.brass, -w * 0.04, h / 2 + 4, 4.8); rod(g, [-w * 0.04 + 3, h / 2 + 4, 4.8], [w * 0.1, h / 2 + 4, 4.8], 0.8, UM.brass);
    for (let i = 0; i < 2; i++) box(g, 4, 4, 1, UM.steel, -w * 0.32 + i * 6, h * 0.72, 4.5);
    const tbe = new THREE.Group(); tbe.position.set(-w * 0.3, h * 0.42, 4); g.add(tbe);
    cyl(tbe, 3, 3.8, 18, UM.brass, 0, 0, 9, PI / 2, 0, 0, 14); cyl(tbe, 4.4, 4.4, 2, UM.burnt, 0, 0, 18, PI / 2, 0, 0, 14);
    cyl(g, 7, 7, 1.4, UM.burnt, w * 0.25, -8, 3, PI / 2, 0, 0, 20); // eyepiece disc below
  },
  // framed constellation picture: glow-in-the-dark print, its stars twinkle (GPU halos)
  framed_painting(g, p) {
    const w = p.w || 30, h = w * 1.3, gold = !/c$/.test(p.id); let pts = [];
    const m = paintMat('const_' + p.id, 128, 168, (c, W, H, q) => {
      const gr = c.createLinearGradient(0, 0, W, H); gr.addColorStop(0, '#2a1a5a'); gr.addColorStop(1, '#6a4ab0'); c.fillStyle = gr; c.fillRect(0, 0, W, H);
      for (let i = 0; i < 80; i++) { c.fillStyle = `rgba(255,255,255,${q() * 0.7})`; c.fillRect(q() * W, q() * H, 1, 1); }
      pts = Array.from({ length: 6 }, () => [20 + q() * (W - 40), 20 + q() * (H - 40)]); c.strokeStyle = 'rgba(220,210,255,0.8)'; c.lineWidth = 1.5;
      c.beginPath(); pts.forEach(([x, y], i) => c[i ? 'lineTo' : 'moveTo'](x, y)); c.stroke(); c.fillStyle = '#fff'; pts.forEach(([x, y]) => { c.beginPath(); c.arc(x, y, 3, 0, 7); c.fill(); });
      pts = pts.map(([x, y]) => [x / W, y / H]);
    }, 0.75);
    picture(g, w - 5, h - 5, m, 0, h / 2, 2.1); frame(g, w, h, 2.5, gold ? UM.gold : UM.silver, 0, h / 2, 0, 3); box(g, w - 1, h - 1, 1, UM.black, 0, h / 2, 0.5);
    for (const [u, v] of pts) glow(g, (u - 0.5) * (w - 5), h / 2 + (0.5 - v) * (h - 5), 2.6, 3.2, 0xe0d8ff, 0.6, 1.2 + u * 2);
    glow(g, 0, h / 2, 3, w * 1.5, 0x2a1a5a, 0.1, 1);
  },
  // 14 tarot panorama painting: black frame, warm naive landscape (each panel continues the next), slightly tilted on its hook
  tarot_gallery(g, p) {
    const w = p.w || 30, h = 42, idx = { '14': 0, '14b': 1, '14c': 2, '14d': 3 }[p.id] ?? 0;
    const m = paintMat('tarot_' + p.id, 128, 180, (c, W, H, q) => {
      c.fillStyle = '#f0c048'; c.fillRect(0, 0, W, H); c.fillStyle = '#f8e08a'; c.beginPath(); c.arc(W * (1.5 - idx * 0.5) - W * 0.5, H * 0.18, 18, 0, 7); c.fill();
      for (let k = 0; k < 3; k++) { c.fillStyle = ['#d8781e', '#a85a2a', '#6a8a3a'][k]; c.beginPath(); c.moveTo(0, H); for (let x = 0; x <= W; x += 8) c.lineTo(x, H * (0.45 + k * 0.15) + Math.sin((x + idx * W) * 0.04 + k) * 12); c.lineTo(W, H); c.fill(); }
      c.strokeStyle = '#3a2a1a'; c.lineWidth = 2; c.strokeRect(6, 6, W - 12, H - 12); c.fillStyle = '#3a2a1a'; c.font = 'bold 16px serif'; c.textAlign = 'center'; c.fillText(['XIX', 'VI', 'XVIII', 'X'][idx], W / 2, H - 14);
    }, 0.12);
    const q = new THREE.Group(); q.position.set(0, h, 1.5); q.rotation.z = [0.05, -0.08, 0.1, -0.04][idx]; g.add(q);
    picture(q, w - 4, h - 4, m, 0, -h / 2, 1.6); frame(q, w, h, 2, UM.black, 0, -h / 2, 0, 2.5);
    rod(g, [0, h + 2, 0], [0, h + 2, 3], 0.5, UM.brass);
  },
  // 15 divination cups: small dark shelf with 8 tea cups on saucers + poem plaque
  divination_cups(g, p, r) {
    const w = p.w || 40;
    for (const [y, dd] of [[0, 14], [16, 12]]) { box(g, w, 1.8, dd, UM.shelf, 0, y, dd / 2); for (const s of [-1, 1]) box(g, 1.5, 6, dd * 0.8, UM.shelf, s * (w / 2 - 3), y - 3.5, dd * 0.4); }
    for (let i = 0; i < 8; i++) { const y = i < 4 ? 0.9 : 16.9, x = -w / 2 + 6 + (i % 4) * (w - 12) / 3, z = 6;
      cyl(g, 3.8, 3.4, 0.6, UM.porcelain, x, y + 0.3, z, 0, 0, 0, 16); cyl(g, 3, 2, 4, UM.porcelain, x, y + 2.6, z, 0, 0, 0, 16); tor(g, 1.2, 0.35, UM.porcelain, x + 3, y + 3, z, 0, 0, 0, PI * 1.6);
      cyl(g, 2.7, 2.7, 0.3, S(0x5a3a1a), x, y + 4.3, z, 0, 0, 0, 12); }
    const pm = paintMat('poem', 128, 64, (c, W, H) => { c.fillStyle = '#e8d9b4'; c.fillRect(0, 0, W, H); c.fillStyle = '#3a2a1a'; c.font = 'italic 9px serif'; ['A feather drifts, the moon grows bright,', 'a star, a cup, a wolf at night...'].forEach((t, i) => c.fillText(t, 6, 22 + i * 14)); });
    picture(g, 22, 11, pm, 0, -14, 0.4);
  },
  // pouf: painted (velvet top) or plain wooden box hiding a controller + speaker
  pouf(g, p) {
    const w = p.w || 40, d = p.d || 30, wooden = /wooden/i.test(p.name);
    box(g, w, 36, d, wooden ? UM.wood : UM.walnut, 0, 18, 0);
    if (wooden) { for (let i = 0; i < 4; i++) box(g, w + 0.4, 0.8, d + 0.4, UM.burnt, 0, 5 + i * 9, 0); return; }
    rbox(g, w + 2, 8, d + 2, 3, UM.velvetNavy, 0, 39, 0); scrolls(g, 0, 18, d / 2 + 0.5, w * 0.8, UM.gold);
  },
  // UV lamp bar with a violet halo
  uv_lamp(g, p) {
    const w = p.w || 40; box(g, w, 5, 4, UM.black, 0, 2.5, 2); box(g, w - 4, 2, 1, led(0x7a3bff, 3.5), 0, 1.5, 4.3);
    for (let i = 0; i < 5; i++) glow(g, -w / 2 + 4 + i * (w - 8) / 4, 1.5, 5, 12, 0x7a3bff, 0.06, 3);
    glow(g, 0, -10, 18, 70, 0x2a1060, 0.08, 1);
  },
  // 21 Boggart's monster chest: battered dark plank chest, iron bands, thick chains, talisman plate on the lid
  monster_chest(g, p, r) {
    const w = p.w || 90, d = p.d || 50, h = 49;
    for (let i = 0; i < 4; i++) box(g, w, h / 4 - 0.8, d, UM.charred, 0, (i + 0.5) * h / 4, 0, 0, (r() - 0.5) * 0.01, 0);
    box(g, w + 2, 4, d + 2, UM.burnt, 0, h + 2, 0);
    for (const s of [-1, 1]) { box(g, 5, h + 4, d + 2.4, UM.iron, s * (w / 2 - 12), h / 2 + 2, 0); box(g, w + 2.4, 5, 3, UM.iron, 0, h * 0.5, s * (d / 2 + 0.6)); }
    for (const s of [-1, 1]) for (const t of [-1, 1]) box(g, 6, h + 4.5, 6, UM.iron, s * (w / 2 - 2), h / 2 + 2, t * (d / 2 - 2));
    box(g, 24, 1.5, 16, UM.steel, 0, h + 4.7, 0); for (const s of [-1, 1]) cyl(g, 4, 4, 0.6, led(0xff7a20, 1.5), s * 6, h + 5.7, 0, 0, 0, 0, 16);
    chain(g, [-w / 2 + 4, h + 4.5, d / 2], [w / 2 - 4, 6, d / 2 + 2], 22, UM.steel, 2.2);
    chain(g, [w / 2 - 4, h + 4.5, d / 2], [-w / 2 + 10, 4, d / 2 + 2], 22, UM.steel, 2.2);
    chain(g, [-w / 2, h + 4.5, -d / 4], [w / 2, h + 4.5, d / 4], 22, UM.steel, 2.2);
    for (const x of [-w / 2 - 6, w / 2 + 6]) box(g, 9, 9, 9, UM.walnut, x, 4.5, d / 2 - 4);
    box(g, 30, 7, 1, UM.iron, 0, h * 0.7, d / 2 + 0.6); // drawer front
    box(g, 12, 13, 4.5, UM.iron, 0, h * 0.42, d / 2 + 3.4); tor(g, 4.4, 1.1, UM.steel, 0, h * 0.42 + 7, d / 2 + 3.4, 0, 0, 0, PI); cyl(g, 1.2, 1.2, 1, UM.black, 0, h * 0.4, d / 2 + 5.8, PI / 2); // big padlock
    chain(g, [w / 2 - 4, 8, d / 2 + 2], [w / 2 + 10, 0.8, d / 2 + 14], 7, UM.steel, 2.2); // loose chain end on the floor
  },
  // cast-a-spell board: distressed metal panel with an embossed bronze rune over a glowing ember groove, black post to the floor
  spell_board(g, p) {
    const s = 42, kind = spellRunes[('bcdefg'.indexOf(p.id.slice(-1)) + 6) % 6];
    box(g, 14, p.h ?? 100, 2.5, UM.black, 0, -(p.h ?? 100) / 2, 1.25);
    rbox(g, s, s, 5, 1.5, UM.iron, 0, s / 2, 3); frame(g, s - 4, s - 4, 1.4, UM.bronze, 0, s / 2, 5.4, 0.8);
    const c = s / 2, ember = flickerMat(0xff6a1a, 1.8, 0.35, 2.2);
    const rune = (B, k, z) => {
      if (kind === 'spiral') { tor(g, 10, 1.2 * k, B, 0, c, z, 0, 0, -PI / 2, PI * 1.7); rod(g, [0, c, z], [0, c - 10, z], 1.2 * k, B); }
      else if (kind === 'v') { rod(g, [-11, c + 10, z], [0, c - 10, z], 1.2 * k, B); rod(g, [11, c + 10, z], [0, c - 10, z], 1.2 * k, B); rod(g, [-13, c + 12, z], [13, c + 12, z], 1.2 * k, B); }
      else if (kind === 'leaf') { tor(g, 12, 1.2 * k, B, 0, c - 6, z, 0, 0, PI * 0.25, PI * 0.5); tor(g, 12, 1.2 * k, B, 0, c + 6, z, 0, 0, -PI * 0.75, PI * 0.5); rod(g, [0, c - 10, z], [0, c + 10, z], 1 * k, B); }
      else if (kind === 'bolt') { rod(g, [6, c + 12, z], [-4, c + 1, z], 1.2 * k, B); rod(g, [-4, c + 1, z], [5, c - 1, z], 1.2 * k, B); rod(g, [5, c - 1, z], [-6, c - 12, z], 1.2 * k, B); }
      else if (kind === 'wave') { tube(g, [[-13, c, z], [-6, c + 7, z], [0, c, z], [6, c - 7, z], [13, c, z]], 1.2 * k, B, 20); }
      else { tor(g, 10, 1.2 * k, B, 0, c, z, 0, 0, 0, PI * 2); sph(g, 3.5 * (k > 1 ? 1.3 : 1), B, 0, c, z); }
    };
    rune(ember, 1.75, 5.2); rune(UM.bronze, 1, 6);
    glow(g, 0, c, 7, 34, 0xff5a10, 0.35, 2.2);
    box(g, s - 6, 1, 1, led(0xffa040, 1.2), 0, -1.5, 3.5); // LED chain lights up when the board is armed
  },
  // 19 creature map: big framed hand-painted forest map (river, path, clearings with creatures, cottage, mountains,
  // compass rose), carved gold frame with bead moulding
  creature_map(g, p) {
    const w = p.w || 180, h = 100;
    const m = paintMat('creatureMap2', 640, 360, (c, W, H, r) => {
      const gr = c.createRadialGradient(W / 2, H / 2, H * 0.2, W / 2, H / 2, W * 0.62); gr.addColorStop(0, '#ecdcae'); gr.addColorStop(1, '#b0925a'); c.fillStyle = gr; c.fillRect(0, 0, W, H);
      for (let i = 0; i < 40; i++) { c.fillStyle = `rgba(${130 + r() * 40},${160 + r() * 30},80,0.22)`; c.beginPath(); c.ellipse(r() * W, r() * H, 20 + r() * 50, 10 + r() * 25, r() * 3, 0, 7); c.fill(); }
      c.fillStyle = '#8a8a90'; for (let i = 0; i < 5; i++) { const x = W * (0.66 + i * 0.07), y = H * 0.16; c.beginPath(); c.moveTo(x - 28, y + 26); c.lineTo(x, y - 18 - r() * 10); c.lineTo(x + 28, y + 26); c.fill(); c.fillStyle = '#f0f0f0'; c.beginPath(); c.moveTo(x - 7, y - 6); c.lineTo(x, y - 18); c.lineTo(x + 7, y - 6); c.fill(); c.fillStyle = '#8a8a90'; }
      c.strokeStyle = '#5a8aa8'; c.lineWidth = 10; c.beginPath(); c.moveTo(0, H * 0.62); c.bezierCurveTo(W * 0.3, H * 0.35, W * 0.55, H * 0.95, W, H * 0.5); c.stroke();
      c.strokeStyle = '#9ac4d8'; c.lineWidth = 3; c.stroke();
      c.fillStyle = '#5a8aa8'; c.beginPath(); c.ellipse(W * 0.48, H * 0.4, 34, 18, 0.2, 0, 7); c.fill();
      c.setLineDash([7, 6]); c.strokeStyle = '#7a5a2a'; c.lineWidth = 3; c.beginPath(); c.moveTo(W * 0.05, H * 0.95); c.bezierCurveTo(W * 0.35, H * 0.7, W * 0.4, H * 0.3, W * 0.8, H * 0.1); c.stroke(); c.setLineDash([]);
      const clear = [[0.16, 0.3], [0.38, 0.58], [0.62, 0.32], [0.78, 0.66], [0.28, 0.82], [0.56, 0.78], [0.9, 0.36]];
      const trees = []; for (let i = 0; i < 420; i++) { const x = r() * W, y = r() * H; if (clear.some(([u, v]) => Math.hypot(x - u * W, (y - v * H) * 1.4) < 46)) continue; trees.push([x, y, 7 + r() * 8]); }
      trees.sort((a, b) => a[1] - b[1]).forEach(([x, y, s]) => { c.fillStyle = '#4a3020'; c.fillRect(x - 1, y, 2, 4); c.fillStyle = ['#1e3a22', '#2a4a2a', '#34582e', '#24402a'][Math.floor(r() * 4)];
        for (let k = 0; k < 3; k++) { c.beginPath(); c.moveTo(x, y - s * 1.7 + k * s * 0.45); c.lineTo(x - s * (0.45 + k * 0.15), y + k * s * 0.1 - s * 0.2 * (2 - k)); c.lineTo(x + s * (0.45 + k * 0.15), y + k * s * 0.1 - s * 0.2 * (2 - k)); c.fill(); } });
      const blob = (col, x, y, sx, sy) => { c.fillStyle = col; c.beginPath(); c.ellipse(x, y, sx, sy, 0, 0, 7); c.fill(); };
      { const [u, v] = clear[0], x = u * W, y = v * H; blob('#8a2a1a', x, y, 22, 12); c.beginPath(); c.moveTo(x - 6, y - 6); c.lineTo(x - 26, y - 30); c.lineTo(x + 8, y - 8); c.fill(); c.beginPath(); c.moveTo(x + 4, y - 6); c.lineTo(x + 24, y - 32); c.lineTo(x + 14, y - 4); c.fill(); blob('#8a2a1a', x + 24, y - 8, 8, 6); c.lineWidth = 4; c.strokeStyle = '#8a2a1a'; c.beginPath(); c.moveTo(x - 20, y + 4); c.quadraticCurveTo(x - 40, y + 14, x - 34, y - 6); c.stroke(); }
      { const [u, v] = clear[2], x = u * W, y = v * H; for (let k = 0; k < 7; k++) { c.fillStyle = ['#f0a020', '#e86a1a', '#f8d040'][k % 3]; c.beginPath(); c.moveTo(x, y + 14); c.quadraticCurveTo(x + (k - 3) * 9, y - 6, x + (k - 3) * 5, y - 26 - (3 - Math.abs(k - 3)) * 4); c.quadraticCurveTo(x, y, x, y + 14); c.fill(); } }
      { const [u, v] = clear[3], x = u * W, y = v * H; blob('#4a4a6a', x, y, 20, 10); blob('#4a4a6a', x + 18, y - 8, 8, 7); c.fillStyle = '#4a4a6a'; c.beginPath(); c.moveTo(x + 14, y - 14); c.lineTo(x + 16, y - 24); c.lineTo(x + 20, y - 13); c.fill(); }
      { const [u, v] = clear[1], x = u * W, y = v * H; blob('#9a7a4a', x, y, 18, 11); blob('#d8d0c0', x + 16, y - 10, 7, 7); c.fillStyle = '#c8b890'; c.beginPath(); c.moveTo(x - 4, y - 6); c.lineTo(x - 20, y - 30); c.lineTo(x + 8, y - 8); c.fill(); }
      { const [u, v] = clear[4], x = u * W, y = v * H; c.fillStyle = 'rgba(240,240,250,0.85)'; c.beginPath(); c.moveTo(x, y - 24); c.quadraticCurveTo(x + 18, y - 10, x + 14, y + 16); c.lineTo(x - 14, y + 16); c.quadraticCurveTo(x - 18, y - 10, x, y - 24); c.fill(); }
      { const [u, v] = clear[5], x = u * W, y = v * H; c.fillStyle = '#8a3a2a'; c.beginPath(); c.moveTo(x - 16, y - 4); c.lineTo(x, y - 20); c.lineTo(x + 16, y - 4); c.fill(); c.fillStyle = '#d8c09a'; c.fillRect(x - 12, y - 4, 24, 16); c.fillStyle = '#3a2a1a'; c.fillRect(x - 3, y + 3, 6, 9); }
      { const [u, v] = clear[6], x = u * W, y = v * H; blob('#7a7a7a', x, y, 16, 14); blob('#7a7a7a', x, y - 18, 8, 8); }
      c.strokeStyle = '#3a2a1a'; c.fillStyle = '#c8a050'; c.lineWidth = 2; const cx = W * 0.93, cy = H * 0.86;
      for (let k = 0; k < 8; k++) { const a = k * PI / 4, L = k % 2 ? 12 : 22; c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(a + 0.2) * 6, cy + Math.sin(a + 0.2) * 6); c.lineTo(cx + Math.cos(a) * L, cy + Math.sin(a) * L); c.closePath(); c.fill(); c.stroke(); }
      c.beginPath(); c.arc(cx, cy, 9, 0, 7); c.stroke();
      const v2 = c.createRadialGradient(W / 2, H / 2, H * 0.4, W / 2, H / 2, W * 0.6); v2.addColorStop(0, 'rgba(0,0,0,0)'); v2.addColorStop(1, 'rgba(60,30,10,0.45)'); c.fillStyle = v2; c.fillRect(0, 0, W, H);
    }, 0.1);
    picture(g, w - 14, h - 14, m, 0, h / 2, 2.6); ornateFrame(g, w, h, 7, UM.gold, 0, h / 2, 0, 4); box(g, w - 2, h - 2, 1, UM.black, 0, h / 2, 0.5);
    beadFrame(g, w - 15, h - 15, 1, UM.gold, 0, h / 2, 5.4, 5);
  },
  // 20 element plate: scratched dark disc with white roman-numeral strokes and an element medallion below
  element_plate(g, p) {
    const R = 15, el = { '20': 0, '20b': 1, '20c': 2, '20d': 3 }[p.id] ?? 0;
    cyl(g, R, R, 2, UM.charred, 0, R + 8, 1, PI / 2, 0, 0, 32); tor(g, R, 0.5, UM.iron, 0, R + 8, 2);
    const n = [3, 1, 2, 4][el]; for (let i = 0; i < n; i++) box(g, 2.2, 18, 0.4, UM.porcelain, (i - (n - 1) / 2) * 5, R + 9, 2.2, 0, 0, 0.08);
    cyl(g, 5.5, 5.5, 1, UM.porcelain, 0, 5, 2.5, PI / 2, 0, 0, 20);
    cyl(g, 3, 3, 0.4, S([0x2a6ab0, 0xb02a2a, 0xd8d8e8, 0x4a8a3a][el]), 0, 5, 3.2, PI / 2, 0, 0, 16);
  },
  // 20e wizard staff with element symbols + 4 coloured wooden lens rings (element emblem at the bottom) on a small stand
  lens_stand(g, p, r) {
    const H = p.hgt || 180;
    cyl(g, 12, 14, 4, UM.iron, 0, 2, 0, 0, 0, 0, 16);
    tube(g, [[0, 2, 0], [1, H * 0.3, 0.5], [-1, H * 0.6, -0.5], [1, H * 0.85, 0], [0, H, 0]], 1.8, UM.walnut, 30);
    tor(g, 6, 1.2, UM.walnut, 0, H + 4, 0, 0, 0, 0, PI * 1.6); sph(g, 3, led(0x9fe6ff, 1.2), 0, H + 4, 0); glow(g, 0, H + 4, 0, 18, 0x9fe6ff, 0.25, 2);
    [0xb02a2a, 0x2a6ab0, 0xd8d8e8, 0x4a8a3a].forEach((c, i) => { cyl(g, 2.5, 2.5, 0.8, S(c), 0, H * (0.55 + i * 0.08), 2, PI / 2, 0, 0, 12);
      const ring = new THREE.Group(); ring.position.set(-14, 4.8, 10 - i * 7); ring.rotation.set(-1.3, 0, 0.2); g.add(ring);
      tor(ring, 7.5, 1.1, S(c, { roughness: 0.6 }), 0, 0, 0); cyl(ring, 6.6, 6.6, 0.3, UM.plexi, 0, 0, 0, PI / 2);
      cyl(ring, 2.6, 2.6, 1.2, S(c, { roughness: 0.6 }), 0, -8.2, 0, PI / 2, 0, 0, 14); tor(ring, 1.4, 0.4, UM.porcelain, 0, -8.2, 0.7, 0, 0, i, PI * 1.5); });
  },
  // 18 courage test box: charred cube with a hand hole (green glow inside), hung on ropes tied to its twin
  courage_test(g, p) {
    const s = 25, first = p.id === '18';
    box(g, s, s, s, UM.charred, 0, s / 2, s / 2); frame(g, s, s, 1.2, UM.burnt, 0, s / 2, s + 0.1, 0.6);
    cyl(g, 7, 7, 1, UM.black, 0, s / 2, s + 0.2, PI / 2, 0, 0, 20); cyl(g, 6.5, 6.5, 0.4, led(0x6aff3a, 0.9), 0, s / 2, s - 3, PI / 2, 0, 0, 20);
    glow(g, 0, s / 2, s - 1, 14, 0x6aff3a, 0.2, 1.6);
    const sx = first ? 1 : -1;
    for (let k = 0; k < 3; k++) tube(g, [[sx * s / 2, s * 0.4 + k * 2, s * 0.5], [sx * (s / 2 + 12), -6 - k * 4, s * 0.6], [sx * (s / 2 + 30), -10 - k * 3, s * 0.55], [sx * (s / 2 + 45), s * 0.3, s * 0.5]], 1.2, UM.rope, 20);
    box(g, 6, 3, 4, UM.walnut, 0, s + 6, 3); for (const t of [-1, 1]) tube(g, [[t * 2, s + 6, 3], [t * 6, s + 2, s * 0.3], [t * (s / 2 - 1), s, s * 0.5]], 1, UM.rope, 10); // rope hanger
  },
  // dragon skull trophy on a wooden shield plaque
  dragon_skull(g) {
    mesh(new THREE.CylinderGeometry(16, 16, 2, 6), UM.walnut, g, 0, 0, 1, PI / 2, 0, 0);
    sph(g, 9, UM.bone, 0, 0, 10, 1, 0.9, 1.1); sph(g, 6, UM.bone, 0, -2, 20, 0.8, 0.6, 1.3); box(g, 8, 2.5, 12, UM.bone, 0, -7, 17);
    for (const s of [-1, 1]) { tube(g, [[s * 6, 5, 8], [s * 13, 12, 6], [s * 16, 20, 10]], 1.6, UM.bone, 12); cone(g, 1.6, 6, UM.bone, s * 16.5, 23, 10.5); sph(g, 2, UM.black, s * 4.5, 1, 17); }
  },
  // dark wooden wall post (pilaster) from floor to ceiling (Main Room): chamfered beam, plinth + capital, iron bolts
  wood_post(g, p) {
    const H = p.hgt || 250, w = p.w || 12;
    box(g, w, H, 5, UM.walnut, 0, H / 2, 2.5); for (const s of [-1, 1]) box(g, 1.2, H - 30, 1.2, UM.burnt, s * (w / 2 - 0.4), H / 2, 5);
    box(g, w + 3, 12, 6.5, UM.walnut, 0, 6, 3.25); box(g, w + 4, 3, 7.5, UM.walnut, 0, H - 13, 3.75); box(g, w + 2, 10, 6.5, UM.walnut, 0, H - 5, 3.25);
    for (const y of [45, H - 60]) for (const s of [-1, 1]) cyl(g, 0.9, 0.9, 1, UM.iron, s * (w / 2 - 2.6), y, 5.4, PI / 2, 0, 0, 8);
  },
  // perimeter ceiling beams + cross beams on the post lines with knee braces (Main Room), walk mode only
  beam_frame(g, p) {
    const w = p.w || 400, d = p.d || 350, t = 12, i = 9;
    for (const s of [-1, 1]) { box(g, w - 2 * i, t, t, UM.walnut, 0, -t / 2, s * (d / 2 - i - t / 2)); box(g, t, t, d - 2 * i, UM.walnut, s * (w / 2 - i - t / 2), -t / 2, 0); }
    for (const z of p.cross || []) {
      box(g, w, 16, 14, UM.walnut, 0, -8, z);
      for (const s of [-1, 1]) box(g, 5, 34, 10, UM.walnut, s * (w / 2 - 13), -24, z, 0, 0, s * PI / 4);
    }
  },
  // wing-back armchair with stone-pattern upholstery
  armchair(g) {
    const U = S(0x8e8a84, { roughness: 1 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl(g, 2, 1.5, 12, UM.walnut, sx * 28, 6, sz * 26, 0, 0, 0, 8);
    rbox(g, 64, 14, 60, 4, U, 0, 19, 0); rbox(g, 54, 8, 50, 3, U, 0, 30, 4);
    rbox(g, 64, 72, 12, 5, U, 0, 62, -26);
    for (const s of [-1, 1]) { rbox(g, 9, 22, 54, 4, U, s * 29, 36, 1); rbox(g, 6, 40, 22, 3, U, s * 29, 74, -18); }
    for (const s of [-1, 1]) scrolls(g, s * 33.6, 18, 22, 14, UM.birch);
  },
  // artificial tree in a ribbed grey pot with white pebbles: forked trunk, leaf clusters on the branch tips (Garden)
  potted_tree(g, p, r) {
    const H = p.hgt || 170;
    cyl(g, 16, 13, 30, UM.pot, 0, 15, 0, 0, 0, 0, 20); for (let i = 0; i < 6; i++) tor(g, 15.5 - i * 0.4, 0.5, UM.pot, 0, 4 + i * 4.5, 0, PI / 2);
    tor(g, 16, 1.2, UM.pot, 0, 30, 0, PI / 2); cyl(g, 15, 15, 1, UM.soil, 0, 29.6, 0, 0, 0, 0, 20);
    const pg = new THREE.IcosahedronGeometry(1, 0); for (let i = 0; i < 26; i++) { const a = r() * 6.28, rr = 3 + r() * 11, m = mesh(pg, UM.pebble, g, Math.cos(a) * rr, 30.4, Math.sin(a) * rr); m.scale.set(1.6 + r(), 0.9, 1.4 + r()); }
    const bark = S(0x6a5040), tips = [];
    tube(g, [[0, 30, 0], [2, H * 0.4, 1], [-1, H * 0.6, -1], [0, H * 0.8, 0]], 2.2, bark, 16); tips.push([0, H * 0.82, 0]);
    for (let k = 0; k < 3; k++) { const a = k * 2.1 + r(), y0 = H * (0.42 + k * 0.1), tip = [Math.cos(a) * 26, y0 + 22 + r() * 14, Math.sin(a) * 26]; tube(g, [[0, y0, 0], [Math.cos(a) * 12, y0 + 12, Math.sin(a) * 12], tip], 1.1, bark, 10); tips.push(tip); }
    leaves(g, 320, 'leaf', 10, (d) => { const t = tips[Math.floor(r() * tips.length)], a = r() * PI * 2, rad = 6 + r() * 20 * Math.sqrt(r()); d.position.set(t[0] + Math.cos(a) * rad, t[1] + (r() - 0.4) * 34, t[2] + Math.sin(a) * rad); d.rotation.set(r() * 3, r() * 3, r() * 3); }, [0x2e6a2a, 0x3d7a32, 0x24561e, 0x4f8a3a], r);
  },
  // low leafy bush / fern clump (Garden)
  bush(g, p, r) {
    const w = p.w || 50;
    leaves(g, 120, 'leaf', 11, (d) => { const a = r() * PI, rad = r() * w / 2; d.position.set(Math.cos(a) * rad * (r() < 0.5 ? -1 : 1), 4 + r() * 30 * (1 - rad / w), Math.sin(a) * rad * 0.6); d.rotation.set(r() * 3, r() * 3, r() * 3); }, [0x2e6a2a, 0x3d7a32, 0x1f4a1e, 0x4f8a3a], r);
  },
  // ivy garland hanging from the top of a wall (Garden)
  ivy_garland(g, p, r) {
    const w = p.w || 200, pts = [];
    for (let i = 0; i <= 8; i++) pts.push([-w / 2 + i * w / 8, (i % 2 ? -14 : 0) + (r() - 0.5) * 6, 4]);
    ivy(g, pts, Math.round(w * 1.4), r, 10, 7);
    for (let k = 0; k < Math.round(w / 35); k++) { const x = -w / 2 + r() * w, L = 30 + r() * 70; ivy(g, [[x, 0, 3], [x + (r() - 0.5) * 8, -L / 2, 4], [x + (r() - 0.5) * 6, -L, 3]], Math.round(L * 0.6), r, 6, 6); }
    for (let i = 0; i < Math.round(w / 25); i++) sph(g, 2.6, S(0xd85a2a, { roughness: 0.5 }), -w / 2 + r() * w, -6 - r() * 20, 6);
  },
  // heavy navy velvet curtain from floor to ceiling (Astrology): deep irregular folds, fold shading in vertex colours,
  // flared hem, brass rod with rings
  velvet_curtain(g, p, r) {
    const w = p.w || 100, H = p.hgt || 248, n = Math.max(2, Math.round(w / 12)), geo = new THREE.PlaneGeometry(w, H, n * 10, 14), pos = geo.attributes.position;
    const ph = r() * 6;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), u = x / w + 0.5, v = (y + H / 2) / H;
      const a = 2.2 + 1.2 * Math.sin(u * 5.3 + ph) + (1 - v) * 1.3;
      const f = Math.sin(u * n * PI * 2 + 0.7 * Math.sin(u * 9 + ph) + (1 - v) * 0.5 * Math.sin(u * 13 + ph));
      pos.setZ(i, a + 1.4 + a * f);
    }
    geo.computeVertexNormals();
    mesh(geo, UM.velvetFold, g, 0, H / 2, 0);
    rod(g, [-w / 2 - 3, H - 3, 8], [w / 2 + 3, H - 3, 8], 1.1, UM.brass); for (const s of [-1, 1]) sph(g, 2, UM.brass, s * (w / 2 + 4), H - 3, 8);
    for (let i = 0; i <= n * 2; i++) tor(g, 1.7, 0.35, UM.brass, -w / 2 + i * w / (n * 2), H - 4.4, 8, 0, PI / 2, 0);
  },
  // white string curtain in front of the painting passage (Astrology side)
  string_curtain(g, p, r) {
    const w = p.w || 90, top = p.hgt || 175;
    for (let i = 0; i < 40; i++) { const x = -w / 2 + (i + 0.5) * w / 40; box(g, 0.4, top, 0.4, UM.string, x + (r() - 0.5), top / 2, 6 + (r() - 0.5) * 3); }
    box(g, w + 6, 3, 3, UM.walnut, 0, top + 1.5, 6);
  },
  // cotton-wool cloud cluster with fairy lights under the ceiling (Astrology), walk mode only
  cloud_cluster(g, p, r) {
    const geo = new THREE.IcosahedronGeometry(1, 2);
    for (let i = 0; i < 30; i++) { const s = 4 + r() * 6, m = mesh(geo, UM.cloud, g, (r() - 0.5) * 64, -8 - r() * 12, (r() - 0.5) * 46); m.scale.set(s * (1 + r() * 0.5), s * 0.8, s * (1 + r() * 0.4)); }
    for (let i = 0; i < 14; i++) glow(g, (r() - 0.5) * 66, -17 - r() * 10, (r() - 0.5) * 50, 3 + r() * 3, r() < 0.5 ? 0xfff2d0 : 0xb8c8ff, 0.5, 1.5 + r() * 2);
  },
  // black iron wall torch sconce: cup with cage prongs, flickering flame + warm halo on the wall (Dueling)
  wall_torch(g) {
    box(g, 8, 18, 1.5, UM.iron, 0, 0, 0.75); rod(g, [0, -2, 1], [0, 8, 14], 1, UM.iron);
    cone(g, 5, 12, UM.iron, 0, 10, 15, PI); tor(g, 5, 0.6, UM.iron, 0, 16, 15, PI / 2);
    for (let k = 0; k < 6; k++) { const a = k * PI / 3; rod(g, [Math.cos(a) * 4.8, 16, 15 + Math.sin(a) * 4.8], [Math.cos(a) * 6, 21, 15 + Math.sin(a) * 6], 0.4, UM.iron); }
    const F = flickerMat(0xff7a20, 4.5, 0.45, 13), F2 = flickerMat(0xffc040, 5, 0.4, 17);
    sph(g, 3.4, F, 0, 19, 15, 1, 1.5, 1); cone(g, 2.2, 7, F2, 0, 24.5, 15); cone(g, 1.3, 5, F2, 1.2, 23, 16, 0, 0, -0.3);
    glow(g, 0, 22, 15, 26, 0xffa040, 0.4, 12); glow(g, 0, 22, 12, 85, 0xff6a20, 0.3, 9);
  },
  // Garden "skylight": black metal edge frame at ~230 cm with scrolled iron corner brackets, white band above it (photos 72/73)
  garden_frame(g, p) {
    const w = p.w || 200, d = p.d || 350, E = UM.black;
    for (const s of [-1, 1]) {
      box(g, w, 6, 6, E, 0, -3, s * (d / 2 - 3)); box(g, 6, 6, d, E, s * (w / 2 - 3), -3, 0);
      box(g, w, 20, 0.6, UM.skyWhite, 0, 10, s * (d / 2 - 0.4)); box(g, 0.6, 20, d, UM.skyWhite, s * (w / 2 - 0.4), 10, 0);
    }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const x = sx * (w / 2 - 2), z0 = sz * (d / 2 - 2), pts = [];
      for (let k = 0; k <= 22; k++) { const a = k * 0.42, rad = 11 * (1 - k / 28); pts.push([x, -15 + rad * Math.sin(a), z0 - sz * (16 + rad * Math.cos(a))]); }
      tube(g, pts, 0.7, E, 40); rod(g, [x, -3, z0], [x, -34, z0], 0.9, E); rod(g, [x, -3, z0 - sz * 3], [x, -3, z0 - sz * 36], 0.9, E); rod(g, [x, -32, z0], [x, -4, z0 - sz * 32], 0.8, E);
    }
  },
  // artificial-grass pile variation: darker/lighter patches + ~380 instanced grass tufts (one draw call)
  grass_tufts(g, p, r) {
    const w = p.w || 190, d = p.d || 340, n = QUALITY.low ? 220 : 380;
    const patch = S(0x24481a, { roughness: 1, transparent: true, opacity: 0.16, depthWrite: false }), patch2 = S(0x7aa840, { roughness: 1, transparent: true, opacity: 0.09, depthWrite: false });
    for (let i = 0; i < 9; i++) { const m = mesh(new THREE.CircleGeometry(1, 16), i % 3 ? patch : patch2, g, (r() - 0.5) * (w - 40), 0.6 + i * 0.02, (r() - 0.5) * (d - 40), -PI / 2); m.scale.set(18 + r() * 26, 14 + r() * 22, 1); }
    const im = new THREE.InstancedMesh(new THREE.PlaneGeometry(9, 8), leafMat('tuft'), n), c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const x = (r() - 0.5) * w, z = (r() - 0.5) * d, k = 0.6 + r() * 0.7; _d.position.set(x, 3.4 * k, z); _d.rotation.set(0, r() * PI, 0); _d.scale.setScalar(k); _d.updateMatrix(); im.setMatrixAt(i, _d.matrix);
      const v = 0.5 + 0.5 * Math.sin(x * 0.05 + 1.3) * Math.cos(z * 0.04); im.setColorAt(i, c.set(0x3d6a24).lerp(new THREE.Color(0x6a9a38), v * 0.7 + r() * 0.3));
    }
    im.raycast = () => {}; g.add(im);
  },
  // round iron ring chandelier (hammered band, 8 candles on drip pans) hung on three chains (Main Room, photos 6/8)
  ring_chandelier(g, p, r) {
    const R = p.r || 34, y0 = -64;
    chain(g, [0, 0, 0], [0, -24, 0], 6, UM.iron, 1.5); tor(g, 3, 0.8, UM.iron, 0, -26, 0);
    for (let k = 0; k < 3; k++) { const a = k * 2 * PI / 3 + 0.3; chain(g, [0, -28, 0], [Math.cos(a) * R, y0 + 7, Math.sin(a) * R], 7, UM.iron, 1.3); }
    mesh(new THREE.CylinderGeometry(R, R, 12, 40, 1, true), UM.bandIron, g, 0, y0, 0);
    for (const y of [y0 + 6, y0 - 6]) tor(g, R, 1, UM.iron, 0, y, 0, PI / 2);
    for (let i = 0; i < 16; i++) { const a = i * PI / 8; sph(g, 0.9, UM.iron, Math.cos(a) * (R + 0.4), y0, Math.sin(a) * (R + 0.4)); }
    for (let i = 0; i < 8; i++) { const a = (i + 0.5) * PI / 4, x = Math.cos(a) * R, z = Math.sin(a) * R; cyl(g, 3, 2, 1.5, UM.iron, x, y0 + 6.8, z, 0, 0, 0, 10); candle(g, x, y0 + 7.5, z, 1.7, 8 + r() * 4); }
  },
  // woven rug (Persian-style, painted canvas) with fringed ends
  rug(g, p) {
    const w = p.w || 160, d = p.d || 110, style = p.style || 'red';
    const m = rugMat('rug_' + style, (c, W, H, q) => {
      const P = style === 'red' ? ['#6e1a1a', '#1e2a4a', '#c8a050', '#e8d8b0', '#2a0c0c'] : ['#1e2a4a', '#6e1a1a', '#c8a050', '#e8d8b0', '#0c1020'];
      c.fillStyle = P[4]; c.fillRect(0, 0, W, H); c.fillStyle = P[1]; c.fillRect(10, 10, W - 20, H - 20); c.fillStyle = P[0]; c.fillRect(40, 40, W - 80, H - 80);
      c.strokeStyle = P[2]; c.lineWidth = 3; c.strokeRect(24, 24, W - 48, H - 48); c.strokeRect(44, 44, W - 88, H - 88);
      c.fillStyle = P[2]; const dia = (x, y, s) => { c.beginPath(); c.moveTo(x, y - s); c.lineTo(x + s, y); c.lineTo(x, y + s); c.lineTo(x - s, y); c.fill(); };
      for (let x = 34; x < W - 30; x += 20) { dia(x, 17, 5); dia(x, H - 17, 5); } for (let y = 34; y < H - 30; y += 20) { dia(17, y, 5); dia(W - 17, y, 5); }
      c.save(); c.translate(W / 2, H / 2);
      [[P[1], 1], [P[2], 0.8], [P[0], 0.62], [P[3], 0.4], [P[1], 0.24]].forEach(([col, k]) => { c.fillStyle = col; c.beginPath(); for (let a = 0; a < 16; a++) { const ang = a * PI / 8, rr = (a % 2 ? 0.72 : 1) * k; c.lineTo(Math.cos(ang) * W * 0.2 * rr, Math.sin(ang) * H * 0.3 * rr); } c.fill(); });
      c.restore();
      c.fillStyle = P[1]; for (const sx of [0, 1]) for (const sy of [0, 1]) { c.beginPath(); c.ellipse(44 + sx * (W - 88), 44 + sy * (H - 88), W * 0.12, H * 0.16, 0, 0, 7); c.fill(); }
      c.fillStyle = P[3]; c.globalAlpha = 0.35; for (let i = 0; i < 70; i++) { const x = 50 + q() * (W - 100), y = 50 + q() * (H - 100); if (Math.hypot((x - W / 2) / W, (y - H / 2) / H) > 0.22) dia(x, y, 2.5); }
      c.globalAlpha = 1; for (let i = 0; i < 900; i++) { c.fillStyle = `rgba(${q() < 0.5 ? '0,0,0' : '255,240,210'},${q() * 0.14})`; c.fillRect(q() * W, q() * H, 2, 1); }
    });
    box(g, w, 0.5, d, S(0x2a1410), 0, 0.25, 0);
    const top = picture(g, w, d, m, 0, 0.55, 0); top.rotation.x = -PI / 2;
    for (const s of [-1, 1]) for (let i = 0; i < d / 2.2; i++) box(g, 3.5, 0.25, 0.8, UM.paperFringe, s * (w / 2 + 1.6), 0.15, -d / 2 + 1 + i * 2.2);
  },
  // heraldic heater shield over two crossed swords (Dueling wall decor)
  shield_trophy(g) {
    for (const s of [-1, 1]) { const q = new THREE.Group(); q.position.set(0, 28, 1.5); q.rotation.z = s * 0.72; g.add(q);
      box(q, 3, 74, 0.6, UM.silver, 0, 12, 0); box(q, 14, 1.6, 2.2, UM.iron, 0, -26, 0); cyl(q, 1.1, 1.1, 9, UM.leatherMat, 0, -31, 0, 0, 0, 0, 8); sph(q, 1.8, UM.brass, 0, -36.5, 0); }
    const sh = new THREE.Shape(); sh.moveTo(-20, 20); sh.lineTo(20, 20); sh.lineTo(20, 2); sh.quadraticCurveTo(20, -20, 0, -32); sh.quadraticCurveTo(-20, -20, -20, 2); sh.closePath();
    const m = paintMat('shieldPaint', 128, 166, (c, W, H) => {
      c.fillStyle = '#7a1414'; c.fillRect(0, 0, W, H); c.fillStyle = '#c8a040'; c.fillRect(W / 2, 0, W / 2, H * 0.45); c.fillRect(0, H * 0.45, W / 2, H * 0.55);
      c.strokeStyle = '#d8b050'; c.lineWidth = 8; c.strokeRect(0, 0, W, H);
      c.fillStyle = '#1a1a1a'; c.beginPath(); c.moveTo(W * 0.5, H * 0.18); c.lineTo(W * 0.62, H * 0.42); c.lineTo(W * 0.56, H * 0.42); c.lineTo(W * 0.6, H * 0.7); c.lineTo(W * 0.4, H * 0.7); c.lineTo(W * 0.44, H * 0.42); c.lineTo(W * 0.38, H * 0.42); c.closePath(); c.fill();
    });
    const geo = new THREE.ExtrudeGeometry(sh, { depth: 2.5, bevelEnabled: true, bevelThickness: 0.6, bevelSize: 0.8, bevelSegments: 1 });
    const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) + 20) / 40, (uv.getY(i) + 32) / 52); geo.userData.uvScaled = true;
    mesh(geo, m, g, 0, 30, 3); sph(g, 3, UM.brass, 0, 33, 6.4, 1, 1, 0.5);
  },
  // twinkling stars under the galaxy ceiling (Astrology): one Points of halos, animated on the GPU; walk mode only
  star_field(g, p, r) {
    const w = p.w || 240, d = p.d || 240, cols = [0xffffff, 0xcfd8ff, 0xffe6b0, 0xb8a0ff];
    for (let i = 0; i < 260; i++) { const big = r() < 0.12; glow(g, (r() - 0.5) * w, -1.5 - r() * 2, (r() - 0.5) * d, big ? 6 + r() * 6 : 1.8 + r() * 2.6, cols[Math.floor(r() * 4)], 0.55 + r() * 0.4, 0.7 + r() * 2.8); }
  },
  // wooden weapon rack: two swords and a spear leaning in a slotted rail (Dueling decor)
  weapon_rack(g, p) {
    const w = p.w || 46, d = p.d || 18;
    for (const s of [-1, 1]) { box(g, 4, 112, 4, UM.walnut, s * (w / 2 - 2), 56, -d / 2 + 3); box(g, 4, 4, d, UM.walnut, s * (w / 2 - 2), 2, 0); }
    box(g, w, 4, 4, UM.walnut, 0, 108, -d / 2 + 3); box(g, w, 3, 3, UM.walnut, 0, 72, -d / 2 + 6); box(g, w - 4, 3, d - 4, UM.walnut, 0, 6, 0);
    for (let i = 0; i < 3; i++) {
      const q = new THREE.Group(); q.position.set(-w / 2 + 10 + i * (w - 20) / 2, 7.5, 3); q.rotation.x = -0.08; g.add(q);
      if (i === 1) { cyl(q, 1.1, 1.1, 124, UM.walnut, 0, 62, 0, 0, 0, 0, 8); cone(q, 2.4, 12, UM.steel, 0, 130, 0, 0, 0, 0, 4); tor(q, 1.4, 0.5, UM.brass, 0, 123, 0, PI / 2); continue; }
      box(q, 2.8, 70, 0.6, UM.silver, 0, 35, 0); box(q, 13, 1.6, 2.2, UM.iron, 0, 71, 0); cyl(q, 1.1, 1.1, 10, UM.leatherMat, 0, 77, 0, 0, 0, 0, 8); sph(q, 1.8, UM.brass, 0, 83, 0);
    }
  },
});

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
  const fn = BUILDERS[p.kind]; const glows = (GLOW_LIST = []);
  if (fn) fn(g, p, rng(p.id + p.kind));
  else { box(g, 40, 40, 40, M.unknown, 0, 20, p.mount === 'wall' ? 20 : 0); console.warn('No builder for kind', p.kind, 'prop', p.id); }
  GLOW_LIST = null; flushGlows(g, glows, p.mount === 'ceiling' && (p.overhead || p.kind === 'chandelier'));
  if (!g.userData.animate) mergeStatic(g); // animated props move individual parts: keep those separate
  if (p.scale) g.scale.setScalar(p.scale);
  return g;
}
