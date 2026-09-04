// Level 1: an original layout in the classic proportions (28 x 31 tiles of
// 8 px = 224 x 248). Not the Namco board. Legend (lib/maze.mjs):
//
//   #  wall          .  pellet        o  power pellet
//      empty (walkable, no pellet)     -  ghost-house door
//   T  tunnel mouth (wraps)            H  ghost-house interior
//   P  player spawn (empty tile)
//
// Design rules the tests enforce: rows 0 and 30 solid; walls mirror
// left/right; corridors one tile wide; wall blocks at least two tiles thick
// (the house is the only one-tile-thick wall); no dead ends; every pellet
// reachable from P without crossing the door. The layout was authored as the
// left 14 columns and mirrored; the full text is committed so it reads as data.
//
// Landmarks: house walls at columns 10-17, rows 12-16 with a two-wide door on
// row 12; one tunnel on row 14, joining the column-4 corridors; a pellet-free
// moat (rows 11 and 17, the house ring) around the house and the 4 x 5 blocks
// beside it; power pellets at rows 3 and 26; 256 pellets.

export const LEVEL_1 = `
############################
#............##............#
#.##.###.###.##.###.###.##.#
#o##.###.###.##.###.###.##o#
#..........................#
#.##.####.########.####.##.#
#.##.####.########.####.##.#
#.##.####..........####.##.#
#....####.########.####....#
####.####.########.####.####
####.####.########.####.####
####.                  .####
####.#### ###--### ####.####
####.#### #HHHHHH# ####.####
T    #### #HHHHHH# ####    T
####.#### #HHHHHH# ####.####
####.#### ######## ####.####
####.                  .####
####.####.########.####.####
####.####.########.####.####
#..........................#
#.###.######.##.######.###.#
#.###.######.##.######.###.#
#......##....P ....##......#
###.##.##.########.##.##.###
###.##.##.########.##.##.###
#o........................o#
#.####.##############.####.#
#.####.##############.####.#
#..........................#
############################
`;

// Ghost landmarks (Pac-Man Dossier). Tiles are { x, y } in the 28 x 31 grid.

/**
 * Tiles from which a ghost may not turn up in scatter or chase: the two on the
 * row above the house and the two beside the spawn, at the original's columns.
 */
export const NO_UP_TILES = Object.freeze([
  Object.freeze({ x: 12, y: 11 }), Object.freeze({ x: 15, y: 11 }),
  Object.freeze({ x: 12, y: 23 }), Object.freeze({ x: 15, y: 23 }),
]);

/** Scatter corners, off the board as in the original so the ghosts circle the corner blocks. */
export const SCATTER_TARGETS = Object.freeze({
  blinky: Object.freeze({ x: 25, y: -3 }),
  pinky: Object.freeze({ x: 2, y: -3 }),
  inky: Object.freeze({ x: 27, y: 31 }),
  clyde: Object.freeze({ x: 0, y: 31 }),
});
