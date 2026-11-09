// Photo textures from the album (tools/photo_tex.py -> tex/). Local experiment: lib/materials.js only loads
// this on localhost or with ?photo=1, and deploy.sh does not ship tex/.
// key = texture key in lib/materials.js; T = cm across one tile; aspect = tile width / height.
export default {
  damask: { src: 'tex/damask.jpg', normal: 'tex/damask_n.png', T: 120, aspect: 3.03 },          // Library wallpaper
  flag: { src: 'tex/flag.jpg', normal: 'tex/flag_n.png', T: 150, aspect: 1.778 },              // stone ceilings
  bark: { src: 'tex/bark.jpg', normal: 'tex/bark_n.png', T: 75, aspect: 0.607 },               // Sleepy Forest walls + trunks
  stucco: { src: 'tex/stucco.jpg', normal: 'tex/stucco_n.png', T: 140, aspect: 2.667 },        // Djinn's Vault walls
  crackBlack: { src: 'tex/crackBlack.jpg', normal: 'tex/crackBlack_n.png', T: 33, aspect: 5.333 }, // crackle props
};

// Real photos on prop fronts (tools/photo_props.py -> tex/props/). Shop product photos where the puzzle is sold
// (00 lectern, 07 firefly column, 21-26 combination box), album shots otherwise. Key = prop id or builder kind.
export const props = {
  lectern_book: { front: 'tex/props/lectern_front.jpg', base: 'tex/props/lectern_base.jpg', book: 'tex/props/lectern_book.jpg' },
  firefly_column: { front: 'tex/props/firefly_column.jpg' },
  combo_box: { front: 'tex/props/combo_box.png' },
  order_plaque: { front: 'tex/props/order_plaque.png' },
  fake_door_books: { front: 'tex/props/fake_door.jpg' },
  mine_door_tnt: { front: 'tex/props/mine_door.jpg' },
  framed_map: { front: 'tex/props/frozen_map.jpg' },
  scarab_door: { front: 'tex/props/scarab_door.jpg' },
  symbol_board: { front: 'tex/props/animal_board.png' },
  jewel_wheel: { front: 'tex/props/jewel_wheel.png' },
  coral_console: { board: 'tex/props/coral_board.png' },
  seashell_shelf: { plaque: 'tex/props/morse_plaque.png' },
  '08f': { front: 'tex/props/ice_portrait.jpg' }, // Ice Queen portrait (mirror_painting, ice style)
};
