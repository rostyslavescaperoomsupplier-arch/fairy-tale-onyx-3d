// Procedural PBR-style textures (colour + normal maps, generated in code) +
// per-room themes + shared prop materials + water caustics.
// UV convention: geometry UVs are in cm / T, where T = cm covered by one tile
// (stored in texture.userData.T), so patterns keep a real-world scale.
//
// Memory / startup: every texture set starts as a 1x1 flat-colour placeholder so
// the scene renders immediately; startTextures() then generates the real maps in
// a Worker (OffscreenCanvas; batched main-thread fallback) and swaps them in.
// Roughness maps are replaced by a scalar (their mean), normal maps are half the
// colour resolution, colour variants of one finish share a single greyscale
// texture tinted through material.color.
import * as THREE from 'three';
import { rng, build, linRGB, s2l, l2s } from './texgen.js?v=202611091303';
export { rng };

// ---------- quality tier ----------
// low: phones/tablets (coarse pointer), small screens, <=4 GB RAM, small GPUs, software GL, or ?q=low.  ?q=high forces high.
// An automatic downgrade (GPU reset loop, software renderer, slow first frames) is remembered for this tab and
// this page only (sessionStorage keyed by pathname), so it never leaks into the URL or into the other game.
const qp = new URLSearchParams(location.search).get('q');
const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
const small = Math.min(screen.width, screen.height) < 600;
const lowMem = !!navigator.deviceMemory && navigator.deviceMemory <= 4;
const AUTO_KEY = 'q3dAutoLow:' + location.pathname;
const ssGet = (k) => { try { return sessionStorage.getItem(k); } catch (e) { return null; } };
const ssSet = (k, v) => { try { sessionStorage.setItem(k, v); } catch (e) { /* storage blocked */ } };
const autoLow = ssGet(AUTO_KEY) === '1';
export const QUALITY = {
  low: qp === 'low' || (qp !== 'high' && (coarse || small || lowMem || autoLow)),
  forced: qp === 'low' || qp === 'high', auto: autoLow, software: false, gpu: '', maxTex: 4096, aniso: 8,
};
export { ssGet, ssSet };
// remember an automatic low-tier decision for reloads of this page in this tab
export function markAutoLow() { ssSet(AUTO_KEY, '1'); QUALITY.auto = true; }
const SOFTWARE_GL = /swiftshader|llvmpipe|softpipe|software|basic render/i;
// call once the renderer exists: small GPUs and software rasterisers drop to the low tier.
// Returns true when the tier changed (the caller may rebuild a renderer that was created with high-tier options).
export function refineQuality(renderer) {
  const cap = renderer.capabilities, gl = renderer.getContext(), was = QUALITY.low;
  try { const ext = gl.getExtension('WEBGL_debug_renderer_info'); QUALITY.gpu = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) || ''); } catch (e) { /* hidden by the browser */ }
  QUALITY.software = SOFTWARE_GL.test(QUALITY.gpu);
  if (!QUALITY.forced && (cap.maxTextureSize < 8192 || QUALITY.software)) QUALITY.low = true;
  if (QUALITY.software && !QUALITY.forced) markAutoLow();
  QUALITY.maxTex = cap.maxTextureSize; QUALITY.aniso = Math.min(QUALITY.low ? 2 : 8, cap.getMaxAnisotropy());
  return QUALITY.low !== was;
}

// ---------- photo textures (local experiment) ----------
// data/photos.js: { key: { src, normal, T, aspect } } replaces the generated maps of that texture key with a tiled
// photo (T = cm across one tile, aspect = width / height). On by default only on localhost; ?photo=1 / ?photo=0 forces it.
const pq = new URLSearchParams(location.search).get('photo');
export const PHOTO_ON = pq ? pq === '1' : /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
let PHOTOS = {};
export let PHOTO_PROPS = {}; // prop id or builder kind -> photo faces (used by lib/props.js)
if (PHOTO_ON) try { const m = await import(new URL('../data/photos.js?v=202611091303', import.meta.url).href); PHOTOS = m.default || {}; PHOTO_PROPS = m.props || {}; } catch (e) { /* this game has no photo set */ }
const photoLoader = new THREE.TextureLoader();
function loadPhoto(set, ph) {
  const swap = (prop, t) => {
    for (const m of set.users) if (m[prop] === set[prop]) m[prop] = t;
    if (set[prop] !== flatN) set[prop].dispose();
    set[prop] = t;
  };
  const load = (src, prop, srgb) => photoLoader.load(new URL('../' + src, import.meta.url).href, (t) => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = QUALITY.aniso; t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.repeat.set(1, ph.aspect || 1); t.userData = { T: set.T, px: t.image.width, photo: true };
    swap(prop, t);
  }, undefined, () => console.warn('photo texture missing', src));
  load(ph.src, 'map', true);
  if (ph.normal) load(ph.normal, 'normalMap', false);
}

