import { test } from "node:test";
import assert from "node:assert/strict";
import { LEVEL_1, NO_UP_TILES, SCATTER_TARGETS } from "../lib/maze-data.mjs";
import { parseMaze, tileAt, isWalkable, wallMask, TILE } from "../lib/maze.mjs";

const maze = parseMaze(LEVEL_1);

/** Rows of the map text with the surrounding blank lines removed. */
function rows(text) {
  const lines = text.split("\n");
  if (lines[0] === "") lines.shift();
  if (lines[lines.length - 1] === "") lines.pop();
  return lines;
}

const ROWS = rows(LEVEL_1);

test("the level is 28 columns by 31 rows", () => {
  assert.equal(maze.width, 28);
  assert.equal(maze.height, 31);
  assert.equal(ROWS.length, 31);
  for (const [y, row] of ROWS.entries()) assert.equal(row.length, 28, `row ${y} is ${row.length} wide`);
  assert.equal(maze.tiles.length, 28 * 31);
});

test("rows 0 and 30 and the side columns are solid wall (except the tunnel)", () => {
  for (let x = 0; x < 28; x++) {
    assert.equal(tileAt(maze, x, 0), TILE.WALL, `(${x},0)`);
    assert.equal(tileAt(maze, x, 30), TILE.WALL, `(${x},30)`);
  }
  for (let y = 0; y < 31; y++) {
    const left = tileAt(maze, 0, y);
    const right = tileAt(maze, 27, y);
    if (left === TILE.TUNNEL) {
      assert.equal(right, TILE.TUNNEL, `tunnel row ${y} must be open on both sides`);
    } else {
      assert.equal(left, TILE.WALL, `(0,${y})`);
      assert.equal(right, TILE.WALL, `(27,${y})`);
    }
  }
});

test("walls mirror left/right exactly", () => {
  for (let y = 0; y < 31; y++) {
    for (let x = 0; x < 14; x++) {
      const a = tileAt(maze, x, y) === TILE.WALL;
      const b = tileAt(maze, 27 - x, y) === TILE.WALL;
      assert.equal(a, b, `wall-ness differs at (${x},${y}) vs (${27 - x},${y})`);
    }
  }
});

test("pellet count is in the documented range 200-260", () => {
  assert.ok(maze.pellets.length >= 200 && maze.pellets.length <= 260, `got ${maze.pellets.length}`);
  const dots = ROWS.join("").split("").filter(ch => ch === ".").length;
  assert.equal(maze.pellets.length, dots);
  for (const p of maze.pellets) assert.equal(tileAt(maze, p.x, p.y), TILE.PELLET);
});

test("exactly four power pellets", () => {
  assert.equal(maze.powerPellets.length, 4);
  for (const p of maze.powerPellets) assert.equal(tileAt(maze, p.x, p.y), TILE.POWER);
});

test("the ghost house has interior cells and a two-wide door in its top wall", () => {
  const { house } = maze;
  assert.ok(house.cells.length > 0, "house has interior cells");
  assert.equal(house.door.length, 2);
  assert.equal(house.x, 10);
  assert.equal(house.y, 12);
  assert.equal(house.width, 8);
  assert.equal(house.height, 5);
  const doorY = house.door[0].y;
  assert.equal(doorY, house.y, "door sits in the house's top wall");
  for (const d of house.door) {
    assert.equal(tileAt(maze, d.x, d.y), TILE.DOOR);
    assert.equal(tileAt(maze, d.x, d.y + 1), TILE.HOUSE, "house interior lies below the door");
  }
  for (const c of house.cells) {
    assert.equal(tileAt(maze, c.x, c.y), TILE.HOUSE);
    assert.ok(c.x > house.x && c.x < house.x + house.width - 1, `interior x ${c.x}`);
    assert.ok(c.y > house.y && c.y < house.y + house.height - 1, `interior y ${c.y}`);
  }
  // The rest of the house perimeter is wall.
  for (let x = house.x; x < house.x + house.width; x++) {
    for (let y = house.y; y < house.y + house.height; y++) {
      const edge = x === house.x || y === house.y || x === house.x + house.width - 1 || y === house.y + house.height - 1;
      if (!edge) continue;
      const kind = tileAt(maze, x, y);
      const isDoor = maze.house.door.some(d => d.x === x && d.y === y);
      assert.equal(kind, isDoor ? TILE.DOOR : TILE.WALL, `house perimeter (${x},${y})`);
    }
  }
});

