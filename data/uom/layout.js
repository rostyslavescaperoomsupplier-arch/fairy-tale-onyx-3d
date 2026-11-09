// University of Magic - Onyx layout, placed in the same scene 100 cm to the right of the Fairy Tale Library.
// Sources (reference/uom_*):
//   "University of Magic Dimensions Onyx Updated.pdf" (Drive): room order, doors, props per room
//   hand sketch 1794219364589.jpg: measured sizes. The sketch is drawn mirrored left-right compared with the .ai;
//   the .ai orientation is used here (Main Room + entrance bottom left, Garden bottom right).
//   Sizes: Main Room 267 x 424, Garden 147 x 424 (sketch 2.72 / 1.52 taken to the wall centre line), upper block
//   405 deep: Astrology 213 wide (top part, 216 deep) + 125 wide (bottom part, 180 deep), Dueling the mirror image
//   (201 / 289). Ceiling 250 cm assumed.
// Everything below is in local cm (outer top-left corner of this block = 0,0); OX shifts it into the scene.
export const OX = 483 + 100;
const H = 250;

export const PLAN = {
  rooms: [
    { id: 'astrology_room', name: 'Astrology Room', polygon: [[10, 10], [223, 10], [223, 226], [135, 226], [135, 415], [10, 415]], ceiling_h: H },
    { id: 'dueling_room', name: 'Dueling Room', polygon: [[233, 10], [434, 10], [434, 415], [145, 415], [145, 236], [233, 236]], ceiling_h: H },
    { id: 'main_room', name: 'Main Room', polygon: [[10, 425], [277, 425], [277, 849], [10, 849]], ceiling_h: H },
    { id: 'garden', name: 'Garden', polygon: [[287, 425], [434, 425], [434, 849], [287, 849]], ceiling_h: H },
  ],
  walls: [
    { id: 'u_outer_n', a: [0, 5], b: [444, 5], thickness: 10 },
    { id: 'u_outer_s', a: [0, 854], b: [444, 854], thickness: 10 },
    { id: 'u_outer_w', a: [5, 0], b: [5, 859], thickness: 10 },
    { id: 'u_outer_e', a: [439, 0], b: [439, 859], thickness: 10 },
    { id: 'u_cross', a: [5, 420], b: [439, 420], thickness: 10 },
    { id: 'u_upper_v', a: [228, 5], b: [228, 231], thickness: 10 },
    { id: 'u_notch', a: [140, 231], b: [228, 231], thickness: 10 },
    { id: 'u_lower_v', a: [140, 231], b: [140, 420], thickness: 10 },
    { id: 'u_garden', a: [282, 420], b: [282, 854], thickness: 10 },
  ],
  doors: [
    { id: 'u_entrance', name: 'D1 entrance', between: ['outside', 'main_room'], center: [195, 854], width: 75, type: 'passage', wall_axis: 'x', height: 200, sill: 0 },
    { id: 'u_painting', name: 'D4 painting passage', between: ['main_room', 'astrology_room'], center: [82, 420], width: 90, type: 'painting-passage', wall_axis: 'x', height: 175, sill: 25 },
    { id: 'u_knight', name: "D3 Knight's door", between: ['main_room', 'dueling_room'], center: [197, 420], width: 90, type: 'knight-door', wall_axis: 'x', height: 200, sill: 0 },
    { id: 'u_garden_gate', name: 'D2 garden gate', between: ['main_room', 'garden'], center: [282, 671], width: 90, type: 'garden-gate', wall_axis: 'y', height: 200, sill: 0 },
  ],
};