// ---------- texture sets ----------
const SETS = new Map();     // key -> set
const flatN = new THREE.DataTexture(new Uint8Array([128, 128, 255, 255]), 1, 1); flatN.needsUpdate = true;
const fl = (hex) => linRGB(hex).map((v) => l2s(v) * 255);          // plain sRGB colour
const fr = (hex, k = 1) => linRGB(hex).map((v) => v * 255 * k);     // what rgbOf()-based generators write
function solid(rgb, T) {
  const t = new THREE.DataTexture(new Uint8Array([rgb[0], rgb[1], rgb[2], 255].map((v) => Math.max(0, Math.min(255, Math.round(v))))), 1, 1);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = t.minFilter = THREE.LinearFilter;
  t.userData.T = T; t.needsUpdate = true; return t;
}
// opts: gen (texgen.js generator), args, size (design px), T (cm per tile), normal (strength),
// rough (mean roughness of the old roughness map), flat (placeholder rgb), tint (hex -> shared greyscale), content (shared job key)
function pbr(key, { size = 1024, T = 100, normal = 3, rough = 0.88, flat = [128, 128, 128], tint = null, tintL = 1.15, gen, args = [], content = key }) {
  if (SETS.has(key)) return SETS.get(key);
  const ph = PHOTOS[key];
  if (ph) { T = ph.T; tint = null; content = 'photo:' + key; }
  let tc = null;
  if (tint) { const l = linRGB(tint); tc = new THREE.Color().setRGB(s2l(l[0] * tintL), s2l(l[1] * tintL), s2l(l[2] * tintL)); flat = [200, 200, 200]; }
  const set = { key, T, roughness: rough, tint: tc, users: new Set(), map: solid(flat, T), normalMap: flatN, job: { key: content, gen, args, design: size, normal } };
  SETS.set(key, set);
  if (ph) { set.photo = set.ready = true; loadPhoto(set, ph); return set; }
  if (started) setTimeout(() => lateSet(set), 0); // registered after generation started (lazy prop finishes)
  return set;
}
const TX = {
  // damask(key, [bg, motif, line, goldHex, goldK]) - no args = Fairy Tale red/gold
  damask: (key = 'damask', args = [], T = 95) => pbr(key, { T, normal: 2.2, rough: 0.82, flat: fl(args[0] || '#7a2620'), gen: 'damask', args }),
  planks: (base = '#3B2B20', key = 'planks', T = 140) => pbr(key, { T, normal: 3, rough: 0.75, flat: fl(base), gen: 'planks', args: [base, key] }),
  // flagstone(key, [joint, stoneA, stoneB, speckles[]]) - no args = Fairy Tale brown
  flagstone: (key = 'flag', args = [], T = 170) => pbr(key, { T, normal: 2.5, rough: 0.85, flat: fl(args[2] || '#8f7a5c'), gen: 'flagstone', args }),
  stoneWall: (key = 'stoneWall', args = [], T = 150) => pbr(key, { T, normal: 3, rough: 0.9, flat: fl('#b49a7a'), gen: 'stoneWall', args }),
  brick: (key = 'brick', args = [], T = 100) => pbr(key, { T, normal: 2.5, rough: 0.9, flat: fl('#a85a42'), gen: 'brick', args }),
  galaxy: (key = 'galaxy', T = 260) => pbr(key, { T, normal: 0.5, rough: 1, flat: fl('#141436'), gen: 'galaxy' }),
  bark: () => pbr('bark', { T: 190, normal: 5, rough: 0.67, flat: fr(0x5a1f24), gen: 'bark' }),
  grass: () => pbr('grass', { T: 60, normal: 2, rough: 0.9, flat: fl('#3d6420'), gen: 'grass' }),
  castleStone: () => pbr('castle', { T: 160, normal: 3.5, rough: 0.85, flat: fl('#a89a70'), gen: 'castleStone' }),
  boards: (base, key, T = 100) => pbr(key, { size: 512, T, normal: 2, rough: 0.7, flat: fl(base), gen: 'boards', args: [base, key] }),
  plaster: (base, key, spread = 0.06, T = 100, bump = 1.5, size = 1024) => pbr(key, { size, T, normal: bump, rough: 0.88, flat: fr(base), gen: 'plaster', args: [base, key, spread] }),
  tiles: (base, key, T = 120) => pbr(key, { T, normal: 2, rough: 0.45, flat: fr(base, 0.9), gen: 'tiles', args: [base, key] }),
  snow: () => pbr('snow', { size: 512, T: 40, normal: 4, rough: 0.95, flat: [235, 240, 245], gen: 'snow' }),
  stucco: (base = '#A08B70', key = 'stucco', T = 130) => pbr(key, { T, normal: 4, rough: 0.92, flat: fr(base), gen: 'stucco', args: [base, key] }),
  fabric: () => pbr('fabric', { size: 512, T: 120, normal: 3, rough: 0.95, flat: fr(0xefe4cc, 0.94), gen: 'fabric' }),
  caveRock: () => pbr('cave', { T: 170, normal: 7, rough: 0.85, flat: fr(0x868a90), gen: 'caveRock' }),
  concrete: (base, key, T = 120) => pbr(key, { size: 512, T, normal: 1.5, rough: 0.85, flat: fr(base), gen: 'concrete', args: [base, key] }),
  // ---- prop finishes (tile in cm via box UVs) ----
  crackle: (dark, light, key) => pbr(key, { size: 512, T: 40, normal: 3, rough: 0.62, flat: fl(dark), gen: 'crackle', args: [dark, light, key] }),
  plywood: (base, key, T = 45) => pbr(key, { size: 512, T, normal: 1.2, rough: 0.7, tint: base, gen: 'plywoodTint', content: 'plywoodTint' }),
  brushed: (base, key) => pbr(key, { size: 512, T: 30, normal: 0.8, rough: 0.52, tint: base, gen: 'brushedTint', content: 'brushedTint' }),
  agedGold: (base, key) => pbr(key, { size: 512, T: 25, normal: 1.5, rough: 0.42, tint: base, gen: 'agedGoldTint', content: 'agedGoldTint' }),
  rope: (base, key) => pbr(key, { size: 256, T: 6, normal: 4, rough: 0.95, tint: base, gen: 'ropeTint', content: 'ropeTint' }),
  stoneProp: (base, key, T = 35) => pbr(key, { size: 512, T, normal: 3, rough: 0.9, tint: base, tintL: 1.2, gen: 'stoneTint', content: 'stoneTint' }),
  spines: () => pbr('spines', { size: 256, T: 1, normal: 2, rough: 0.7, flat: [200, 200, 200], gen: 'spines' }),
};
export const textures = TX;

