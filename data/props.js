// Prop layout for the Onyx version. Positions come from "Fairy Tale Pokoje Onyx.ai" (one page per room,
// reference/p1..p5.png), mapped into the measured room sizes of data/plan.js.
//   id     "05", "05b" ... leading 2 digits = puzzle number (or set `puzzle`)
//   decor  true = set dressing, no puzzle label
//   room   room id from plan.js (wall props face into this room)
//   kind   builder name in lib/props.js (unknown kinds render as a marked crate)
//   pos    [x, y] cm, plan coordinates (x right, y grows toward the entrance)
//   rot    degrees, floor/ceiling only; 0 = front faces +y (entrance), 90 = faces +x
//   mount  floor | wall (snapped to nearest wall, facing into `room`) | ceiling
//   h      cm. wall: height of the prop's base above floor; floor: lift; ceiling: drop
// Combination boxes 21-26 hang on the wall at ~150 cm (the .ai draws them flat on the walls; the old power plan
// puts the combination-box outlets at 150 cm).
import { shifted as U } from './uom/layout.js?v=202611091157';
const CB_H = 120;
export default [
  // ---- Library (bottom, 463 x 174) ----
  { id: '00', name: "Lectern with the Storyteller's Book", room: 'library', kind: 'lectern_book', pos: [67, 826], rot: 180, mount: 'floor' },
  { id: '02', name: 'Round maze', room: 'library', kind: 'round_maze', pos: [121, 824], rot: 180, mount: 'floor' },
  { id: '01', name: "Fairy Godmother's Cabinet (books, wand window, drawer)", room: 'library', kind: 'godmother_cabinet', pos: [426, 828], rot: 180, mount: 'floor' },
  { id: '04', name: 'Final Chapter order plaque (shell, apple, lamp, snowflake); the 4 books sit in cabinet 01', room: 'library', kind: 'order_plaque', pos: [426, 851], mount: 'wall', h: 150 },
  { id: '03', name: 'Fake door of book covers with 5 stars (03a)', room: 'library', kind: 'fake_door_books', pos: [241.5, 677], mount: 'wall', h: 0, w: 120 },
  { id: '03c', name: 'Bookshelf door to Frozen Kingdom', room: 'library', kind: 'bookshelf_door', pos: [67.5, 677], mount: 'wall', h: 0, w: 75 },
  { id: '03b', name: 'Bookshelf door to Sleepy Forest', room: 'library', kind: 'bookshelf_door', pos: [415.5, 677], mount: 'wall', h: 0, w: 75, mirror: true },
  { id: '03d', name: 'Music box 29 above the fake door (box with speakers)', room: 'library', kind: 'music_box', pos: [241.5, 677], mount: 'wall', h: 212 },
  { id: 'D22', decor: true, name: 'Oriental rug', room: 'library', kind: 'rug', pos: [241, 770], rot: 0, mount: 'floor', w: 150, d: 80 },
  { id: 'D23', decor: true, name: 'Brass candle sconce', room: 'library', kind: 'sconce', pos: [10, 760], mount: 'wall', h: 165 },
  { id: 'D24', decor: true, name: 'Brass candle sconce', room: 'library', kind: 'sconce', pos: [473, 760], mount: 'wall', h: 165 },
  { id: 'D25', decor: true, nopick: true, name: 'Candle glow', room: 'library', kind: 'glows', pos: [0, 0], mount: 'floor', pts: [[23, 192, 760], [460, 192, 760]], color: 0xffb060, size: 14 },
  { id: 'D1', decor: true, name: 'Chandelier (lamp 230 V)', room: 'library', kind: 'chandelier', pos: [241.5, 764], rot: 0, mount: 'ceiling' },

  // ---- Frozen Kingdom (middle left, 228 x 329) ----
  { id: '08e', name: 'Ice cabinet and ice frame (08c)', room: 'frozen_kingdom', kind: 'ice_cabinet', pos: [241.5, 412], mount: 'wall', h: 0 },
  { id: '08f', name: 'Ice Queen portrait in the shared opening', room: 'frozen_kingdom', kind: 'mirror_painting', pos: [241.5, 414], mount: 'wall', h: 128, w: 40, hgt: 60, style: 'ice' },
  { id: '08g', name: 'Lever (08d)', room: 'frozen_kingdom', kind: 'lever', pos: [241.5, 380], mount: 'wall', h: 120, style: 'ice' },
  { id: '08h', name: 'Lever (08d)', room: 'frozen_kingdom', kind: 'lever', pos: [241.5, 455], mount: 'wall', h: 120, style: 'ice' },
  { id: '10', name: 'Star with snowflake and star with hand (10a)', room: 'frozen_kingdom', kind: 'frost_pillar', pos: [5, 450], mount: 'wall', h: 0 },
  { id: '10b', name: 'Star pillar (10a)', room: 'frozen_kingdom', kind: 'frost_pillar', pos: [5, 550], mount: 'wall', h: 0 },
  { id: '10c', name: 'Star pillar (10a)', room: 'frozen_kingdom', kind: 'frost_pillar', pos: [241.5, 494], mount: 'wall', h: 0 },
  { id: '10d', name: 'Star pillar (10a)', room: 'frozen_kingdom', kind: 'frost_pillar', pos: [241.5, 638], mount: 'wall', h: 0 },
  { id: '10e', name: 'Board with 1 fixed gear on the door to Djinn\'s Vault (10b)', room: 'frozen_kingdom', kind: 'gear_board', pos: [93.5, 338], mount: 'wall', h: 150, off: 4 },
  { id: '11', name: 'Map of the Frozen Kingdom (11a)', room: 'frozen_kingdom', kind: 'framed_map', pos: [193, 338], mount: 'wall', h: 150, w: 55 },
  { id: '11g', name: 'Map of the Frozen Kingdom (11a)', room: 'frozen_kingdom', kind: 'framed_map', pos: [5, 398], mount: 'wall', h: 150, w: 55 },
  { id: '11h', name: 'Map of the Frozen Kingdom (11a)', room: 'frozen_kingdom', kind: 'framed_map', pos: [5, 500], mount: 'wall', h: 150, w: 55 },
  { id: '11i', name: 'Map of the Frozen Kingdom (11a)', room: 'frozen_kingdom', kind: 'framed_map', pos: [5, 601], mount: 'wall', h: 150, w: 55 },
  { id: '11j', name: 'Map of the Frozen Kingdom (11a)', room: 'frozen_kingdom', kind: 'framed_map', pos: [193, 672], mount: 'wall', h: 150, w: 55 },
  { id: '11b', name: 'Banner with symbol and compasses with letters (11b)', room: 'frozen_kingdom', kind: 'banner', pos: [241.5, 400], mount: 'wall', h: 222, symbol: 0 },
  { id: '11c', name: 'Board with hint (11c)', room: 'frozen_kingdom', kind: 'clue_board', pos: [241.5, 436], mount: 'wall', h: 212, w: 34 },
  { id: '12', name: 'Winter throne', room: 'frozen_kingdom', kind: 'ice_throne', pos: [212, 566], rot: -90, mount: 'floor', w: 90 },
  { id: '13', name: 'Frozen door with scarab (to Djinn\'s Vault)', room: 'frozen_kingdom', kind: 'scarab_door', pos: [93.5, 338], mount: 'wall', h: 0, w: 75 },
  { id: '23', name: 'Combination box 23 [7394]', room: 'frozen_kingdom', kind: 'combo_box', pos: [145, 338], rot: 0, mount: 'wall', h: CB_H },
  { id: '24', name: 'Combination box 24 [SUTIA]', room: 'frozen_kingdom', kind: 'combo_box', pos: [145, 672], rot: 0, mount: 'wall', h: CB_H },
  { id: '28', puzzle: 'MB', name: 'Music box Frozen Kingdom (above the entry door)', room: 'frozen_kingdom', kind: 'music_box', pos: [67.5, 672], mount: 'wall', h: 210 },
  { id: 'D30', decor: true, nopick: true, name: 'Icicles, snow drifts, ice crystals, throne runner', room: 'frozen_kingdom', kind: 'frozen_dressing', pos: [0, 0], mount: 'floor',
    poly: [[10, 338], [238, 338], [238, 667], [10, 667]],
    drifts: [[22, 350, 12, 4], [226, 352, 10, 3], [22, 655, 12, 3], [226, 655, 10, 3], [20, 515, 9, 2]],
    crystals: [[24, 356], [200, 650]], runner: [140, 566, 76, 50] },
  { id: 'D31', decor: true, nopick: true, name: 'Drifting snow', room: 'frozen_kingdom', kind: 'snowfall', pos: [0, 0], mount: 'floor', rects: [[10, 338, 238, 667]] },

  // ---- Sleepy Forest, castle part (middle right, top) ----
  { id: '08', name: 'Stone cabinet and stone frame (08a)', room: 'sleepy_forest', kind: 'stone_dresser', pos: [241.5, 412], mount: 'wall', h: 0 },
  { id: '08b', name: 'Mirror in stone frame (lowers on actuator)', room: 'sleepy_forest', kind: 'mirror_painting', pos: [241.5, 414], mount: 'wall', h: 128, w: 40, hgt: 58 },
  { id: '08c', name: 'Box with chains (08b)', room: 'sleepy_forest', kind: 'chain_block', pos: [241.5, 369], mount: 'wall', h: 185 },
  { id: '08d', name: 'Box with chains (08b)', room: 'sleepy_forest', kind: 'chain_block', pos: [241.5, 469], mount: 'wall', h: 185 },
  { id: '09', name: 'Collapsed mine entrance door with TNT and wire (09a)', room: 'sleepy_forest', kind: 'mine_door_tnt', pos: [389, 338], mount: 'wall', h: 0, w: 75 },
  { id: '07', name: 'Firefly column with 4 leaf buttons (07a)', room: 'sleepy_forest', kind: 'firefly_column', pos: [455, 357], rot: -45, mount: 'floor' },
  { id: '07b', name: 'Trapdoor box (07b)', room: 'sleepy_forest', kind: 'trapdoor_box', pos: [453, 418], rot: -90, mount: 'floor' },
  { id: 'D40', decor: true, name: 'Evil Queen banner (apple)', room: 'sleepy_forest', kind: 'queen_banner', pos: [300, 338], mount: 'wall', h: 235, symbol: 0 },
  { id: 'D44', decor: true, name: 'Wall torch', room: 'sleepy_forest', kind: 'wall_torch', pos: [473, 460], mount: 'wall', h: 150 },
  { id: 'D46', decor: true, nopick: true, name: 'Torch glow', room: 'sleepy_forest', kind: 'glows', pos: [0, 0], mount: 'floor', pts: [[458, 181, 460]], color: 0xffa040, size: 18 },
  { id: '06', name: 'Forest gate between the stone piers (06a)', room: 'sleepy_forest', kind: 'stone_arch_gate', pos: [359, 507.5], rot: 0, mount: 'floor', w: 80, span: 148 },
  // ---- Sleepy Forest, twilight forest (bottom) ----
  { id: '06b', name: 'Hollow trunk with tokens (06b)', room: 'sleepy_forest', kind: 'hollow_trunk', pos: [458, 590], rot: -90, mount: 'floor' },
  { id: '05', name: 'Branch with 5 lianas over 15 digit stones (05a)', room: 'sleepy_forest', kind: 'tangled_vines', pos: [245, 590], mount: 'wall', h: 0, w: 90 },
  { id: '05b', name: 'Board with LED controllers on the ceiling (05b)', room: 'sleepy_forest', kind: 'led_ceiling_board', pos: [335, 590], rot: 90, mount: 'ceiling', w: 86, d: 75 },
  { id: '21', name: 'Combination box 21 [78561] (05c)', room: 'sleepy_forest', kind: 'combo_box', pos: [324, 667], rot: 0, mount: 'wall', h: CB_H },
  { id: '29', puzzle: 'MB', name: 'Music box Sleepy Forest (above the entry door)', room: 'sleepy_forest', kind: 'music_box', pos: [415.5, 667], mount: 'wall', h: 210 },
  { id: 'D47', decor: true, nopick: true, name: 'Twilight forest dressing (ivy walls, trees, mushrooms, grass)', room: 'sleepy_forest', kind: 'forest_dressing', pos: [0, 0], mount: 'floor',
    box: [245, 525, 473, 667],
    ivy: [[473, 530, 473, 545, 10, 250, -1, 0], [473, 640, 473, 667, 0, 250, -1, 0], [440, 667, 473, 667, 0, 250, 0, -1], [245, 667, 300, 667, 0, 250, 0, -1],
      [245, 530, 245, 545, 0, 250, 1, 0], [245, 636, 245, 667, 0, 250, 1, 0]],
    trunks: [[292, 538, 1], [426, 538, -1]] },
  { id: 'D48', decor: true, nopick: true, overhead: true, name: 'LED foliage ceiling', room: 'sleepy_forest', kind: 'forest_canopy', pos: [0, 0], mount: 'ceiling', rect: [245, 525, 473, 667], hole: [292, 547, 378, 633] },
  { id: 'D49', decor: true, nopick: true, name: 'Fireflies (07c)', room: 'sleepy_forest', kind: 'fireflies', pos: [0, 0], mount: 'floor', box: [245, 340, 473, 667], n: 24 },

  // ---- Djinn's Vault (top left, 228 x 318) ----
  { id: '17', name: 'Jewel wheel (17a)', room: 'djinns_vault', kind: 'jewel_wheel', pos: [124, 5], mount: 'wall', h: 132 },
  { id: '14b', name: 'Board with hint (14a)', room: 'djinns_vault', kind: 'clue_board', pos: [124, 5], mount: 'wall', h: 212, w: 50 },
  { id: '16', name: 'Table with bowl, 2 compartments and LED crystals', room: 'djinns_vault', kind: 'adventurer_table', pos: [124, 44], rot: 0, mount: 'floor', w: 40 },
  { id: '17b', name: 'Shelf (17b)', room: 'djinns_vault', kind: 'jewel_shelf', pos: [5, 104], mount: 'wall', h: 130, jewel: 0 },
  { id: '17c', name: 'Shelf (17b)', room: 'djinns_vault', kind: 'jewel_shelf', pos: [5, 171], mount: 'wall', h: 130, jewel: 1 },
  { id: '17d', name: 'Shelf (17b)', room: 'djinns_vault', kind: 'jewel_shelf', pos: [5, 238], mount: 'wall', h: 130, jewel: 2 },
  { id: '17e', name: 'Shelf (17b)', room: 'djinns_vault', kind: 'jewel_shelf', pos: [241.5, 104], mount: 'wall', h: 130, jewel: 3 },
  { id: '17f', name: 'Shelf (17b)', room: 'djinns_vault', kind: 'jewel_shelf', pos: [241.5, 171], mount: 'wall', h: 130, jewel: 4 },
  { id: '17g', name: 'Shelf (17b)', room: 'djinns_vault', kind: 'jewel_shelf', pos: [241.5, 238], mount: 'wall', h: 130, jewel: 5 },
  { id: '17h', name: 'Rising pedestal (17c)', room: 'djinns_vault', kind: 'pedestal', pos: [124, 171], rot: 0, mount: 'floor', r: 16 },
  { id: '15', name: 'Sacred Animals of the East: 2 ropes with lantern weights either side of the door', room: 'djinns_vault', kind: 'ropes_weights', pos: [93.5, 316], rot: 180, mount: 'ceiling' },
  { id: '15b', name: 'Animal sequence board above the door', room: 'djinns_vault', kind: 'symbol_board', pos: [93.5, 328], mount: 'wall', h: 205, w: 74 },
  { id: '09b', name: 'TNT detonator (09b)', room: 'djinns_vault', kind: 'detonator', pos: [216, 312], rot: 180, mount: 'floor' },
  { id: '14', name: 'Spyglass (14b)', room: 'djinns_vault', kind: 'spyglass', pos: [176, 300], rot: 180, mount: 'floor' },
  { id: '22', name: 'Combination box 22 [736] (with the spyglass)', room: 'djinns_vault', kind: 'combo_box', pos: [167, 328], rot: 0, mount: 'wall', h: CB_H },
  { id: '25', name: 'Combination box 25 [64236]', room: 'djinns_vault', kind: 'combo_box', pos: [39, 5], rot: 0, mount: 'wall', h: CB_H },
  { id: '26', name: 'Combination box 26 [9753]', room: 'djinns_vault', kind: 'combo_box', pos: [208, 5], rot: 0, mount: 'wall', h: CB_H },
  { id: 'D50', decor: true, name: 'Oriental rug', room: 'djinns_vault', kind: 'rug', pos: [124, 200], rot: 0, mount: 'floor', w: 110, d: 80, style: 'djinn' },
  { id: 'D53', decor: true, nopick: true, name: 'Treasure, sand and drapes', room: 'djinns_vault', kind: 'djinn_dressing', pos: [0, 0], mount: 'floor',
    dunes: [[200, 60, 40, 60, 4, 0], [40, 40, 50, 40, 4, 0.2]], piles: [[60, 26, 12], [190, 26, 10]], chests: [],
    poly: [[238, 328], [10, 328], [10, 10], [238, 10]], skip: [[0, 105, 185]] },

  // ---- Mermaid Cave (top right, 228 x 318) ----
  { id: '20', name: 'Box with invisible harp (20a)', room: 'mermaid_cave', kind: 'harp_cabinet', pos: [338, 5], mount: 'wall', h: 60, w: 70 },
  { id: '20b', name: 'Open-a-box with speakers (20b)', room: 'mermaid_cave', kind: 'open_a_box', pos: [405, 26], rot: 0, mount: 'floor' },
  { id: '27', name: 'Additional electronic puzzle: box with marine animals (on top of 20b)', room: 'mermaid_cave', kind: 'marine_box', pos: [405, 26], rot: 0, mount: 'floor', h: 46 },
  { id: '19', name: 'Shelf with seashell and speaker (19a)', room: 'mermaid_cave', kind: 'seashell_shelf', pos: [245, 90], mount: 'wall', h: 110 },
  { id: '18', name: 'Shelf with corals and blowers, 15 marine animal symbols (18b, 18c) + drop-a-prop (19c)', room: 'mermaid_cave', kind: 'coral_console', pos: [245, 172], mount: 'wall', h: 0, w: 76 },
  { id: '19b', name: 'Shelf with LED button (19b)', room: 'mermaid_cave', kind: 'button_shelf', pos: [245, 253], mount: 'wall', h: 110 },
  { id: '18b', name: '6 buttons with reef (18a)', room: 'mermaid_cave', kind: 'reef_buttons', pos: [478, 178], mount: 'wall', h: 0, w: 110 },
  { id: '09c', name: 'Mine door, Mermaid side', room: 'mermaid_cave', kind: 'plain_door', pos: [389, 328], mount: 'wall', h: 0, w: 75 },
  { id: '09d', name: 'Box with speakers by the mine door (09c)', room: 'mermaid_cave', kind: 'music_box', pos: [389, 328], mount: 'wall', h: 210 },
  { id: 'D14', decor: true, nopick: true, name: 'Cave dressing (rocks, corals, seaweed, shells, net)', room: 'mermaid_cave', kind: 'mermaid_dressing', pos: [0, 0], mount: 'floor',
    rocks: [[258, 300, 10, 3], [462, 300, 10, 3], [462, 20, 10, 3]],
    corals: [[460, 12, 30, 1, 0], [258, 8, 300, 0.9, 1], [462, 8, 280, 0.9, 2]],
    brains: [[455, 0, 290, 6, 2]],
    shells: [[300, 0.5, 60, 0, 0.3], [430, 0.5, 120, 1, 1.2], [330, 0.5, 220, 2, 0.5], [420, 0.5, 260, 0, 2]],
    kelp: [[255, 30, 6, 80], [462, 80, 6, 90], [330, 318, 6, 85]], net: [300, 10, 70, 90, 0, 1] },
  { id: 'D4', decor: true, name: 'Organza jellyfish', room: 'mermaid_cave', kind: 'jellyfish', pos: [330, 120], mount: 'ceiling', drop: 70 },
  { id: 'D5', decor: true, name: 'Organza jellyfish', room: 'mermaid_cave', kind: 'jellyfish', pos: [400, 230], mount: 'ceiling', drop: 85 },
  // ---- University of Magic (data/uom/layout.js) ----
  ...U.props,
];
