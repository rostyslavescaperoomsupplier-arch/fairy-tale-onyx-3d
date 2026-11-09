# Fairy Tale Library - Onyx layout (3D)

3D model of the Fairy Tale Library escape game in the Onyx room layout (2 x 2 rooms over a full-width library,
483 x 861 cm). Same engine as the standard layout at https://ersrooms.byst.re/fairy-tale-library/.

- `data/plan.js` - walls, rooms, doors (measured sizes)
- `data/props.js` - puzzle placement from "Fairy Tale Pokoje Onyx.ai"
- `data/cables.js` - engineer mode: controllers, sockets, cables (switch position is an assumption)
- **Engineer mode** toggle: every wall on its own with boxes, 230 V sockets and cable routes, dimensions from the
  left corner; switch port list; "Print all walls". Open directly with `?eng=1`.

Local: `python3 serve.py 8765` (no-cache server; ES modules don't load from file://).