// game: 'uom' -> built by lib/props_uom.js; puzzle keys get a U prefix (both games use 00-31)
const P = (o) => ({ game: 'uom', ...o, id: 'U' + o.id, puzzle: o.decor ? undefined : 'U' + (o.puzzle || o.id.match(/^\d{2}/)[0]) });
export const PROPS = [
  // ---- Main Room ----
  { id: '00', name: 'Memory Well (hint system)', room: 'main_room', kind: 'memory_well', pos: [252, 824], rot: 225, mount: 'floor', w: 49, d: 49, hgt: 111 },
  { id: '02a', name: 'Open-a-box (Catch a Poltergeist)', room: 'main_room', kind: 'open_a_box', game: 'ftl', pos: [262, 789], rot: -90, mount: 'floor' },
  { id: '01', name: 'Wand case (6 wands)', room: 'main_room', kind: 'wand_case', pos: [30, 569], rot: 90, mount: 'floor', w: 66, d: 40, hgt: 75 },
  { id: '02', name: 'Poltergeist wall lantern with candle', room: 'main_room', kind: 'poltergeist_lantern', pos: [5, 511], mount: 'wall', h: 150, off: 4 },
  { id: '02b', name: 'Poltergeist wall lantern with candle', room: 'main_room', kind: 'poltergeist_lantern', pos: [5, 775], mount: 'wall', h: 150, off: 4 },
  { id: '02c', name: 'Poltergeist wall lantern with candle', room: 'main_room', kind: 'poltergeist_lantern', pos: [282, 511], mount: 'wall', h: 150, off: 4 },
  { id: '02d', name: 'Poltergeist wall lantern with candle', room: 'main_room', kind: 'poltergeist_lantern', pos: [282, 768], mount: 'wall', h: 150, off: 4 },
  { id: '22', name: 'Magic Token Stand base (3 patron tokens)', room: 'main_room', kind: 'token_stand', pos: [26, 636], rot: 90, mount: 'floor', w: 50, d: 28 },
  { id: '22b', name: 'Token stand wall panel (LED progress chains + drop-a-prop)', room: 'main_room', kind: 'token_panel', pos: [5, 636], mount: 'wall', h: 110, w: 90 },
  { id: '08', name: 'Alchemy desk', room: 'main_room', kind: 'alchemy_desk', pos: [39, 713], rot: 90, mount: 'floor', w: 89, d: 52 },
  { id: '03', name: 'Potion stand', room: 'main_room', kind: 'potion_stand', pos: [46, 838], rot: 180, mount: 'floor', h: 0, w: 70, d: 18 },
  { id: '10', name: 'Celestowl painting (passage to the Astrology Room)', room: 'main_room', kind: 'painting_passage', pos: [82, 420], mount: 'wall', h: 25, w: 100, hgt: 180 },
  { id: '17', name: "Knight's Door to the Dueling Room", room: 'main_room', kind: 'knight_door', pos: [197, 420], mount: 'wall', h: 0, w: 100 },
  { id: '17b', name: 'Knight in armour on movable base (sword recess)', room: 'main_room', kind: 'knight_armour', pos: [197, 458], rot: 0, mount: 'floor', w: 86, d: 46, hgt: 212 },
  { id: '13', name: 'Framed Elvish alphabet', room: 'main_room', kind: 'alphabet_board', pos: [282, 566], mount: 'wall', h: 140, w: 33, hgt: 85 },
  { id: '04', name: 'Garden gate (04a)', room: 'garden', kind: 'flower_gate', pos: [282, 671], mount: 'wall', h: 0, w: 90 },
  { id: '26', name: 'Combination box 26 [6438] (garden gate)', room: 'main_room', kind: 'combo_box', pos: [100, 854], mount: 'wall', h: 150 },
  { id: '29', name: 'Combination box 29 [83720] (potion book)', room: 'main_room', kind: 'combo_box', pos: [132, 854], mount: 'wall', h: 150 },
  { id: 'D1', decor: true, name: 'Chandelier with 5 faux candles', room: 'main_room', kind: 'chandelier', pos: [143, 637], rot: 0, mount: 'ceiling' },
  { id: 'D14', decor: true, name: 'Dark wooden ceiling beams', room: 'main_room', kind: 'beam_frame', pos: [143, 637], mount: 'ceiling', overhead: true, w: 267, d: 424, cross: [-100, 100] },
  { id: 'D32', decor: true, name: 'Persian rug', room: 'main_room', kind: 'rug', pos: [150, 640], rot: 90, mount: 'floor', w: 170, d: 112, style: 'red' },
  { id: 'D15', decor: true, name: 'Wing-back armchair', room: 'main_room', kind: 'armchair', pos: [200, 780], rot: 200, mount: 'floor' },

  // ---- Garden ----
  { id: '06', name: 'Magic plant box', room: 'garden', kind: 'plant_box', pos: [319, 446], rot: 0, mount: 'floor', w: 38, d: 30, hgt: 30 },
  { id: '07', name: 'Gnome tree trunk (corner)', room: 'garden', kind: 'tree_trunk', pos: [410, 449], rot: 315, mount: 'floor', w: 46, d: 46 },
  { id: '09', name: "Salamander's lair", room: 'garden', kind: 'salamander_lair', pos: [418, 541], rot: -90, mount: 'floor', w: 53, d: 28 },
  { id: '04b', puzzle: '04', name: 'Flower rack', room: 'garden', kind: 'flower_rack', pos: [439, 669], mount: 'wall', h: 60, w: 70 },
  { id: '05', name: 'Mermaid fountain', room: 'garden', kind: 'fountain', pos: [358, 830], rot: 180, mount: 'floor', w: 50, d: 36 },
  { id: '05b', puzzle: '05', name: 'Faux stained-glass window with LEDs', room: 'garden', kind: 'stained_glass', pos: [358, 854], mount: 'wall', h: 89, w: 50, hgt: 69 },
  { id: 'D38', decor: true, name: 'Black metal skylight frame', room: 'garden', kind: 'garden_frame', pos: [360.5, 637], mount: 'ceiling', h: 20, overhead: true, w: 147, d: 424 },
  { id: 'D39', decor: true, name: 'Artificial grass tufts', room: 'garden', kind: 'grass_tufts', pos: [360.5, 637], mount: 'floor', w: 137, d: 414 },
  { id: 'D16', decor: true, name: 'Artificial tree in grey pot', room: 'garden', kind: 'potted_tree', pos: [305, 828], mount: 'floor' },
  { id: 'D18', decor: true, name: 'Fern bush', room: 'garden', kind: 'bush', pos: [420, 720], rot: -90, mount: 'floor', w: 45 },
  { id: 'D20', decor: true, name: 'Ivy garland', room: 'garden', kind: 'ivy_garland', pos: [439, 637], mount: 'wall', h: 230, w: 400 },
  { id: 'D4', decor: true, name: 'Ceiling lamp', room: 'garden', kind: 'ceiling_lamp', pos: [360, 560], rot: 0, mount: 'ceiling', overhead: true },

  // ---- Astrology Room ----
  { id: '16', name: 'Planetary table (9 planet tokens)', room: 'astrology_room', kind: 'planetary_table', pos: [88, 113], rot: 180, mount: 'floor', w: 55 },
  { id: '11', name: 'Midnight longcase clock (11a)', room: 'astrology_room', kind: 'clock', pos: [206, 115], rot: -90, mount: 'floor', w: 58, d: 31, hgt: 150 },
  { id: '12', name: 'Constellations gallery with telescope (12ab)', room: 'astrology_room', kind: 'constellation_board', pos: [5, 113], mount: 'wall', h: 100, w: 90 },
  { id: '12b', puzzle: '12', name: 'Framed constellation painting', room: 'astrology_room', kind: 'framed_painting', pos: [5, 45], mount: 'wall', h: 140, w: 30 },
  { id: '12c', puzzle: '12', name: 'Framed constellation painting', room: 'astrology_room', kind: 'framed_painting', pos: [5, 180], mount: 'wall', h: 140, w: 30 },
  { id: '14', name: 'Tarot panorama painting', room: 'astrology_room', kind: 'tarot_gallery', pos: [80, 5], mount: 'wall', h: 130, w: 30 },
  { id: '14b', puzzle: '14', name: 'Tarot panorama painting', room: 'astrology_room', kind: 'tarot_gallery', pos: [107, 5], mount: 'wall', h: 130, w: 30 },
  { id: '14c', puzzle: '14', name: 'Tarot panorama painting', room: 'astrology_room', kind: 'tarot_gallery', pos: [134, 5], mount: 'wall', h: 130, w: 30 },
  { id: '14d', puzzle: '14', name: 'Tarot panorama painting', room: 'astrology_room', kind: 'tarot_gallery', pos: [161, 5], mount: 'wall', h: 130, w: 30 },
  { id: '15', name: 'Shelf with 8 divination cups (spot not on the plan)', room: 'astrology_room', kind: 'divination_cups', pos: [200, 5], mount: 'wall', h: 110, w: 40 },
  { id: '10b', puzzle: '10', name: 'Painted pouf (Painting Passage controller + speaker)', room: 'astrology_room', kind: 'pouf', pos: [24, 392], rot: 0, mount: 'floor', w: 40, d: 30 },
  { id: '23', name: 'Combination box 23 [582]', room: 'astrology_room', kind: 'combo_box', pos: [5, 255], mount: 'wall', h: 150 },
  { id: '30', name: 'Combination box 30 [19618]', room: 'astrology_room', kind: 'combo_box', pos: [5, 342], mount: 'wall', h: 150 },
  { id: '24', name: 'Combination box 24 [79365]', room: 'astrology_room', kind: 'combo_box', pos: [140, 255], mount: 'wall', h: 150 },
  { id: '31', name: 'Combination box 31 [SHRTK]', room: 'astrology_room', kind: 'combo_box', pos: [140, 342], mount: 'wall', h: 150 },
  { id: 'D5', decor: true, name: 'UV lamp bar (11b)', room: 'astrology_room', kind: 'uv_lamp', pos: [5, 150], mount: 'wall', h: 200, w: 40 },
  { id: 'D45', decor: true, name: 'Twinkling stars under the galaxy ceiling', room: 'astrology_room', kind: 'star_field', pos: [116, 118], mount: 'ceiling', overhead: true, w: 200, d: 200 },
  { id: 'D26', decor: true, name: 'Cotton-wool clouds', room: 'astrology_room', kind: 'cloud_cluster', pos: [60, 60], mount: 'ceiling', overhead: true },
  { id: 'D6', decor: true, name: 'Ceiling lamp (relay 230 V)', room: 'astrology_room', kind: 'ceiling_lamp', pos: [88, 113], rot: 0, mount: 'ceiling', overhead: true },

  // ---- Dueling Room ----
  { id: '21', name: "Monster chest (21a)", room: 'dueling_room', kind: 'monster_chest', pos: [293, 388], rot: 180, mount: 'floor', w: 86, d: 48 },
  { id: '17c', puzzle: '17', name: "Wooden pouf (Knight's Door controller + speaker)", room: 'dueling_room', kind: 'pouf', pos: [359, 396], rot: 180, mount: 'floor', w: 40, d: 30 },
  { id: '21b', puzzle: '21', name: 'Cast-a-spell board', room: 'dueling_room', kind: 'spell_board', pos: [140, 250], mount: 'wall', h: 100, w: 48 },
  { id: '21c', puzzle: '21', name: 'Cast-a-spell board', room: 'dueling_room', kind: 'spell_board', pos: [140, 315], mount: 'wall', h: 100, w: 48 },
  { id: '21d', puzzle: '21', name: 'Cast-a-spell board', room: 'dueling_room', kind: 'spell_board', pos: [140, 380], mount: 'wall', h: 100, w: 48 },
  { id: '21e', puzzle: '21', name: 'Cast-a-spell board', room: 'dueling_room', kind: 'spell_board', pos: [439, 250], mount: 'wall', h: 100, w: 48 },
  { id: '21f', puzzle: '21', name: 'Cast-a-spell board', room: 'dueling_room', kind: 'spell_board', pos: [439, 315], mount: 'wall', h: 100, w: 48 },
  { id: '21g', puzzle: '21', name: 'Cast-a-spell board', room: 'dueling_room', kind: 'spell_board', pos: [439, 380], mount: 'wall', h: 100, w: 48 },
  { id: '20', name: 'Engraved element plate', room: 'dueling_room', kind: 'element_plate', pos: [140, 282], mount: 'wall', h: 150, w: 30 },
  { id: '20b', puzzle: '20', name: 'Engraved element plate', room: 'dueling_room', kind: 'element_plate', pos: [140, 348], mount: 'wall', h: 150, w: 30 },
  { id: '20c', puzzle: '20', name: 'Engraved element plate', room: 'dueling_room', kind: 'element_plate', pos: [439, 282], mount: 'wall', h: 150, w: 30 },
  { id: '20d', puzzle: '20', name: 'Engraved element plate', room: 'dueling_room', kind: 'element_plate', pos: [439, 348], mount: 'wall', h: 150, w: 30 },
  { id: '19', name: 'Creature map', room: 'dueling_room', kind: 'creature_map', pos: [228, 118], mount: 'wall', h: 110, w: 130 },
  { id: '18', name: 'Courage test box (hung on rope)', room: 'dueling_room', kind: 'courage_test', pos: [439, 59], mount: 'wall', h: 100, w: 20 },
  { id: '18b', puzzle: '18', name: 'Courage test box (hung on rope)', room: 'dueling_room', kind: 'courage_test', pos: [439, 172], mount: 'wall', h: 100, w: 20 },
  { id: '25', name: 'Combination box 25 [36107]', room: 'dueling_room', kind: 'combo_box', pos: [285, 5], mount: 'wall', h: 150 },
  { id: '27', name: 'Combination box 27 [^>>v<^]', room: 'dueling_room', kind: 'combo_box', pos: [331, 5], mount: 'wall', h: 150 },
  { id: '28', name: 'Combination box 28 [EOIYA]', room: 'dueling_room', kind: 'combo_box', pos: [377, 5], mount: 'wall', h: 150 },
  { id: 'D7', decor: true, name: 'Chandelier with 5 faux candles', room: 'dueling_room', kind: 'chandelier', pos: [330, 220], rot: 0, mount: 'ceiling' },
  { id: 'D29', decor: true, name: 'Iron wall torch', room: 'dueling_room', kind: 'wall_torch', pos: [439, 115], mount: 'wall', h: 165 },
  { id: 'D8', decor: true, name: 'Dragon skull', room: 'dueling_room', kind: 'dragon_skull', pos: [415, 5], mount: 'wall', h: 207 },
].map(P);

