// Escape-game 3D viewer (shared engine; game data in data/*.js). Units: cm. Plan (x, y) maps to world (x, 0, y).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import plan from './data/plan.js?v=202611091303';
import PROPS from './data/props.js?v=202611091303';
import * as THEME_DATA from './data/themes.js?v=202611091303';
import { PUZZLES, FLOW } from './data/puzzles.js?v=202611091303';
import { themes, causticUniforms, propFinishes, QUALITY, refineQuality, startTextures, markAutoLow, ssGet, ssSet } from './lib/materials.js?v=202611091303';
import { buildProp, mergeStatic, batchStatic, PICK_LAYER } from './lib/props.js?v=202611091303';
import { initEngineer } from './lib/engineer.js?v=202611091303';
import { buildProp as buildPropUoM } from './lib/props_uom.js?v=202611091303';

const $ = (s) => document.querySelector(s);
const THEME_MAP = THEME_DATA.default || {};
// Per-game settings (data/game.js, optional): title, pageTitle, walkStart [x, y], ...
let GAME = {};
try { GAME = (await import('./data/game.js?v=202611091303')).default || {}; } catch (e) { console.warn('No game config', e.message); }
if (GAME.pageTitle) document.title = GAME.pageTitle;
if (GAME.title) { const h = document.querySelector('#side h1'); if (h) h.textContent = GAME.title; }
// Shop links (data/links.js is maintained separately; the viewer works without it)
let LINKS = {}, GAME_LINK = null;
try { ({ LINKS = {}, GAME_LINK = null } = await import('./data/links.js?v=202611091303')); } catch (e) { console.warn('No shop links', e.message); }
const shopOf = (k) => { const e = k && LINKS[k]; return e && (e.puzzle?.url || e.components?.length) ? e : null; };
const hasProduct = (k) => !!(k && LINKS[k]?.puzzle?.url);
// runtime errors after the first frame: small note (before it, the bootstrap in index.html shows a full message + Retry)
const showErr = (m) => { if (!window.__boot || window.__boot.started) { const el = $('#err'); el.style.display = 'block'; el.textContent = 'Error: ' + m; } };
window.addEventListener('error', (e) => { if (e.message) showErr(e.message); });
window.addEventListener('unhandledrejection', (e) => showErr(e.reason?.message || String(e.reason)));

// ---------------- geometry helpers ----------------
const T = themes(THEME_DATA.THEMES); // built-in themes + game themes from data/themes.js
const DEFAULT_H = 250;
const rooms = plan.rooms.map((r) => {
  const xs = r.polygon.map((p) => p[0]), ys = r.polygon.map((p) => p[1]);
  return { ...r, ceil: r.ceiling_h || DEFAULT_H, bbox: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] };
});
const roomById = Object.fromEntries(rooms.map((r) => [r.id, r]));
const WALL_H = Math.max(DEFAULT_H, ...rooms.map((r) => r.ceil));

function inPoly([x, y], poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
  }
  return c;
}
function polyArea(poly) { let a = 0; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) a += poly[j][0] * poly[i][1] - poly[i][0] * poly[j][1]; return a / 2; }
function centroid(poly) {
  let cx = 0, cy = 0, a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const f = poly[j][0] * poly[i][1] - poly[i][0] * poly[j][1]; cx += (poly[j][0] + poly[i][0]) * f; cy += (poly[j][1] + poly[i][1]) * f; a += f; }
  return a ? [cx / (3 * a), cy / (3 * a)] : poly[0];
}
// interior point that is guaranteed inside (centroid or best grid sample)
function innerPoint(poly) {
  const c = centroid(poly); if (inPoly(c, poly)) return c;
  const xs = poly.map((p) => p[0]), ys = poly.map((p) => p[1]); let best = poly[0], bd = -1;
  for (let x = Math.min(...xs); x <= Math.max(...xs); x += 10) for (let y = Math.min(...ys); y <= Math.max(...ys); y += 10) {
    if (!inPoly([x, y], poly)) continue; let d = Infinity;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) d = Math.min(d, segDist([x, y], poly[j], poly[i]).d);
    if (d > bd) { bd = d; best = [x, y]; }
  }
  return best;
}
function segDist(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2));
  const qx = a[0] + t * dx, qy = a[1] + t * dy; return { d: Math.hypot(p[0] - qx, p[1] - qy), t };
}
// Sutherland-Hodgman clip of a polygon by an axis-aligned rect
function clipRect(poly, [x0, y0, x1, y1]) {
  const edges = [[(p) => p[0] >= x0, (a, b) => [x0, a[1] + (b[1] - a[1]) * (x0 - a[0]) / (b[0] - a[0])]], [(p) => p[0] <= x1, (a, b) => [x1, a[1] + (b[1] - a[1]) * (x1 - a[0]) / (b[0] - a[0])]],
    [(p) => p[1] >= y0, (a, b) => [a[0] + (b[0] - a[0]) * (y0 - a[1]) / (b[1] - a[1]), y0]], [(p) => p[1] <= y1, (a, b) => [a[0] + (b[0] - a[0]) * (y1 - a[1]) / (b[1] - a[1]), y1]]];
  let out = poly;
  for (const [inside, cut] of edges) {
    const inp = out; out = [];
    for (let i = 0; i < inp.length; i++) { const a = inp[(i + inp.length - 1) % inp.length], b = inp[i];
      if (inside(b)) { if (!inside(a)) out.push(cut(a, b)); out.push(b); } else if (inside(a)) out.push(cut(a, b)); }
    if (!out.length) break;
  }
  return out;
}
const roomAt = (x, y) => rooms.find((r) => inPoly([x, y], r.polygon));
function roomCfg(room) {
  const c = THEME_MAP[room.id] ?? room.theme ?? 'neutral';
  return typeof c === 'string' ? { theme: c, zones: [] } : { theme: c.theme || 'neutral', zones: c.zones || [] };
}
function themeKeyAt(x, y) {
  const r = roomAt(x, y); if (!r) return null;
  const cfg = roomCfg(r);
  for (const z of cfg.zones) { const [x0, y0, x1, y1] = z.rect; if (x >= x0 && x <= x1 && y >= y0 && y <= y1) return z.theme; }
  return cfg.theme;
}
// floor regions: { key, poly, room }
const regions = [];
for (const r of rooms) {
  const cfg = roomCfg(r);
  regions.push({ key: cfg.theme, poly: r.polygon, room: r, base: true });
  for (const z of cfg.zones) { const p = clipRect(r.polygon, z.rect); if (p.length >= 3 && Math.abs(polyArea(p)) > 100) regions.push({ key: z.theme, poly: p, room: r }); }
}

// ---------------- renderer / scene ----------------
const view = $('#view');
// Some browsers refuse a context with antialias or after a GPU reset: retry plain, then explain instead of a blank page.
function makeRenderer() {
  for (const opts of [{ antialias: !QUALITY.low, powerPreference: QUALITY.low ? 'default' : 'high-performance' }, { antialias: false, powerPreference: 'default' }]) {
    try { return new THREE.WebGLRenderer(opts); } catch (e) { console.warn('WebGL context failed', opts, e); }
  }
  document.body.insertAdjacentHTML('beforeend', `<div style="position:fixed;inset:0;display:grid;place-items:center;background:#0d0d10;color:#ddd;font:15px/1.5 system-ui;z-index:99;padding:24px;text-align:center"><div style="max-width:460px"><h2 style="margin:0 0 8px;color:#e8b04a">3D view could not start</h2>The browser did not allow WebGL. Close other 3D tabs, turn on hardware acceleration (Chrome: Settings &gt; System), then reload. If it persists, restart the browser.</div></div>`);
  throw new Error('WebGL unavailable');
}
let renderer = makeRenderer();
// small GPUs (maxTextureSize < 8192) and software rasterisers (SwiftShader / llvmpipe, Chrome's fallback after GPU
// crashes: ~5 fps on the high tier) drop to the low tier; the context was made with high-tier options, so rebuild it
if (refineQuality(renderer)) { renderer.dispose(); renderer.forceContextLoss(); renderer = makeRenderer(); }
// pixel ratio: <= 1.5 on low tier, <= 2 on high, and never more than ~4.2 MP rendered (4K / big retina screens)
const pixelRatio = () => Math.max(1, Math.min(devicePixelRatio, QUALITY.low ? 1.5 : 2, Math.sqrt(4.2e6 / (innerWidth * innerHeight))));
renderer.setPixelRatio(pixelRatio());
// GPU reset / memory pressure: keep the page alive, show a note, reload once the context comes back.
// A second loss within a minute reloads in the low tier instead (avoids Chrome blocking WebGL for the site).
let glLost = false;
renderer.domElement.addEventListener('webglcontextlost', (e) => {
  e.preventDefault(); glLost = true;
  if (!$('#glLost')) document.body.insertAdjacentHTML('beforeend', '<div id="glLost" style="position:fixed;left:50%;top:16px;transform:translateX(-50%);z-index:100;background:rgba(13,13,16,.92);color:#e8e0d0;font:14px/1.4 system-ui;padding:10px 16px;border-radius:8px;border:1px solid #3a3a40">Reconnecting 3D\u2026</div>');
  setTimeout(() => {
    const el = $('#glLost'); if (!glLost || !el) return;
    el.innerHTML = '3D view stopped (graphics reset). <a href="#" style="color:#e8b04a">Reload in light mode</a>';
    el.querySelector('a').onclick = (ev) => { ev.preventDefault(); markAutoLow(); location.reload(); };
  }, 12000);
});
// The light-mode decision is kept in sessionStorage for this page only (key includes the pathname, so the other game
// is not affected) instead of adding ?q=low to the URL, where it used to stick in bookmarks and shared links.
const GL_KEY = 'q3dGlLost:' + location.pathname;
renderer.domElement.addEventListener('webglcontextrestored', () => {
  const now = Date.now(), last = +ssGet(GL_KEY) || 0; ssSet(GL_KEY, now);
  if (now - last < 60000 && !QUALITY.low) markAutoLow();
  location.reload();
});
// ?q=low auto-added by the previous version (it set 'ftlGlLost' in this tab first): drop it from the address bar and
// keep the light tier for this tab; a ?q= typed or shared by the user is left alone
{
  const u = new URL(location.href);
  if (u.searchParams.get('q') === 'low' && ssGet('ftlGlLost')) {
    markAutoLow(); try { sessionStorage.removeItem('ftlGlLost'); } catch (e) { /* storage blocked */ }
    u.searchParams.delete('q'); history.replaceState(history.state, '', u.href);
  }
}
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
view.appendChild(renderer.domElement);
const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(innerWidth, innerHeight);
Object.assign(labelRenderer.domElement.style, { position: 'fixed', inset: '0', pointerEvents: 'none' });
view.appendChild(labelRenderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0c0f);
const xs = rooms.flatMap((r) => [r.bbox[0], r.bbox[2]]), ys = rooms.flatMap((r) => [r.bbox[1], r.bbox[3]]);
const B = { x0: Math.min(...xs) - 10, y0: Math.min(...ys) - 10, x1: Math.max(...xs) + 10, y1: Math.max(...ys) + 10 };
const C = new THREE.Vector3((B.x0 + B.x1) / 2, 0, (B.y0 + B.y1) / 2);
const SIZE = Math.max(B.x1 - B.x0, B.y1 - B.y0);

