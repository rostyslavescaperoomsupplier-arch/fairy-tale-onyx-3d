// Engineer mode: cable routes for installers.
//  - every room polygon edge is a wall face; each face gets its own elevation drawing (SVG) with doors, props,
//    controller boxes, 230 V sockets and every cable that runs in or on that wall, dimensioned from the left corner
//    as you see it standing in the room
//  - cables go up the room face of their wall to the top of the wall and run on top of the walls (TRUNK_H);
//    the route between two ends is the shortest path over the wall centrelines
//  - 3D overlay: the same routes as thin tubes + controller boxes; picking a wall flies the camera to it
import { ITEMS, LINKS, TYPES, OUTLETS, TRUNK_H, SWITCHES } from '../data/cables.js';
import { PUZZLES } from '../data/puzzles.js';
const ascii = (t) => String(t).replace(/\u2192/g, '->').replace(/\u2190/g, '<-').replace(/[^\x20-\x7e\u00a0-\u00ff]/g, '');
// light palette written as SVG presentation attributes (used by the PDF export); the page CSS overrides them on screen
const PAL = {
  wallbg: 'fill="#f3f3f1" stroke="#555"', grid: 'stroke="#d0d0d0" stroke-dasharray="2 3"', ax: 'fill="#666" font-size="8"',
  door: 'fill="#ffffff" stroke="#777"', 'door ghost': 'fill="none" stroke="#777" stroke-dasharray="3 2"', dl: 'fill="#555" font-size="8"',
  prop: 'fill="#f6ead0" stroke="#c49a3a"', 'prop free': 'fill="#f6ead0" stroke="#c49a3a" stroke-dasharray="2 2"', pl: 'fill="#8a6a20" font-size="8"',
  trunk: 'stroke="#d8d8d8" stroke-width="6"', bl: 'fill="#111" font-size="8"', dim: 'stroke="#999" stroke-dasharray="1 2"', dt: 'fill="#333" font-size="8"',
  floor: 'stroke="#555" stroke-width="1.5"', cap: 'fill="#555" font-size="9"', sock: 'stroke="#222"',
};
const A = (cls) => `class="${cls}" ${PAL[cls] || ''}`;
const BOXFILL = { upc: '#ffffff', cb: '#f2c94c', net: '#9ad0ff', end: '#ffb02e', switch: '#3ddc5a' };

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const m = (cm) => (cm / 100).toFixed(1).replace('.', ',') + ' m';
const SLACK = 100; // cm per cable for the boxes, loops and termination

function segDist(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2));
  return { d: Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy)), t };
}
function inPoly([x, y], poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; }
  return c;
}

