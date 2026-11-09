// Procedural texture generators, DOM- and three-free so they run in a Worker
// (OffscreenCanvas) or, as a fallback, on the main thread. Output = raw RGBA
// bytes (rows already flipped for WebGL, i.e. same result as CanvasTexture
// with flipY) for a colour map and a tangent-space normal map.
// Colour maths reproduces THREE.Color (sRGB <-> linear) exactly, so the look
// is identical to the old canvas-in-main-thread version.

function hash(s) { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
export function rng(seed) {
  let a = typeof seed === 'number' ? seed >>> 0 : hash(seed);
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
// ---- colour helpers (THREE.Color semantics: hex is sRGB, stored linear) ----
const s2l = (c) => (c < 0.04045 ? c * 0.0773993808 : Math.pow(c * 0.9478672986 + 0.0521327014, 2.4));
const l2s = (c) => (c < 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 0.41666) - 0.055);
const hexNum = (hex) => (typeof hex === 'number' ? hex : parseInt(String(hex).replace('#', ''), 16));
export function linRGB(hex) { const n = hexNum(hex); return [s2l((n >> 16 & 255) / 255), s2l((n >> 8 & 255) / 255), s2l((n & 255) / 255)]; }
export { s2l, l2s };
// THREE.Color(hex).multiplyScalar(k).getStyle()
const shade = (hex, k) => { const c = linRGB(hex); return `rgb(${Math.round(l2s(c[0] * k) * 255)},${Math.round(l2s(c[1] * k) * 255)},${Math.round(l2s(c[2] * k) * 255)})`; };
// [c.r*255, ...] of a THREE.Color (linear values used as 8-bit sRGB pixels: kept as-is for the original look)
const rgbOf = (hex) => linRGB(hex).map((v) => v * 255);
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// ---------- tileable noise ----------
function lattice(seed, n) { const r = rng(seed), g = new Float32Array(n); for (let i = 0; i < n; i++) g[i] = r(); return g; }
function fbm(seed, s, fx, fy, oct = 5, gain = 0.5, ridged = false) {
  const out = new Float32Array(s * s); let amp = 1, tot = 0;
  for (let o = 0; o < oct; o++) {
    const Px = fx << o, Py = fy << o, g = lattice(seed + ':' + o, Px * Py), kx = Px / s, ky = Py / s;
    for (let y = 0; y < s; y++) {
      const yy = y * ky, yi = Math.floor(yy), yf = yy - yi, v = yf * yf * (3 - 2 * yf), y0 = yi % Py, y1 = (y0 + 1) % Py, r0 = y0 * Px, r1 = y1 * Px, row = y * s;
      for (let x = 0; x < s; x++) {
        const xx = x * kx, xi = Math.floor(xx), xf = xx - xi, u = xf * xf * (3 - 2 * xf), x0 = xi % Px, x1 = (x0 + 1) % Px;
        const a = g[r0 + x0], b = g[r0 + x1], c = g[r1 + x0], d = g[r1 + x1];
        let n = a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
        if (ridged) n = 1 - Math.abs(n * 2 - 1);
        out[row + x] += n * amp;
      }
    }
    tot += amp; amp *= gain;
  }
  for (let i = 0; i < out.length; i++) out[i] /= tot;
  return out;
}
function stretch(a, lo = 0.02, hi = 0.98) {
  const v = []; for (let i = 0; i < a.length; i += 97) v.push(a[i]); v.sort((p, q) => p - q);
  const mn = v[Math.floor(v.length * lo)], mx = v[Math.floor(v.length * hi)], k = 1 / (mx - mn || 1);
  for (let i = 0; i < a.length; i++) a[i] = clamp01((a[i] - mn) * k);
  return a;
}

// ---------- canvas helpers ----------
const mk = (s) => {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(s, s);
  const c = document.createElement('canvas'); c.width = c.height = s; return c;
};
const free = (c) => { if (c) { c.width = c.height = 0; } };
function readGray(canvas) {
  const s = canvas.width, d = canvas.getContext('2d').getImageData(0, 0, s, s).data, H = new Float32Array(s * s);
  for (let i = 0; i < H.length; i++) H[i] = d[i * 4] / 255; return H;
}
function pixCanvas(s, f) {
  const c = mk(s), ctx = c.getContext('2d'), im = ctx.createImageData(s, s), d = im.data;
  for (let i = 0, n = s * s; i < n; i++) { const p = f(i); d[i * 4] = p[0]; d[i * 4 + 1] = p[1]; d[i * 4 + 2] = p[2]; d[i * 4 + 3] = 255; }
  ctx.putImageData(im, 0, 0); return c;
}
function speckle(c, s, r, colors, n, rmin, rmax, alpha = 1) {
  for (let i = 0; i < n; i++) {
    c.globalAlpha = alpha * (0.4 + r() * 0.6); c.fillStyle = colors[Math.floor(r() * colors.length)];
    const x = r() * s, y = r() * s, rr = rmin + r() * (rmax - rmin);
    for (const [ox, oy] of [[0, 0], [s, 0], [-s, 0], [0, s], [0, -s]]) { c.beginPath(); c.arc(x + ox, y + oy, rr, 0, 7); c.fill(); }
  }
  c.globalAlpha = 1;
}
function blurTile(canvas, px) {
  const s = canvas.width, t = mk(s), c = t.getContext('2d'); c.filter = `blur(${px}px)`;
  for (const ox of [-s, 0, s]) for (const oy of [-s, 0, s]) c.drawImage(canvas, ox, oy);
  const g = canvas.getContext('2d'); g.clearRect(0, 0, s, s); g.drawImage(t, 0, 0); free(t); return canvas;
}
function wrapDraw(c, s, fn) { for (const ox of [-s, 0, s]) for (const oy of [-s, 0, s]) { c.save(); c.translate(ox, oy); fn(c); c.restore(); } }

// ---------- generators: (s, r, ...args) -> { color: canvas, height: Float32Array|canvas } ----------
// `px: true` = drawn with absolute pixel sizes, so it is always generated at its
// design size and downscaled; the others are resolution-independent and are
// generated directly at the target size.
export const GEN = {
  // optional colours (defaults = Fairy Tale red/gold): bg, motif fill, motif line, gold-cloud colour, gold-cloud strength
  damask: { px: true, fn: (s, r, bg = '#8e2b23', motifC = '#6a1c16', line = 'rgba(200,160,100,0.85)', goldC = 0xc9a46a, goldK = 0.75) => {
    const col = mk(s), c = col.getContext('2d'), hc = mk(s), h = hc.getContext('2d');
    const motif = (g, cx, cy, sc, fill, line) => {
      g.save(); g.translate(cx, cy); g.scale(sc, sc); g.fillStyle = fill; g.strokeStyle = line;
      for (const m of [1, -1]) {
        g.save(); g.scale(m, 1);
        g.beginPath(); g.moveTo(0, -150); g.bezierCurveTo(40, -120, 70, -80, 30, -40); g.bezierCurveTo(90, -60, 120, 10, 50, 20);
        g.bezierCurveTo(100, 60, 60, 120, 0, 150); g.closePath(); g.fill();
        g.lineWidth = 7; g.beginPath(); g.moveTo(14, -120); g.bezierCurveTo(60, -70, 40, -20, 12, 0); g.bezierCurveTo(50, 30, 40, 90, 8, 120); g.stroke();
        for (const [x, y, rr] of [[70, -95, 16], [95, -20, 11], [80, 85, 13], [118, 40, 8], [40, -150, 9]]) { g.beginPath(); g.arc(x, y, rr, 0, 7); g.fill(); }
        g.beginPath(); g.moveTo(60, -120); g.quadraticCurveTo(130, -110, 120, -40); g.lineWidth = 9; g.stroke();
        g.beginPath(); g.moveTo(58, 110); g.quadraticCurveTo(140, 120, 125, 60); g.stroke();
        g.restore();
      }
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.ellipse(0, 0, 12, 40, 0, 0, 7); g.fill();
      g.restore();
    };
    const pts = [[s / 2, s / 2, 1.55], [0, 0, 1.55], [s, 0, 1.55], [0, s, 1.55], [s, s, 1.55], [s / 2, 0, 0.75], [s / 2, s, 0.75], [0, s / 2, 0.75], [s, s / 2, 0.75]];
    c.fillStyle = bg; c.fillRect(0, 0, s, s);
    for (let x = 0; x < s; x += 6) { c.fillStyle = `rgba(0,0,0,${0.03 + r() * 0.04})`; c.fillRect(x, 0, 3, s); }
    for (const [x, y, k] of pts) motif(c, x, y, k, motifC, line);
    const n = stretch(fbm('dmk', s, 4, 4, 5)), fine = fbm('dmk2', s, 32, 32, 2);
    const im = c.getImageData(0, 0, s, s), d = im.data, gold = rgbOf(goldC);
    for (let i = 0; i < s * s; i++) {
      const t = clamp01((n[i] - 0.55) * 2.6) * (0.6 + fine[i] * 0.6);
      const p = mix3([d[i * 4], d[i * 4 + 1], d[i * 4 + 2]], gold, t * goldK); const k = 0.9 + fine[i] * 0.2;
      d[i * 4] = p[0] * k; d[i * 4 + 1] = p[1] * k; d[i * 4 + 2] = p[2] * k;
    }
    c.putImageData(im, 0, 0);
    h.fillStyle = '#606060'; h.fillRect(0, 0, s, s);
    for (const [x, y, k] of pts) motif(h, x, y, k, '#a0a0a0', '#b8b8b8');
    blurTile(hc, 2);
    return { color: col, height: hc };
  } },
  planks: { px: true, fn: (s, r, base, key) => {
    const col = mk(s), c = col.getContext('2d'), hc = mk(s), h = hc.getContext('2d'), n = 6, ph = s / n;
    const grainN = fbm(key + 'g', s, 2, 48, 4, 0.55);
    h.fillStyle = '#909090'; h.fillRect(0, 0, s, s);
    for (let i = 0; i < n; i++) {
      const y = i * ph, off = r() * s;
      for (const x0 of [off - s, off]) { const sh = 0.75 + r() * 0.5; c.fillStyle = shade(base, sh); c.fillRect(x0, y, s, ph); }
      h.fillStyle = '#202020'; h.fillRect(0, y, s, 3); h.fillRect(off % s, y, 3, ph);
      for (let k = 0; k < 7; k++) {
        const kx = r() * s, ky = y + ph * (0.25 + r() * 0.5); c.strokeStyle = 'rgba(20,10,5,0.35)'; c.lineWidth = 1.5;
        for (let q = 1; q < 5; q++) { c.beginPath(); c.ellipse(kx, ky, q * 7, q * 2.2, 0, 0, 7); c.stroke(); }
      }
    }
    const im = c.getImageData(0, 0, s, s), d = im.data, hh = h.getImageData(0, 0, s, s).data, H = new Float32Array(s * s);
    for (let i = 0; i < s * s; i++) {
      const g = grainN[i], k = 0.75 + g * 0.5;
      d[i * 4] *= k; d[i * 4 + 1] *= k; d[i * 4 + 2] *= k; H[i] = hh[i * 4] / 255 * 0.8 + g * 0.2;
    }
    c.putImageData(im, 0, 0); free(hc);
    c.fillStyle = 'rgba(0,0,0,0.7)'; for (let i = 0; i < n; i++) c.fillRect(0, i * ph, s, 2);
    return { color: col, height: H };
  } },
  // optional palette (defaults = Fairy Tale brown): joint colour, stone A, stone B, speckle colours
  flagstone: { px: true, fn: (s, r, joint = '#4f4032', ca = '#8A7458', cb = '#B39874', spk = ['#6a5640', '#c8ae88', '#3a2e22']) => {
    const col = mk(s), c = col.getContext('2d'), hc = mk(s), h = hc.getContext('2d');
    c.fillStyle = joint; c.fillRect(0, 0, s, s); h.fillStyle = '#202020'; h.fillRect(0, 0, s, s);
    const stones = [];
    for (let y = 0; y < s; y += 72) { let x = -r() * 70; while (x < s) { const w = 55 + r() * 85; stones.push([x + 4, y + 4 + (r() - 0.5) * 6, w - 8, 62 + (r() - 0.5) * 8, r()]); x += w; } }
    wrapDraw(c, s, (g) => stones.forEach(([x, y, w, hh, k]) => { g.fillStyle = shade(k < 0.5 ? ca : cb, 0.8 + k * 0.4); g.beginPath(); g.roundRect(x, y, w, hh, 12); g.fill(); }));
    wrapDraw(h, s, (g) => stones.forEach(([x, y, w, hh]) => { g.fillStyle = '#b0b0b0'; g.beginPath(); g.roundRect(x + 2, y + 2, w - 4, hh - 4, 12); g.fill(); })); blurTile(hc, 3);
    speckle(c, s, r, spk, 2500, 1, 3, 0.4);
    return { color: col, height: hc };
  } },
  bark: { fn: (s) => {
    const ridge = stretch(fbm('barkR', s, 24, 2, 5, 0.55, true)), broad = stretch(fbm('barkB', s, 3, 2, 3)), streak = fbm('barkS', s, 64, 3, 3);
    const A = rgbOf(0x3e1418), B = rgbOf(0x5a1f24), C = rgbOf(0x7a3a2a), D = rgbOf(0x9a5a3a), H = new Float32Array(s * s);
    const col = pixCanvas(s, (i) => {
      const t = ridge[i] * 0.6 + streak[i] * 0.4, b = broad[i];
      let p = t < 0.45 ? mix3(A, B, t / 0.45) : mix3(B, C, (t - 0.45) / 0.55);
      p = mix3(p, D, clamp01((streak[i] - 0.7) * 3) * 0.5 * b);
      H[i] = ridge[i] * 0.75 + streak[i] * 0.25; return p;
    });
    return { color: col, height: H };
  } },
  grass: { px: true, fn: (s, r) => {
    const col = mk(s), c = col.getContext('2d'), hc = mk(s), h = hc.getContext('2d');
    c.fillStyle = '#2f5418'; c.fillRect(0, 0, s, s); h.fillStyle = '#000'; h.fillRect(0, 0, s, s);
    c.lineWidth = 1.2; h.lineWidth = 1.2;
    for (let i = 0; i < 26000; i++) {
      const x = r() * s, y = r() * s, l = 4 + r() * 9, dx = (r() - 0.5) * 5, k = 0.55 + r() * 0.9;
      c.strokeStyle = shade('#4F7A2A', k); c.beginPath(); c.moveTo(x, y); c.lineTo(x + dx, y - l); c.stroke();
      h.strokeStyle = `rgba(255,255,255,${0.3 + r() * 0.5})`; h.beginPath(); h.moveTo(x, y); h.lineTo(x + dx, y - l); h.stroke();
    }
    return { color: col, height: hc };
  } },
  castleStone: { px: true, fn: (s, r) => {
    const col = mk(s), c = col.getContext('2d'), hc = mk(s), h = hc.getContext('2d'), rows = 6, bh = s / rows;
    c.fillStyle = '#7f7254'; c.fillRect(0, 0, s, s); h.fillStyle = '#202020'; h.fillRect(0, 0, s, s);
    for (let i = 0; i < rows; i++) for (let j = -1; j < 3; j++) {
      const x = j * s / 2 + (i % 2) * s / 4; c.fillStyle = shade('#B9A678', 0.85 + r() * 0.25); c.fillRect(x + 3, i * bh + 3, s / 2 - 6, bh - 6);
      h.fillStyle = `rgb(${170 + r() * 40},${170},${170})`; h.fillRect(x + 4, i * bh + 4, s / 2 - 8, bh - 8);
    }
    blurTile(hc, 2);
    const n = fbm('castleN', s, 8, 8, 5), im = c.getImageData(0, 0, s, s), d = im.data;
    for (let i = 0; i < s * s; i++) { const k = 0.82 + n[i] * 0.3; d[i * 4] *= k; d[i * 4 + 1] *= k; d[i * 4 + 2] *= k; }
    c.putImageData(im, 0, 0);
    const H = readGray(hc); free(hc); for (let i = 0; i < H.length; i++) H[i] = H[i] * 0.85 + n[i] * 0.15;
    return { color: col, height: H };
  } },
  boards: { px: true, fn: (s, r, base, key) => {
    const col = mk(s), c = col.getContext('2d'), hc = mk(s), h = hc.getContext('2d'), g = fbm(key + 'g', s, 2, 24, 3);
    h.fillStyle = '#909090'; h.fillRect(0, 0, s, s);
    for (let i = 0; i < 4; i++) { c.fillStyle = shade(base, 0.9 + r() * 0.15); c.fillRect(0, i * s / 4, s, s / 4); h.fillStyle = '#202020'; h.fillRect(0, i * s / 4, s, 2); const xx = r() * s; h.fillRect(xx, i * s / 4, 2, s / 4); c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(0, i * s / 4, s, 2); c.fillRect(xx, i * s / 4, 2, s / 4); }
    const im = c.getImageData(0, 0, s, s), d = im.data; for (let i = 0; i < s * s; i++) { const k = 0.9 + g[i] * 0.18; d[i * 4] *= k; d[i * 4 + 1] *= k; d[i * 4 + 2] *= k; } c.putImageData(im, 0, 0);
    const H = readGray(hc); free(hc); for (let i = 0; i < H.length; i++) H[i] = H[i] * 0.85 + g[i] * 0.15;
    return { color: col, height: H };
  } },
  plaster: { fn: (s, r, base, key, spread = 0.06) => {
    const n = fbm(key, s, 6, 6, 6, 0.55), f = fbm(key + 'f', s, 48, 48, 2), B = rgbOf(base), H = new Float32Array(s * s);
    const col = pixCanvas(s, (i) => { const k = 1 + (n[i] - 0.5) * spread * 3 + (f[i] - 0.5) * spread; H[i] = n[i] * 0.7 + f[i] * 0.3; return [B[0] * k, B[1] * k, B[2] * k]; });
    return { color: col, height: H };
  } },
  tiles: { fn: (s, r, base, key) => {
    const n = fbm(key, s, 4, 4, 5), v = fbm(key + 'v', s, 12, 3, 3, 0.5, true), B = rgbOf(base), H = new Float32Array(s * s), q = s / 2, sw = Math.max(1, Math.round(3 * s / 1024));
    const col = pixCanvas(s, (i) => {
      const x = i % s, y = (i / s) | 0, seam = (x % q < sw || y % q < sw) ? 1 : 0;
      const k = 0.92 + (n[i] - 0.5) * 0.18 - Math.pow(v[i], 6) * 0.08 - seam * 0.25; H[i] = seam ? 0.1 : 0.6 + n[i] * 0.2;
      return [B[0] * k, B[1] * k, B[2] * k];
    });
    return { color: col, height: H };
  } },
  snow: { fn: (s) => {
    const n = stretch(fbm('snowN', s, 6, 6, 5, 0.6)), B = [244, 248, 252];
    const col = pixCanvas(s, (i) => { const k = 0.9 + n[i] * 0.1; return [B[0] * k, B[1] * k, B[2] * k]; });
    return { color: col, height: n };
  } },
  stucco: { px: true, fn: (s, r, base, key) => {
    const hc = mk(s), h = hc.getContext('2d'); h.fillStyle = '#808080'; h.fillRect(0, 0, s, s);
    for (let i = 0; i < 700; i++) {
      const x = r() * s, y = r() * s, rad = 30 + r() * 90, a0 = r() * 7, v = r() < 0.5 ? 255 : 0;
      wrapDraw(h, s, (g) => { g.strokeStyle = `rgba(${v},${v},${v},${0.08 + r() * 0.1})`; g.lineWidth = 6 + r() * 14; g.beginPath(); g.arc(x, y, rad, a0, a0 + 0.6 + r() * 1.2); g.stroke(); });
    }
    blurTile(hc, 1.5);
    const n = fbm(key + 'n', s, 16, 16, 4), Ht = readGray(hc), H = new Float32Array(s * s), B = rgbOf(base); free(hc);
    const col = pixCanvas(s, (i) => { H[i] = Ht[i] * 0.7 + n[i] * 0.3; const k = 0.85 + H[i] * 0.3; return [B[0] * k, B[1] * k, B[2] * k]; });
    return { color: col, height: H };
  } },
  fabric: { fn: (s) => {
    const n = fbm('fabN', s, 12, 1, 3), H = new Float32Array(s * s), B = rgbOf(0xefe4cc);
    const col = pixCanvas(s, (i) => {
      const x = i % s, fold = 0.5 + 0.5 * Math.sin((x / s) * Math.PI * 2 * 3 + n[i] * 3);
      H[i] = fold; const k = 0.86 + fold * 0.16; return [B[0] * k, B[1] * k, B[2] * k];
    });
    return { color: col, height: H };
  } },
  caveRock: { fn: (s) => {
    const rid = stretch(fbm('caveN', s, 5, 5, 6, 0.55, true)), m = stretch(fbm('caveM', s, 4, 4, 5)), B = rgbOf(0x9ea2a8), Dk = rgbOf(0x6a6e74), H = new Float32Array(s * s);
    const col = pixCanvas(s, (i) => { H[i] = rid[i] * 0.6 + m[i] * 0.4; const p = mix3(Dk, B, clamp01(0.25 + m[i] * 0.5 + rid[i] * 0.35)); return [p[0], p[1], p[2] + 3]; });
    return { color: col, height: H };
  } },
  concrete: { fn: (s, r, base, key) => {
    const n = fbm(key, s, 8, 8, 5), B = rgbOf(base);
    const col = pixCanvas(s, (i) => { const k = 0.88 + n[i] * 0.24; return [B[0] * k, B[1] * k, B[2] * k]; });
    return { color: col, height: n };
  } },
  crackle: { px: true, fn: (s, r, dark, light, key) => {
    const col = mk(s), c = col.getContext('2d'), hc = mk(s), h = hc.getContext('2d');
    c.fillStyle = dark; c.fillRect(0, 0, s, s); h.fillStyle = '#c0c0c0'; h.fillRect(0, 0, s, s);
    const pts = []; for (let i = 0; i < 140; i++) pts.push([r() * s, r() * s]);
    wrapDraw(c, s, (g) => { g.strokeStyle = light; for (const [x, y] of pts) { g.lineWidth = 1 + r() * 2.2; g.beginPath(); let a = r() * 7; g.moveTo(x, y); for (let k = 0; k < 6; k++) { a += (r() - 0.5) * 1.6; g.lineTo(x + Math.cos(a) * (8 + k * 9), y + Math.sin(a) * (8 + k * 9)); } g.stroke(); } });
    wrapDraw(h, s, (g) => { g.strokeStyle = '#303030'; for (const [x, y] of pts) { g.lineWidth = 2; g.beginPath(); let a = r() * 7; g.moveTo(x, y); for (let k = 0; k < 6; k++) { a += (r() - 0.5) * 1.6; g.lineTo(x + Math.cos(a) * (8 + k * 9), y + Math.sin(a) * (8 + k * 9)); } g.stroke(); } });
    const n = fbm(key + 'n', s, 6, 6, 4), im = c.getImageData(0, 0, s, s), d = im.data;
    for (let i = 0; i < s * s; i++) { const k = 0.8 + n[i] * 0.4; d[i * 4] *= k; d[i * 4 + 1] *= k; d[i * 4 + 2] *= k; } c.putImageData(im, 0, 0);
    const H = readGray(hc); free(hc); for (let i = 0; i < H.length; i++) H[i] = H[i] * 0.8 + n[i] * 0.2;
    return { color: col, height: H };
  } },
  // irregular rounded stone-wall print (rows of mixed-size stones, dark joints); pal = stone colours
  stoneWall: { px: true, fn: (s, r, joint = '#4a3e33', pal = ['#c9a47e', '#d8bc94', '#8e8a84', '#b4aea4', '#a88a68']) => {
    const col = mk(s), c = col.getContext('2d'), hc = mk(s), h = hc.getContext('2d');
    c.fillStyle = joint; c.fillRect(0, 0, s, s); h.fillStyle = '#1a1a1a'; h.fillRect(0, 0, s, s);
    const rows = []; let tot = 0; while (tot < s) { const rh = 46 + r() * 34; rows.push(rh); tot += rh; }
    const k = s / tot; let y = 0; const stones = [];
    for (const rh0 of rows) {
      const rh = rh0 * k; let x = -r() * 80;
      while (x < s - 4) { let w = 50 + r() * 120; if (x + w > s - 30 && x + w < s + 30) w = s - x; stones.push([x + 3 + r() * 2, y + 3 + r() * 3, w - 6 - r() * 3, rh - 6 - r() * 4, r(), r()]); x += w; }
      y += rh;
    }
    const draw = (g, fill) => stones.forEach(([x, y0, w, hh, a, b]) => {
      g.fillStyle = fill ? fill(a, b) : '#b0b0b0'; const rad = Math.min(hh, w) * (0.22 + b * 0.25);
      g.beginPath(); g.moveTo(x + rad, y0 + (a - 0.5) * 3); g.lineTo(x + w - rad, y0); g.quadraticCurveTo(x + w, y0, x + w + (b - 0.5) * 4, y0 + rad);
      g.lineTo(x + w, y0 + hh - rad); g.quadraticCurveTo(x + w, y0 + hh, x + w - rad, y0 + hh + (a - 0.5) * 3); g.lineTo(x + rad, y0 + hh);
      g.quadraticCurveTo(x, y0 + hh, x + (a - 0.5) * 4, y0 + hh - rad); g.lineTo(x, y0 + rad); g.quadraticCurveTo(x, y0, x + rad, y0 + (a - 0.5) * 3); g.fill();
    });
    wrapDraw(c, s, (g) => draw(g, (a, b) => shade(pal[Math.floor(a * pal.length)], 0.8 + b * 0.35)));
    wrapDraw(h, s, (g) => draw(g)); blurTile(hc, 4);
    const n = fbm('stoneWallN', s, 8, 8, 5), im = c.getImageData(0, 0, s, s), d = im.data;
    for (let i = 0; i < s * s; i++) { const q = 0.78 + n[i] * 0.4; d[i * 4] *= q; d[i * 4 + 1] *= q; d[i * 4 + 2] *= q; }
    c.putImageData(im, 0, 0); speckle(c, s, r, ['#5a4a3a', '#efe0c8', '#6e6a64'], 3000, 1, 3, 0.35);
    const H = readGray(hc); free(hc); for (let i = 0; i < H.length; i++) H[i] = H[i] * 0.8 + n[i] * 0.2;
    return { color: col, height: H };
  } },
  // running-bond brick print with light mortar
  brick: { px: true, fn: (s, r, mortar = '#cfc8be', pal = ['#b5553a', '#c8724f', '#8e3a2a', '#a8483a', '#c06048']) => {
    const col = mk(s), c = col.getContext('2d'), hc = mk(s), h = hc.getContext('2d'), rows = 14, bh = s / rows, nb = 4, bw = s / nb;
    c.fillStyle = mortar; c.fillRect(0, 0, s, s); h.fillStyle = '#303030'; h.fillRect(0, 0, s, s);
    for (let i = 0; i < rows; i++) for (let j = -1; j <= nb; j++) {
      const x = j * bw + (i % 2) * bw / 2, m = 5;
      c.fillStyle = shade(pal[Math.floor(r() * pal.length)], 0.8 + r() * 0.35); c.fillRect(x + m / 2, i * bh + m / 2, bw - m, bh - m);
      h.fillStyle = '#c0c0c0'; h.fillRect(x + m / 2 + 1, i * bh + m / 2 + 1, bw - m - 2, bh - m - 2);
    }
    blurTile(hc, 1.5);
    const n = fbm('brickN', s, 16, 16, 4), im = c.getImageData(0, 0, s, s), d = im.data;
    for (let i = 0; i < s * s; i++) { const q = 0.8 + n[i] * 0.35; d[i * 4] *= q; d[i * 4 + 1] *= q; d[i * 4 + 2] *= q; }
    c.putImageData(im, 0, 0); speckle(c, s, r, ['#6a2a1a', '#e0b090', '#3a2a24'], 2500, 1, 2.5, 0.3);
    const H = readGray(hc); free(hc); for (let i = 0; i < H.length; i++) H[i] = H[i] * 0.85 + n[i] * 0.15;
    return { color: col, height: H };
  } },
  // night sky: navy/violet nebula clouds + stars (ceiling)
  galaxy: { fn: (s, r) => {
    const n = stretch(fbm('galN', s, 3, 3, 6, 0.55)), m = stretch(fbm('galM', s, 5, 5, 5, 0.5, true)), H = new Float32Array(s * s);
    const A = [8, 10, 34], B = [70, 40, 150], C = [40, 110, 210], st = 1 / (s * s);
    const col = pixCanvas(s, (i) => {
      const t = Math.pow(n[i], 2.2), u = Math.pow(m[i], 3);
      let p = mix3(A, B, t * 0.8); p = mix3(p, C, u * t * 0.9);
      const q = r(); if (q < st * 1800) { const b = 120 + r() * 135; p = [b, b, Math.min(255, b + 20)]; } else if (q < st * 9000) { const b = 60 + r() * 60; p = mix3(p, [b, b, b + 10], 0.6); }
      H[i] = t * 0.3; return p;
    });
    return { color: col, height: H };
  } },
  // ---- tintable greyscale finishes: one texture shared by every colour variant
  // (materials.js puts the base colour into material.color). L = 1/1.15 headroom.
  plywoodTint: { fn: (s) => {
    const g = stretch(fbm('plywood', s, 2, 40, 4, 0.6)), w = fbm('plywoodw', s, 6, 6, 3);
    const col = pixCanvas(s, (i) => { const t = Math.pow(g[i], 1.5), k = (1 - t * 0.21) * (0.92 + w[i] * 0.16) * 255 / 1.15; return [k, k, k]; });
    return { color: col, height: g };
  } },
  brushedTint: { fn: (s) => {
    const g = fbm('brushed', s, 1, 96, 3), n = fbm('brushedn', s, 8, 8, 3);
    const col = pixCanvas(s, (i) => { const k = (0.8 + g[i] * 0.35 - Math.pow(n[i], 3) * 0.2) * 255 / 1.15; return [k, k, k]; });
    return { color: col, height: g };
  } },
  agedGoldTint: { fn: (s) => {
    const n = stretch(fbm('agedgold', s, 6, 6, 5)), P = 0.25;
    const col = pixCanvas(s, (i) => { const t = clamp01((0.45 - n[i]) * 2.5), k = (1 - t * 0.85 * (1 - P)) * 255 / 1.15; return [k, k * (1 - t * 0.1), k * (1 - t * 0.25)]; });
    return { color: col, height: n };
  } },
  ropeTint: { fn: (s) => {
    const H = new Float32Array(s * s), n = fbm('rope', s, 16, 16, 2);
    const col = pixCanvas(s, (i) => { const x = i % s, y = (i / s) | 0, t = 0.5 + 0.5 * Math.sin(((x + y) / s) * Math.PI * 2 * 4); H[i] = t * 0.8 + n[i] * 0.2; const k = (0.7 + H[i] * 0.4) * 255 / 1.15; return [k, k, k]; });
    return { color: col, height: H };
  } },
  stoneTint: { fn: (s) => {
    const n = stretch(fbm('stoneprop', s, 4, 4, 6, 0.55));
    const col = pixCanvas(s, (i) => { const k = (0.75 + n[i] * 0.45) * 255 / 1.2; return [k, k, k]; });
    return { color: col, height: n };
  } },
  spines: { fn: (s, r) => {
    const col = mk(s), c = col.getContext('2d'), hc = mk(s), h = hc.getContext('2d');
    c.fillStyle = '#e8e8e8'; c.fillRect(0, 0, s, s); h.fillStyle = '#808080'; h.fillRect(0, 0, s, s);
    const n = fbm('spineN', s, 8, 8, 3); const im = c.getImageData(0, 0, s, s), d = im.data;
    for (let i = 0; i < s * s; i++) { const k = 0.85 + n[i] * 0.2; d[i * 4] *= k; d[i * 4 + 1] *= k; d[i * 4 + 2] *= k; } c.putImageData(im, 0, 0);
    for (const y of [0.1, 0.16, 0.84, 0.9]) { c.fillStyle = '#fff6c8'; c.fillRect(0, y * s, s, s * 0.025); h.fillStyle = '#d0d0d0'; h.fillRect(0, y * s, s, s * 0.025); }
    c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(s * 0.15, s * 0.3, s * 0.7, s * 0.28);
    c.fillStyle = '#fff2b0'; for (let k = 0; k < 4; k++) c.fillRect(s * (0.3 + r() * 0.05), s * (0.34 + k * 0.055), s * (0.3 + r() * 0.1), s * 0.02);
    c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(0, 0, s * 0.06, s); c.fillRect(s * 0.94, 0, s * 0.06, s);
    h.fillStyle = '#505050'; h.fillRect(0, 0, s * 0.05, s); h.fillRect(s * 0.95, 0, s * 0.05, s);
    return { color: col, height: hc };
  } },
};

// box-filter a height field from s down to t (s/t integer)
function downH(H, s, t) {
  if (s === t) return H;
  const f = s / t, out = new Float32Array(t * t), k = 1 / (f * f);
  for (let y = 0; y < t; y++) for (let x = 0; x < t; x++) {
    let a = 0; for (let j = 0; j < f; j++) { const row = (y * f + j) * s + x * f; for (let i = 0; i < f; i++) a += H[row + i]; }
    out[y * t + x] = a * k;
  }
  return out;
}
// tangent-space normal map bytes (rows flipped like CanvasTexture.flipY)
function normalBytes(H, s, strength) {
  const d = new Uint8Array(s * s * 4);
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const xl = (x + s - 1) % s, xr = (x + 1) % s, yu = (y + s - 1) % s, yd = (y + 1) % s;
    const dx = (H[y * s + xr] - H[y * s + xl]) * strength, dy = (H[yd * s + x] - H[yu * s + x]) * strength;
    const nx = -dx, ny = dy, l = Math.hypot(nx, ny, 1), i = ((s - 1 - y) * s + x) * 4;
    d[i] = (nx / l * 0.5 + 0.5) * 255; d[i + 1] = (ny / l * 0.5 + 0.5) * 255; d[i + 2] = (1 / l * 0.5 + 0.5) * 255; d[i + 3] = 255;
  }
  return d;
}
function flippedBytes(canvas, s) {
  const src = canvas.getContext('2d').getImageData(0, 0, s, s).data, out = new Uint8Array(s * s * 4), row = s * 4;
  for (let y = 0; y < s; y++) out.set(src.subarray(y * row, y * row + row), (s - 1 - y) * row);
  return out;
}