// Realistic graphics (local experiment, high tier only): image-based light for reflections on metal / varnish,
// ambient occlusion in corners and under props, soft shadows on from the start, weaker flat fill light.
// On by default only on localhost; ?real=1 / ?real=0 forces it.
const rq = new URLSearchParams(location.search).get('real');
const REAL = !QUALITY.low && (rq ? rq === '1' : /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname));
// The environment map goes on metals / glossy finishes only: as scene.environment it also lit every wall with a
// neutral white and washed out the room colours.
let envTex = null;
if (REAL) { const pm = new THREE.PMREMGenerator(renderer); envTex = pm.fromScene(new RoomEnvironment(), 0.04).texture; pm.dispose(); }
function envOnMetals() {
  if (!envTex) return;
  scene.traverse((o) => [].concat(o.material || []).forEach((m) => {
    if (m.isMeshStandardMaterial && m.envMap !== envTex && (m.metalness >= 0.3 || m.roughness < 0.3)) { m.envMap = envTex; m.envMapIntensity = m.metalness >= 0.3 ? 0.9 : 0.35; m.needsUpdate = true; }
  }));
}
scene.add(new THREE.HemisphereLight(0xbfc8d8, 0x2a2420, REAL ? 0.4 : 0.9));
const sun = new THREE.DirectionalLight(0xffffff, 0.55); sun.position.set(C.x - 400, 900, C.z + 600); sun.target.position.copy(C); scene.add(sun, sun.target);

const world = new THREE.Group(); scene.add(world);
const wallsG = new THREE.Group(), floorsG = new THREE.Group(), ceilG = new THREE.Group(), propsG = new THREE.Group(), flowG = new THREE.Group(), labelsG = new THREE.Group(), roomLabelsG = new THREE.Group();
world.add(wallsG, floorsG, ceilG, propsG, flowG, labelsG, roomLabelsG);

// ---------------- floors / ceilings / lights ----------------
const roomLights = [];
function shapeGeo(poly, y, Tsize = 100) {
  const s = new THREE.Shape(poly.map(([x, z]) => new THREE.Vector2(x, -z)));
  const g = new THREE.ShapeGeometry(s); g.rotateX(-Math.PI / 2); g.translate(0, y, 0);
  const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / Tsize, uv.getY(i) / Tsize);
  return g;
}
const texT = (m) => m?.map?.userData?.T || 100;
const asMat = (v) => (v && v.isMaterial ? v : new THREE.MeshStandardMaterial({ color: v ?? 0x303236, roughness: 0.95, side: THREE.DoubleSide }));
{
  const base = new THREE.Mesh(new THREE.PlaneGeometry(B.x1 - B.x0 + 160, B.y1 - B.y0 + 160), new THREE.MeshStandardMaterial({ color: 0x15171b, roughness: 1 }));
  base.rotation.x = -Math.PI / 2; base.position.set(C.x, -0.6, C.z); floorsG.add(base);
  const slab = new THREE.Mesh(new THREE.PlaneGeometry(B.x1 - B.x0, B.y1 - B.y0), new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 1 }));
  slab.rotation.x = -Math.PI / 2; slab.position.set(C.x, -0.3, C.z); floorsG.add(slab);
}
for (const f of plan.features || []) {
  if (f.polygon) { const m = new THREE.Mesh(shapeGeo(f.polygon, -0.45), new THREE.MeshStandardMaterial({ color: 0x1f2227, roughness: 1 })); floorsG.add(m); }
}
regions.forEach((rg, i) => {
  const th = T[rg.key] || T.neutral, y = rg.base ? 0 : 0.25;
  floorsG.add(new THREE.Mesh(shapeGeo(rg.poly, y, texT(th.floor)), th.floor));
  const cm = asMat(th.ceiling); const ceil = rg.room.ceil - (rg.base ? 0 : 0.3);
  if (th.tent) {
    const [x0, y0, x1, y1] = rg.room.bbox, W = x1 - x0, D = y1 - y0, g = new THREE.PlaneGeometry(W, D, 72, 60); g.rotateX(Math.PI / 2);
    const p = g.attributes.position, uv = g.attributes.uv, Tt = texT(cm);
    for (let k = 0; k < p.count; k++) {
      const X = p.getX(k), Z = p.getZ(k), u = X / W + 0.5, v = Z / D + 0.5, d = Math.min(1, Math.hypot(X / (W / 2), Z / (D / 2))), a = Math.atan2(Z, X);
      const sag = -34 * Math.sin(Math.PI * u) * Math.sin(Math.PI * v), folds = -7 * Math.pow(Math.abs(Math.sin(a * 7)), 0.6) * d * (1 - d * 0.4);
      const swag = -9 * Math.abs(Math.sin(Math.PI * 3 * (Math.abs(X) > Math.abs(Z) * W / D ? v : u))) * Math.pow(d, 6), rosette = 30 * Math.exp(-d * d * 40);
      p.setY(k, sag + folds + swag + rosette); uv.setXY(k, (X + W / 2) / Tt, (Z + D / 2) / Tt);
    }
    g.computeVertexNormals(); const m = new THREE.Mesh(g, cm); m.position.set(x0 + W / 2, ceil, y0 + D / 2); ceilG.add(m);
    const glow = new THREE.Mesh(new THREE.CircleGeometry(16, 32), new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.rotation.x = Math.PI / 2; glow.position.set(x0 + W / 2, ceil - 4, y0 + D / 2); ceilG.add(glow);
  } else { const g = shapeGeo(rg.poly, ceil, texT(cm)); ceilG.add(new THREE.Mesh(g, cm)); }
  const ip = innerPoint(rg.poly), xs2 = rg.poly.map((q) => q[0]), ys2 = rg.poly.map((q) => q[1]);
  const span = Math.max(Math.max(...xs2) - Math.min(...xs2), Math.max(...ys2) - Math.min(...ys2));
  const light = new THREE.PointLight(th.light, th.li * 2.6, span * 1.05, 0); light.position.set(ip[0], rg.room.ceil - (th.tent ? 75 : 25), ip[1]); world.add(light);
  roomLights.push({ light, base: light.intensity, key: rg.key, pos: ip, ceil: rg.room.ceil, span });
});
ceilG.visible = false;

// ---------------- walls ----------------
const collide = []; // 2D segments for walk mode
const capMat = new THREE.MeshStandardMaterial({ color: 0x1c1d20, roughness: 1 });
function wallMat(key) { return key ? (T[key] || T.neutral).wall : capMat; }
function addPiece(a, u, s0, s1, y0, y1, t) {
  if (s1 - s0 < 0.5 || y1 - y0 < 0.5) return;
  const n = [-u[1], u[0]];
  // split where the side themes change
  const side = (s, k) => themeKeyAt(a[0] + u[0] * s + n[0] * k * (t / 2 + 4), a[1] + u[1] * s + n[1] * k * (t / 2 + 4));
  const cuts = [s0]; let prev = side(s0 + 0.5, 1) + '|' + side(s0 + 0.5, -1);
  for (let s = s0 + 5; s < s1; s += 5) { const cur = side(s, 1) + '|' + side(s, -1); if (cur !== prev) { cuts.push(s - 2.5); prev = cur; } }
  cuts.push(s1);
  for (let i = 0; i < cuts.length - 1; i++) {
    const c0 = cuts[i], c1 = cuts[i + 1], mid = (c0 + c1) / 2, L = c1 - c0, H = y1 - y0;
    const mp = wallMat(side(mid, 1)), mm = wallMat(side(mid, -1));
    const g = new THREE.BoxGeometry(L, H, t); const uv = g.attributes.uv;
    const Tp = texT(mp), Tm = texT(mm);
    for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) {
      const idx = f * 4 + k, U = uv.getX(idx), V = uv.getY(idx);
      if (f === 4) uv.setXY(idx, (c0 + U * L) / Tp, (y0 + V * H) / Tp);
      else if (f === 5) uv.setXY(idx, (c0 + U * L) / Tm, (y0 + V * H) / Tm);
      else uv.setXY(idx, U * 0.1, V * 0.1);
    }
    const m = new THREE.Mesh(g, [capMat, capMat, capMat, capMat, mp, mm]);
    m.position.set(a[0] + u[0] * mid, (y0 + y1) / 2, a[1] + u[1] * mid); m.rotation.y = Math.atan2(-u[1], u[0]);
    wallsG.add(m);
    for (const k of [1, -1]) if (side(mid, k) === 'frozen') trims.push({ a, u, c0, c1, y0, y1, t, k });
  }
  // walk-mode collision: pieces at body height block; low sills (<= 45 cm, e.g. the painting passage) can be stepped over
  if (y0 < 150 && y1 > 45) collide.push([[a[0] + u[0] * s0, a[1] + u[1] * s0], [a[0] + u[0] * s1, a[1] + u[1] * s1]]);
}
const trims = []; // Frozen Kingdom wall faces that get silver mouldings + cotton snow
const NO_CUT = new Set(['fake', 'gate']);
const doorsDone = new Set();
const walls = plan.walls.map((w) => { const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]); return { ...w, L, u: [(w.b[0] - w.a[0]) / L, (w.b[1] - w.a[1]) / L], t: w.thickness || 10 }; });
for (const w of walls) {
  const ops = [];
  for (const d of plan.doors || []) {
    if (NO_CUT.has(d.type)) continue;
    const { d: dist, t } = segDist(d.center, w.a, w.b); const s = t * w.L;
    if (dist < w.t && s > 1 && s < w.L - 1) { ops.push({ s0: s - d.width / 2, s1: s + d.width / 2, h: d.height ?? 200, sill: d.sill ?? 0 }); doorsDone.add(d.id); }
  }
  ops.sort((p, q) => p.s0 - q.s0); let cur = 0;
  for (const o of ops) { addPiece(w.a, w.u, cur, o.s0, 0, WALL_H, w.t); addPiece(w.a, w.u, o.s0, o.s1, o.sill + o.h, WALL_H, w.t); if (o.sill > 0) addPiece(w.a, w.u, o.s0, o.s1, 0, o.sill, w.t); cur = o.s1; }
  addPiece(w.a, w.u, cur, w.L, 0, WALL_H, w.t);
}
// walls already split at openings: add headers (and sills) over the gaps
function doorAxis(d) {
  let u = d.wall_axis === 'x' ? [1, 0] : d.wall_axis === 'y' ? [0, 1] : null;
  if (!u) { let best = null; for (const w of walls) { const sd = segDist(d.center, w.a, w.b).d; if (!best || sd < best.sd) best = { sd, w }; } u = best ? best.w.u : [1, 0]; }
  return u;
}
for (const d of plan.doors || []) {
  if (NO_CUT.has(d.type) || doorsDone.has(d.id)) continue;
  const u = doorAxis(d);
  const a = [d.center[0] - u[0] * d.width / 2, d.center[1] - u[1] * d.width / 2], h = d.height ?? 200, sill = d.sill ?? 0;
  addPiece(a, u, 0, d.width, sill + h, WALL_H, 10); if (sill > 0) addPiece(a, u, 0, d.width, 0, sill, 10);
}
// Walk-mode openings. Windows (e.g. the Two Queens mirror-window) are see-through only: they stay cut in the wall
// but get a collision segment, so they are intentionally not walkable. Doors get a centering assist; doors to
// 'outside' also define the small area in front of the entrance that walk mode may enter.
const openings = [];
for (const d of plan.doors || []) {
  if (NO_CUT.has(d.type)) continue;
  const u = doorAxis(d), hw = d.width / 2, [cx, cy] = d.center;
  const a = [cx - u[0] * hw, cy - u[1] * hw], b = [cx + u[0] * hw, cy + u[1] * hw];
  if (d.walkable === false || /window/i.test(d.type || '')) { collide.push([a, b]); continue; }
  if ((d.sill ?? 0) > 45) continue; // high sill = solid at body height (already a collider)
  openings.push({ id: d.id, c: d.center, u, n: [-u[1], u[0]], hw, a, b, outside: (d.between || []).includes('outside') });
}