// ---- engineer mode: UPC numbers from "university of magic all puzzles and uupc eng" (Drive) ----
export const SWITCH = { id: 'SWU', label: 'Switch 24p + GM PC (UoM)', kind: 'switch', at: [120, 867], h: 100, outside: true, note: 'Outside the University of Magic entrance wall, left of D1 (assumed)' };
const I = (o) => ({ ...o, sw: 'SWU' });
export const ITEMS = [
  // main room
  I({ id: 'U_UPC2', label: 'UPC #2', role: 'Memory Well hint system (00)', room: 'main_room', at: [277, 824], h: 40, kind: 'upc', lan: true, outlet: '40' }),
  I({ id: 'U_UPC3', label: 'UPC #3', role: 'Catch a Poltergeist (02) + open-a-box 02a', room: 'main_room', at: [277, 795], h: 40, kind: 'upc', lan: true, outlet: '40' }),
  I({ id: 'U_C1', label: 'Lantern 02', role: 'Magnetic sensor in the candle', room: 'main_room', at: [10, 511], h: 150, kind: 'end' }),
  I({ id: 'U_C2', label: 'Lantern 02', role: 'Magnetic sensor in the candle', room: 'main_room', at: [10, 775], h: 150, kind: 'end' }),
  I({ id: 'U_C3', label: 'Lantern 02', role: 'Magnetic sensor in the candle', room: 'main_room', at: [277, 511], h: 150, kind: 'end' }),
  I({ id: 'U_C4', label: 'Lantern 02', role: 'Magnetic sensor in the candle', room: 'main_room', at: [277, 768], h: 150, kind: 'end' }),
  I({ id: 'U_UPC4', label: 'UPC #4', role: 'Alchemy desk (08): 4 RFID + electromagnet', room: 'main_room', at: [10, 713], h: 40, kind: 'upc', lan: true, outlet: '40' }),
  I({ id: 'U_UPC20', label: 'UPC #20', role: 'Magic Token Stand (22): 3 RFID, LED chains, drop-a-prop', room: 'main_room', at: [10, 636], h: 40, kind: 'upc', lan: true, outlet: '40' }),
  I({ id: 'U_LEDP', label: 'LED chains 22', role: '3 x 1 m LED progress chains', room: 'main_room', at: [10, 650], h: 160, kind: 'end' }),
  I({ id: 'U_MAG10', label: 'Electromagnets 10', role: 'Painting passage, 3 x 70 kg', room: 'main_room', at: [125, 425], h: 200, kind: 'end' }),
  I({ id: 'U_MAG17', label: 'Electromagnet 17', role: "Knight's door", room: 'main_room', at: [240, 425], h: 200, kind: 'end' }),
  I({ id: 'U_CB26', label: 'CB 26', role: 'Combination box [6438], garden gate', room: 'main_room', at: [100, 849], h: 150, kind: 'cb', lan: true, outlet: '150' }),
  I({ id: 'U_LOCK04', label: 'Gate lock 04', role: 'Garden gate lock (opened by CB 26)', room: 'main_room', at: [277, 720], h: 120, kind: 'end' }),
  I({ id: 'U_CB29', label: 'CB 29', role: 'Combination box [83720], potion book', room: 'main_room', at: [132, 849], h: 150, kind: 'cb', lan: true, outlet: '150' }),
  I({ id: 'U_LAMPM', label: 'Lamp 230 V', role: 'Main Room chandelier', room: 'main_room', at: [143, 637], h: 245, kind: 'end' }),
  // garden
  I({ id: 'U_UPC10', label: 'UPC #10', role: 'Gnome tree trunk (07): knock + 5 RFID, UV LEDs', room: 'garden', at: [434, 449], h: 40, kind: 'upc', lan: true, outlet: '40' }),
  I({ id: 'U_UPC11', label: 'UPC #11', role: 'Magic plant box (06): 6 RFID, drawer', room: 'garden', at: [319, 425], h: 40, kind: 'upc', lan: true, outlet: '40' }),
  I({ id: 'U_UPC12', label: 'UPC #12', role: "Salamander's lair (09): RFID, electro-lock", room: 'garden', at: [434, 541], h: 40, kind: 'upc', lan: true, outlet: '40' }),
  I({ id: 'U_UPC13', label: 'UPC #13', role: 'Mermaid fountain (05): 5 magnetic sensors, LED', room: 'garden', at: [358, 849], h: 40, kind: 'upc', lan: true, outlet: '40' }),
  I({ id: 'U_LED05', label: 'LED controller 05', role: 'Behind the stained-glass window + 2 m RGB strip', room: 'garden', at: [380, 849], h: 120, kind: 'end', outlet: '40' }),
  I({ id: 'U_LAMPG', label: 'Lamp 230 V', role: 'Garden ceiling lamp', room: 'garden', at: [360, 560], h: 245, kind: 'end' }),
  // astrology
  I({ id: 'U_UPC5', label: 'UPC #5', role: 'Painting passage (10), in the pouf: RFID, speaker', room: 'astrology_room', at: [10, 392], h: 40, kind: 'upc', lan: true, outlet: '40' }),
  I({ id: 'U_MAG10B', label: 'Electromagnets 10', role: 'Painting passage, Astrology side', room: 'astrology_room', at: [82, 415], h: 200, kind: 'end' }),
  I({ id: 'U_UPC7', label: 'UPC #7', role: 'Midnight clock (11): direction sensor, relay 230 V lamp + UV lamp, ceiling LEDs', room: 'astrology_room', at: [223, 100], h: 40, kind: 'upc', lan: true, outlet: '40' }),
  I({ id: 'U_UPC6', label: 'UPC #6', role: 'Planetary table (16): 9 RFID (16-port UUPC)', room: 'astrology_room', at: [88, 113], h: 40, kind: 'upc', lan: true }),
  I({ id: 'U_DRAW', label: 'Drawer 16', role: 'Drawer output set in the clock', room: 'astrology_room', at: [223, 130], h: 60, kind: 'end' }),
  I({ id: 'U_UV', label: 'UV lamp 11b', role: '230 V UV lamp (via relay)', room: 'astrology_room', at: [10, 150], h: 200, kind: 'end', outlet: '220' }),
  I({ id: 'U_LAMPA', label: 'Lamp 230 V', role: 'Ceiling lamp (via relay)', room: 'astrology_room', at: [88, 113], h: 245, kind: 'end' }),
  I({ id: 'U_CB23', label: 'CB 23', role: 'Combination box [582]', room: 'astrology_room', at: [10, 255], h: 150, kind: 'cb', lan: true, outlet: '150' }),
  I({ id: 'U_CB30', label: 'CB 30', role: 'Combination box [19618]', room: 'astrology_room', at: [10, 342], h: 150, kind: 'cb', lan: true, outlet: '150' }),
  I({ id: 'U_CB24', label: 'CB 24', role: 'Combination box [79365]', room: 'astrology_room', at: [135, 255], h: 150, kind: 'cb', lan: true, outlet: '150' }),
  I({ id: 'U_CB31', label: 'CB 31', role: 'Combination box [SHRTK]', room: 'astrology_room', at: [135, 342], h: 150, kind: 'cb', lan: true, outlet: '150' }),
  // dueling
  I({ id: 'U_UPC8', label: 'UPC #8', role: "Knight's door (17), in the pouf: RFID, speaker", room: 'dueling_room', at: [359, 415], h: 40, kind: 'upc', lan: true, outlet: '40' }),
  I({ id: 'U_UPC1', label: 'UPC #1', role: 'Monster chest (21): 2 RFID, relay, LED controller, knocker', room: 'dueling_room', at: [270, 415], h: 40, kind: 'upc', lan: true, outlet: '40' }),
  I({ id: 'U_UPC9', label: 'UPC #9', role: 'Spellcasting (21): 6 cast-a-spell inputs, drawer', room: 'dueling_room', at: [315, 415], h: 40, kind: 'upc', lan: true, outlet: '40' }),
  ...[[14, 145, 250], [15, 145, 315], [16, 145, 380], [17, 434, 250], [18, 434, 315], [19, 434, 380]].map(([n, x, y]) =>
    I({ id: 'U_UPC' + n, label: 'UPC #' + n, role: 'Cast-a-spell board (no LAN, to UPC #9)', room: 'dueling_room', at: [x, y], h: 100, kind: 'upc' })),
  I({ id: 'U_CB25', label: 'CB 25', role: 'Combination box [36107]', room: 'dueling_room', at: [285, 10], h: 150, kind: 'cb', lan: true, outlet: '150' }),
  I({ id: 'U_CB27', label: 'CB 27', role: 'Combination box [^>>v<^]', room: 'dueling_room', at: [331, 10], h: 150, kind: 'cb', lan: true, outlet: '150' }),
  I({ id: 'U_CB28', label: 'CB 28', role: 'Combination box [EOIYA]', room: 'dueling_room', at: [377, 10], h: 150, kind: 'cb', lan: true, outlet: '150' }),
  I({ id: 'U_LAMPD', label: 'Lamp 230 V', role: 'Dueling Room chandelier', room: 'dueling_room', at: [330, 220], h: 245, kind: 'end' }),
];
export const LINKS = [
  { a: 'U_UPC3', b: 'U_C1', type: 'sig' }, { a: 'U_UPC3', b: 'U_C2', type: 'sig' }, { a: 'U_UPC3', b: 'U_C3', type: 'sig' }, { a: 'U_UPC3', b: 'U_C4', type: 'sig' },
  { a: 'U_UPC20', b: 'U_LEDP', type: 'sig' },
  { a: 'U_UPC5', b: 'U_MAG10B', type: 'sig' }, { a: 'U_UPC5', b: 'U_MAG10', type: 'sig' },
  { a: 'U_UPC8', b: 'U_MAG17', type: 'sig' },
  { a: 'U_CB26', b: 'U_LOCK04', type: 'sig' },
  { a: 'U_UPC13', b: 'U_LED05', type: 'sig' },
  { a: 'U_UPC7', b: 'U_UV', type: 'pwr', v: '230 V relay' }, { a: 'U_UPC7', b: 'U_LAMPA', type: 'pwr', v: '230 V relay' },
  { a: 'U_UPC7', b: 'U_UPC6', type: 'lan', floor: true, via: [[200, 113], [88, 113]], note: '12 V + ethernet + internet in a floor channel (as on the plan)' },
  { a: 'U_UPC6', b: 'U_DRAW', type: 'sig', floor: true, via: [[88, 113], [200, 130]] },
  ...[14, 15, 16, 17, 18, 19].map((n) => ({ a: 'U_UPC9', b: 'U_UPC' + n, type: 'sig' })),
  { a: 'U_UPC1', b: 'U_UPC9', type: 'sig', inside: 'monster chest' },
  { a: 'U_LAMPM', b: null, type: 'pwr', v: '230 V' }, { a: 'U_LAMPG', b: null, type: 'pwr', v: '230 V' }, { a: 'U_LAMPD', b: null, type: 'pwr', v: '230 V' },
];

// shift local coordinates into the scene
const sx = ([x, y]) => [x + OX, y];
export const shifted = {
  rooms: PLAN.rooms.map((r) => ({ ...r, polygon: r.polygon.map(sx) })),
  walls: PLAN.walls.map((w) => ({ ...w, a: sx(w.a), b: sx(w.b) })),
  doors: PLAN.doors.map((d) => ({ ...d, center: sx(d.center) })),
  props: PROPS.map((p) => ({ ...p, pos: p.pos[0] === 0 && p.pos[1] === 0 ? p.pos : sx(p.pos) })),
  switch: { ...SWITCH, at: sx(SWITCH.at) },
  items: ITEMS.map((i) => ({ ...i, at: sx(i.at) })),
  links: LINKS.map((l) => (l.via ? { ...l, via: l.via.map(sx) } : l)),
};
