// Room id (from plan.js) -> visual theme. Either a theme name, or { theme, zones:[{ theme, rect:[x0,y0,x1,y1] }] }.
// Built-in themes live in lib/materials.js; the University of Magic looks are defined below (THEMES)
// from reference/photos/props.json (colours picked from the album photos).
export default {
  main_room: 'um_main',
  garden: 'um_garden',
  astrology_room: 'um_astrology',
  dueling_room: 'um_duelling',
};

// Called once by the engine with the texture/material factories; only themes that are used get built.
export const THEMES = ({ THREE, std, textures: TX, QUALITY }) => {
  const D = THREE.DoubleSide;
  // Main Room: stone-print wallpaper on walls AND ceiling, crazy-paving flagstone floor, warm amber
  const stone = TX.stoneWall('umStoneWall', ['#3e342c', ['#c4a684', '#d6c0a0', '#8e8a84', '#a8a29a', '#a08a6e', '#e2d0b4', '#7a7064']], 185);
  const paving = TX.flagstone('umPaving', ['#2e2924', '#857b6e', '#a89a88', ['#5a5248', '#c8bca8', '#3a332c', '#7a6a58', '#9a8a70']], 160);
  // Garden: red brick print, artificial grass, white "sky" ceiling
  const brick = TX.brick('umBrick', ['#cfc8be', ['#b5553a', '#c8724f', '#8e3a2a', '#a8483a', '#c06048']], 100);
  // Astrology: navy damask with silver-gold pattern, dark laminate, galaxy ceiling, blue-violet light
  const navy = TX.damask('umNavyDamask', ['#151c32', '#38446a', 'rgba(196,184,136,0.5)', 0xa89a70, 0.45], 60);
  // Duelling: red damask with gold pattern, warm wood laminate, dark ceiling, amber light
  const red = TX.damask('umRedDamask', ['#5a1410', '#8a4422', 'rgba(205,150,70,0.5)', 0xb8903c, 0.3], 42);
  // Garden: painted daylight sky with soft clouds (tileable, self-lit) for the "open sky" ceiling
  const S = QUALITY?.low ? 256 : 512, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const x = cv.getContext('2d'), sg = x.createLinearGradient(0, 0, S, S); sg.addColorStop(0, '#bcd8f2'); sg.addColorStop(0.5, '#d6e8f8'); sg.addColorStop(1, '#c4dcf4');
  x.fillStyle = sg; x.fillRect(0, 0, S, S); let sd = 7; const rnd = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 14; i++) { const cx = rnd() * S, cy = rnd() * S, n = 6 + rnd() * 6;
    for (let k = 0; k < n; k++) { const px = cx + (rnd() - 0.5) * S * 0.22, py = cy + (rnd() - 0.5) * S * 0.08, r = S * (0.03 + rnd() * 0.05);
      for (const [ox, oy] of [[0, 0], [S, 0], [-S, 0], [0, S], [0, -S]]) { const g = x.createRadialGradient(px + ox, py + oy, 0, px + ox, py + oy, r); g.addColorStop(0, 'rgba(255,255,255,0.75)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(px + ox - r, py + oy - r, r * 2, r * 2); } } }
  const sky = new THREE.CanvasTexture(cv); sky.colorSpace = THREE.SRGBColorSpace; sky.wrapS = sky.wrapT = THREE.RepeatWrapping; sky.userData.T = 320;
  sky.onUpdate = () => { cv.width = cv.height = 0; };
  const skyMat = new THREE.MeshStandardMaterial({ map: sky, emissive: 0x3a4658, roughness: 1, color: 0xb4c6dc, side: D });
  return {
    um_main: { label: 'Main Room', swatch: '#c9a47e', floor: std(paving, { color: 0xc8c0b4 }), wall: std(stone), ceiling: std(stone, { side: D, color: 0x9a8c78 }), light: 0xffc488, li: 1.65 },
    um_garden: { label: 'Garden', swatch: '#4e7a2e', floor: std(TX.grass(), { color: 0xd8f0c0 }), wall: std(brick), ceiling: skyMat, light: 0xfff0dc, li: 1.75 },
    um_astrology: { label: 'Astrology Room', swatch: '#3a4ad8', floor: std(TX.planks('#5A3E2B', 'umLaminateDark', 120)), wall: std(navy), ceiling: std(TX.galaxy('umGalaxy'), { side: D, emissive: 0x1a1440, emissiveIntensity: 1 }), light: 0x9088ff, li: 1.4 },
    um_duelling: { label: 'Dueling Room', swatch: '#b0302a', floor: std(TX.planks('#7A5532', 'umLaminateWarm', 120)), wall: std(red), ceiling: 0x1c1512, light: 0xffa050, li: 1.45 },
  };
};