// Frozen Kingdom: silver crown moulding + skirting on every wall face, cotton-snow tufts along the top
{
  const PF = propFinishes(), r = (() => { let q = 7; return () => ((q = (q * 16807) % 2147483647) / 2147483647); })();
  const snowM = [], dm = new THREE.Object3D();
  for (const tr of trims) {
    const { a, u, c0, c1, y0, y1, t, k } = tr, n = [-u[1] * k, u[0] * k], L = c1 - c0, mid = (c0 + c1) / 2, ry = Math.atan2(-u[1], u[0]);
    const at = (s, off) => [a[0] + u[0] * s + n[0] * off, a[1] + u[1] * s + n[1] * off];
    const strip = (h, d, y) => { const [x, z] = at(mid, t / 2 + d / 2); const m = new THREE.Mesh(new THREE.BoxGeometry(L, h, d), PF.silver); m.position.set(x, y, z); m.rotation.y = ry; wallsG.add(m); };
    if (y1 >= WALL_H - 1) { strip(8, 2.5, WALL_H - 9); strip(2, 4, WALL_H - 14); }
    if (y0 < 1) strip(9, 1.6, 4.5);
    if (y1 >= WALL_H - 1) for (let s = c0 + 4; s < c1 - 4; s += 10 + r() * 22) {
      if (r() < 0.35) continue;
      const n2 = 1 + Math.floor(r() * 3);
      for (let q = 0; q < n2; q++) { const [x, z] = at(s + (r() - 0.5) * 10, t / 2 + 2 + r() * 4); dm.position.set(x, WALL_H - 4 - r() * 6, z); dm.scale.set(4 + r() * 5, 3 + r() * 3, 4 + r() * 4); dm.rotation.set(r(), r(), r()); dm.updateMatrix(); snowM.push(dm.matrix.clone()); }
    }
  }
  const im = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 2), PF.snow, snowM.length); snowM.forEach((m, i) => im.setMatrixAt(i, m)); wallsG.add(im);
}
mergeStatic(wallsG); // ~85 wall pieces x 6 faces (+ trims) -> one mesh per material

// ---------------- props ----------------
const deg = Math.PI / 180;
const disp = (k) => PUZZLES[k]?.label ?? k; // University of Magic keys are U00.. but show 00..
const puzzleOf = (p) => (p.decor ? null : p.puzzle || (p.id.match(/^\d{2}/) || [p.id.replace(/[^A-Za-z]/g, '')])[0]);
function nearestWallLine(x, y) {
  let best = null;
  // a point at the very end of a wall (e.g. where a partition meets a cross wall) belongs to the wall it lies along
  for (const w of walls) { const { d, t } = segDist([x, y], w.a, w.b), k = d + (t <= 0.001 || t >= 0.999 ? 6 : 0); if (!best || k < best.k) best = { d, k, w }; }
  if (!best || best.d > 70) return null;
  const { w } = best, s = (x - w.a[0]) * w.u[0] + (y - w.a[1]) * w.u[1];
  return { px: w.a[0] + w.u[0] * s, py: w.a[1] + w.u[1] * s, n: [-w.u[1], w.u[0]], t: w.t };
}
const propObjs = [], overheadObjs = [], OVERHEAD_KINDS = new Set(['chandelier', 'led_ceiling_board']);
for (const p of PROPS) {
  const obj = p.game === 'uom' ? buildPropUoM(p) : buildProp(p);
  const room = roomById[p.room] || roomAt(...p.pos);
  const ceil = room?.ceil ?? DEFAULT_H;
  const [x, y] = p.pos;
  let mount = p.mount || 'floor';
  if (mount === 'wall') {
    const wl = nearestWallLine(x, y);
    if (!wl) { console.warn('No wall near prop', p.id); mount = 'floor'; }
    else {
      let [nx, ny] = wl.n;
      const probe = [wl.px + nx * 20, wl.py + ny * 20];
      const inside = room ? inPoly(probe, room.polygon) : true;
      if (!inside) { nx = -nx; ny = -ny; }
      const o = wl.t / 2 + (p.off || 0);
      obj.position.set(wl.px + nx * o, p.h ?? 100, wl.py + ny * o); obj.rotation.y = Math.atan2(nx, ny);
    }
  }
  if (mount === 'floor') { obj.position.set(x, p.h || 0, y); obj.rotation.y = (p.rot || 0) * deg; }
  if (mount === 'ceiling') { obj.position.set(x, ceil - (p.h || 0), y); obj.rotation.y = (p.rot || 0) * deg; }
  // Flat dark ceiling pieces read as floating black shadows from above (ceiling is hidden there): show them in walk mode only.
  if (mount === 'ceiling' && (OVERHEAD_KINDS.has(p.kind) || p.overhead)) overheadObjs.push(obj);
  obj.userData.prop = p; obj.userData.puzzle = puzzleOf(p);
  obj.traverse((o) => { o.userData.owner = obj; });
  propsG.add(obj); propObjs.push(obj);
}
world.updateMatrixWorld(true);
// one draw call per shared material across all static props (animated + overhead props stay separate)
batchStatic(propsG, propObjs.filter((o) => !o.userData.animate && !overheadObjs.includes(o)));

// ---------------- labels + flow ----------------
const puzzleIds = [...new Set(propObjs.map((o) => o.userData.puzzle).filter(Boolean))].sort((a, b) => (isNaN(a) ? 99 : +a) - (isNaN(b) ? 99 : +b));
const primary = {}, anchor = {}, labelEls = {}, labelObjs = {};
for (const o of propObjs) { const k = o.userData.puzzle; if (k && !primary[k]) primary[k] = o; }
for (const k of puzzleIds) {
  const o = primary[k], bb = new THREE.Box3().setFromObject(o), c = bb.getCenter(new THREE.Vector3());
  const room = roomById[o.userData.prop.room]; const top = Math.min(bb.max.y + 18, (room?.ceil ?? DEFAULT_H) - 10);
  anchor[k] = new THREE.Vector3(c.x, top, c.z);
  const el = document.createElement('div'); el.className = 'label'; el.textContent = disp(k); el.title = (PUZZLES[k]?.name || '') + (hasProduct(k) ? ' (in shop)' : '');
  if (hasProduct(k)) el.insertAdjacentHTML('beforeend', '<i class="sdot"></i>');
  el.addEventListener('click', (e) => { e.stopPropagation(); select(o); });
  const lab = new CSS2DObject(el); lab.position.copy(anchor[k]); labelsG.add(lab); labelEls[k] = el; labelObjs[k] = lab;
}
for (const r of rooms) {
  const el = document.createElement('div'); el.className = 'roomlabel'; el.textContent = r.name;
  const ip = innerPoint(r.polygon), lab = new CSS2DObject(el); lab.position.set(ip[0], r.ceil, ip[1]); roomLabelsG.add(lab);
}
const pulses = [];
{
  const mat = new THREE.MeshStandardMaterial({ color: 0xd9ad57, emissive: 0xd9ad57, emissiveIntensity: 0.9, transparent: true, opacity: 0.85 });
  const pmat = new THREE.MeshBasicMaterial({ color: 0xfff0c8 });
  for (const [a, b] of FLOW) {
    if (!anchor[a] || !anchor[b]) continue;
    const A = anchor[a].clone().setY(anchor[a].y + 6), Bv = anchor[b].clone().setY(anchor[b].y + 6), d = A.distanceTo(Bv);
    const M = A.clone().lerp(Bv, 0.5); M.y = Math.max(A.y, Bv.y) + 40 + d * 0.18;
    const curve = new THREE.QuadraticBezierCurve3(A, M, Bv);
    flowG.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 40, 1.4, 6), mat));
    const tip = curve.getPoint(0.94), dir = curve.getTangent(0.94);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(5, 14, 12), mat); cone.position.copy(tip); cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir); flowG.add(cone);
    for (let i = 0; i < 2; i++) { const s = new THREE.Mesh(new THREE.SphereGeometry(2.4, 10, 8), pmat); flowG.add(s); pulses.push({ s, curve, o: i / 2 }); }
  }
}
flowG.visible = false;

