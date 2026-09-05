// Maze data model: parses the ASCII map in lib/maze-data.mjs into tiles and
// the landmarks the rules and renderer need.
//
// Pure ES module: no Qt, no I/O. QML imports it as a relative path from
// app/ (the shell root is the repo root); `node --test` covers the same code.

/** Tile kinds. */
export const TILE = Object.freeze({
  WALL: "wall",
  PELLET: "pellet",
  POWER: "power",
  EMPTY: "empty",
  DOOR: "door",
  TUNNEL: "tunnel",
  HOUSE: "house",
});

export const MAZE_WIDTH = 28;
export const MAZE_HEIGHT = 31;

/** Map legend (see plan.md): character -> tile kind. `P` is empty plus spawn. */
const LEGEND = Object.freeze({
  "#": TILE.WALL,
  ".": TILE.PELLET,
  "o": TILE.POWER,
  " ": TILE.EMPTY,
  "-": TILE.DOOR,
  "T": TILE.TUNNEL,
  "P": TILE.EMPTY,
  "H": TILE.HOUSE,
});

const WALKABLE = new Set([TILE.PELLET, TILE.POWER, TILE.EMPTY, TILE.TUNNEL]);

/** True for tiles the player may enter. Door and house interior are not (yet). */
export function isWalkable(kind) {
  return WALKABLE.has(kind);
}

/**
 * Parse the map text. Leading/trailing blank lines from a template string are
 * dropped. Throws on a wrong row count, a wrong row width, or a stray
 * character, naming the row and column.
 */
export function parseMaze(text) {
  const lines = String(text).split("\n");
  if (lines.length && lines[0] === "") lines.shift();
  if (lines.length && lines[lines.length - 1] === "") lines.pop();
  if (lines.length !== MAZE_HEIGHT) {
    throw new Error(`maze: expected ${MAZE_HEIGHT} rows, got ${lines.length}`);
  }

  const width = MAZE_WIDTH;
  const height = MAZE_HEIGHT;
  const tiles = new Array(width * height);
  const pellets = [];
  const powerPellets = [];
  const houseCells = [];
  const door = [];
  const tunnelRows = new Set();
  let spawn = null;

  for (let y = 0; y < height; y++) {
    const row = lines[y];
    if (row.length !== width) throw new Error(`maze: row ${y} has ${row.length} columns`);
    for (let x = 0; x < width; x++) {
      const ch = row[x];
      const kind = LEGEND[ch];
      if (kind === undefined) throw new Error(`maze: unknown tile '${ch}' at row ${y} col ${x}`);
      tiles[y * width + x] = kind;
      switch (ch) {
        case ".": pellets.push({ x, y }); break;
        case "o": powerPellets.push({ x, y }); break;
        case "H": houseCells.push({ x, y }); break;
        case "-": door.push({ x, y }); break;
        case "T": tunnelRows.add(y); break;
        case "P":
          if (spawn) throw new Error(`maze: second spawn at row ${y} col ${x}`);
          spawn = { x, y };
          break;
        default: break;
      }
    }
  }

  if (!spawn) throw new Error("maze: no spawn (P)");
  if (houseCells.length === 0) throw new Error("maze: no house interior (H)");
  if (door.length === 0) throw new Error("maze: no house door (-)");

  // The house box includes its walls: the interior's bounding box grown by one.
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const c of houseCells) {
    if (c.x < minX) minX = c.x;
    if (c.y < minY) minY = c.y;
    if (c.x > maxX) maxX = c.x;
    if (c.y > maxY) maxY = c.y;
  }
  const house = {
    x: minX - 1,
    y: minY - 1,
    width: maxX - minX + 3,
    height: maxY - minY + 3,
    door,
    cells: houseCells,
  };

  const tunnels = [...tunnelRows].sort((a, b) => a - b).map(y => ({
    y,
    left: { x: 0, y },
    right: { x: width - 1, y },
  }));

  return { width, height, tiles, pellets, powerPellets, house, spawn, tunnels };
}

/** Tile kind at (x, y); x wraps (tunnels), y outside the map is wall. */
export function tileAt(maze, x, y) {
  const ty = Math.floor(y);
  if (!(ty >= 0 && ty < maze.height)) return TILE.WALL;
  const tx = Math.floor(x);
  if (!Number.isFinite(tx)) return TILE.WALL;
  const wx = ((tx % maze.width) + maze.width) % maze.width;
  return maze.tiles[ty * maze.width + wx];
}

/** Clockwise from north: N, NE, E, SE, S, SW, W, NW. Bit i is set when that neighbour is wall. */
export const NEIGHBOURS = Object.freeze([
  [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1],
]);

/**
 * 8-bit mask of which neighbours of (x, y) are walls; bit 0 = north, then
 * clockwise. Off-map rows count as wall so the border draws as a closed
 * outline; x wraps so the tunnel mouths stay open. Everything that is not a
 * wall (door, house interior, pellets, empty, tunnel) counts as open.
 */
export function wallMask(maze, x, y) {
  let mask = 0;
  for (let i = 0; i < NEIGHBOURS.length; i++) {
    const [dx, dy] = NEIGHBOURS[i];
    if (tileAt(maze, x + dx, y + dy) === TILE.WALL) mask |= 1 << i;
  }
  return mask;
}
