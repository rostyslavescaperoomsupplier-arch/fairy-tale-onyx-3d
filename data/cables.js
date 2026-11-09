import { shifted as U } from './uom/layout.js?v=202611091157';
// Engineer mode data: controllers, cable ends, outlets and the cables between them (Onyx layout).
//
// Where it comes from
//   - which UPC drives which puzzle and which inter-UPC cables exist: the Fairy Tale UPC map
//     (upclocationsfairytalelibrary, almanach numbering) and "Full games Onyx - rozmieszczenie ethernet.pdf"
//   - outlet heights: the same ethernet plan (red ~40 cm, green ~150 cm combination boxes, blue ~220 cm near ceiling)
//   - positions: the props of data/props.js (Fairy Tale Pokoje Onyx.ai)
// Assumptions (not on any drawing yet, change here):
//   - switch + Game Master PC stand outside the entrance wall, left of D1 (SWITCH below)
//   - every cable goes up the inside face of its wall to the top of the wall and runs ON TOP of the walls
//     (above the ceiling) to the switch / the other end; nothing runs across the floor except the floor links
//   - UPC #13 is empty in the almanach; puzzle 27 is new in Onyx and gets its own controller "UPC 27"
//
// Item fields: id, label, room, at [x, y] plan cm, h = box height above floor (cm), kind:
//   upc | cb (combination box) | net (mini switch) | end (sensor / actuator / speaker / lamp) | switch
//   lan: true = home run to the switch; outlet: '40' | '150' | '220' (230 V socket next to the box)
// Link fields: a, b (item ids), type: 'lan' | 'sig' (signal/control) | 'pwr' (12 V) | 'spk' (speaker), floor: true = floor channel
export const TRUNK_H = 252; // cable route on top of the 250 cm walls
export const SWITCH_FTL = { id: 'SW', label: 'Switch 24p + GM PC', kind: 'switch', at: [140, 872], h: 100, outside: true, note: 'Outside the entrance wall, left of D1 (assumed)' };