test("exactly one spawn, on an empty tile below the house", () => {
  assert.deepEqual(maze.spawn, { x: 13, y: 23 });
  assert.equal(tileAt(maze, 13, 23), TILE.EMPTY);
  assert.equal(ROWS.join("").split("").filter(ch => ch === "P").length, 1);
});

test("one tunnel row with T at both edges, on the house's middle row", () => {
  assert.equal(maze.tunnels.length, 1);
  const [t] = maze.tunnels;
  assert.equal(t.y, 14);
  assert.deepEqual(t.left, { x: 0, y: 14 });
  assert.deepEqual(t.right, { x: 27, y: 14 });
  assert.equal(ROWS[14][0], "T");
  assert.equal(ROWS[14][27], "T");
});

test("every pellet and power pellet is reachable from spawn by BFS", () => {
  const seen = new Set();
  const key = (x, y) => y * maze.width + x;
  const queue = [maze.spawn];
  seen.add(key(maze.spawn.x, maze.spawn.y));
  while (queue.length) {
    const { x, y } = queue.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = ((x + dx) % maze.width + maze.width) % maze.width; // tunnel wrap
      const ny = y + dy;
      if (ny < 0 || ny >= maze.height) continue;
      const kind = tileAt(maze, nx, ny);
      if (!isWalkable(kind)) continue;
      const k = key(nx, ny);
      if (seen.has(k)) continue;
      seen.add(k);
      queue.push({ x: nx, y: ny });
    }
  }
  for (const p of [...maze.pellets, ...maze.powerPellets]) {
    assert.ok(seen.has(key(p.x, p.y)), `pellet at (${p.x},${p.y}) unreachable`);
  }
  for (const c of maze.house.cells) assert.ok(!seen.has(key(c.x, c.y)), "BFS must not enter the house");
  for (const d of maze.house.door) assert.ok(!seen.has(key(d.x, d.y)), "BFS must not cross the door");
});

test("no dead ends: every walkable tile has at least two walkable neighbours", () => {
  for (let y = 0; y < maze.height; y++) {
    for (let x = 0; x < maze.width; x++) {
      if (!isWalkable(tileAt(maze, x, y))) continue;
      let open = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (isWalkable(tileAt(maze, x + dx, y + dy))) open++;
      }
      assert.ok(open >= 2, `dead end at (${x},${y})`);
    }
  }
});

test("corridors are one tile wide: no 2x2 block of walkable tiles", () => {
  for (let y = 0; y + 1 < maze.height; y++) {
    for (let x = 0; x + 1 < maze.width; x++) {
      const cells = [[x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]];
      const allOpen = cells.every(([cx, cy]) => isWalkable(tileAt(maze, cx, cy)));
      assert.ok(!allOpen, `2x2 open block at (${x},${y})`);
    }
  }
});

test("walls outside the house are at least two tiles thick", () => {
  const { house } = maze;
  const inHouse = (x, y) => x >= house.x && x < house.x + house.width && y >= house.y && y < house.y + house.height;
  const open = (x, y) => tileAt(maze, x, y) !== TILE.WALL;
  for (let y = 0; y < maze.height; y++) {
    for (let x = 0; x < maze.width; x++) {
      if (tileAt(maze, x, y) !== TILE.WALL || inHouse(x, y)) continue;
      assert.ok(!(open(x - 1, y) && open(x + 1, y)), `one-thick vertical wall at (${x},${y})`);
      assert.ok(!(open(x, y - 1) && open(x, y + 1)), `one-thick horizontal wall at (${x},${y})`);
    }
  }
});

test("parseMaze throws with row and column on a stray character", () => {
  const bad = ROWS.map((row, y) => (y === 5 ? row.slice(0, 7) + "X" + row.slice(8) : row)).join("\n");
  assert.throws(() => parseMaze(bad), /unknown tile 'X' at row 5 col 7/);
});

test("parseMaze throws on the wrong row count and a short row", () => {
  assert.throws(() => parseMaze(ROWS.slice(0, 30).join("\n")), /expected 31 rows, got 30/);
  const short = ROWS.map((row, y) => (y === 3 ? row.slice(0, 27) : row)).join("\n");
  assert.throws(() => parseMaze(short), /row 3 has 27 columns/);
});

test("parseMaze accepts a template string with surrounding blank lines", () => {
  const padded = "\n" + ROWS.join("\n") + "\n";
  assert.equal(parseMaze(padded).pellets.length, maze.pellets.length);
});