// job: { key, gen, args, design, size, nsize, normal } -> { key, size, nsize, color, normal }
export function build(job) {
  const G = GEN[job.gen], gs = G.px ? job.design : job.size;
  const out = G.fn(gs, rng(job.key), ...(job.args || []));
  let H = out.height;
  if (!(H instanceof Float32Array)) { const hc = H; H = readGray(hc); free(hc); }
  let col = out.color;
  if (gs !== job.size) {
    const c2 = mk(job.size), x = c2.getContext('2d'); x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
    x.drawImage(col, 0, 0, job.size, job.size); free(col); col = c2;
  }
  const ns = job.nsize, normal = normalBytes(downH(H, gs, ns), ns, job.normal * ns / 512);
  const color = flippedBytes(col, job.size); free(col);
  return { key: job.key, size: job.size, nsize: ns, color, normal };
}
// Worker variant: CPU-backed ImageBitmaps (made from ImageData, so they don't depend on the
// worker's GPU context). They live outside the JS heap and are closed right after upload.
export async function buildBitmaps(job) {
  const r = build(job), opt = { premultiplyAlpha: 'none', colorSpaceConversion: 'none' };
  r.color = await createImageBitmap(new ImageData(new Uint8ClampedArray(r.color.buffer), r.size, r.size), opt);
  r.normal = await createImageBitmap(new ImageData(new Uint8ClampedArray(r.normal.buffer), r.nsize, r.nsize), opt);
  return r;
}