const FTL_ITEMS = [
  // ---------- Library ----------
  { id: 'UPC12', label: 'UPC #12', role: "Hint stand, 00 Storyteller's Book", room: 'library', at: [67, 826], h: 40, kind: 'upc', lan: true, outlet: '40' },
  { id: 'MINI', label: 'Mini switch', role: 'In cabinet 01, joins UPC #14 + #19', room: 'library', at: [440, 828], h: 40, kind: 'net', lan: true, outlet: '40' },
  { id: 'UPC14', label: 'UPC #14', role: "Cabinet 01, Fairy Godmother's Cabinet / ending", room: 'library', at: [412, 828], h: 55, kind: 'upc' },
  { id: 'UPC19', label: 'UPC #19', role: 'Book shelf, 04 Final Chapter', room: 'library', at: [426, 828], h: 75, kind: 'upc' },
  { id: 'LEDP', label: 'LED progress', role: '04: lights the fake door parts', room: 'library', at: [262, 677], h: 150, kind: 'end' },
  { id: 'UPC15', label: 'UPC #15', role: 'Over the fake door, 03 Once Upon A Time', room: 'library', at: [241.5, 677], h: 225, kind: 'upc', lan: true, outlet: '220' },
  { id: 'STARS3', label: '5 stars', role: '03 magnetic sensors in the fake door', room: 'library', at: [222, 677], h: 120, kind: 'end' },
  { id: 'SPK03', label: 'Music box 29', role: '03d speakers above the fake door', room: 'library', at: [215, 677], h: 212, kind: 'end' },
  { id: 'LOCK03c', label: 'Maglock 03c', role: 'Bookshelf door to Frozen Kingdom', room: 'library', at: [100, 677], h: 195, kind: 'end' },
  { id: 'LOCK03b', label: 'Maglock 03b', role: 'Bookshelf door to Sleepy Forest', room: 'library', at: [383, 677], h: 195, kind: 'end' },
  { id: 'LAMPL', label: 'Lamp 230 V', role: 'Library chandelier', room: 'library', at: [241.5, 764], h: 245, kind: 'end' },

  // ---------- Frozen Kingdom ----------
  { id: 'UPC1', label: 'UPC #1', role: 'Throne, 12 Winter Throne', room: 'frozen_kingdom', at: [236, 545], h: 40, kind: 'upc', lan: true, outlet: '40' },
  { id: 'UPC2', label: 'UPC #2', role: 'In the throne, 10 Touch of Frost (no LAN, via UPC #1)', room: 'frozen_kingdom', at: [236, 590], h: 40, kind: 'upc' },
  { id: 'ST1', label: 'Star 10a', role: 'Touch sensor + LED', room: 'frozen_kingdom', at: [10, 450], h: 110, kind: 'end' },
  { id: 'ST2', label: 'Star 10a', role: 'Touch sensor + LED', room: 'frozen_kingdom', at: [10, 550], h: 110, kind: 'end' },
  { id: 'ST3', label: 'Star 10a', role: 'Touch sensor + LED', room: 'frozen_kingdom', at: [238, 494], h: 110, kind: 'end' },
  { id: 'ST4', label: 'Star 10a', role: 'Touch sensor + LED', room: 'frozen_kingdom', at: [238, 638], h: 110, kind: 'end' },
  { id: 'UPC5', label: 'UPC #5', role: 'Ice cabinet 08c: crowns, lower drawers', room: 'frozen_kingdom', at: [238, 398], h: 40, kind: 'upc', lan: true, outlet: '40' },
  { id: 'LEV1', label: 'Lever 08d', role: 'Lever switch', room: 'frozen_kingdom', at: [238, 380], h: 120, kind: 'end' },
  { id: 'LEV2', label: 'Lever 08d', role: 'Lever switch', room: 'frozen_kingdom', at: [238, 455], h: 120, kind: 'end' },
  { id: 'ACT08', label: 'Actuator 08', role: 'Lowers the mirror / portrait (above the window)', room: 'frozen_kingdom', at: [238, 426], h: 205, kind: 'end' },
  { id: 'DOOR13', label: 'Scarab 13 + maglock', role: 'Door to Djinn\'s Vault (D5)', room: 'frozen_kingdom', at: [93.5, 338], h: 150, kind: 'end' },
  { id: 'CB23', label: 'CB 23', role: 'Combination box [7394]', room: 'frozen_kingdom', at: [145, 338], h: 150, kind: 'cb', lan: true, outlet: '150' },
  { id: 'CB24', label: 'CB 24', role: 'Combination box [SUTIA]', room: 'frozen_kingdom', at: [145, 667], h: 150, kind: 'cb', lan: true, outlet: '150' },
  { id: 'UPC16', label: 'UPC #16', role: 'Ambient 1, Frozen Kingdom (music box 28)', room: 'frozen_kingdom', at: [100, 667], h: 225, kind: 'upc', lan: true, outlet: '220' },
  { id: 'MB28', label: 'Music box 28', role: 'Speakers + distance sensor above D2', room: 'frozen_kingdom', at: [67.5, 667], h: 212, kind: 'end' },
  { id: 'LAMPF', label: 'Lamp 12 V', role: 'Ceiling lamp', room: 'frozen_kingdom', at: [124, 470], h: 245, kind: 'end' },

  // ---------- Sleepy Forest ----------
  { id: 'UPC6', label: 'UPC #6', role: 'Stone cabinet 08a: levers + chains', room: 'sleepy_forest', at: [245, 398], h: 40, kind: 'upc', lan: true, outlet: '40' },
  { id: 'CH1', label: 'Chains 08b', role: 'Box with chains (lock)', room: 'sleepy_forest', at: [245, 369], h: 185, kind: 'end' },
  { id: 'CH2', label: 'Chains 08b', role: 'Box with chains (lock)', room: 'sleepy_forest', at: [245, 469], h: 185, kind: 'end' },
  { id: 'UPC10', label: 'UPC #10', role: 'Column 07 Flickering Fireflies', room: 'sleepy_forest', at: [473, 368], h: 40, kind: 'upc', lan: true, outlet: '40' },
  { id: 'TRAP', label: 'Trapdoor 07b', role: 'Lock of the trapdoor box', room: 'sleepy_forest', at: [473, 418], h: 40, kind: 'end' },
  { id: 'FF1', label: 'Firefly 07c', role: 'Hanging LED', room: 'sleepy_forest', at: [317, 369], h: 215, kind: 'end' },
  { id: 'FF2', label: 'Firefly 07c', role: 'Hanging LED', room: 'sleepy_forest', at: [463, 447], h: 215, kind: 'end' },
  { id: 'FF3', label: 'Firefly 07c', role: 'Hanging LED', room: 'sleepy_forest', at: [435, 491], h: 215, kind: 'end' },
  { id: 'FF4', label: 'Firefly 07c', role: 'Hanging LED', room: 'sleepy_forest', at: [298, 530], h: 215, kind: 'end' },
  { id: 'FF5', label: 'Firefly 07c', role: 'Hanging LED', room: 'sleepy_forest', at: [441, 543], h: 215, kind: 'end' },
  { id: 'UPC18', label: 'UPC #18', role: 'Over the mine door D4, 09 Light the Fuse', room: 'sleepy_forest', at: [420, 338], h: 225, kind: 'upc', lan: true, outlet: '220' },
  { id: 'TNT', label: 'TNT plug 09a', role: 'Wire socket on the mine door', room: 'sleepy_forest', at: [360, 338], h: 120, kind: 'end' },
  { id: 'UPC11', label: 'UPC #11', role: 'Gate portal, 06 Forest Gate', room: 'sleepy_forest', at: [265, 525], h: 40, kind: 'upc', lan: true, outlet: '40' },
  { id: 'GATE', label: 'Gate lock 06a', role: 'Iron gate lock + token sensors', room: 'sleepy_forest', at: [285, 507.5], h: 100, kind: 'end' },
  { id: 'LED05', label: 'LED board 05b', role: '5 LED controllers on the ceiling (no UPC, 12 V)', room: 'sleepy_forest', at: [335, 590], h: 245, kind: 'end' },
  { id: 'PSU05', label: '12 V PSU 05', role: 'Feeds the LED board', room: 'sleepy_forest', at: [245, 600], h: 225, kind: 'end', outlet: '220' },
  { id: 'CB21', label: 'CB 21', role: 'Combination box [78561]', room: 'sleepy_forest', at: [324, 667], h: 150, kind: 'cb', lan: true, outlet: '150' },
  { id: 'UPC17', label: 'UPC #17', role: 'Ambient 2, Sleepy Forest (music box 29)', room: 'sleepy_forest', at: [383, 667], h: 225, kind: 'upc', lan: true, outlet: '220' },
  { id: 'MB29', label: 'Music box 29', role: 'Speakers + distance sensor above D3', room: 'sleepy_forest', at: [415.5, 667], h: 212, kind: 'end' },
  { id: 'LAMPS', label: 'Lamp 12 V', role: 'Ceiling lamp (castle part)', room: 'sleepy_forest', at: [359, 410], h: 245, kind: 'end' },

  // ---------- Djinn's Vault ----------
  { id: 'UPC3', label: 'UPC #3', role: 'In table 16: 13 Open Sesame + speakers', room: 'djinns_vault', at: [110, 10], h: 40, kind: 'upc', lan: true, outlet: '40' },
  { id: 'UPC4', label: 'UPC #4', role: 'In table 16: 17 Jewel Wheel', room: 'djinns_vault', at: [140, 10], h: 40, kind: 'upc', lan: true, outlet: '40' },
  { id: 'WHEEL', label: 'Jewel wheel 17a', role: 'Encoder + spotlights', room: 'djinns_vault', at: [124, 10], h: 150, kind: 'end' },
  { id: 'SH1', label: 'Shelf 17b', role: 'Dome sensor', room: 'djinns_vault', at: [10, 104], h: 130, kind: 'end' },
  { id: 'SH2', label: 'Shelf 17b', role: 'Dome sensor', room: 'djinns_vault', at: [10, 171], h: 130, kind: 'end' },
  { id: 'SH3', label: 'Shelf 17b', role: 'Dome sensor', room: 'djinns_vault', at: [10, 238], h: 130, kind: 'end' },
  { id: 'SH4', label: 'Shelf 17b', role: 'Dome sensor', room: 'djinns_vault', at: [238, 104], h: 130, kind: 'end' },
  { id: 'SH5', label: 'Shelf 17b', role: 'Dome sensor', room: 'djinns_vault', at: [238, 171], h: 130, kind: 'end' },
  { id: 'SH6', label: 'Shelf 17b', role: 'Dome sensor', room: 'djinns_vault', at: [238, 238], h: 130, kind: 'end' },
  { id: 'PED', label: 'Pedestal 17c', role: 'Rising pedestal (12 V + ethernet in a floor channel)', room: 'djinns_vault', at: [124, 171], h: 5, kind: 'end' },
  { id: 'DET', label: 'Detonator 09b', role: 'TNT detonator', room: 'djinns_vault', at: [216, 328], h: 40, kind: 'end' },
  { id: 'CB22', label: 'CB 22', role: 'Combination box [736] with the spyglass', room: 'djinns_vault', at: [167, 328], h: 150, kind: 'cb', lan: true, outlet: '150' },
  { id: 'CB25', label: 'CB 25', role: 'Combination box [64236]', room: 'djinns_vault', at: [39, 10], h: 150, kind: 'cb', lan: true, outlet: '150' },
  { id: 'CB26', label: 'CB 26', role: 'Combination box [9753]', room: 'djinns_vault', at: [208, 10], h: 150, kind: 'cb', lan: true, outlet: '150' },
  { id: 'LAMPD', label: 'Lamp 12 V', role: 'Ceiling lamp', room: 'djinns_vault', at: [124, 150], h: 245, kind: 'end' },

  // ---------- Mermaid Cave ----------
  { id: 'UPC7', label: 'UPC #7', role: 'Blower shelf 18b (corals) + drop-a-prop 19c', room: 'mermaid_cave', at: [245, 160], h: 40, kind: 'upc', lan: true, outlet: '40' },
  { id: 'DROP', label: 'Drop-a-prop 19c', role: 'Releases the balls', room: 'mermaid_cave', at: [245, 185], h: 100, kind: 'end' },
  { id: 'UPC9', label: 'UPC #9', role: '6 reef buttons, 18 Whack-a-bubble', room: 'mermaid_cave', at: [473, 178], h: 40, kind: 'upc', lan: true, outlet: '40' },
  { id: 'UPC8', label: 'UPC #8', role: 'Invisible harp 20a', room: 'mermaid_cave', at: [338, 10], h: 40, kind: 'upc', lan: true, outlet: '40' },
  { id: 'OAB', label: 'Open-a-box 20b', role: 'Own LAN port (as in the old plan)', room: 'mermaid_cave', at: [395, 10], h: 40, kind: 'upc', lan: true, outlet: '40' },
  { id: 'UPC27', label: 'UPC 27 (new)', role: 'Box with marine animals, puzzle 27', room: 'mermaid_cave', at: [420, 10], h: 60, kind: 'upc', lan: true },
  { id: 'UPC20', label: 'UPC #20', role: 'Under the seashell 19a (Morse)', room: 'mermaid_cave', at: [245, 90], h: 40, kind: 'upc', lan: true, outlet: '40' },
  { id: 'BTN19', label: 'LED button 19b', role: 'Morse button', room: 'mermaid_cave', at: [245, 253], h: 120, kind: 'end' },
  { id: 'SPK09', label: 'Speakers 09c', role: 'Box with speakers by the mine door', room: 'mermaid_cave', at: [389, 328], h: 212, kind: 'end' },
  { id: 'LAMPM', label: 'Lamp 12 V', role: 'Ceiling lamp', room: 'mermaid_cave', at: [359, 150], h: 245, kind: 'end' },
];