// ---------- progressive generation ----------
let started = null;
function sizesFor(design) {
  const size = QUALITY.low ? Math.max(128, Math.min(512, design / 2)) : Math.min(design, 1024, QUALITY.maxTex);
  return { size, nsize: Math.max(64, size / 2) };
}
function apply(res) {
  const sets = [...SETS.values()].filter((s) => s.job.key === res.key && !s.ready);
  let c0 = null, n0 = null;
  for (const set of sets) {
    let c, n;
    if (!c0) {
      const mk = (data, sz, srgb) => {
        const bmp = typeof ImageBitmap !== 'undefined' && data instanceof ImageBitmap;
        const t = bmp ? new THREE.Texture(data) : new THREE.DataTexture(data, sz, sz, THREE.RGBAFormat);
        t.flipY = false; t.userData.px = sz;
        t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
        t.generateMipmaps = true; t.unpackAlignment = 4; t.anisotropy = QUALITY.aniso; t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        // pixels live on the GPU now: free the CPU copy (clones share the same Source, so this runs once)
        t.onUpdate = bmp ? () => data.close() : () => { t.image.data = null; };
        t.needsUpdate = true; return t;
      };
      c = c0 = mk(res.color, res.size, true); n = n0 = mk(res.normal, res.nsize, false);
    } else { c = c0.clone(); n = n0.clone(); c.onUpdate = c0.onUpdate; n.onUpdate = n0.onUpdate; } // clones share the GPU texture (same Source)
    c.userData = { T: set.T, px: res.size }; n.userData = { T: set.T, px: res.nsize };
    for (const m of set.users) { if (m.map === set.map) m.map = c; if (m.normalMap === set.normalMap) m.normalMap = n; }
    set.map.dispose(); set.map = c; set.normalMap = n; set.ready = true;
  }
}
function lateSet(set) {
  if (set.ready) return;
  const donor = [...SETS.values()].find((s) => s.ready && s.job.key === set.job.key);
  if (!donor) { apply(build({ ...set.job, ...sizesFor(set.job.design) })); return; }
  const c = donor.map.clone(), n = donor.normalMap.clone(); c.userData = { ...donor.map.userData, T: set.T }; n.userData = { ...donor.normalMap.userData, T: set.T };
  for (const m of set.users) { if (m.map === set.map) m.map = c; if (m.normalMap === set.normalMap) m.normalMap = n; }
  set.map.dispose(); set.map = c; set.normalMap = n; set.ready = true;
}
// Generate every registered set (call after the first frame). Resolves when all maps are in.
export function startTextures() {
  if (started) return started;
  const jobs = [], seen = new Set();
  for (const s of SETS.values()) if (!s.photo && !seen.has(s.job.key)) { seen.add(s.job.key); jobs.push({ ...s.job, ...sizesFor(s.job.design) }); }
  const mainThread = async (list) => {
    for (const j of list) { await new Promise((ok) => setTimeout(ok, 30)); try { apply(build(j)); } catch (e) { console.warn('texture', j.key, e); } }
  };
  started = new Promise((done) => {
    let w;
    try { w = new Worker(new URL('./texworker.js?v=202611091303', import.meta.url), { type: 'module' }); } catch (e) { w = null; }
    if (!w) { mainThread(jobs).then(done); return; }
    let left = jobs.length, fellBack = false, watchdog = 0;
    // worker missing, crashed or silently killed (OOM, tab discard of the worker): build what is still flat on the main thread
    const fallback = (why) => {
      if (fellBack) return; fellBack = true; clearTimeout(watchdog);
      console.warn('Texture worker unavailable, generating on main thread:', why); try { w.terminate(); } catch (e) { /* already gone */ }
      mainThread(jobs.filter((j) => [...SETS.values()].some((s) => s.job.key === j.key && !s.ready))).then(done);
    };
    // no reply for a while = the worker died without an error event (big textures take ~1 s each on slow phones)
    const arm = (ms) => { clearTimeout(watchdog); watchdog = setTimeout(() => fallback('no reply for ' + ms / 1000 + ' s'), ms); };
    arm(8000);
    w.onerror = (e) => { e.preventDefault?.(); fallback(e.message || 'error'); };
    w.onmessageerror = () => fallback('message error');
    w.onmessage = (e) => {
      if (fellBack) return;
      const d = e.data;
      if ('ready' in d) { if (!d.ready) return fallback('no OffscreenCanvas 2D'); for (const j of jobs) w.postMessage(j); if (!jobs.length) { clearTimeout(watchdog); done(); } else arm(15000); return; }
      try {
        if (d.error) { console.warn('texture', d.key, d.error); const j = jobs.find((q) => q.key === d.key); if (j) apply(build(j)); }
        else apply(d);
      } catch (err) { console.warn('texture apply failed', d.key, err); }
      if (--left === 0) { clearTimeout(watchdog); setTimeout(() => w.terminate(), 5000); done(); } else arm(15000);
    };
  });
  return started;
}

