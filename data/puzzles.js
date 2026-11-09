import * as UP from './uom/puzzles.js?v=202611091157';
// Puzzle descriptions (text of the ERS per-puzzle PDFs) and game flow.
const FTL_PUZZLES = {
  '00': { name: "Storyteller's Book", room: 'library',
    desc: 'Hint system. Lectern with a book that has a display inside showing the time. A magnetic sensor hidden under the start symbol (triggered by the Fairy Godmother\'s wand) asks for a hint. Hidden speakers play the intro, outro, ambience and hints.' },
  '01': { name: "Fairy Godmother's Cabinet", room: 'library',
    desc: 'First and last puzzle of the game. Use the key from the round maze to get the Fairy Godmother\'s wand out of the cabinet.' },
  '02': { name: 'Key of the Round Maze', room: 'library',
    desc: 'Round maze, a simple warm-up puzzle. The key opens the compartment with the Fairy Godmother\'s wand in the cabinet.' },
  '03': { name: 'Once Upon A Time', room: 'library',
    desc: 'Fake door with book covers. Tap the stars (magnetic sensors) with the wand to play sounds; the sequence "Once upon > a time > in a land > far > far > away" opens the 2 bookshelf doors. Audio plays from the music box above the fake door. Connected to 04: each correctly placed happy-ending book lights up its part of the door.' },
  '04': { name: 'Final Chapter', room: 'library',
    desc: 'Throughout the game players find happy endings to place inside the books. After placing a book in the correct spot the matching part of the fake door lights up. When all 4 books are in place the game is won and the outro plays.' },
  '05': { name: 'Tangled Vines', room: 'sleepy_forest',
    desc: 'Branch with 5 vines, a glowing LED board on the ceiling (5 LED controllers) and 15 stones with digits / + / -. Thread the vines through the stones as shown by the glowing paths on the ceiling, solve 5 simple equations and get the 5-digit code [78561] to combination box 21, which holds 2 animal-track tokens.' },
  '06': { name: 'Forest Gate', room: 'sleepy_forest',
    desc: 'Stone arch (built from 5 elements), iron gate and hollow trunk. 2 more animal-track tokens are hidden in the trunk. Compare the 4 tokens to the engravings on the arch and put them in their spots to open the iron gate.' },
  '07': { name: 'Flickering Fireflies', room: 'sleepy_forest',
    desc: 'Column with 4 coloured LED buttons, a trapdoor and 5 blinking fireflies. Watch the order and colours the fireflies glow in and repeat the sequences on the buttons. The Evil Queen\'s crown is hidden in the trapdoor.' },
  '08': { name: 'Secret of Two Queens', room: 'sleepy_forest',
    desc: 'Stone cabinet + frame, ice cabinet + frame, mirror/painting with actuator, 2 levers, 2 boxes with chains. Placing the queens\' crowns on the cabinets opens 2 drawers and lowers the mirror/painting so both rooms can see each other. Hints in the drawers give the order of pulling levers and chains; the correct sequence opens 2 more drawers with the scarab pieces.' },
  '09': { name: 'Light the Fuse', room: 'sleepy_forest',
    desc: 'Collapsed mine entrance door with TNT and wire, a TNT detonator and a box with speakers. Drag the TNT cable from Snow White\'s room to Aladdin\'s room and attach it to the detonator next to the adventurer\'s body to "detonate" the entrance to the Little Mermaid.' },
  '10': { name: 'Touch of Frost', room: 'frozen_kingdom',
    desc: '4 stars with snowflakes under milky plexiglass (4 touch sensors with LED progress extensions), 4 stars with engraved hands, a board with 1 fixed gear on the door to the Djinn\'s Vault and 1 loose gear. Touch the hand stars until the snowflake stars light up, use the gears to give each snowflake a number; Roman numerals on the hands give the order. The 4-digit code [7394] opens combination box 23 in the Frozen Kingdom.' },
  '11': { name: 'Map of the Frozen Kingdom', room: 'frozen_kingdom',
    desc: 'Map of the Frozen Kingdom, 5 banners with symbols on 5 planks, 5 compasses with letters and a hint board. Read on the map in which direction from the palace each location lies; the compass under each banner turns directions into letters, and the symbol set gives the reading order. The 5-letter code [SUTIA] opens combination box 24 in the Frozen Kingdom.' },
  '12': { name: 'Winter Throne', room: 'frozen_kingdom',
    desc: 'Throne with pillow, engraved tear and heart, 2 sashes, RFID heart and tear tokens, pressure mat in the seat. Place the tokens on the symbols under the ribbons and sit on the throne: the drawer under it opens and reveals the crown.' },
  '13': { name: 'Open Sesame', room: 'frozen_kingdom',
    desc: 'Frozen door with a scarab symbol and 2 scarab pieces. Placing both pieces opens the door to the Djinn\'s Vault and plays its intro and ambience (speakers in the table of puzzle 16).' },
  '14': { name: 'Spyglass', room: 'djinns_vault',
    desc: 'Find the spyglass on the adventurer\'s corpse, look through it at the clue board on the wall and read the 3-digit code [736] to combination box 22, which is full of small crystals.' },
  '15': { name: 'Sacred Animals of the East', room: 'djinns_vault',
    desc: '2 ropes with weights on both ends, running over 4 pulleys above the door, with tokens on the ropes; 12 symbols (8 digits, 4 animals) and a board with the animal sequence above the door. Line the ornament up with an animal and read the digit under the ornament at the other end of the rope (Monkey 9, Elephant 7, Parrot 5, Tiger 3). The 4-digit code [9753] opens combination box 26.' },
  '16': { name: 'Crystals of the Lost Adventurer', room: 'djinns_vault',
    desc: 'Table with bowl and 2 compartments (Crystals output set; the table also hides the speakers and the controller of puzzle 13), LED crystals. Drop the crystals in the bowl and they glow; count the red, green, blue and yellow ones. The necklace on the adventurer\'s corpse gives the order. The code [64236] opens combination box 25.' },
  '17': { name: 'Jewel Wheel', room: 'djinns_vault',
    desc: 'Jewel wheel with spotlights, 6 shelves, 6 domes with jewels, a board indicating the correct jewel and a rising pedestal. Find the 6 domes scattered throughout the rooms, turn the wheel so a jewel points at the arrow and put the matching dome on the highlighted shelf. After all 6 the pedestal rises.' },
  '18': { name: 'Whack-a-bubble', room: 'mermaid_cave',
    desc: '6 blue LED buttons with reef decoration on the wall, a shelf with corals and 5 blowers, styrofoam balls, 15 marine animal symbols. Press any button to start whack-a-mole and hit the buttons as they light up; finishing the challenge turns on the blowers on the coral shelf.' },
  '19': { name: 'Seashell Code', room: 'mermaid_cave',
    desc: 'Shelf with a seashell speaker, shelf with an LED button (Morse code sensor), drop-a-prop. Listen to the short Morse message from the seashell and repeat it on the button to drop the styrofoam balls.' },
  '20': { name: 'Song of the Sea', room: 'mermaid_cave',
    desc: 'Box with invisible harp (5 optical distance sensors), open-a-box with speakers, frame with musical staff, 5 plexi note pieces, steering wheel. The wheel gives each marine animal a number, floating balls on the corals give the order of a 5-digit code to the box. The assembled notes give the melody for the invisible harp, which opens the open-a-box.' },
  '21': { name: 'Combination box', room: 'sleepy_forest', desc: 'Code box of Tangled Vines (05). Enter the code 78561 (magnetic sensors, electro-lock) to get the 2 animal-track tokens for the Forest Gate.' },
  '22': { name: 'Combination box', room: 'djinns_vault', desc: 'Code box of Spyglass (14). Enter the code 736 (magnetic sensors, electro-lock); inside are the small crystals for Crystals of the Lost Adventurer.' },
  '23': { name: 'Combination box', room: 'frozen_kingdom', desc: 'Code box of Touch of Frost (10). Opens with the code 7394 (magnetic sensors, electro-lock).' },
  '24': { name: 'Combination box', room: 'frozen_kingdom', desc: 'Code box of Map of the Frozen Kingdom (11). Opens with the code SUTIA (magnetic sensors, electro-lock).' },
  '25': { name: 'Combination box', room: 'djinns_vault', desc: 'Code box of Crystals of the Lost Adventurer (16). Opens with the code 64236 (magnetic sensors, electro-lock).' },
  '26': { name: 'Combination box', room: 'djinns_vault', desc: 'Code box of Sacred Animals of the East (15). Opens with the code 9753 (magnetic sensors, electro-lock).' },
  '27': { name: 'Marine animals box', room: 'mermaid_cave', desc: 'Extra electronic puzzle added in the Onyx version: a box with marine animals standing on the open-a-box (20b). Mechanics not documented yet.' },
  'MB': { name: 'Music boxes', room: 'sleepy_forest',
    desc: 'Boxes hanging above the entry doors of Sleepy Forest and Frozen Kingdom; an optical distance sensor starts the intro and ambience music when you walk under them. Not part of the puzzle chain.' },
};