test("tileAt wraps x and treats y off-map as wall", () => {
  assert.equal(tileAt(maze, -1, 14), TILE.TUNNEL);
  assert.equal(tileAt(maze, 28, 14), TILE.TUNNEL);
  assert.equal(tileAt(maze, 5, -1), TILE.WALL);
  assert.equal(tileAt(maze, 5, 31), TILE.WALL);
});

test("tileAt floors fractional coordinates and treats non-numbers as wall", () => {
  assert.equal(tileAt(maze, 13.7, 23.2), tileAt(maze, 13, 23));
  assert.equal(tileAt(maze, -0.5, 14), TILE.TUNNEL);
  assert.equal(tileAt(maze, NaN, 14), TILE.WALL);
  assert.equal(tileAt(maze, 5, undefined), TILE.WALL);
  assert.equal(tileAt(maze, 5, 30.9), TILE.WALL);
});

test("isWalkable covers pellet, power, empty and tunnel only", () => {
  assert.ok(isWalkable(TILE.PELLET));
  assert.ok(isWalkable(TILE.POWER));
  assert.ok(isWalkable(TILE.EMPTY));
  assert.ok(isWalkable(TILE.TUNNEL));
  assert.ok(!isWalkable(TILE.WALL));
  assert.ok(!isWalkable(TILE.DOOR));
  assert.ok(!isWalkable(TILE.HOUSE));
});

test("wallMask: bit 0 is north, clockwise; a buried tile is 0xff", () => {
  // Build a tiny maze by hand: 3x3 walls around a single open centre.
  const text = [
    "############################",
    ...Array.from({ length: 29 }, () => "#" + " ".repeat(26) + "#"),
    "############################",
  ];
  // Put a solid 3x3 block inside the open field, and one open cell at its NE.
  text[10] = "#" + " ".repeat(4) + "###" + " ".repeat(19) + "#";
  text[11] = "#" + " ".repeat(4) + "###" + " ".repeat(19) + "#";
  text[12] = "#" + " ".repeat(4) + "###" + " ".repeat(19) + "#";
  text[14] = "T" + " ".repeat(26) + "T";
  text[15] = "#" + " ".repeat(9) + "###-####" + " ".repeat(9) + "#";
  text[16] = "#" + " ".repeat(9) + "#HHHHHH#" + " ".repeat(9) + "#";
  text[17] = "#" + " ".repeat(9) + "#HHHHHH#" + " ".repeat(9) + "#";
  text[18] = "#" + " ".repeat(9) + "########" + " ".repeat(9) + "#";
  text[22] = "#" + " ".repeat(12) + "P" + " ".repeat(13) + "#";
  const m = parseMaze(text.join("\n"));
  // Centre of the 3x3 block: all eight neighbours are wall.
  assert.equal(wallMask(m, 6, 11), 0xff);
  // NW corner of the block: only E (bit 2), SE (bit 3), S (bit 4) are wall.
  assert.equal(wallMask(m, 5, 10), (1 << 2) | (1 << 3) | (1 << 4));
  // Map corner (0,0): off-map counts as wall; E and S are wall (border), SE is open.
  assert.equal(wallMask(m, 0, 0), 0xff & ~(1 << 3));
});

test("the no-up tiles are walkable and the scatter targets sit off the board at the corners", () => {
  assert.deepEqual(NO_UP_TILES, [{ x: 12, y: 11 }, { x: 15, y: 11 }, { x: 12, y: 23 }, { x: 15, y: 23 }]);
  for (const t of NO_UP_TILES) assert.ok(isWalkable(tileAt(maze, t.x, t.y)), `(${t.x},${t.y}) walkable`);
  assert.deepEqual(SCATTER_TARGETS, {
    blinky: { x: 25, y: -3 }, pinky: { x: 2, y: -3 }, inky: { x: 27, y: 31 }, clyde: { x: 0, y: 31 },
  });
  assert.ok(Object.isFrozen(NO_UP_TILES) && Object.isFrozen(SCATTER_TARGETS));
});

test("wallMask on the real maze: the house door and interior count as open", () => {
  // Tile left of the door is a house wall: E is the door (open).
  const { house } = maze;
  const leftOfDoor = { x: house.door[0].x - 1, y: house.door[0].y };
  assert.equal(tileAt(maze, leftOfDoor.x, leftOfDoor.y), TILE.WALL);
  assert.equal((wallMask(maze, leftOfDoor.x, leftOfDoor.y) >> 2) & 1, 0, "E (door) is open");
  assert.equal((wallMask(maze, leftOfDoor.x, leftOfDoor.y) >> 4) & 1, 0, "S (interior) is open");
});
