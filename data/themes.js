// Room id (from plan.js) -> visual theme. Swap values here if sides change.
// Either a theme name, or { theme, zones:[{ theme, rect:[x0,y0,x1,y1] }] } to
// give part of a room its own look (floor, wall faces and light).
// Themes: library, forest, castle, frozen, djinn, mermaid, neutral (lib/materials.js)
import UOM_MAP, { THEMES as UOM_THEMES } from './uom/themes.js?v=202611091211';
export default {
  ...UOM_MAP,
  library: 'library',
  frozen_kingdom: 'frozen',
  djinns_vault: 'djinn',
  mermaid_cave: 'mermaid',
  // castle part (Evil Queen) = upper part of the L, down to the Forest Gate arch
  sleepy_forest: { theme: 'forest', zones: [{ theme: 'castle', rect: [245, 338, 473, 507] }] },
};
// Game overrides of built-in themes: stronger moving light from the water-effect projectors seen in the
// photos (warm on the castle walls, cold in the Frozen Kingdom and the Mermaid Cave).
const FTL_THEMES = ({ THREE, std, textures: TX, addCaustics }) => ({
  castle: { label: 'Sleepy Forest - castle', swatch: '#b9a678', floor: std(TX.boards('#CFC6B0', 'castleFloor')),
    wall: addCaustics(std(TX.castleStone(), { color: 0xd8d0c0 }), 0xffd070, 0.26), ceiling: 0x2a2620, light: 0xffc650, li: 1.05, fill: 0x403010 },
  frozen: { label: 'Frozen Kingdom', swatch: '#2fa8ff', floor: addCaustics(std(TX.tiles('#D8D8D2', 'frozenFloor'), { roughness: 1 }), 0x7fd8ff, 0.14),
    wall: addCaustics(std(TX.plaster('#E9EEF2', 'frozenWall', 0.03, 100, 1.2)), 0x7fd8ff, 0.27), ceiling: 0xf2f5f8, light: 0x3aa8ff, li: 1.0, fill: 0x123a6a },
  mermaid: { label: 'Mermaid Cave', swatch: '#8f9399', floor: addCaustics(std(TX.concrete('#9A9A98', 'mermaidFloor')), 0xe8f4ff, 0.16),
    wall: addCaustics(std(TX.caveRock()), 0xe8f4ff, 0.28), ceiling: std(TX.flagstone()), light: 0xdfeaff, li: 1.55, fill: 0x10303a },
});

export const THEMES = (ctx) => ({ ...UOM_THEMES(ctx), ...FTL_THEMES(ctx) });