// Directed edges of the game order [from, to]. Only edges backed by the puzzle PDFs / gdoc cards
// (2026-10-28/29): a code opens its box, an item found in one puzzle is used in another, or a
// room has to be open first. What boxes 23-26 and the Jewel Wheel pedestal hold is not documented.
const FTL_FLOW = [
  ['00', '02'], ['02', '01'], ['01', '03'],
  ['03', '05'], ['05', '21'], ['21', '06'], ['06', '07'], ['07', '08'],
  ['03', '10'], ['03', '11'], ['10', '23'], ['11', '24'], ['03', '12'], ['12', '08'],
  ['08', '13'], ['13', '14'], ['13', '15'], ['13', '17'], ['14', '22'], ['22', '16'], ['15', '26'], ['16', '25'],
  ['13', '09'], ['09', '18'], ['09', '19'], ['18', '20'], ['19', '20'], ['20', '04'],
];

// University of Magic: same numbers, keys prefixed with U (label shows the plain number)
const pre = (k) => 'U' + k;
export const PUZZLES = { ...FTL_PUZZLES, ...Object.fromEntries(Object.entries(UP.PUZZLES).map(([k, v]) => [pre(k), { ...v, label: k }])) };
export const FLOW = [...FTL_FLOW, ...UP.FLOW.map(([a, b]) => [pre(a), pre(b)])];