// Cables other than the home runs (those are generated for every item with lan: true)
const FTL_LINKS = [
  // library
  { a: 'UPC14', b: 'MINI', type: 'lan', inside: 'cabinet 01' },
  { a: 'UPC19', b: 'MINI', type: 'lan', inside: 'cabinet 01' },
  { a: 'UPC19', b: 'LEDP', type: 'sig' },
  { a: 'UPC15', b: 'STARS3', type: 'sig' },
  { a: 'UPC15', b: 'SPK03', type: 'spk' },
  { a: 'UPC15', b: 'LOCK03c', type: 'sig' },
  { a: 'UPC15', b: 'LOCK03b', type: 'sig' },
  // frozen kingdom
  { a: 'UPC1', b: 'UPC2', type: 'sig', inside: 'throne' },
  { a: 'UPC2', b: 'ST1', type: 'sig' }, { a: 'UPC2', b: 'ST2', type: 'sig' }, { a: 'UPC2', b: 'ST3', type: 'sig' }, { a: 'UPC2', b: 'ST4', type: 'sig' },
  { a: 'UPC5', b: 'ACT08', type: 'sig' },
  { a: 'UPC6', b: 'LEV1', type: 'sig' }, { a: 'UPC6', b: 'LEV2', type: 'sig' },
  { a: 'UPC3', b: 'DOOR13', type: 'sig' },
  { a: 'UPC16', b: 'MB28', type: 'spk' },
  // sleepy forest
  { a: 'UPC6', b: 'CH1', type: 'sig' }, { a: 'UPC6', b: 'CH2', type: 'sig' },
  { a: 'UPC10', b: 'TRAP', type: 'sig' },
  { a: 'UPC10', b: 'FF1', type: 'sig' }, { a: 'UPC10', b: 'FF2', type: 'sig' }, { a: 'UPC10', b: 'FF3', type: 'sig' }, { a: 'UPC10', b: 'FF4', type: 'sig' }, { a: 'UPC10', b: 'FF5', type: 'sig' },
  { a: 'UPC18', b: 'TNT', type: 'sig' }, { a: 'UPC18', b: 'DET', type: 'sig' }, { a: 'UPC18', b: 'SPK09', type: 'spk' },
  { a: 'UPC11', b: 'GATE', type: 'sig' },
  { a: 'PSU05', b: 'LED05', type: 'pwr' },
  { a: 'UPC17', b: 'MB29', type: 'spk' },
  // djinn's vault
  { a: 'UPC4', b: 'WHEEL', type: 'sig' },
  { a: 'UPC4', b: 'SH1', type: 'sig' }, { a: 'UPC4', b: 'SH2', type: 'sig' }, { a: 'UPC4', b: 'SH3', type: 'sig' },
  { a: 'UPC4', b: 'SH4', type: 'sig' }, { a: 'UPC4', b: 'SH5', type: 'sig' }, { a: 'UPC4', b: 'SH6', type: 'sig' },
  { a: 'UPC4', b: 'PED', type: 'sig', floor: true, via: [[124, 44], [124, 171]] },
  // mermaid cave
  { a: 'UPC9', b: 'UPC7', type: 'sig' },
  { a: 'UPC7', b: 'DROP', type: 'sig' },
  { a: 'UPC20', b: 'BTN19', type: 'sig' },
  // 12 V lamps: feed from the top of the nearest wall
  { a: 'LAMPF', b: null, type: 'pwr' }, { a: 'LAMPS', b: null, type: 'pwr' }, { a: 'LAMPD', b: null, type: 'pwr' }, { a: 'LAMPM', b: null, type: 'pwr' }, { a: 'LAMPL', b: null, type: 'pwr', v: '230 V' },
];

export const TYPES = {
  lan: { name: 'Ethernet (Cat5e/6)', color: '#3ddc5a' },
  sig: { name: 'Control / sensor cable', color: '#ffb02e' },
  spk: { name: 'Speaker cable', color: '#c08bff' },
  pwr: { name: 'Power 12 V / 230 V', color: '#ff5a4f' },
};
export const OUTLETS = {
  '40': { name: '230 V socket ~40 cm', color: '#e53935' },
  '150': { name: '230 V socket ~150 cm (combination box)', color: '#2e9d3a' },
  '220': { name: '230 V socket ~220 cm (near ceiling)', color: '#1e9be0' },
};

// both games: Fairy Tale items go to SW, University of Magic items to SWU
export const SWITCHES = [SWITCH_FTL, U.switch];
export const ITEMS = [...FTL_ITEMS, ...U.items];
export const LINKS = [...FTL_LINKS, ...U.links];