// ---------------- cameras + controls ----------------
const persp = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 2, 20000);
const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 20000);
const narrow = () => Math.max(1, 1.05 / (innerWidth / innerHeight)); // portrait screens: widen the view so the whole plan fits
function fitOrtho() { const a = innerWidth / innerHeight, s = SIZE * 0.62 * narrow(); ortho.left = -s * a; ortho.right = s * a; ortho.top = s; ortho.bottom = -s; ortho.updateProjectionMatrix(); }
fitOrtho();
const orbitP = new OrbitControls(persp, renderer.domElement); orbitP.enableDamping = true; orbitP.maxPolarAngle = 1.48; orbitP.minDistance = 60; orbitP.maxDistance = 4000;
const orbitO = new OrbitControls(ortho, renderer.domElement); orbitO.enableRotate = false; orbitO.screenSpacePanning = true; orbitO.enableDamping = true; orbitO.minZoom = 0.5; orbitO.maxZoom = 8;
orbitO.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
orbitO.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN };
orbitP.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
ortho.position.set(C.x, 2000, C.z + 0.01); orbitO.target.copy(C); ortho.lookAt(C);
const ISO_DIR = new THREE.Vector3(-0.3, 1.55, 0.95).normalize();
persp.position.copy(C).addScaledVector(ISO_DIR, SIZE * 1.75 * Math.min(2.2, narrow())); orbitP.target.copy(C);

// bloom only on the high tier; the low tier renders straight to the canvas (no extra full-screen targets)
const composer = QUALITY.low ? null : new EffectComposer(renderer);
const renderPass = composer && new RenderPass(scene, persp);
const bloomPass = composer && new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), REAL ? 0.4 : 0.55, 0.45, 0.82);
// scene units are cm: AO reaches ~35 cm, ignores depth gaps over 25 cm (no dark halos around props in front of walls)
const gtaoPass = composer && REAL ? new GTAOPass(scene, persp, innerWidth, innerHeight, undefined, { radius: 35, thickness: 25, distanceExponent: 1.5, scale: 1.1, samples: 16 }) : null;
if (gtaoPass) gtaoPass.blendIntensity = 0.9;
// Compile shader programs without blocking (KHR_parallel_shader_compile). With the composer the scene is drawn into
// a render target (no tone mapping, linear output), which is part of the program key: compile for that target too,
// otherwise the precompiled programs don't match and the first real frame compiles everything again.
function precompile() {
  const prev = renderer.getRenderTarget(); let p;
  renderer.setRenderTarget(composer ? composer.readBuffer : null);
  try { p = renderer.compileAsync(scene, persp); } finally { renderer.setRenderTarget(prev); }
  return p;
}
if (composer) {
  composer.addPass(renderPass);
  if (REAL) composer.addPass(gtaoPass);
  composer.addPass(bloomPass);
  composer.addPass(new OutputPass());
}

let mode = 'iso', cam = persp, isoPose = null;
const walk = { yaw: 0, pitch: 0, keys: new Set(), x: GAME.walkStart?.[0] ?? 315, z: GAME.walkStart?.[1] ?? 590, joy: { x: 0, y: 0 }, pendingRoom: null };
// small-screen / touch UI state
const smallMQ = matchMedia('(max-width: 820px), (max-height: 500px)');
let touchSeen = matchMedia('(pointer: coarse)').matches;
const isTouch = () => touchSeen;
let labelsDirty = true;
document.body.classList.toggle('touch', touchSeen);
if (smallMQ.matches) $('#tRooms').checked = false; // less label clutter on phones
function setMode(m) {
  const prev = mode;
  if (prev === 'iso' && m !== 'iso') isoPose = { p: persp.position.clone(), t: orbitP.target.clone() }; // restored when coming back from walk
  if (m !== prev) tween = null;
  mode = m; document.querySelectorAll('#modes button').forEach((b) => { b.classList.toggle('on', b.dataset.mode === m); b.setAttribute('aria-pressed', b.dataset.mode === m); });
  cam = m === 'top' ? ortho : persp; if (renderPass) renderPass.camera = cam;
  if (gtaoPass) gtaoPass.enabled = cam === persp && !QUALITY.low; // the AO shader is built for the perspective camera
  orbitO.enabled = m === 'top'; orbitP.enabled = m === 'iso';
  ceilG.visible = m === 'walk'; roomLabelsG.visible = m !== 'walk';
  overheadObjs.forEach((o) => (o.visible = m === 'walk'));
  wallsG.scale.y = m !== 'walk' && $('#tLow').checked ? 0.32 : 1;
  if (m === 'walk') {
    // keep the last walk position; only a room picked since then (sidebar) moves the walker
    if (walk.pendingRoom) { placeInRoom(walk.pendingRoom); walk.pendingRoom = null; }
    else if (!walk.started && (blocked(walk.x, walk.z) || !walkable(walk.x, walk.z))) { const r = roomAt(walk.x, walk.z) || rooms[0], sp = freeSpot(...(r ? innerPoint(r.polygon) : [walk.x, walk.z]), r); if (sp) [walk.x, walk.z] = sp; }
    persp.rotation.order = 'YXZ'; if (!walk.started) { walk.yaw = 0; walk.pitch = -0.05; walk.started = true; }
  } else if (m === 'iso' && prev === 'walk' && isoPose) { persp.position.copy(isoPose.p); orbitP.target.copy(isoPose.t); persp.lookAt(orbitP.target); }
  persp.fov = m === 'walk' ? 70 : 45; persp.updateProjectionMatrix();
  if (m !== 'walk') Object.values(labelObjs).forEach((l) => (l.visible = true));
  roomLabelsG.visible = m !== 'walk' && $('#tRooms').checked;
  document.body.classList.toggle('walk', m === 'walk'); walk.joy.x = walk.joy.y = 0; labelsDirty = true;
  $('#hint').innerHTML = isTouch()
    ? (m === 'walk' ? 'Joystick to move, drag to look. Tap a prop for details.' : m === 'top' ? 'Drag to pan, pinch to zoom. Tap a number for details.' : 'Drag to orbit, two fingers to zoom and pan. Tap a number for details.')
    : m === 'walk' ? '<kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> move, drag to look, <kbd>Shift</kbd> faster. Click a prop for details.'
    : m === 'top' ? 'Drag to pan, scroll to zoom. Click a prop or number for details.' : 'Drag to orbit, right-drag to pan, scroll to zoom. Click a prop or number for details.';
  if (isTouch()) { const h = $('#hint'); h.classList.remove('fade'); clearTimeout(setMode.t); setMode.t = setTimeout(() => h.classList.add('fade'), 5000); }
}
$('#modes').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) setMode(b.dataset.mode); });

// ---------------- tweening ----------------
let tween = null;
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
function flyTo(target, dist, zoom, viewDir) {
  if (mode === 'top') tween = { t: 0, d: 0.7, from: orbitO.target.clone(), to: target.clone().setY(0), z0: ortho.zoom, z1: zoom, top: true };
  else if (mode === 'iso') { const dir = viewDir ? viewDir.clone().normalize() : persp.position.clone().sub(orbitP.target).normalize(); tween = { t: 0, d: 0.8, from: orbitP.target.clone(), to: target.clone(), p0: persp.position.clone(), p1: target.clone().addScaledVector(dir, dist) }; }
}
function stepTween(dt) {
  if (!tween) return; tween.t = Math.min(1, tween.t + dt / tween.d); const k = ease(tween.t);
  if (tween.top) { const p = tween.from.clone().lerp(tween.to, k); orbitO.target.copy(p); ortho.position.set(p.x, 2000, p.z + 0.01); ortho.zoom = tween.z0 + (tween.z1 - tween.z0) * k; ortho.updateProjectionMatrix(); }
  else { orbitP.target.copy(tween.from.clone().lerp(tween.to, k)); persp.position.copy(tween.p0.clone().lerp(tween.p1, k)); }
  if (tween.t >= 1) tween = null;
}