export function initEngineer(ctx) {
  const { THREE, CSS2DObject, world, plan, rooms, walls, propObjs, persp, orbitP, setMode, getMode, WALL_H, $, onDirty } = ctx;
  const roomById = Object.fromEntries(rooms.map((r) => [r.id, r]));
  const roomAt = (x, y) => rooms.find((r) => inPoly([x, y], r.polygon));

  // ---------------- wall faces ----------------
  const DIRS = { '0,-1': 'North', '0,1': 'South', '1,0': 'East', '-1,0': 'West' };
  const faces = [];
  for (const r of rooms) {
    const P = r.polygon; let k = 0;
    P.forEach((a, i) => {
      const b = P[(i + 1) % P.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 1) return;
      const u = [(b[0] - a[0]) / L, (b[1] - a[1]) / L], mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      let n = [-u[1], u[0]]; if (!inPoly([mid[0] + n[0] * 3, mid[1] + n[1] * 3], P)) n = [-n[0], -n[1]];
      // the wall this face belongs to: parallel centreline at t/2 behind the face
      let wall = null, best = 1e9;
      for (const w of walls) {
        if (Math.abs(Math.abs(dot(w.u, u)) - 1) > 1e-3) continue;
        const c = [mid[0] - n[0] * w.t / 2, mid[1] - n[1] * w.t / 2], sd = segDist(c, w.a, w.b);
        if (sd.d < 1.5 && sd.d < best) { best = sd.d; wall = w; }
      }
      const t = wall ? wall.t : 10, d = [-n[0], -n[1]], right = [-d[1], d[0]];
      const origin = Math.min(dot(a, right), dot(b, right));
      let other = null;
      for (const q of [0.2, 0.5, 0.8]) { const p = [a[0] + (b[0] - a[0]) * q - n[0] * (t + 6), a[1] + (b[1] - a[1]) * q - n[1] * (t + 6)]; other = other || roomAt(...p); }
      const dir = DIRS[`${Math.round(d[0])},${Math.round(d[1])}`] || 'Wall';
      let pw = wall && wall.t > 20 ? wall : null;
      if (!wall) for (const w of walls) if (w.t > 20 && segDist(mid, w.a, w.b).d < w.t) pw = w;
      const pn = pw ? (pw.a[0] + pw.b[0] < r.bbox[0] + r.bbox[2] ? 'Left' : 'Right') + ' gate pier' : '';
      faces.push({ id: `${r.id}:${k++}`, room: r, a, b, L, u, n, t: wall ? t : (pw ? pw.t : t), wall, right, origin, mid,
        dir, name: pw ? (wall ? `${pn}, ${dir.toLowerCase()} side` : `${pn}, end`) : `${dir} wall`,
        other: other && other.id !== r.id ? other : null, outer: !other });
    });
  }
  const sOf = (f, p) => dot(p, f.right) - f.origin;
  const sdist = (f, p) => dot([p[0] - f.a[0], p[1] - f.a[1]], f.n); // signed, + = into the room

  // ---------------- items: snap to a face ----------------
  const items = {};
  for (const it of [...SWITCHES, ...ITEMS]) {
    const cand = it.outside ? null : faces.filter((f) => f.room.id === it.room);
    let face = null, bd = 1e9, pt = null;
    for (const f of cand || []) { const sd = segDist(it.at, f.a, f.b); if (sd.d < bd) { bd = sd.d; face = f; pt = [f.a[0] + (f.b[0] - f.a[0]) * sd.t, f.a[1] + (f.b[1] - f.a[1]) * sd.t]; } }
    let wall = face?.wall, cl = null;
    if (it.outside) { // nearest centreline, cable goes up the outside of that wall
      let bw = null, bdd = 1e9; for (const w of walls) { const sd = segDist(it.at, w.a, w.b); if (sd.d < bdd) { bdd = sd.d; bw = { w, sd }; } }
      wall = bw.w; cl = [wall.a[0] + (wall.b[0] - wall.a[0]) * bw.sd.t, wall.a[1] + (wall.b[1] - wall.a[1]) * bw.sd.t];
      const nn = [it.at[0] - cl[0], it.at[1] - cl[1]], ln = Math.hypot(...nn) || 1; pt = [cl[0] + nn[0] / ln * (wall.t / 2), cl[1] + nn[1] / ln * (wall.t / 2)];
    } else if (wall) cl = [pt[0] - face.n[0] * face.t / 2, pt[1] - face.n[1] * face.t / 2];
    else { // face without its own centreline (end of a pier): hop onto the nearest wall
      let bw = null, bdd = 1e9; for (const w of walls) { const sd = segDist(pt, w.a, w.b); if (sd.d < bdd) { bdd = sd.d; bw = { w, sd }; } }
      wall = bw.w; cl = [wall.a[0] + (wall.b[0] - wall.a[0]) * bw.sd.t, wall.a[1] + (wall.b[1] - wall.a[1]) * bw.sd.t];
    }
    const spur = !it.outside && bd > 12 ? (it.h >= 180 ? 'ceiling' : 'floor') : null;
    items[it.id] = { ...it, face, pt, cl, wall, spur, off: bd };
  }

  // puzzle tags: numbers named in an item's label/role (CB 23 -> 23, "Throne, 12 Winter Throne" -> 12); U prefix for UoM
  for (const it of Object.values(items)) {
    if (it.pz) continue;
    const pre = it.sw === 'SWU' ? 'U' : '';
    const txt = `${it.label} ${it.role || ''}`.replace(/U?UPC\s*#?\s*\d+/g, '').replace(/#\d+/g, '').replace(/\d+\s*(V|kg|m|cm|p|-port|x)\b/g, '');
    it.pz = []; for (const mm of txt.matchAll(/\b(\d{2})[a-d]?\b/g)) { const k = pre + mm[1]; if (PUZZLES[k] && !it.pz.includes(k)) it.pz.push(k); }
  }
  // ---------------- route graph over wall centrelines ----------------
  const nodes = [], key = (p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`, nodeIdx = new Map();
  const node = (p) => { const k = key(p); if (!nodeIdx.has(k)) { nodeIdx.set(k, nodes.length); nodes.push({ p, adj: [] }); } return nodeIdx.get(k); };
  const onWall = walls.map((w) => [w.a, w.b]);
  walls.forEach((w, i) => walls.forEach((v, j) => {
    if (j <= i) return;
    const d = [w.b[0] - w.a[0], w.b[1] - w.a[1]], e = [v.b[0] - v.a[0], v.b[1] - v.a[1]], den = d[0] * e[1] - d[1] * e[0];
    if (Math.abs(den) < 1e-9) return;
    const s = ((v.a[0] - w.a[0]) * e[1] - (v.a[1] - w.a[1]) * e[0]) / den, t = ((v.a[0] - w.a[0]) * d[1] - (v.a[1] - w.a[1]) * d[0]) / den;
    const tol = 0.02; if (s < -tol || s > 1 + tol || t < -tol || t > 1 + tol) return;
    const p = [w.a[0] + d[0] * Math.max(0, Math.min(1, s)), w.a[1] + d[1] * Math.max(0, Math.min(1, s))];
    onWall[i].push(p); onWall[j].push(p);
  }));
  for (const it of Object.values(items)) onWall[walls.indexOf(it.wall)].push(it.cl);
  walls.forEach((w, i) => {
    const pts = onWall[i].map((p) => ({ p, s: dot([p[0] - w.a[0], p[1] - w.a[1]], w.u) })).sort((x, y) => x.s - y.s);
    for (let k = 1; k < pts.length; k++) {
      const A = node(pts[k - 1].p), B = node(pts[k].p), L = pts[k].s - pts[k - 1].s; if (A === B) continue;
      nodes[A].adj.push([B, L]); nodes[B].adj.push([A, L]);
    }
  });
  function shortest(pa, pb) {
    const s = node(pa), t = node(pb), dist = new Array(nodes.length).fill(Infinity), prev = new Array(nodes.length).fill(-1), done = new Set();
    dist[s] = 0;
    while (true) {
      let u = -1, bd = Infinity; for (let i = 0; i < nodes.length; i++) if (!done.has(i) && dist[i] < bd) { bd = dist[i]; u = i; }
      if (u < 0 || u === t) break; done.add(u);
      for (const [v, L] of nodes[u].adj) if (dist[u] + L < dist[v]) { dist[v] = dist[u] + L; prev[v] = u; }
    }
    const path = []; for (let v = t; v >= 0; v = prev[v]) path.unshift(nodes[v].p);
    return path[0] && key(path[0]) === key(pa) ? path : [pa, pb];
  }

  // ---------------- cables ----------------
  // 3D point list [x, h, y]: item -> (spur) -> up its face -> over the wall top -> ... -> down to the other item
  function legUp(it) {
    const pts = [];
    if (it.spur === 'floor') pts.push([it.at[0], it.h, it.at[1]], [it.at[0], 1, it.at[1]], [it.pt[0], 1, it.pt[1]]);
    else if (it.spur === 'ceiling') pts.push([it.at[0], it.h, it.at[1]], [it.at[0], WALL_H - 2, it.at[1]], [it.pt[0], WALL_H - 2, it.pt[1]]);
    else pts.push([it.pt[0], it.h, it.pt[1]]);
    pts.push([it.pt[0], WALL_H, it.pt[1]], [it.cl[0], TRUNK_H, it.cl[1]]);
    return pts;
  }
  const len3 = (pts) => pts.reduce((s, p, i) => (i ? s + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1], p[2] - pts[i - 1][2]) : 0), 0);
  const cables = [];
  const ports = {};
  for (const it of ITEMS) if (it.lan) {
    const A = items[it.id], S = items[it.sw || 'SW'], path = shortest(A.cl, S.cl);
    const pts = [...legUp(A), ...path.slice(1, -1).map((p) => [p[0], TRUNK_H, p[1]]), ...legUp(S).reverse()];
    const port = String((ports[S.id] = (ports[S.id] || 0) + 1)).padStart(2, '0');
    cables.push({ id: `L${S.id}${port}`, type: 'lan', a: A, b: S, port, pts, text: `${A.label} → ${S.id === 'SW' ? '' : S.id + ' '}switch port ${port}` });
  }
  LINKS.forEach((l, i) => {
    const A = items[l.a], B = l.b ? items[l.b] : null; let pts;
    if (l.inside) pts = [[A.at[0], A.h, A.at[1]], [B.at[0], B.h, B.at[1]]];
    else if (l.floor) pts = [[A.at[0], A.h, A.at[1]], ...l.via.map(([x, y]) => [x, 1, y]), [B.at[0], 1, B.at[1]], [B.at[0], B.h, B.at[1]]];
    else if (!B) pts = legUp(A).slice(0, -1);
    else { const path = shortest(A.cl, B.cl); pts = [...legUp(A), ...path.slice(1, -1).map((p) => [p[0], TRUNK_H, p[1]]), ...legUp(B).reverse()]; }
    const text = B ? `${A.label} → ${B.label}` : `${A.label} ← ${l.v || '12 V'} feed (lighting circuit)`;
    cables.push({ id: `C${i + 1}`, type: l.type, a: A, b: B, pts, text, inside: l.inside, floor: l.floor });
  });
  // dedupe identical points, measure
  for (const c of cables) { c.pts = c.pts.filter((p, i, a) => !i || Math.hypot(p[0] - a[i - 1][0], p[1] - a[i - 1][1], p[2] - a[i - 1][2]) > 0.01); c.len = len3(c.pts) + (c.inside ? 30 : SLACK); }
  for (const c of cables) { c.pz = [...new Set([...(c.a.pz || []), ...(c.b?.pz || [])])]; if (!c.pz.length) c.pz = ['other']; }
  const filt = new Set();
  const showC = (c) => !filt.size || c.pz.some((k) => filt.has(k));
  const showI = (it) => it.kind === 'switch' || !filt.size || it.pz.some((k) => filt.has(k)) || cables.some((c) => showC(c) && (c.a === it || c.b === it));
  // lanes: cables sharing a stretch of wall top are drawn side by side
  cables.forEach((c, i) => (c.lane = i));

  // ---------------- 3D overlay ----------------
  const engG = new THREE.Group(); engG.visible = false; world.add(engG);
  const mats = Object.fromEntries(Object.entries(TYPES).map(([k, v]) => [k, new THREE.MeshBasicMaterial({ color: v.color })]));
  const nl = cables.length;
  for (const c of cables) {
    const o = ((c.lane % 14) - 7) * 0.9; // spread on top of the wall
    const path = new THREE.CurvePath();
    const P = c.pts.map(([x, h, y]) => new THREE.Vector3(x + (h >= TRUNK_H - 0.1 ? o : 0), h, y + (h >= TRUNK_H - 0.1 ? o : 0)));
    for (let i = 1; i < P.length; i++) if (P[i].distanceTo(P[i - 1]) > 0.01) path.add(new THREE.LineCurve3(P[i - 1], P[i]));
    if (!path.curves.length) continue;
    const g = new THREE.TubeGeometry(path, Math.max(8, path.curves.length * 3), c.type === 'lan' ? 0.9 : 0.7, 5, false);
    const mesh = new THREE.Mesh(g, mats[c.type]); mesh.userData.cable = c; engG.add(mesh); c.mesh = mesh;
  }
  const boxMat = { upc: new THREE.MeshBasicMaterial({ color: 0xf2f2f2 }), cb: new THREE.MeshBasicMaterial({ color: 0xf2c94c }), net: new THREE.MeshBasicMaterial({ color: 0x9ad0ff }), end: new THREE.MeshBasicMaterial({ color: 0xffb02e }), switch: new THREE.MeshBasicMaterial({ color: 0x3ddc5a }) };
  const sockMat = Object.fromEntries(Object.entries(OUTLETS).map(([k, v]) => [k, new THREE.MeshBasicMaterial({ color: v.color })]));
  const labs = [];
  for (const it of Object.values(items)) {
    const big = it.kind !== 'end', w = big ? 14 : 6, p = it.spur || it.kind === 'end' && it.off > 12 ? [it.at[0], it.at[1]] : it.pt;
    const n = it.face ? it.face.n : [0, 0];
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, big ? 10 : 6, w), boxMat[it.kind] || boxMat.end);
    b.position.set(p[0] + n[0] * (w / 2 + 1), it.h, p[1] + n[1] * (w / 2 + 1)); engG.add(b); it.objs = [b];
    if (it.outlet) {
      const s = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 2, 16), sockMat[it.outlet]); s.rotation.x = Math.PI / 2;
      const r = it.face.right; s.position.set(it.pt[0] + n[0] * 1.5 + r[0] * 14, +it.outlet, it.pt[1] + n[1] * 1.5 + r[1] * 14); s.lookAt(s.position.x + n[0], s.position.y, s.position.z + n[1]); engG.add(s); it.objs.push(s);
    }
    if (big) {
      const el = document.createElement('div'); el.className = 'englabel k-' + it.kind; el.textContent = it.label; el.title = it.role || it.note || '';
      const lab = new CSS2DObject(el); lab.position.set(b.position.x, it.h + 12, b.position.z); engG.add(lab); labs.push({ lab, room: it.room, it });
    }
  }
  const hl = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xd9ad57, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }));
  hl.visible = false; engG.add(hl);

  // ---------------- elevation of one face ----------------
  const doorsOn = (f) => (plan.doors || []).filter((d) => Math.abs(sdist(f, d.center)) <= f.t / 2 + 3 && sOf(f, d.center) > -1 && sOf(f, d.center) < f.L + 1)
    .map((d) => ({ d, s0: sOf(f, d.center) - d.width / 2, s1: sOf(f, d.center) + d.width / 2, y0: d.sill || 0, y1: (d.sill || 0) + (d.height || 200) }));
  function propsOn(f) {
    const out = [], bb = new THREE.Box3();
    for (const o of propObjs) {
      const p = o.userData.prop; if (p.nopick || (p.room && p.room !== f.room.id)) continue;
      bb.setFromObject(o); if (bb.isEmpty()) continue;
      const cs = []; for (const x of [bb.min.x, bb.max.x]) for (const z of [bb.min.z, bb.max.z]) cs.push([x, z]);
      const ds = cs.map((c) => sdist(f, c)), ss = cs.map((c) => sOf(f, c));
      if (Math.min(...ds) > 40 || Math.max(...ds) < -2) continue;
      let s0 = Math.max(0, Math.min(...ss)), s1 = Math.min(f.L, Math.max(...ss)); if (s1 - s0 < 2) continue;
      out.push({ id: p.id, name: p.name, s0, s1, y0: Math.max(0, bb.min.y), y1: Math.min(WALL_H, bb.max.y), touch: Math.min(...ds) < 6 });
    }
    return out;
  }
  // parts of cable polylines that lie in/on this wall (between the centreline and the room face)
  function cablesOn(f) {
    const res = [];
    for (const c of cables) {
      if (!showC(c)) continue;
      const segs = [];
      for (let i = 1; i < c.pts.length; i++) {
        const A = c.pts[i - 1], B = c.pts[i], pa = [A[0], A[2]], pb = [B[0], B[2]];
        const da = sdist(f, pa), db = sdist(f, pb), sa = sOf(f, pa), sb = sOf(f, pb);
        const inW = (d) => d >= -f.t / 2 - 1 && d <= 2;
        const inS = (s) => s >= -f.t - 1 && s <= f.L + f.t + 1;
        if (inW(da) && inW(db) && inS(sa) && inS(sb)) segs.push([[sa, A[1]], [sb, B[1]]]);
        else if (((A[1] >= WALL_H - 3 && B[1] >= WALL_H - 3) || (A[1] <= 2 && B[1] <= 2)) && (inW(da) || inW(db)) && inS(sa) && inS(sb)) segs.push([[sa, A[1]], [sb, B[1]], 'spur']);
      }
      if (segs.length) res.push({ c, segs });
    }
    return res;
  }
  const itemsOn = (f) => Object.values(items).filter((it) => it.face === f && showI(it));

  function elevationSVG(f, W = 420) {
    const pad = { l: 30, r: 12, t: 26, b: 40 }, H0 = WALL_H + 12, sc = (W - pad.l - pad.r) / Math.max(f.L, 60), Hpx = H0 * sc + pad.t + pad.b;
    const X = (s) => pad.l + s * sc, Y = (h) => pad.t + (H0 - h) * sc;
    let s = `<svg class="elev" viewBox="0 0 ${W} ${Hpx.toFixed(0)}" width="${W}" height="${Hpx.toFixed(0)}" font-family="helvetica" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(f.room.name + ', ' + f.name)}">`;
    s += `<rect x="${X(0)}" y="${Y(WALL_H)}" width="${f.L * sc}" height="${WALL_H * sc}" ${A('wallbg')}/>`;
    // height grid
    for (const h of [40, 100, 150, 200, 250]) s += `<line x1="${X(0)}" x2="${X(f.L)}" y1="${Y(h)}" y2="${Y(h)}" ${A('grid')}/><text x="${pad.l - 4}" y="${Y(h) + 3}" ${A('ax')} text-anchor="end">${h}</text>`;
    for (const o of doorsOn(f)) {
      const cls = /fake|gate|window/.test(o.d.type) ? 'door ghost' : 'door';
      s += `<rect x="${X(o.s0)}" y="${Y(o.y1)}" width="${(o.s1 - o.s0) * sc}" height="${(o.y1 - o.y0) * sc}" ${A(cls)}/><text x="${X((o.s0 + o.s1) / 2)}" y="${Y(o.y1) + 11}" ${A('dl')} text-anchor="middle">${esc(o.d.name || o.d.id)}</text>`;
    }
    for (const p of propsOn(f)) s += `<rect x="${X(p.s0)}" y="${Y(p.y1)}" width="${(p.s1 - p.s0) * sc}" height="${Math.max(1, (p.y1 - p.y0) * sc)}" ${A(p.touch ? 'prop' : 'prop free')}><title>${esc(p.id + ' ' + p.name)}</title></rect><text x="${X((p.s0 + p.s1) / 2)}" y="${Y(p.y0) - 3}" ${A('pl')} text-anchor="middle">${esc(p.id)}</text>`;
    // wall top route band
    s += `<line x1="${X(0)}" x2="${X(f.L)}" y1="${Y(TRUNK_H)}" y2="${Y(TRUNK_H)}" ${A('trunk')}/>`;
    const on = cablesOn(f);
    on.forEach(({ c, segs }, k) => {
      const col = TYPES[c.type].color, dy = ((k % 8) - 3.5) * 1.6;
      for (const sg of segs) {
        const [[s0, h0], [s1, h1]] = sg, top = h0 >= WALL_H - 3 && h1 >= WALL_H - 3;
        const y0 = top ? Y(WALL_H + 4) + dy : Y(h0), y1 = top ? Y(WALL_H + 4) + dy : Y(h1);
        s += `<line x1="${X(Math.max(-2, Math.min(f.L + 2, s0)))}" y1="${y0}" x2="${X(Math.max(-2, Math.min(f.L + 2, s1)))}" y2="${y1}" stroke="${col}" stroke-width="1.6" ${sg[2] ? 'stroke-dasharray="3 2"' : ''} class="cab${sg[2] ? ' spur' : ''}" data-c="${c.id}"><title>${esc(c.text)} (${m(c.len)})</title></line>`;
      }
    });
    // boxes, sockets and their dimensions
    const its = itemsOn(f).sort((a, b) => sOf(f, a.pt) - sOf(f, b.pt));
    its.forEach((it, i) => {
      const sx = sOf(f, it.pt), big = it.kind !== 'end', w = big ? 12 : 7;
      s += `<rect x="${X(sx) - w / 2}" y="${Y(it.h) - w / 2}" width="${w}" height="${w}" class="bx k-${it.kind}" fill="${BOXFILL[it.kind] || '#ccc'}" stroke="#222"><title>${esc(it.label + ': ' + (it.role || ''))}</title></rect>`;
      s += `<text x="${X(sx) + w / 2 + 2}" y="${Y(it.h) + 3}" ${A('bl')}>${esc(it.label)}${it.spur ? ' (' + it.spur + ')' : ''}</text>`;
      if (it.outlet) s += `<circle cx="${X(sx) - w / 2 - 6}" cy="${Y(+it.outlet)}" r="4" fill="${OUTLETS[it.outlet].color}" ${A('sock')}><title>${esc(OUTLETS[it.outlet].name)}</title></circle>`;
      const ty = Hpx - pad.b + 12 + (i % 3) * 9;
      s += `<line x1="${X(sx)}" x2="${X(sx)}" y1="${Y(0)}" y2="${ty - 7}" ${A('dim')}/><text x="${X(sx)}" y="${ty}" ${A('dt')} text-anchor="middle">${Math.round(sx)}</text>`;
    });
    s += `<line x1="${X(0)}" x2="${X(f.L)}" y1="${Y(0)}" y2="${Y(0)}" ${A('floor')}/>`;
    s += `<text x="${X(0)}" y="${pad.t - 10}" ${A('cap')}>|&lt;- ${Math.round(f.L)} cm -&gt;| &#160;&#183;&#160; seen from inside ${esc(f.room.name)}</text>`;
    s += `<text x="${X(f.L)}" y="${Y(WALL_H + 4) - 6}" ${A('ax')} text-anchor="end">on top of wall</text>`;
    return s + '</svg>';
  }

  // ---------------- plan of the whole layout (top view) ----------------
  function planSVG(W = 420) {
    const xs = rooms.flatMap((r) => r.polygon.map((p) => p[0])), ys = rooms.flatMap((r) => r.polygon.map((p) => p[1]));
    const x0 = Math.min(...xs) - 25, y0 = Math.min(...ys) - 25, x1 = Math.max(...xs) + 25, y1 = Math.max(...ys) + 45;
    const sc = W / (x1 - x0), H = (y1 - y0) * sc, X = (x) => ((x - x0) * sc).toFixed(1), Y = (y) => ((y - y0) * sc).toFixed(1);
    let s = `<svg class="elev plan" viewBox="0 0 ${W} ${H.toFixed(0)}" width="${W}" height="${H.toFixed(0)}" font-family="helvetica" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Plan with cable routes">`;
    for (const r of rooms) s += `<polygon points="${r.polygon.map(([x, y]) => X(x) + ',' + Y(y)).join(' ')}" ${A('wallbg')} stroke="none"/>`;
    for (const w of walls) s += `<line x1="${X(w.a[0])}" y1="${Y(w.a[1])}" x2="${X(w.b[0])}" y2="${Y(w.b[1])}" stroke="#555" stroke-width="${Math.max(1, w.t * sc)}" class="pw"/>`;
    for (const d of plan.doors || []) {
      if (/fake|gate/.test(d.type)) continue;
      const u = d.wall_axis === 'y' ? [0, 1] : [1, 0], hw = d.width / 2;
      s += `<line x1="${X(d.center[0] - u[0] * hw)}" y1="${Y(d.center[1] - u[1] * hw)}" x2="${X(d.center[0] + u[0] * hw)}" y2="${Y(d.center[1] + u[1] * hw)}" stroke="#ffffff" stroke-width="${Math.max(1.5, 12 * sc)}" class="pd"/>`;
    }
    cables.filter(showC).forEach((c) => {
      const o = ((c.lane % 10) - 5) * 0.35;
      const pts = c.pts.filter((p, i, a) => !i || Math.hypot(p[0] - a[i - 1][0], p[2] - a[i - 1][2]) > 0.5).map(([x, , y]) => `${(+X(x) + o).toFixed(1)},${(+Y(y) + o).toFixed(1)}`).join(' ');
      s += `<polyline points="${pts}" fill="none" stroke="${TYPES[c.type].color}" stroke-width="0.9" stroke-linejoin="round" ${c.floor ? 'stroke-dasharray="3 2"' : ''} data-c="${c.id}"><title>${esc(c.text)} (${m(c.len)})</title></polyline>`;
    });
    for (const it of Object.values(items)) {
      if (!showI(it)) continue;
      const p = it.spur || it.outside ? it.at : it.pt, big = it.kind !== 'end', w = big ? 5 : 3;
      s += `<rect x="${(+X(p[0]) - w / 2).toFixed(1)}" y="${(+Y(p[1]) - w / 2).toFixed(1)}" width="${w}" height="${w}" fill="${BOXFILL[it.kind] || '#ccc'}" stroke="#222" stroke-width="0.5"><title>${esc(it.label + ': ' + (it.role || ''))}</title></rect>`;
      if (big) s += `<text x="${(+X(p[0]) + 3.5).toFixed(1)}" y="${(+Y(p[1]) - 2).toFixed(1)}" font-size="5" ${A('bl')}>${esc(it.label.replace('Combination box', 'CB'))}</text>`;
    }
    for (const r of rooms) { const xs2 = r.polygon.map((p) => p[0]), ys2 = r.polygon.map((p) => p[1]); s += `<text x="${X((Math.min(...xs2) + Math.max(...xs2)) / 2)}" y="${Y(Math.min(...ys2) + 22)}" text-anchor="middle" font-size="7" ${A('cap')}>${esc(r.name)}</text>`; }
    return s + '</svg>';
  }

  // ---------------- puzzle filter ----------------
  const pzKeys = [...new Set(cables.flatMap((c) => c.pz))].sort((a, b) => (a === 'other') - (b === 'other') || (a[0] === 'U') - (b[0] === 'U') || a.localeCompare(b));
  const pzName = (k) => (k === 'other' ? 'Ambient, music boxes, lamps' : PUZZLES[k]?.name || k);
  const pzNum = (k) => (k === 'other' ? '•' : PUZZLES[k]?.label ?? k);
  function filterHtml() {
    const grp = (title, ks) => ks.length ? `<div class="pzg"><div class="wrn">${title}</div><div class="wb">${ks.map((k) => `<button type="button" data-pz="${k}" class="${filt.has(k) ? 'on' : ''}" title="${esc(pzName(k))}">${esc(pzNum(k))}<small>${esc(pzName(k).slice(0, 18))}</small></button>`).join('')}</div></div>` : '';
    return `<details class="flt" ${filt.size ? 'open' : ''}><summary>Show cables of puzzles: ${filt.size ? [...filt].map((k) => (k[0] === 'U' ? 'UoM ' : k === 'other' ? '' : 'FTL ') + pzNum(k)).join(', ') : 'all'}</summary>
      <div class="fbar"><button type="button" class="q3d-btn" data-pz="*">Show all</button></div>
      ${grp('Fairy Tale Library', pzKeys.filter((k) => k !== 'other' && k[0] !== 'U'))}${grp('University of Magic', pzKeys.filter((k) => k[0] === 'U'))}${grp('Other', pzKeys.filter((k) => k === 'other'))}</details>`;
  }
  function applyFilter() {
    for (const c of cables) if (c.mesh) c.mesh.visible = showC(c);
    for (const it of Object.values(items)) for (const o of it.objs || []) o.visible = showI(it);
    for (const l of labs) l.lab.visible = showI(l.it) && (!cur || l.room === cur.room.id);
    onDirty();
  }

  // ---------------- PDF export (jsPDF + svg2pdf, loaded on demand) ----------------
  const loadScript = (src) => new Promise((ok, bad) => { const e = document.createElement('script'); e.src = src; e.onload = ok; e.onerror = () => bad(new Error('Could not load ' + src)); document.head.appendChild(e); });
  async function exportPdf(btn) {
    const label = btn.textContent; btn.textContent = 'Building PDF…'; btn.disabled = true;
    try {
      if (!window.jspdf) await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
      if (!window.svg2pdf) await loadScript('https://cdn.jsdelivr.net/npm/svg2pdf.js@2.2.3/dist/svg2pdf.umd.min.js');
      const { jsPDF } = window.jspdf, doc = new jsPDF({ unit: 'pt', format: 'a4' }), PW = 595, M = 36, CW = PW - 2 * M;
      const host = document.createElement('div'); host.style.cssText = 'position:fixed;left:-9999px;top:0'; document.body.appendChild(host);
      const putSvg = async (svgStr, y, w) => {
        host.innerHTML = ascii(svgStr); const el = host.firstElementChild, vb = el.viewBox.baseVal, h = w * vb.height / vb.width;
        await doc.svg(el, { x: M, y, width: w, height: h }); return y + h;
      };
      let y = M;
      const line = (t, size = 9, bold = false, color = 20) => {
        doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(size); doc.setTextColor(color);
        for (const l of doc.splitTextToSize(ascii(t), CW)) { if (y > 806) { doc.addPage(); y = M; } doc.text(l, M, y); y += size * 1.3; }
      };
      const flt = filt.size ? 'Puzzles: ' + [...filt].map((k) => (k[0] === 'U' ? 'UoM ' : k === 'other' ? '' : 'FTL ') + pzNum(k) + ' ' + pzName(k)).join(', ') : 'All puzzles';
      line(document.title + ': cable plan', 15, true); line(flt + '   |   ' + new Date().toISOString().slice(0, 10), 9, false, 90); y += 4;
      line(Object.values(TYPES).map((t) => t.name).join('  |  ') + '   (colours as on screen)', 8, false, 90);
      line(SWITCHES.map((S) => S.note).join('. ') + '. Lengths = route + 1 m per cable.', 8, false, 90); y += 4;
      const plan = planSVG(420), vbH = +plan.match(/viewBox="0 0 \d+ ([\d.]+)"/)[1];
      y = await putSvg(plan, y, Math.min(CW, (806 - y) * 420 / vbH)) + 10;
      for (const { S, runs } of bySw) {
        const rr = runs.filter(showC); if (!rr.length) continue;
        doc.addPage(); y = M; line(S.label + ': switch ports', 13, true); y += 2;
        for (const c of rr) line(`${c.port}   ${c.a.label} - ${c.a.role || ''} (${roomById[c.a.room]?.name || ''})   ${m(c.len)}`, 9);
      }
      const vis = cables.filter(showC);
      doc.addPage(); y = M; line('All cables (' + vis.length + ')', 13, true); y += 2;
      for (const c of vis) line(`[${TYPES[c.type].name.split(' (')[0]}]  ${c.text}   ${m(c.len)}`, 8.5);
      for (const f of faces) {
        const on = cablesOn(f), its = itemsOn(f); if (filt.size && !on.length && !its.length) continue;
        doc.addPage(); y = M;
        line(`${f.room.name}: ${f.name}`, 13, true);
        line([`${Math.round(f.L)} cm long`, `${f.t} cm wall`, f.other ? 'other side: ' + f.other.name : f.outer ? 'outer wall' : ''].filter(Boolean).join('  |  ') + '. Distances from the left corner seen from inside the room, heights from the floor.', 8.5, false, 90);
        y = await putSvg(elevationSVG(f, 520), y + 4, CW) + 10;
        if (its.length) { line('Boxes on this wall', 10, true); for (const it of its.sort((a, b) => sOf(f, a.pt) - sOf(f, b.pt))) line(`${it.label} - ${it.role || ''}:  ${Math.round(sOf(f, it.pt))} cm from left, ${it.h} cm high${it.outlet ? ', 230 V socket ' + it.outlet + ' cm' : ''}${it.spur ? ' (' + it.spur + ' run ' + Math.round(it.off) + ' cm into the room)' : ''}`, 8.5); y += 4; }
        if (on.length) { line('Cables in this wall', 10, true); for (const { c } of on) line(`[${TYPES[c.type].name.split(' (')[0]}]  ${c.text}   ${m(c.len)}`, 8.5); }
      }
      host.remove();
      doc.save(`onyx-cables${filt.size ? '-' + [...filt].join('-') : ''}.pdf`);
    } catch (e) { console.error(e); alertNote('PDF export failed: ' + e.message); }
    finally { btn.textContent = label; btn.disabled = false; }
  }
  const alertNote = (t) => { const n = panel.querySelector('#engMsg'); if (n) n.textContent = t; };

  // ---------------- panel ----------------
  const panel = $('#eng');
  let cur = null;
  const lanRuns = cables.filter((c) => c.type === 'lan' && c.b?.kind === 'switch');
  const bySw = SWITCHES.map((S) => ({ S, runs: lanRuns.filter((c) => c.b.id === S.id) }));
  const totals = {}; for (const c of cables) totals[c.type] = (totals[c.type] || 0) + c.len;
  function legend() {
    return `<div class="leg">${Object.values(TYPES).map((t) => `<span><i style="background:${t.color}"></i>${esc(t.name)}</span>`).join('')}${Object.values(OUTLETS).map((o) => `<span><b style="background:${o.color}"></b>${esc(o.name)}</span>`).join('')}</div>`;
  }
  function wallList() {
    return rooms.map((r) => `<div class="wr"><div class="wrn">${esc(r.name)}</div><div class="wb">${faces.filter((f) => f.room === r).map((f) => {
      const n = cablesOn(f).length, k = itemsOn(f).length;
      return `<button type="button" data-f="${f.id}" class="${cur === f ? 'on' : ''}" title="${esc(f.name)}, ${Math.round(f.L)} cm, ${n} cables">${esc(f.name.replace(' wall', '').replace('Gate pier ', 'Pier '))}<small>${Math.round(f.L)}${k ? ' · ' + k : ''}</small></button>`;
    }).join('')}</div></div>`).join('');
  }
  function faceHtml(f) {
    const on = cablesOn(f), its = itemsOn(f).sort((a, b) => sOf(f, a.pt) - sOf(f, b.pt));
    const meta = [`${Math.round(f.L)} cm long`, `${f.t} cm wall`, f.other ? `other side: ${esc(f.other.name)}` : f.outer ? 'outer wall' : ''].filter(Boolean).join(' · ');
    let h = `<h3>${esc(f.room.name)}: ${esc(f.name)}</h3><div class="meta">${meta}</div>${elevationSVG(f)}`;
    h += `<p class="note">Distances in cm from the left corner as you face this wall inside ${esc(f.room.name)}. Heights above the floor. Cables go up inside the wall to its top and run on top of the walls.</p>`;
    if (its.length) h += `<h4>Boxes on this wall</h4><table class="t"><tr><th>Box</th><th>from left</th><th>height</th><th>230 V</th></tr>${its.map((it) => `<tr><td><b>${esc(it.label)}</b><br><span>${esc(it.role || '')}</span></td><td>${Math.round(sOf(f, it.pt))}</td><td>${it.h}${it.spur ? ' (' + it.spur + ', ' + Math.round(it.off) + ' cm out)' : ''}</td><td>${it.outlet ? it.outlet + ' cm' : ''}</td></tr>`).join('')}</table>`;
    if (on.length) h += `<h4>Cables in this wall (${on.length})</h4><table class="t">${on.map(({ c }) => `<tr data-c="${c.id}"><td><i class="sw" style="background:${TYPES[c.type].color}"></i></td><td>${esc(c.text)}</td><td class="r">${m(c.len)}</td></tr>`).join('')}</table>`;
    else h += '<p class="note">No cables in this wall.</p>';
    return h;
  }
  function render() {
        panel.innerHTML = `<div class="eh"><div><div class="eyebrow">Engineer mode</div><h2>Cables, wall by wall</h2></div><button type="button" class="close" id="engClose" aria-label="Close engineer mode">&times;</button></div>
      <div class="eb">${legend()}
      <div class="sum">${bySw.map(({ S, runs }) => `${esc(S.label)}: ${runs.length} ethernet runs${runs.length > 24 ? ` <em>(24 ports: ${runs.length - 24} short)</em>` : ''}`).join('<br>')}<br>${Object.entries(totals).map(([k, v]) => `${esc(TYPES[k].name.split(' (')[0])}: ${m(v)}`).join(' · ')}</div>
      ${filterHtml()}
      <details class="plan" open><summary>Plan of all cables</summary>${planSVG()}</details>
      <div class="walls">${wallList()}</div>
      <div id="engFace">${cur ? faceHtml(cur) : '<p class="note">Pick a wall above to see it on its own with every box, socket and cable.</p>'}</div>
      ${bySw.map(({ S, runs }) => `<details><summary>${esc(S.label)}: ports (${runs.length})</summary><table class="t">${runs.map((c) => `<tr><td>${c.port}</td><td><b>${esc(c.a.label)}</b><br><span>${esc(c.a.role || '')}</span></td><td>${esc(roomById[c.a.room]?.name || '')}</td><td class="r">${m(c.len)}</td></tr>`).join('')}</table></details>`).join('')}
      <details><summary>All cables (${cables.length})</summary><table class="t">${cables.map((c) => `<tr><td><i class="sw" style="background:${TYPES[c.type].color}"></i></td><td>${esc(c.text)}</td><td class="r">${m(c.len)}</td></tr>`).join('')}</table></details>
      <p class="note">${SWITCHES.map((S) => esc(S.note)).join('. ')}. Lengths: route + ${SLACK / 100} m per cable for boxes and loops. Data: data/cables.js.</p>
      <div class="fbar"><button type="button" class="q3d-btn pri" id="engPdf">Export PDF</button><button type="button" class="q3d-btn" id="engPrint">Print</button></div><p class="note" id="engMsg"></p></div>`;
  }
  panel.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-f]'); if (b) { pick(faces.find((f) => f.id === b.dataset.f)); return; }
    if (e.target.closest('#engClose')) { const t = $('#tEng'); t.checked = false; t.dispatchEvent(new Event('change')); return; }
    if (e.target.closest('#engPrint')) printAll();
    const pdf = e.target.closest('#engPdf'); if (pdf) { exportPdf(pdf); return; }
    const z = e.target.closest('button[data-pz]');
    if (z) { const k = z.dataset.pz; if (k === '*') filt.clear(); else if (filt.has(k)) filt.delete(k); else filt.add(k); const sc = panel.querySelector('.eb')?.scrollTop; render(); applyFilter(); const eb = panel.querySelector('.eb'); if (eb) eb.scrollTop = sc; }
  });
  panel.addEventListener('pointerover', (e) => { const r = e.target.closest('[data-c]'); hot(r ? r.dataset.c : null); });
  panel.addEventListener('pointerleave', () => hot(null));
  function hot(id) {
    for (const c of cables) if (c.mesh) c.mesh.scale.setScalar(1), (c.mesh.material = mats[c.type]);
    const c = id && cables.find((x) => x.id === id); if (!c?.mesh) return;
    c.mesh.material = new THREE.MeshBasicMaterial({ color: 0xffffff });
  }

  let anim = null;
  function pick(f) {
    cur = f; render();
    applyFilter();
    const W = f.L, mid = f.mid;
    hl.visible = true; hl.scale.set(W, WALL_H, 1);
    hl.position.set(mid[0] + f.n[0] * 1.2, WALL_H / 2, mid[1] + f.n[1] * 1.2); hl.rotation.set(0, Math.atan2(f.n[0], f.n[1]), 0);
    if (getMode() !== 'iso') setMode('iso');
    const target = new THREE.Vector3(mid[0], 120, mid[1]);
    const tan = Math.tan((persp.fov / 2) * Math.PI / 180), free = innerWidth > 820 ? 0.55 : 1;
    const dist = Math.min(1200, Math.max((W / 2 + 50) / (tan * persp.aspect * free), 170 / tan));
    const el = 0.62, dir = new THREE.Vector3(f.n[0] * Math.cos(el), Math.sin(el), f.n[1] * Math.cos(el));
    const p1 = target.clone().addScaledVector(dir, dist);
    // shift the target right so the wall sits in the part of the screen not covered by the panel
    if (innerWidth > 820) { const r = new THREE.Vector3(f.right[0], 0, f.right[1]); target.addScaledVector(r, dist * tan * persp.aspect * 0.42); p1.addScaledVector(r, dist * tan * persp.aspect * 0.42); }
    const p0 = persp.position.clone(), t0 = orbitP.target.clone(), T0 = performance.now();
    cancelAnimationFrame(anim);
    const step = () => { const k = Math.min(1, (performance.now() - T0) / 700), e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      persp.position.lerpVectors(p0, p1, e); orbitP.target.lerpVectors(t0, target, e); onDirty(); if (k < 1) anim = requestAnimationFrame(step); };
    step();
  }
  function printAll() {
    let pr = document.getElementById('engPrintArea'); if (!pr) { pr = document.createElement('div'); pr.id = 'engPrintArea'; document.body.appendChild(pr); }
    pr.innerHTML = `<h1>${esc(document.title)}: cables wall by wall</h1>${legend()}${planSVG(640)}` + faces.filter((f) => !filt.size || cablesOn(f).length || itemsOn(f).length).map((f) => `<section class="pf">${faceHtml(f)}</section>`).join('') +
      `<section class="pf"><h3>Switch ports</h3><table class="t">${lanRuns.map((c) => `<tr><td>${esc(c.b.label)} ${c.port}</td><td>${esc(c.a.label)}: ${esc(c.a.role || '')}</td><td>${esc(roomById[c.a.room]?.name || '')}</td><td class="r">${m(c.len)}</td></tr>`).join('')}</table></section>`;
    window.print();
  }

  function setOn(on) {
    engG.visible = on; document.body.classList.toggle('eng', on);
    if (on) { const low = $('#tLow'); if (low.checked) { low.checked = false; setMode(getMode()); } render(); }
    else { hl.visible = false; cur = null; applyFilter(); }
    onDirty();
  }
  return { setOn, faces, items, cables, pick: (id) => pick(faces.find((f) => f.id === id)), elevationSVG };
}
