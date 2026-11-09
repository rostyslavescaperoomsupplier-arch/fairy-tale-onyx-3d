// Fairy Tale Library - Onyx layout (2026-11). Units: cm, origin = outer top-left corner, x right, y down (toward the entrance).
// Sources (reference/):
//   sketch_onyx_dims.jpg - measured inner sizes: top rooms 228 x 318, middle rooms 228 x 329, library 463 x 174
//   p0.png .. p5.png     - "Fairy Tale Pokoje Onyx.ai": room order, door positions, props per room
// Door offsets are taken from the .ai (drawn for 225-wide rooms) and scaled by 228/225.
// Middle wall between the left and right rooms is 7 cm (2 x 228 + 7 = 463 = library width); all other walls 10 cm.
// Ceiling height is not on the sketch: 250 cm assumed.
import { shifted as U } from './uom/layout.js';
const H = 250;
const plan = {
  units: 'cm',
  origin: 'outer top-left corner, y down',
  bbox: [0, 0, 483, 861],
  rooms: [
    { id: 'djinns_vault', name: "Djinn's Vault", polygon: [[10, 10], [238, 10], [238, 328], [10, 328]], ceiling_h: H, size_cm: '228x318' },
    { id: 'mermaid_cave', name: 'Mermaid Cave', polygon: [[245, 10], [473, 10], [473, 328], [245, 328]], ceiling_h: H, size_cm: '228x318' },
    { id: 'frozen_kingdom', name: 'Frozen Kingdom', polygon: [[10, 338], [238, 338], [238, 667], [10, 667]], ceiling_h: H, size_cm: '228x329' },
    { id: 'sleepy_forest', name: 'Sleepy Forest',
      polygon: [[245, 338], [473, 338], [473, 490], [433, 490], [433, 525], [473, 525], [473, 667], [245, 667], [245, 525], [285, 525], [285, 490], [245, 490]],
      ceiling_h: H, size_cm: '228x152 castle + 228x142 forest, gate between 2 stone piers 40x35' },
    { id: 'library', name: 'Library', polygon: [[10, 677], [473, 677], [473, 851], [10, 851]], ceiling_h: H, size_cm: '463x174' },
  ],
  // wall centrelines; the engine cuts the door openings itself
  walls: [
    { id: 'outer_n', a: [0, 5], b: [483, 5], thickness: 10 },
    { id: 'outer_s', a: [0, 856], b: [483, 856], thickness: 10 },
    { id: 'outer_w', a: [5, 0], b: [5, 861], thickness: 10 },
    { id: 'outer_e', a: [478, 0], b: [478, 861], thickness: 10 },
    { id: 'mid', a: [241.5, 5], b: [241.5, 672], thickness: 7 },
    { id: 'cross_n', a: [5, 333], b: [478, 333], thickness: 10 },
    { id: 'cross_s', a: [5, 672], b: [478, 672], thickness: 10 },
    { id: 'pier_w', a: [241.5, 507.5], b: [285, 507.5], thickness: 35 },
    { id: 'pier_e', a: [433, 507.5], b: [478, 507.5], thickness: 35 },
  ],
  doors: [
    { id: 'entrance', name: 'D1 entrance', between: ['outside', 'library'], center: [230, 856], width: 75, type: 'passage', wall_axis: 'x', height: 200, sill: 0 },
    { id: 'bookshelf_frozen', name: 'D2 bookshelf door', between: ['library', 'frozen_kingdom'], center: [67.5, 672], width: 75, type: 'hidden-bookshelf', wall_axis: 'x', height: 200, sill: 0 },
    { id: 'bookshelf_forest', name: 'D3 bookshelf door', between: ['library', 'sleepy_forest'], center: [415.5, 672], width: 75, type: 'hidden-bookshelf', wall_axis: 'x', height: 200, sill: 0 },
    { id: 'open_sesame', name: 'D5 Open Sesame door', between: ['frozen_kingdom', 'djinns_vault'], center: [93.5, 333], width: 75, type: 'passage', wall_axis: 'x', height: 200, sill: 0 },
    { id: 'light_the_fuse', name: 'D4 mine door', between: ['sleepy_forest', 'mermaid_cave'], center: [389, 333], width: 75, type: 'passage', wall_axis: 'x', height: 200, sill: 0 },
    { id: 'two_queens_window', name: 'Two Queens window', between: ['sleepy_forest', 'frozen_kingdom'], center: [241.5, 414], width: 50, type: 'mirror-window', wall_axis: 'y', height: 168, sill: 0 },
    { id: 'fake_book_door', name: 'Fake door (03)', between: ['library', 'library'], center: [241.5, 672], width: 90, type: 'fake', wall_axis: 'x', height: 200, sill: 0 },
    { id: 'forest_gate', name: 'Forest gate (06)', between: ['sleepy_forest', 'sleepy_forest'], center: [359, 507.5], width: 148, type: 'gate', wall_axis: 'x', height: 200, sill: 0 },
  ],
  features: [],
  notes: [
    'Onyx layout: 2 x 2 rooms over a full-width library; 483 x 861 cm outside.',
    'The second sketch with 4 rooms (4.24 x 8.29 m) is not used here (reference/sketch_other_4rooms.jpg).',
  ],
};
// University of Magic block, 100 cm to the right (data/uom/layout.js)
plan.rooms.push(...U.rooms); plan.walls.push(...U.walls); plan.doors.push(...U.doors);
plan.bbox = [0, 0, 1027, 861];
export default plan;