// ---------- material factories ----------
// set.roughness = mean of the former roughness map, so an explicit roughness keeps acting as a multiplier
export function std(set, o = {}) {
  const { ns = 1, color, roughness = 1, ...rest } = o;
  const c = new THREE.Color(color ?? 0xffffff); if (set.tint) c.multiply(set.tint);
  const m = new THREE.MeshStandardMaterial({ map: set.map, normalMap: set.normalMap, metalness: 0, ...rest, color: c, roughness: roughness * set.roughness, normalScale: new THREE.Vector2(ns, ns) });
  set.users.add(m); return m;
}
const T_OF = (m) => m?.map?.userData?.T || 100;
export const texScale = T_OF;

// ---------- water caustics (shader patch, shared clock) ----------
export const causticUniforms = { uTime: { value: 0 } };
export function addCaustics(mat, color, k = 0.35, scale = 0.032) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = causticUniforms.uTime; sh.uniforms.uCC = { value: new THREE.Color(color).multiplyScalar(k) };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vCW;')
      .replace('#include <fog_vertex>', '#include <fog_vertex>\nvCW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vCW; uniform float uTime; uniform vec3 uCC;
float causticF(vec2 p, float t) {
  vec2 i = p; float c = 1.0; float inten = 0.005;
  for (int n = 0; n < 4; n++) { float tt = t * (1.0 - (3.5 / float(n + 1)));
    i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
    c += 1.0 / length(vec2(p.x / (sin(i.x + tt) / inten), p.y / (cos(i.y + tt) / inten))); }
  c /= 4.0; c = 1.17 - pow(c, 1.4); return clamp(pow(abs(c), 8.0), 0.0, 1.0);
}`).replace('#include <opaque_fragment>', `{ vec2 cp = vec2(vCW.x + vCW.y * 0.7, vCW.z - vCW.y * 0.7) * ${scale.toFixed(4)};
  float ca = pow(clamp(1.0 - causticF(cp + 20.0, uTime * 0.45), 0.0, 1.0), 3.0) * 1.6;
  outgoingLight += uCC * ca * (0.35 + diffuseColor.rgb); }
#include <opaque_fragment>`);
  };
  mat.customProgramCacheKey = () => 'caustic' + color + k + scale;
  return mat;
}