// ---------------- sidebar ----------------
let currentRoom = null;
const roomSwatch = (r) => (T[roomCfg(r).theme] || T.neutral).swatch;
function goRoom(id) {
  currentRoom = id; const r = roomById[id]; const [x0, y0, x1, y1] = r.bbox, c = new THREE.Vector3((x0 + x1) / 2, 0, (y0 + y1) / 2), s = Math.max(x1 - x0, y1 - y0);
  document.querySelectorAll('#rooms li').forEach((li) => li.classList.toggle('on', li.dataset.id === id));
  if (mode === 'walk') { placeInRoom(id); return; }
  walk.pendingRoom = id; // entering walk next time starts in this room
  if (mode === 'top') flyTo(c, 0, Math.min(4, (SIZE * 0.62 * 2) / (s * 1.35)));
  else { const v = roomView(r); flyTo(v.target, v.dist, 0, v.dir); }
}
// Iso framing for any room shape: aim at an interior point (an L-shaped room's bbox centre can lie outside it), look
// along the room's long axis (narrow rooms are hidden behind their side walls otherwise), keep the camera above the
// building rather than over the void, and pull back just enough to fit the room's bbox (walls included) on screen.
function roomView(r) {
  const [x0, y0, x1, y1] = r.bbox, ip = innerPoint(r.polygon), wallH = WALL_H * ($('#tLow').checked ? 0.32 : 1);
  const target = new THREE.Vector3(ip[0], wallH * 0.2, ip[1]);
  const corners = []; for (const x of [x0, x1]) for (const z of [y0, y1]) for (const y of [0, wallH]) corners.push(new THREE.Vector3(x, y, z));
  // screen area not covered by the desktop sidebar / an open detail panel
  const side = $('#side').getBoundingClientRect(), panel = $('#panel').classList.contains('open') ? $('#panel').getBoundingClientRect() : null;
  const left = smallMQ.matches ? 0 : Math.min(innerWidth * 0.4, side.right + 8), right = panel && !smallMQ.matches ? Math.max(0, innerWidth - panel.left + 8) : 0;
  const free = Math.max(0.4, (innerWidth - left - right) / innerWidth); // fraction of the width
  const tanV = Math.tan((45 / 2) * deg) * 0.86, tanH = Math.tan((45 / 2) * deg) * persp.aspect * free * 0.86;
  const cur = persp.position.clone().sub(orbitP.target), curAz = Math.atan2(cur.x, cur.z), maxDim = Math.max(x1 - x0, y1 - y0);
  let best = null;
  for (let k = 0; k < 16; k++) {
    const az = (k / 16) * Math.PI * 2, hx = Math.sin(az), hz = Math.cos(az);
    let lo = Infinity, hi = -Infinity; for (const [px, pz] of r.polygon) { const t = px * hx + pz * hz; lo = Math.min(lo, t); hi = Math.max(hi, t); }
    const depth = hi - lo; // floor depth seen past the near wall
    // steep enough that the near wall hides at most ~35% of the floor behind it
    const el = Math.max(0.75, Math.min(1.3, Math.atan2(wallH, 0.35 * depth)));
    const dir = new THREE.Vector3(hx * Math.cos(el), Math.sin(el), hz * Math.cos(el)), F = dir.clone().negate();
    const R = new THREE.Vector3().crossVectors(F, new THREE.Vector3(0, 1, 0)).normalize(), U = new THREE.Vector3().crossVectors(R, F);
    let dist = orbitP.minDistance * 3;
    for (const p of corners) { const q = p.clone().sub(target), fz = q.dot(F); dist = Math.max(dist, Math.abs(q.dot(R)) / tanH - fz, Math.abs(q.dot(U)) / tanV - fz); }
    dist = Math.min(dist, orbitP.maxDistance * 0.8);
    const g = (f) => [target.x + hx * dist * Math.cos(el) * f, target.z + hz * dist * Math.cos(el) * f], [gx, gz] = g(1), m = 40;
    const over = gx > B.x0 - m && gx < B.x1 + m && gz > B.y0 - m && gz < B.y1 + m; // camera above the building, not the void
    const score = (over ? 2 : 0) + (roomAt(...g(0.5)) ? 0.5 : 0) + 1.5 * depth / maxDim - el * 0.5 + 0.2 * Math.cos(az - curAz) - dist / 4000;
    if (!best || score > best.score) best = { score, dir, dist, R };
  }
  // centre the room's projected bbox in the free screen area (a few fixed-point steps with the final camera)
  const cam = new THREE.PerspectiveCamera(45, persp.aspect, 2, 20000), tgt = target.clone(), v = new THREE.Vector3();
  const halfH = best.dist * Math.tan((45 / 2) * deg), halfW = halfH * persp.aspect, wantX = (left - right) / innerWidth;
  for (let it = 0; it < 4; it++) {
    cam.position.copy(tgt).addScaledVector(best.dir, best.dist); cam.lookAt(tgt); cam.updateMatrixWorld();
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
    let x0n = Infinity, x1n = -Infinity, y0n = Infinity, y1n = -Infinity;
    for (const p of corners) { v.copy(p).project(cam); x0n = Math.min(x0n, v.x); x1n = Math.max(x1n, v.x); y0n = Math.min(y0n, v.y); y1n = Math.max(y1n, v.y); }
    tgt.addScaledVector(best.R, ((x0n + x1n) / 2 - wantX) * halfW).addScaledVector(up, ((y0n + y1n) / 2) * halfH);
  }
  return { dir: best.dir, dist: best.dist, target: tgt };
}
$('#rooms').innerHTML = rooms.map((r) => `<li class="item" data-id="${r.id}" tabindex="0" role="button"><span class="dot" style="background:${roomSwatch(r)}"></span>${r.name}</li>`).join('');
$('#rooms').addEventListener('click', (e) => { const li = e.target.closest('li'); if (li) { goRoom(li.dataset.id); if (smallMQ.matches) setDrawer(false); } });
// ---- small screens: drawer (rooms/puzzles/toggles) + bottom-sheet panel ----
const sideMQ = matchMedia('(max-height: 500px) and (orientation: landscape)');
function syncSheets() {
  const d = $('#drawer').classList.contains('open'), p = $('#panel').classList.contains('open');
  document.body.classList.toggle('drawer', d); document.body.classList.toggle('sheet', d || p);
}
function setDrawer(open) {
  $('#drawer').classList.toggle('open', open); $('#menuBtn').setAttribute('aria-expanded', open);
  if (open && $('#panel').classList.contains('open') && !sideMQ.matches) select(null);
  syncSheets();
}
$('#menuBtn').addEventListener('click', () => setDrawer(!$('#drawer').classList.contains('open')));
smallMQ.addEventListener('change', () => { if (!smallMQ.matches) setDrawer(false); });
// drag a sheet down by its handle to dismiss it (portrait bottom sheets only)
function sheetDrag(sheet, handleSel, close) {
  let s = null;
  sheet.addEventListener('pointerdown', (e) => {
    if (!smallMQ.matches || sideMQ.matches || e.target.closest('button, a') || !e.target.closest(handleSel)) return;
    s = { id: e.pointerId, y: e.clientY, dy: 0, t: performance.now() }; sheet.classList.add('drag'); sheet.setPointerCapture(e.pointerId);
  });
  sheet.addEventListener('pointermove', (e) => { if (!s || e.pointerId !== s.id) return; s.dy = Math.max(0, e.clientY - s.y); sheet.style.transform = `translateY(${s.dy}px)`; });
  const end = (e) => {
    if (!s || e.pointerId !== s.id) return; sheet.classList.remove('drag'); sheet.style.transform = '';
    const fast = s.dy / Math.max(1, performance.now() - s.t) > 0.5; if (s.dy > 90 || (fast && s.dy > 30)) close(); s = null;
  };
  sheet.addEventListener('pointerup', end); sheet.addEventListener('pointercancel', end);
}
sheetDrag($('#drawer'), '.grab', () => setDrawer(false));
sheetDrag($('#panel'), '.grab, .top', () => select(null));
{
  let html = '';
  for (const r of rooms) {
    const ks = puzzleIds.filter((k) => primary[k].userData.prop.room === r.id); if (!ks.length) continue;
    html += `<li class="grp"><span class="dot" style="background:${roomSwatch(r)}"></span>${r.name}</li>`;
    html += ks.map((k) => `<li class="item" data-k="${k}" tabindex="0" role="button"><span class="num">${disp(k)}</span>${PUZZLES[k]?.name || primary[k].userData.prop.name}${hasProduct(k) ? '<span class="shoptag" title="Available in the shop">shop</span>' : ''}</li>`).join('');
  }
  $('#puzzles').innerHTML = html;
}
$('#puzzles').addEventListener('click', (e) => { const li = e.target.closest('li.item'); if (li) select(primary[li.dataset.k], true); });
// keyboard: list items act like buttons (Enter / Space)
for (const ul of [$('#rooms'), $('#puzzles')]) ul.addEventListener('keydown', (e) => {
  const li = e.target.closest('li.item'); if (!li || (e.key !== 'Enter' && e.key !== ' ')) return;
  e.preventDefault(); e.stopPropagation(); li.click();
});
$('#tLabels').addEventListener('change', (e) => { labelsG.visible = e.target.checked; labelsDirty = true; });
$('#tRooms').addEventListener('change', () => { roomLabelsG.visible = mode !== 'walk' && $('#tRooms').checked; labelsDirty = true; });
$('#tFlow').addEventListener('change', (e) => { flowG.visible = e.target.checked; });
$('#tLow').addEventListener('change', () => setMode(mode));
$('#tShadow').addEventListener('change', (e) => setShadows(e.target.checked));
const hideShadowToggle = () => { const t = $('#tShadow'); t.checked = false; t.disabled = true; t.closest('label').style.display = 'none'; };
if (QUALITY.low) hideShadowToggle(); // 6+ shadow maps are too heavy for phones / software GL

