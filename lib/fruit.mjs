// The classic fruit table and the pure rules around it: which fruit a level
// shows, the row of the last seven the bottom HUD draws, and where on the
// board the fruit appears.
//
// Pure ES module: no Qt, no Date, no Math.random.
//
// The fruit spot is derived from the maze, not a hard-coded Namco constant:
// the house door is two tiles wide (door[0] and door[1]), so "the tile
// directly below the door" is ambiguous between them. fruitTile() picks the
// left one (door[0]) as the single tile game.mjs checks Pac-Man's tile
// against; fruitSpot() draws the sprite centred on the house's own centre
// line, straddling both door tiles, which is where the original's fruit
// sits. Row 17 (the moat under the house) has no junction between the
// tunnel walls, so anyone crossing the drawn fruit necessarily crosses the
// eat tile too; a single-tile check is enough.

import { TILE_PX } from "./player.mjs";

/** The classic fruit table, in level order. Each row is frozen; so is the array. */
export const FRUITS = Object.freeze([
  Object.freeze({ kind: "cherry", score: 100, from: 1 }),
  Object.freeze({ kind: "strawberry", score: 300, from: 2 }),
  Object.freeze({ kind: "orange", score: 500, from: 3 }),
  Object.freeze({ kind: "apple", score: 700, from: 5 }),
  Object.freeze({ kind: "melon", score: 1000, from: 7 }),
  Object.freeze({ kind: "galaxian", score: 2000, from: 9 }),
  Object.freeze({ kind: "bell", score: 3000, from: 11 }),
  Object.freeze({ kind: "key", score: 5000, from: 13 }),
]);

/** The eight kinds, in the same order as FRUITS. */
export const FRUIT_KINDS = Object.freeze(FRUITS.map(f => f.kind));

/** How many of the most recent levels' fruit the bottom HUD shows. */
export const FRUIT_ROW_LENGTH = 7;

/** Pellets eaten this level at which the level's fruit spawns. */
export const FRUIT_SPAWN_COUNTS = Object.freeze([70, 170]);

/** How long a spawned fruit stays on the board: 9 s at 60 Hz. */
export const FRUIT_TICKS = 540;

/** How long its point value shows after it is eaten: 2 s at 60 Hz. */
export const FRUIT_SCORE_TICKS = 120;

/** A sane level number: junk, non-finite or below 1 all read as level 1. */
function sanitiseLevel(level) {
  const n = typeof level === "number" && Number.isFinite(level) ? Math.floor(level) : 1;
  return n >= 1 ? n : 1;
}

/** The fruit row (kind, score, from) for `level`: the last row whose `from` is at or before it. */
export function fruitForLevel(level) {
  const n = sanitiseLevel(level);
  let row = FRUITS[0];
  for (const f of FRUITS) {
    if (f.from > n) break;
    row = f;
  }
  return row;
}

/**
 * The kinds shown across the last min(level, FRUIT_ROW_LENGTH) levels,
 * oldest first, newest (the level's own fruit) last: what the bottom-right
 * HUD draws. A fresh array every call.
 */
export function fruitRow(level) {
  const n = sanitiseLevel(level);
  const len = Math.min(n, FRUIT_ROW_LENGTH);
  const row = [];
  for (let i = 0; i < len; i++) row.push(fruitForLevel(n - (len - 1 - i)).kind);
  return row;
}

/** The single tile game.mjs checks Pac-Man against: directly below the house door's left tile. */
export function fruitTile(maze) {
  return { x: maze.house.door[0].x, y: maze.house.y + maze.house.height };
}

/** The maze-pixel centre the sprite is drawn at: the house's own centre line. */
export function fruitSpot(maze) {
  return {
    x: (maze.house.x + maze.house.width / 2) * TILE_PX,
    y: fruitTile(maze).y * TILE_PX + TILE_PX / 2,
  };
}