// ---------- themes ----------
// Built-in themes are created lazily (first access), so a game only generates the textures of
// the themes it uses. themes(extra): game themes from data/themes.js (`export const THEMES`),
// either an object or a function ({ THREE, std, textures, addCaustics, QUALITY }) => object.
let THEMES = null;
function lazy(obj, key, make) {
  Object.defineProperty(obj, key, { configurable: true, enumerable: true, get() { const v = make(); Object.defineProperty(obj, key, { value: v, enumerable: true, configurable: true }); return v; } });
}
const fixT = (th) => { for (const m of ['floor', 'wall']) if (th[m]?.map) th[m].map.userData.T ??= 100; return th; };
export function themes(extra) {
  if (THEMES) return THEMES;
  let flagM = null; const flag = () => (flagM ??= std(TX.flagstone()));
  const BUILTIN = {
    library: () => ({ label: 'Library', swatch: '#a8362b', floor: std(TX.planks('#3B2B20', 'libFloor', 140)), wall: std(TX.damask()), ceiling: flag(), light: 0xffb868, li: 1.45, fill: 0x6a2a1a }),
    forest: () => ({ label: 'Sleepy Forest', swatch: '#4f7a2a', floor: std(TX.grass()), wall: std(TX.bark(), { ns: 1.2 }), ceiling: std(TX.concrete('#141a10', 'forestCeil')), light: 0xffa640, li: 0.95, fill: 0x2a1840 }),
    castle: () => ({ label: 'Sleepy Forest - castle', swatch: '#b9a678', floor: std(TX.boards('#CFC6B0', 'castleFloor')), wall: addCaustics(std(TX.castleStone(), { color: 0xd8d0c0 }), 0xffd070, 0.16), ceiling: 0x2a2620, light: 0xffc650, li: 1.05, fill: 0x403010 }),
    frozen: () => ({ label: 'Frozen Kingdom', swatch: '#2fa8ff', floor: addCaustics(std(TX.tiles('#D8D8D2', 'frozenFloor'), { roughness: 1 }), 0x7fd8ff, 0.1), wall: addCaustics(std(TX.plaster('#E9EEF2', 'frozenWall', 0.03, 100, 1.2)), 0x7fd8ff, 0.2), ceiling: 0xf2f5f8, light: 0x3aa8ff, li: 1.0, fill: 0x123a6a }),
    djinn: () => ({ label: "Djinn's Vault", swatch: '#ff9a3c', floor: std(TX.stucco('#CBBFA8', 'djinnFloor', 160), { ns: 0.4 }), wall: std(TX.stucco('#b29e84')), ceiling: std(TX.fabric(), { side: THREE.DoubleSide, roughness: 1 }), tent: true, light: 0xff9a3c, li: 1.45, fill: 0x3a2010 }),
    mermaid: () => ({ label: 'Mermaid Cave', swatch: '#8f9399', floor: addCaustics(std(TX.concrete('#9A9A98', 'mermaidFloor')), 0xe8f4ff, 0.12), wall: addCaustics(std(TX.caveRock()), 0xe8f4ff, 0.22), ceiling: flag(), light: 0xdfeaff, li: 1.55, fill: 0x10303a }),
    neutral: () => ({ label: '', swatch: '#6a6d73', floor: new THREE.MeshStandardMaterial({ color: 0x55585e, roughness: 0.9 }), wall: new THREE.MeshStandardMaterial({ color: 0x55585e, roughness: 0.9 }), ceiling: 0x303236, light: 0xffffff, li: 0.8 }),
  };
  THEMES = {};
  for (const k in BUILTIN) lazy(THEMES, k, () => fixT(BUILTIN[k]()));
  if (extra) {
    let made = null; const all = () => (made ??= typeof extra === 'function' ? extra({ THREE, std, textures: TX, addCaustics, QUALITY }) : extra);
    const keys = typeof extra === 'function' ? Object.keys(all()) : Object.keys(extra);
    for (const k of keys) lazy(THEMES, k, () => fixT(all()[k]));
  }
  return THEMES;
}