// ---------------- optional soft shadows (one shadow-casting spot per room, built on demand) ----------------
const shadowLights = []; let shadowsReady = false, shadowPrep = null;
function buildShadowLights() {
  if (shadowLights.length) return;
  for (const L of roomLights) {
    const sp = new THREE.SpotLight(L.light.color, L.base * (REAL ? 0.8 : 1.3), L.span * 1.8, 1.2, 0.7, 0);
    sp.position.set(L.pos[0], L.ceil - 6, L.pos[1]); sp.target.position.set(L.pos[0], 0, L.pos[1]);
    sp.castShadow = true; sp.shadow.mapSize.set(1024, 1024); sp.shadow.bias = -0.0004; sp.shadow.normalBias = 0.6; sp.shadow.radius = 5; sp.shadow.camera.near = 5; sp.shadow.camera.far = 420;
    sp.visible = false; world.add(sp, sp.target); shadowLights.push(sp); // off until applyShadows(true)
  }
}
function applyShadows(on) {
  renderer.shadowMap.enabled = on; renderer.shadowMap.type = on ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap; // off = the startup programs
  shadowLights.forEach((sp) => (sp.visible = on));
  roomLights.forEach((L) => (L.light.intensity = on ? L.base * (REAL ? 0.45 : 0.5) : L.base));
  propsG.traverse((o) => { if (o.isMesh) { const tr = [].concat(o.material).some((m) => m.transparent || m.alphaTest); o.castShadow = on && !tr; o.receiveShadow = on; } });
  floorsG.traverse((o) => { if (o.isMesh) o.receiveShadow = on; }); wallsG.traverse((o) => { if (o.isMesh) o.receiveShadow = on; });
  scene.traverse((o) => { if (o.material) [].concat(o.material).forEach((m) => (m.needsUpdate = true)); });
}
// Shadow variants of every program, compiled a mesh at a time (one or two new programs per frame, so the GPU process
// never has to translate ~25 shaders in one go), then wait until they are linked. Each compile call puts just the
// lights / shadow map / that mesh's receiveShadow into the shadow state and restores it in the same tick.
const isRecv = (o) => { for (let p = o; p; p = p.parent) if (p === propsG || p === floorsG || p === wallsG) return true; return false; };
async function precompileShadows() {
  const list = [], seen = new Set(), frame = () => new Promise((ok) => requestAnimationFrame(() => ok()));
  scene.traverse((o) => {
    if (!(o.isMesh || o.isPoints || o.isLine || o.isSprite) || !o.material || o.isCSS2DObject) return;
    const recv = o.isMesh && isRecv(o), tail = (recv ? '|r' : '') + (o.isInstancedMesh ? '|i' : '') + (o.isSkinnedMesh ? '|s' : '') + '|' + Object.keys(o.geometry?.attributes || {}).join();
    for (const m of [].concat(o.material)) { const key = m.uuid + tail; if (!seen.has(key)) { seen.add(key); list.push({ o, m, recv }); } }
  });
  const progs = () => renderer.info.programs.length, start = progs(); let made = 0;
  for (const { o, m, recv } of list) {
    const n0 = progs(), rt = renderer.getRenderTarget(), r0 = o.receiveShadow, m0 = o.material, en = renderer.shadowMap.enabled, ty = renderer.shadowMap.type;
    // shadow state for this one material (the shadow map type is in every program key, even with shadows off)
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; shadowLights.forEach((sp) => (sp.visible = true)); o.receiveShadow = recv; o.material = m;
    renderer.setRenderTarget(composer ? composer.readBuffer : null);
    try { renderer.compile(o, persp, scene); } finally {
      renderer.setRenderTarget(rt); o.material = m0; o.receiveShadow = r0; renderer.shadowMap.enabled = en; renderer.shadowMap.type = ty; shadowLights.forEach((sp) => (sp.visible = en));
    }
    made += progs() - n0; if (made >= 2) { made = 0; await frame(); }
  }
  // wait until the new programs are linked (KHR_parallel_shader_compile), at most ~4 s
  const fresh = renderer.info.programs.slice(start);
  for (let i = 0; i < 240 && fresh.some((p) => p.isReady && !p.isReady()); i++) await frame();
}
// The first switch-on used to freeze the page for 4-9 s (every material recompiled at once). Now the shadow variants
// are compiled in the background (scene briefly put in the shadow state, compileAsync, state restored in the same
// tick, so frames keep rendering the old programs) and the switch happens once they are linked.
async function setShadows(on) {
  const tog = $('#tShadow'), lab = tog.closest('label');
  if (on && QUALITY.low) { hideShadowToggle(); return; }
  if (on && !shadowsReady) {
    if (!shadowPrep) shadowPrep = (async () => {
      tog.disabled = true; lab.classList.add('busy'); const txt = lab.firstChild.nodeValue; lab.firstChild.nodeValue = 'Preparing shadows\u2026';
      buildShadowLights();
      try { await precompileShadows(); } catch (e) { console.warn('shadow precompile failed', e); }
      shadowsReady = true; lab.firstChild.nodeValue = txt; lab.classList.remove('busy'); tog.disabled = QUALITY.low;
    })();
    await shadowPrep;
    on = tog.checked && !QUALITY.low; // the user may have switched it off / the tier dropped meanwhile
  }
  applyShadows(on);
}

