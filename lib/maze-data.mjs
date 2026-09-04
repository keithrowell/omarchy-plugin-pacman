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