// ---------- shared prop finishes ----------
// Lazy: a finish (and its texture job) is only created when a prop builder first uses it.
let PM = null;
export function propFinishes() {
  if (PM) return PM;
  const st = (set, o) => std(set, o);
  const F = {
    crackle: () => st(TX.crackle('#1c1b1a', '#b9bcc0', 'crackBlack'), { metalness: 0.35 }),
    crackleGreen: () => st(TX.crackle('#2f342b', '#8a9a80', 'crackGreen')),
    birch: () => st(TX.plywood('#d9b98a', 'birch')), darkWood: () => st(TX.plywood('#3a2414', 'darkwood')), wood: () => st(TX.plywood('#6b4423', 'wood')),
    lightWood: () => st(TX.plywood('#9c7448', 'lightwood')), stained: () => st(TX.plywood('#4e3a2a', 'stained')), lectern: () => st(TX.plywood('#3a2a20', 'lectern')),
    shelfWood: () => st(TX.plywood('#2e2119', 'shelfwood', 60)),
    mdf: () => st(TX.plaster('#f2f2ee', 'mdf', 0.02, 40, 0.6, 512)),
    iron: () => st(TX.brushed('#2c2c30', 'iron'), { metalness: 0.85 }), steel: () => st(TX.brushed('#9aa0a8', 'steel'), { metalness: 0.9 }),
    silver: () => st(TX.brushed('#cfd6de', 'silverB'), { metalness: 0.9 }),
    gold: () => st(TX.agedGold('#d4a64a', 'gold'), { metalness: 0.9 }), brass: () => st(TX.agedGold('#b08a3a', 'brass'), { metalness: 0.85 }),
    bronze: () => st(TX.agedGold('#8a5a2a', 'bronze'), { metalness: 0.7 }),
    rope: () => st(TX.rope('#b08a5a', 'jute')), whiteRope: () => st(TX.rope('#f0eee8', 'whiteRope')),
    slate: () => st(TX.stoneProp('#3f4247', 'slate')), slate2: () => st(TX.stoneProp('#4b4f55', 'slate2')), stone: () => st(TX.stoneProp('#7d776e', 'stone')),
    cream: () => st(TX.stoneProp('#d8cdb4', 'creamStone')), beigeStone: () => st(TX.stoneProp('#d6ccb8', 'beigeStone')),
    snow: () => st(TX.snow(), { ns: 1.5 }),
    // no transmission: it re-renders the whole scene into an extra target every frame (2x draw calls) for a few icicles
    ice: () => (QUALITY.low ? new THREE.MeshStandardMaterial({ color: 0xd8f2ff, roughness: 0.12, metalness: 0, transparent: true, opacity: 0.8, emissive: 0x2a5878, emissiveIntensity: 0.3 })
      : new THREE.MeshPhysicalMaterial({ color: 0xd8f2ff, roughness: 0.12, metalness: 0, transparent: true, opacity: 0.8, ior: 1.31, clearcoat: 1, clearcoatRoughness: 0.08, emissive: 0x2a5878, emissiveIntensity: 0.3 })),
    frost: () => (QUALITY.low ? new THREE.MeshStandardMaterial({ color: 0xeaf7ff, roughness: 0.3, metalness: 0.05, emissive: 0x1a3a50, emissiveIntensity: 0.2 })
      : new THREE.MeshPhysicalMaterial({ color: 0xeaf7ff, roughness: 0.35, metalness: 0.05, clearcoat: 0.8, clearcoatRoughness: 0.2, sheen: 0.6, sheenColor: new THREE.Color(0x9fdfff), emissive: 0x1a3a50, emissiveIntensity: 0.2 })),
    spines: () => TX.spines(),
  };
  PM = {};
  for (const k in F) lazy(PM, k, F[k]);
  return PM;
}