// ---------------- selection + panel ----------------
let selected = null; const selBox = new THREE.BoxHelper(new THREE.Object3D(), 0xd9ad57); selBox.visible = false; scene.add(selBox);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const EXT = '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M4.5 2.5H9.5V7.5M9.5 2.5L3 9" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const fmtPrice = (x) => (x?.price == null ? 'Price on request' : new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(x.price) + ' ' + esc(x.currency || ''));
const safeUrl = (u) => (/^https:\/\//.test(u || '') ? esc(u) : '#');
function shopHtml(k) {
  const e = shopOf(k); if (!e) return '';
  const P = e.puzzle, comps = e.components || [];
  return `<h4>Shop</h4><div class="shop">
    ${P?.url ? `<a class="shopbtn" href="${safeUrl(P.url)}" target="_blank" rel="noopener" title="${esc(P.name || '')}"><span class="t">View in shop</span><span class="pr">${fmtPrice(P)}</span>${EXT}</a>
      <div class="shopmeta"><span class="stk${P.in_stock ? '' : ' out'}"></span>${P.in_stock ? 'In stock' : 'Out of stock'}<span style="margin-left:auto;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:60%">${esc(P.name || '')}</span></div>` : ''}
    ${comps.length ? `<div class="meta" style="margin:12px 0 0">Components</div><ul class="comps">${comps.map((c) => `<li><span class="stk${c.in_stock ? '' : ' out'}" title="${c.in_stock ? 'In stock' : 'Out of stock'}"></span><a href="${safeUrl(c.url)}" target="_blank" rel="noopener" title="${esc(c.name || '')}">${esc(c.name || '')}</a><span class="pr">${fmtPrice(c)}</span></li>`).join('')}</ul>` : ''}
  </div>`;
}
function chip(k) { return `<button type="button" class="chip" data-k="${k}"><span class="n">${disp(k)}</span>${esc(PUZZLES[k]?.name || '')}</button>`; }
function select(obj, fly = false) {
  selected = obj; const panel = $('#panel');
  Object.values(labelEls).forEach((el) => el.classList.remove('on'));
  document.querySelectorAll('#puzzles li.item').forEach((li) => li.classList.toggle('on', obj && li.dataset.k === obj.userData.puzzle));
  if (!obj) { selBox.visible = false; panel.classList.remove('open'); syncSheets(); return; }
  if (smallMQ.matches && !sideMQ.matches) setDrawer(false);
  selBox.setFromObject(obj); selBox.visible = true;
  const p = obj.userData.prop, k = obj.userData.puzzle, P = PUZZLES[k] || {}, room = roomById[p.room];
  if (labelEls[k]) labelEls[k].classList.add('on');
  const siblings = propObjs.filter((o) => o.userData.puzzle === k && k);
  const prev = FLOW.filter((e) => e[1] === k).map((e) => e[0]), next = FLOW.filter((e) => e[0] === k).map((e) => e[1]);
  panel.innerHTML = `<div class="grab" aria-hidden="true"></div>
    <div class="top"><div class="big">${esc(k ? disp(k) : '')}</div><button type="button" class="close" id="pclose" aria-label="Close details">Close</button></div>
    <h3>${esc(P.name || p.name)}</h3>
    <div class="meta"><span class="dot" style="background:${room ? roomSwatch(room) : '#666'}"></span>${esc(room?.name || p.room)}${k ? '' : ' &middot; set dressing'}</div>
    <div class="prop"><b>Selected prop</b>${esc(p.name)}</div>
    ${P.desc ? `<p>${esc(P.desc)}</p>` : ''}
    ${shopHtml(k)}
    ${siblings.length > 1 ? `<h4>Props in this puzzle</h4><div class="chips">${siblings.map((o, i) => `<button class="chip" data-i="${propObjs.indexOf(o)}"><span class="n">${esc(o.userData.prop.id)}</span>${esc(o.userData.prop.name)}</button>`).join('')}</div>` : ''}
    ${prev.length || next.length ? `<h4>Game flow</h4>
      ${prev.length ? `<div class="meta" style="margin:4px 0">Comes after</div><div class="chips">${prev.map(chip).join('')}</div>` : ''}
      ${next.length ? `<div class="meta" style="margin:8px 0 4px">Leads to</div><div class="chips">${next.map(chip).join('')}</div>` : ''}` : ''}`;
  panel.classList.add('open'); panel.scrollTop = 0; syncSheets();
  $('#pclose').onclick = () => select(null);
  panel.querySelectorAll('.chip').forEach((b) => (b.onclick = () => select(b.dataset.k ? primary[b.dataset.k] : propObjs[+b.dataset.i], true)));
  if (fly) {
    const bb = new THREE.Box3().setFromObject(obj), c = bb.getCenter(new THREE.Vector3());
    if (mode === 'walk') {
      const sp = walkSpotFor(obj, bb), d = Math.hypot(sp[0] - c.x, sp[1] - c.z) || 1;
      walk.x = sp[0]; walk.z = sp[1]; walk.yaw = Math.atan2(sp[0] - c.x, sp[1] - c.z); walk.pitch = Math.max(-0.7, Math.min(0.35, Math.atan2(c.y - EYE, d)));
    }
    else { const ry = obj.rotation.y; flyTo(c, 330, 3, new THREE.Vector3(Math.sin(ry) * 0.6, 0.8, Math.cos(ry) * 0.6)); } // look from the prop's front, inside its room
  }
}

// ---------------- picking ----------------
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(); ray.layers.enable(PICK_LAYER); // per-prop pick meshes (render batches live on layer 0)
function pick(ev) {
  ndc.set((ev.clientX / innerWidth) * 2 - 1, -(ev.clientY / innerHeight) * 2 + 1); ray.setFromCamera(ndc, cam);
  const hit = ray.intersectObjects(propsG.children, true).find((h) => h.object.visible);
  return hit ? hit.object.userData.owner : null;
}
// Puzzle labels have pointer-events:none on small screens so they never block orbit/pinch gestures; taps are hit-tested here.
function labelAt(x, y) {
  if (!labelsG.visible) return null;
  const pad = isTouch() ? 10 : 2; let best = null, bd = Infinity;
  for (const k in labelEls) {
    const el = labelEls[k]; if (el.style.display === 'none' || !labelObjs[k].visible) continue;
    const r = el.getBoundingClientRect(); if (!r.width) continue;
    if (x < r.left - pad || x > r.right + pad || y < r.top - pad || y > r.bottom + pad) continue;
    const d = Math.hypot(x - (r.left + r.right) / 2, y - (r.top + r.bottom) / 2); if (d < bd) { bd = d; best = k; }
  }
  return best;
}
let down = null; const activePtrs = new Set();
renderer.domElement.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'touch' && !touchSeen) { touchSeen = true; document.body.classList.add('touch'); if (mode !== 'walk') setMode(mode); }
  if (e.isPrimary) activePtrs.clear();
  activePtrs.add(e.pointerId);
  if (activePtrs.size > 1) { if (down) down.multi = true; return; } // pinch: never a tap, never walk-look
  down = { id: e.pointerId, x: e.clientX, y: e.clientY, yaw: walk.yaw, pitch: walk.pitch, touch: e.pointerType === 'touch', moved: 0 };
  if (mode === 'walk') renderer.domElement.setPointerCapture(e.pointerId);
});
const endPtr = (e) => {
  activePtrs.delete(e.pointerId);
  if (!down || e.pointerId !== down.id) return;
  const tap = !down.multi && e.type === 'pointerup' && Math.hypot(e.clientX - down.x, e.clientY - down.y) < (down.touch ? 10 : 5) && down.moved < (down.touch ? 14 : 8);
  if (tap && e.target === renderer.domElement) { const k = labelAt(e.clientX, e.clientY); select(k ? primary[k] : pick(e)); if (smallMQ.matches && $('#drawer').classList.contains('open')) setDrawer(false); }
  down = null;
};
addEventListener('pointerup', endPtr); addEventListener('pointercancel', endPtr);
const tip = $('#tip'); let hoverT = 0;
renderer.domElement.addEventListener('pointermove', (e) => {
  if (down && e.pointerId === down.id) {
    down.moved = Math.max(down.moved, Math.hypot(e.clientX - down.x, e.clientY - down.y));
    if (mode === 'walk' && !down.multi) { const sens = down.touch ? 0.006 : 0.004; walk.yaw = down.yaw - (e.clientX - down.x) * sens; walk.pitch = Math.max(-1.3, Math.min(1.3, down.pitch - (e.clientY - down.y) * sens)); }
  }
  if (e.pointerType === 'touch') return; // no hover tooltip / raycast on touch
  const now = performance.now(); if (down || now - hoverT < 50) return; hoverT = now;
  const o = pick(e); renderer.domElement.style.cursor = o ? 'pointer' : '';
  if (o) { tip.textContent = (o.userData.puzzle ? o.userData.puzzle + '  ' : '') + o.userData.prop.name; tip.style.left = e.clientX + 14 + 'px'; tip.style.top = e.clientY + 12 + 'px'; tip.style.opacity = 1; }
  else tip.style.opacity = 0;
});
renderer.domElement.addEventListener('pointerleave', () => (tip.style.opacity = 0));
addEventListener('keydown', (e) => {
  if (!e.target.matches?.('input[type=text], input[type=search], textarea, select')) walk.keys.add(e.code);
  if (e.key === 'Escape') {
    if ($('#drawer').classList.contains('open')) { setDrawer(false); $('#menuBtn').focus(); }
    else if (selected) {
      const back = $('#panel').contains(document.activeElement), li = document.querySelector('#puzzles li.item.on');
      select(null); if (back) (li && li.offsetParent ? li : $('#modes button.on'))?.focus();
    }
  }
});
addEventListener('keyup', (e) => walk.keys.delete(e.code));
addEventListener('blur', () => walk.keys.clear());
// ---- walk-mode virtual joystick (touch) ----
{
  const joy = $('#joy'), knob = joy.querySelector('.knob'); let jid = null, c = null;
  const upd = (e) => {
    const R = joy.offsetWidth / 2 - 10; let dx = e.clientX - c.x, dy = e.clientY - c.y; const L = Math.hypot(dx, dy);
    if (L > R) { dx *= R / L; dy *= R / L; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    const m = Math.min(1, L / R), dead = 0.12, g = m < dead ? 0 : ((m - dead) / (1 - dead)) * (m > 0.95 ? 1.8 : 1.15) / (m || 1);
    walk.joy.x = dx / R * g; walk.joy.y = dy / R * g;
  };
  joy.addEventListener('pointerdown', (e) => { e.preventDefault(); jid = e.pointerId; joy.setPointerCapture(jid); const r = joy.getBoundingClientRect(); c = { x: r.left + r.width / 2, y: r.top + r.height / 2 }; upd(e); });
  joy.addEventListener('pointermove', (e) => { if (e.pointerId === jid) upd(e); });
  const rel = (e) => { if (e.pointerId !== jid) return; jid = null; walk.joy.x = walk.joy.y = 0; knob.style.transform = ''; };
  joy.addEventListener('pointerup', rel); joy.addEventListener('pointercancel', rel); joy.addEventListener('lostpointercapture', rel);
}

// ---- walk-mode collision ----
// Body radius 14 cm (was 22: left 31-46 cm lanes in 75-90 cm doorways). Movement is sub-stepped (<= 10 cm) so fast
// input at low fps can't tunnel through a 10 cm wall, slides along walls and around door jambs instead of stopping,
// and gets a gentle pull toward the middle of a doorway it is walking through.
const R_WALK = 14, EYE = 160, STEP = 10;
function nearestSeg(x, z) {
  let best = null;
  for (const [a, b] of collide) { const r = segDist([x, z], a, b); if (!best || r.d < best.d) best = { d: r.d, qx: a[0] + (b[0] - a[0]) * r.t, qz: a[1] + (b[1] - a[1]) * r.t }; }
  return best;
}
function blocked(x, z, r = R_WALK) {
  for (const [a, b] of collide) if (segDist([x, z], a, b).d < r) return true;
  return false;
}
// inside the building: any room, the wall band (doorways), or up to ~60 cm in front of a door to the outside
function walkable(x, z) {
  if (roomAt(x, z)) return true;
  for (const o of openings) if (segDist([x, z], o.a, o.b).d < (o.outside ? 62 : 14)) return true;
  for (const w of walls) if (segDist([x, z], w.a, w.b).d < w.t / 2 + 4) return true;
  return false;
}
function tryMove(dx, dz) {
  const x = walk.x, z = walk.z, wasIn = walkable(x, z);
  const ok = (px, pz) => !blocked(px, pz) && (!wasIn || walkable(px, pz));
  const go = (px, pz) => { walk.x = px; walk.z = pz; return true; };
  if (ok(x + dx, z + dz)) return go(x + dx, z + dz);
  const n = nearestSeg(x + dx, z + dz);
  if (n) { // slide: drop the component pointing into the wall / around the jamb end
    let nx = x - n.qx, nz = z - n.qz; const L = Math.hypot(nx, nz);
    if (L > 1e-6) {
      nx /= L; nz /= L; const dot = dx * nx + dz * nz;
      if (dot < 0) { const sx = dx - dot * nx, sz = dz - dot * nz; if (Math.hypot(sx, sz) > 0.05 && ok(x + sx, z + sz)) return go(x + sx, z + sz); }
    }
  }
  if (dx && ok(x + dx, z)) return go(x + dx, z);
  if (dz && ok(x, z + dz)) return go(x, z + dz);
  // stuck inside a collider (old spawn, resize...): any move that gets further from the nearest wall is allowed
  if (blocked(x, z)) { const d0 = nearestSeg(x, z).d, d1 = nearestSeg(x + dx, z + dz).d; if (d1 > d0) return go(x + dx, z + dz); }
  return false;
}
// doorway assist: walking across an opening near a jamb nudges sideways toward its centre
function doorAssist(dx, dz) {
  const L = Math.hypot(dx, dz); if (!L) return [dx, dz];
  for (const o of openings) {
    const px = walk.x - o.c[0], pz = walk.z - o.c[1], along = px * o.u[0] + pz * o.u[1], across = px * o.n[0] + pz * o.n[1];
    if (Math.abs(across) > 70 || Math.abs(along) > o.hw + 10) continue; // only when the body overlaps the opening
    const ma = dx * o.n[0] + dz * o.n[1]; // movement across the wall
    if (Math.abs(ma) < 0.35 * L || (across * ma > 0 && Math.abs(across) > 8)) continue; // not heading through it
    const lim = Math.max(0, o.hw - R_WALK - 6), want = Math.max(-lim, Math.min(lim, along)) - along;
    if (Math.abs(want) < 0.01) continue;
    const k = Math.sign(want) * Math.min(Math.abs(want), 0.6 * Math.abs(ma));
    return [dx + o.u[0] * k, dz + o.u[1] * k];
  }
  return [dx, dz];
}
function stepWalk(dt) {
  const k = walk.keys, sp = (k.has('ShiftLeft') || k.has('ShiftRight') ? 320 : 150) * dt;
  let f = -walk.joy.y, s = walk.joy.x;
  if (k.has('KeyW') || k.has('ArrowUp')) f += 1; if (k.has('KeyS') || k.has('ArrowDown')) f -= 1;
  if (k.has('KeyD') || k.has('ArrowRight')) s += 1; if (k.has('KeyA') || k.has('ArrowLeft')) s -= 1;
  const m = Math.hypot(f, s); if (m > 1.8) { f *= 1.8 / m; s *= 1.8 / m; } // joystick + keys don't add up
  const sy = Math.sin(walk.yaw), cy = Math.cos(walk.yaw);
  const dx = (-sy * f + cy * s) * sp, dz = (-cy * f - sy * s) * sp, n = Math.ceil(Math.hypot(dx, dz) / STEP);
  for (let i = 0; i < n; i++) { const [ex, ez] = doorAssist(dx / n, dz / n); if (!tryMove(ex, ez)) break; }
  persp.position.set(walk.x, EYE, walk.z); persp.rotation.set(walk.pitch, walk.yaw, 0, 'YXZ');
}
// ---- walk-mode spawn points ----
let propBoxes = null; // body-height prop footprints (lazy: world boxes of every prop)
// room-wide dressing (ivy walls, snow drifts... one prop spanning the whole room) is not an obstacle: skip > 5 m2 footprints
const bodyBoxes = () => propBoxes || (propBoxes = propObjs.map((o) => ({ o, b: new THREE.Box3().setFromObject(o) }))
  .filter(({ b }) => b.max.y > 60 && b.min.y < EYE && (b.max.x - b.min.x) * (b.max.z - b.min.z) < 50000));
const inPropBox = (x, z, ignore, m = 12) => bodyBoxes().some(({ o, b }) => o !== ignore && x > b.min.x - m && x < b.max.x + m && z > b.min.z - m && z < b.max.z + m);
function segCross(p1, p2, q1, q2) {
  const d = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  return d(p1, p2, q1) * d(p1, p2, q2) < 0 && d(q1, q2, p1) * d(q1, q2, p2) < 0;
}
const losClear = (p, q) => !collide.some(([a, b]) => segCross(p, q, a, b));
const spotOK = (x, z, room, ignore, strict) => (!room || inPoly([x, z], room.polygon)) && !blocked(x, z, R_WALK + 16) && (!strict || !inPropBox(x, z, ignore));
function freeSpot(x, z, room, ignore = null) {
  for (const strict of [true, false]) for (let r = 0; r <= 300; r += 15) for (let k = 0, n = r ? 16 : 1; k < n; k++) {
    const a = (k / n) * Math.PI * 2, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
    if (spotOK(px, pz, room, ignore, strict)) return [px, pz];
  }
  return null;
}
function placeInRoom(id) {
  const r = roomById[id]; if (!r) return;
  const ip = innerPoint(r.polygon), sp = freeSpot(ip[0], ip[1], r) || ip; walk.x = sp[0]; walk.z = sp[1];
}
// where to stand to look at a prop: in front of it, else around it at 85-200 cm, inside the prop's room, clear of
// walls and other props, with a free line of sight; fallback: a free spot in the room
function walkSpotFor(obj, bb) {
  const c = bb.getCenter(new THREE.Vector3()), sz = bb.getSize(new THREE.Vector3()), p = obj.userData.prop;
  const room = roomById[p.room] || roomAt(c.x, c.z), half = Math.hypot(sz.x, sz.z) / 2, ry = obj.rotation.y;
  for (const strict of [true, false]) for (const da of [0, 30, -30, 60, -60, 90, -90, 120, -120, 150, -150, 180]) for (const dist of [110, 85, 140, 170, 200]) {
    const a = ry + da * deg, d = Math.max(dist, Math.min(half + 45, 260)), x = c.x + Math.sin(a) * d, z = c.z + Math.cos(a) * d;
    if (spotOK(x, z, room, obj, strict) && (!strict || losClear([x, z], [c.x, c.z]))) return [x, z];
  }
  const ip = room ? innerPoint(room.polygon) : [c.x, c.z];
  return freeSpot(ip[0], ip[1], room, obj) || ip;
}

// ---------------- loop ----------------
const animated = propObjs.filter((o) => o.userData.animate);
const clock = new THREE.Clock();
let frameN = 0, walkRoom = null;
const labelRoom = {}; for (const k in labelObjs) labelRoom[k] = primary[k].userData.prop.room || roomAt(anchor[k].x, anchor[k].z)?.id;
// Walk mode: only the current room's puzzle numbers, and only when no wall stands between eye and label (2D test
// against the body-height wall segments; the old raycast missed the merged wall meshes, so numbers showed through).
function occludeLabels() {
  walkRoom = roomAt(walk.x, walk.z)?.id ?? walkRoom; // in a doorway: keep the room we came from
  const e = [walk.x, walk.z];
  for (const k in labelObjs) {
    const a = anchor[k], L = Math.hypot(a.x - e[0], a.z - e[1]);
    labelObjs[k].visible = labelRoom[k] === walkRoom && L < 900 && losClear(e, [a.x, a.z]);
  }
}
// CSS2D labels: only touch the DOM when the camera (or label visibility) actually changed
const lastCamM = new THREE.Matrix4(), lastProjM = new THREE.Matrix4(); let lastCam = null;
function renderLabels() {
  if (!labelsDirty && cam === lastCam && lastCamM.equals(cam.matrixWorld) && lastProjM.equals(cam.projectionMatrix)) return;
  labelsDirty = false; lastCam = cam; lastCamM.copy(cam.matrixWorld); lastProjM.copy(cam.projectionMatrix);
  labelRenderer.render(scene, cam);
}
// Slow-GPU probe: median frame time of frames 10-40 above 40 ms on the high tier -> drop bloom, pixel ratio and
// shadows (no shader recompiles), remember the low tier for reloads of this page, and say so.
const probe = { n: 0, dts: [], done: QUALITY.low || QUALITY.forced };
function notice(html, ms = 12000) {
  $('#note')?.remove();
  document.body.insertAdjacentHTML('beforeend', `<div id="note" class="panel" role="status"><div>${html}</div><button type="button" class="close" aria-label="Dismiss">OK</button></div>`);
  const el = $('#note'); el.querySelector('button').onclick = () => el.remove(); setTimeout(() => el.remove(), ms);
}
function goLow(why) {
  if (QUALITY.low) return; QUALITY.low = true; markAutoLow();
  if (bloomPass) bloomPass.enabled = false;
  if (gtaoPass) gtaoPass.enabled = false;
  renderer.setPixelRatio(pixelRatio()); renderer.setSize(innerWidth, innerHeight);
  if (composer) { composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(innerWidth, innerHeight); }
  if ($('#tShadow').checked) applyShadows(false); hideShadowToggle();
  notice(`3D was running slowly (${why}), so light mode is on. <a href="?q=high" style="color:var(--accent)">Full quality</a>`);
}
function probeFrame(raw) {
  if (probe.done) return;
  if (document.hidden || raw > 1) { probe.n = 0; probe.dts.length = 0; return; } // background tab / stall: start over
  if (++probe.n > 10) probe.dts.push(raw);
  if (probe.dts.length >= 30) {
    probe.done = true; const med = probe.dts.sort((a, b) => a - b)[15] * 1000;
    if (med > 40) goLow(Math.round(1000 / med) + ' fps');
  }
}
function frame() {
  const raw = clock.getDelta(), dt = Math.min(0.05, raw), t = clock.elapsedTime;
  probeFrame(raw);
  stepTween(dt);
  if (mode === 'walk') stepWalk(dt); else if (mode === 'iso') orbitP.update(); else orbitO.update();
  causticUniforms.uTime.value = t;
  animated.forEach((o) => o.userData.animate(t));
  if (flowG.visible) pulses.forEach((p) => p.s.position.copy(p.curve.getPoint((t * 0.35 + p.o) % 1)));
  if (selected) selBox.setFromObject(selected);
  if (mode === 'walk' && (labelsDirty || frameN++ % 8 === 0)) { occludeLabels(); labelsDirty = true; }
  if (!glLost) { if (composer) composer.render(); else renderer.render(scene, cam); }
  renderLabels();
  requestAnimationFrame(frame);
}
addEventListener('resize', () => {
  persp.aspect = innerWidth / innerHeight; persp.updateProjectionMatrix(); fitOrtho();
  renderer.setPixelRatio(pixelRatio()); renderer.setSize(innerWidth, innerHeight);
  if (composer) { composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(innerWidth, innerHeight); }
  labelRenderer.setSize(innerWidth, innerHeight); labelsDirty = true;
});
// ---------------- engineer mode (cable routes wall by wall) ----------------
const ENG = initEngineer({ THREE, CSS2DObject, world, plan, rooms, walls, propObjs, persp, orbitP, setMode, getMode: () => mode, WALL_H, $, onDirty: () => { labelsDirty = true; } });
$('#tEng').addEventListener('change', (e) => { ENG.setOn(e.target.checked); if (e.target.checked && smallMQ.matches) setDrawer(false); });
if (new URLSearchParams(location.search).get('eng') === '1') { $('#tEng').checked = true; ENG.setOn(true); }
if (GAME_LINK?.url) $('#side header').insertAdjacentHTML('beforeend', `<a class="gamelink" href="${safeUrl(GAME_LINK.url)}" target="_blank" rel="noopener" title="${esc(GAME_LINK.name || '')}"><span>View full game kit in shop</span>${EXT}</a>`);
if (GAME_LINK?.url) $('#drawer .grab').insertAdjacentHTML('afterend', `<a class="gamelink m" href="${safeUrl(GAME_LINK.url)}" target="_blank" rel="noopener"><span>View full game kit in shop</span>${EXT}</a>`);
setMode('iso');
envOnMetals();
// Compile every shader program before the first frame without blocking the main thread
// (KHR_parallel_shader_compile); hidden walk-mode parts are included so switching modes doesn't stall.
{
  const m0 = mode, hidden = [ceilG, flowG, ...overheadObjs].filter((o) => !o.visible);
  hidden.forEach((o) => (o.visible = true));
  let p; try { p = precompile(); } catch (e) { console.warn('compile failed', e); }
  if (mode === m0) hidden.forEach((o) => (o.visible = false)); else setMode(mode);
  try { await p; } catch (e) { console.warn('compileAsync failed', e); }
}
frame();
requestAnimationFrame(() => window.__boot?.done()); // hide the loading card once the first frame is on screen
if (REAL) { $('#tShadow').checked = true; setShadows(true); }
if (QUALITY.software && !QUALITY.forced) notice('Your browser is drawing 3D without the graphics card (software rendering), so light mode is on. Turn on hardware acceleration in the browser settings for full quality.', 15000);
// real textures are generated in a worker after the first frame and swapped in as they finish
const texReady = { done: false, at: 0 };
requestAnimationFrame(() => setTimeout(() => startTextures().then(() => { texReady.done = true; texReady.at = performance.now(); if (window.__ftl) { window.__ftl.texturesReady = true; window.__ftl.texturesReadyAt = texReady.at; } }), 50));
window.__ftl = { renderer, scene, get quality() { return QUALITY.low ? 'low' : 'high'; }, texturesReady: texReady.done, setMode, select, goRoom, setShadows, propObjs, eng: ENG, primary, walk, persp, orbitP, labelObjs, get mode() { return mode; } };
