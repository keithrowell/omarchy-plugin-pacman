import { test } from "node:test";
import assert from "node:assert/strict";
import { LEVEL_1, NO_UP_TILES, SCATTER_TARGETS } from "../lib/maze-data.mjs";
import { parseMaze, tileAt, isWalkable, TILE } from "../lib/maze.mjs";
import { DIRS } from "../lib/input.mjs";
import { createPlayer, tileOf, TILE_PX } from "../lib/player.mjs";
import { ghostSpeed, tunnelSpeed } from "../lib/speeds.mjs";
import { seed } from "../lib/rng.mjs";
import {
  GHOST_NAMES, HOUSE_ORDER, DECISION_ORDER, HOUSE_BOB,
  houseGeometry, createGhosts, ghostWalkable, inTunnel, chaseTarget, targetFor,
  candidates, chooseDirection, stepGhost,
} from "../lib/ghosts.mjs";

const maze = parseMaze(LEVEL_1);
const board = { width: maze.width, height: maze.height, tiles: maze.tiles.slice() };
const TICK = 1 / 60;
const centre = t => t * TILE_PX + TILE_PX / 2;
const pxPerTick = tilesPerS => tilesPerS * TILE_PX * TICK;
const NORMAL_PX = pxPerTick(ghostSpeed(1));

/** A ghost at the centre of tile (tx, ty), travelling dir, in state (default normal). */
function ghostAt(name, tx, ty, dir, state = "normal", extra = {}) {
  return Object.assign({ name, x: centre(tx), y: centre(ty), dir, state, dotCounter: 0, reverse: false }, extra);
}

function playerAt(tx, ty, dir) {
  return Object.assign(createPlayer(maze), { x: centre(tx), y: centre(ty), dir });
}

/** Run n ticks of stepGhost at px per tick towards a fixed target. */
function run(g, n, px, target, rng = seed(1)) {
  let ghost = g;
  for (let i = 0; i < n; i++) {
    const r = stepGhost(ghost, board, maze, px, target, rng);
    ghost = r.ghost;
    rng = r.rng;
  }
  return { ghost, rng };
}

test("names, house order, tie-break order and bob amplitude", () => {
  assert.deepEqual(GHOST_NAMES, ["blinky", "pinky", "inky", "clyde"]);
  assert.deepEqual(HOUSE_ORDER, ["pinky", "inky", "clyde"]);
  assert.deepEqual(DECISION_ORDER, ["up", "left", "down", "right"]);
  assert.equal(HOUSE_BOB, 4);
});

test("houseGeometry is derived from the parsed house: door centre x 112, centre row y 116, exit row y 92", () => {
  const g = houseGeometry(maze);
  assert.equal(g.doorX, 112);
  assert.equal(g.centreY, 116);
  assert.equal(g.exitY, 92);
  assert.deepEqual(g.exitTiles, [{ x: 13, y: 11 }, { x: 14, y: 11 }]);
  for (const t of g.exitTiles) assert.ok(isWalkable(tileAt(maze, t.x, t.y)));
  assert.equal(tileAt(maze, 13, 12), TILE.DOOR);
  assert.equal(tileAt(maze, 14, 12), TILE.DOOR);
});

test("createGhosts: Blinky above the door facing left and out; the others in the house at the classic spots", () => {
  const ghosts = createGhosts(maze);
  assert.deepEqual(ghosts.map(g => g.name), GHOST_NAMES);
  const [blinky, pinky, inky, clyde] = ghosts;
  assert.deepEqual(blinky, { name: "blinky", x: 112, y: 92, dir: "left", state: "normal", dotCounter: 0, reverse: false });
  assert.deepEqual(pinky, { name: "pinky", x: 112, y: 116, dir: "down", state: "house", dotCounter: 0, reverse: false });
  assert.deepEqual(inky, { name: "inky", x: 96, y: 116, dir: "up", state: "house", dotCounter: 0, reverse: false });
  assert.deepEqual(clyde, { name: "clyde", x: 128, y: 116, dir: "up", state: "house", dotCounter: 0, reverse: false });
  for (const g of [pinky, inky, clyde]) assert.equal(tileAt(maze, tileOf(g, board).x, tileOf(g, board).y), TILE.HOUSE);
  assert.notEqual(createGhosts(maze)[0], blinky, "fresh objects each call");
});

test("ghostWalkable: corridors for everyone, door and house only for eyes, leavers and enterers", () => {
  for (const state of ["normal", "frightened", "eaten", "leaving", "entering", "house"]) {
    for (const kind of [TILE.PELLET, TILE.POWER, TILE.EMPTY, TILE.TUNNEL]) assert.ok(ghostWalkable(kind, state), `${kind} ${state}`);
    assert.ok(!ghostWalkable(TILE.WALL, state), `wall ${state}`);
  }
  for (const state of ["eaten", "entering", "leaving"]) {
    assert.ok(ghostWalkable(TILE.DOOR, state), `door ${state}`);
    assert.ok(ghostWalkable(TILE.HOUSE, state), `house ${state}`);
  }
  for (const state of ["normal", "frightened", "house"]) {
    assert.ok(!ghostWalkable(TILE.DOOR, state), `door ${state}`);
    assert.ok(!ghostWalkable(TILE.HOUSE, state), `house ${state}`);
  }
});

test("inTunnel covers the open runs from both edges of the tunnel row, wrap band included", () => {
  for (let x = 0; x <= 4; x++) assert.ok(inTunnel(maze, { x, y: 14 }), `(${x},14)`);
  for (let x = 23; x <= 27; x++) assert.ok(inTunnel(maze, { x, y: 14 }), `(${x},14)`);
  assert.ok(inTunnel(maze, { x: -1, y: 14 }), "wrap band left");
  assert.ok(inTunnel(maze, { x: 28, y: 14 }), "wrap band right");
  assert.ok(!inTunnel(maze, { x: 5, y: 14 }), "the wall block is not tunnel");
  assert.ok(!inTunnel(maze, { x: 12, y: 14 }), "the house is not tunnel");
  assert.ok(!inTunnel(maze, { x: 0, y: 13 }));
  assert.ok(!inTunnel(maze, { x: 4, y: 4 }));
});

test("chase targets: Blinky the player tile, Pinky four ahead with the up-left quirk", () => {
  const blinky = ghostAt("blinky", 1, 1, "right");
  const pinky = ghostAt("pinky", 1, 1, "right");
  for (const dir of ["left", "right", "up", "down"]) {
    const p = playerAt(13, 23, dir);
    assert.deepEqual(chaseTarget(blinky, p, null, board), { x: 13, y: 23 }, `blinky ${dir}`);
    const d = DIRS[dir];
    const expect = { x: 13 + 4 * d.dx + (dir === "up" ? -4 : 0), y: 23 + 4 * d.dy };
    assert.deepEqual(chaseTarget(pinky, p, null, board), expect, `pinky ${dir}`);
  }
  assert.deepEqual(chaseTarget(pinky, playerAt(13, 23, "up"), null, board), { x: 9, y: 19 }, "up: four ahead and four left");
  assert.deepEqual(chaseTarget(pinky, playerAt(13, 23, "right"), null, board), { x: 17, y: 23 });
  assert.deepEqual(chaseTarget(pinky, playerAt(1, 4, "left"), null, board), { x: -3, y: 4 }, "targets may lie off the board");
});

test("Inky: two ahead of the player (same quirk), then doubled away from Blinky", () => {
  const inky = ghostAt("inky", 20, 20, "left");
  // Player at (13,23) facing right: two ahead is (15,23); Blinky at (9,20):
  // vector (6,3) doubled from Blinky gives (21,26).
  const b = ghostAt("blinky", 9, 20, "left");
  assert.deepEqual(chaseTarget(inky, playerAt(13, 23, "right"), b, board), { x: 21, y: 26 });
  // Facing up: two ahead and two left is (11,21); from Blinky (9,20): (13,22).
  assert.deepEqual(chaseTarget(inky, playerAt(13, 23, "up"), b, board), { x: 13, y: 22 });
  assert.deepEqual(chaseTarget(inky, playerAt(13, 23, "right"), null, board), { x: 15, y: 23 }, "no Blinky: the two-ahead point");
});

test("Clyde chases at eight or more tiles and retreats to his corner closer in", () => {
  const p = playerAt(13, 23, "left");
  // (13,15) is 8.0 away: chase.
  assert.deepEqual(chaseTarget(ghostAt("clyde", 13, 15, "up"), p, null, board), { x: 13, y: 23 });
  // (20,19): sqrt(49 + 16) = 8.06: chase.
  assert.deepEqual(chaseTarget(ghostAt("clyde", 20, 19, "up"), p, null, board), { x: 13, y: 23 });
  // (19,18): sqrt(36 + 25) = 7.81: corner.
  assert.deepEqual(chaseTarget(ghostAt("clyde", 19, 18, "up"), p, null, board), SCATTER_TARGETS.clyde);
  assert.deepEqual(chaseTarget(ghostAt("clyde", 13, 16, "up"), p, null, board), SCATTER_TARGETS.clyde, "7 away");
  assert.deepEqual(chaseTarget(ghostAt("clyde", 12, 23, "up"), p, null, board), SCATTER_TARGETS.clyde, "adjacent");
});

test("targetFor: scatter corners, chase targets, eyes to the tile above the door, Elroy Blinky chases in scatter", () => {
  const ghosts = createGhosts(maze);
  const player = playerAt(13, 23, "left");
  const ctx = { mode: "scatter", player, ghosts, board, maze, elroy: 0 };
  for (const g of ghosts) assert.deepEqual(targetFor(g, ctx), SCATTER_TARGETS[g.name], g.name);
  const chase = Object.assign({}, ctx, { mode: "chase" });
  assert.deepEqual(targetFor(ghosts[0], chase), { x: 13, y: 23 });
  assert.deepEqual(targetFor(ghosts[1], chase), { x: 9, y: 23 });
  assert.deepEqual(targetFor(ghosts[0], Object.assign({}, ctx, { elroy: 1 })), { x: 13, y: 23 }, "Elroy ignores scatter");
  assert.deepEqual(targetFor(ghosts[1], Object.assign({}, ctx, { elroy: 1 })), SCATTER_TARGETS.pinky, "only Blinky");
  const eyes = Object.assign({}, ghosts[3], { state: "eaten" });
  assert.deepEqual(targetFor(eyes, ctx), { x: 13, y: 11 });
  assert.deepEqual(targetFor(Object.assign({}, eyes, { state: "entering" }), chase), { x: 13, y: 11 });
});

test("candidates at a four-way junction: all but the reverse, in tie-break order", () => {
  // (4,4) is open on all four sides.
  assert.deepEqual(candidates("normal", board, { x: 4, y: 4 }, "right").map(c => c.dir), ["up", "down", "right"]);
  assert.deepEqual(candidates("normal", board, { x: 4, y: 4 }, "left").map(c => c.dir), ["up", "left", "down"]);
  assert.deepEqual(candidates("normal", board, { x: 4, y: 4 }, "up").map(c => c.dir), ["up", "left", "right"]);
  assert.deepEqual(candidates("normal", board, { x: 4, y: 4 }, "down").map(c => c.dir), ["left", "down", "right"]);
  assert.deepEqual(candidates("normal", board, { x: 4, y: 4 }, "right")[0].tile, { x: 4, y: 3 });
  // Corridor: only straight on.
  assert.deepEqual(candidates("normal", board, { x: 2, y: 4 }, "right").map(c => c.dir), ["right"]);
  // Eyes may take the door from the tile above it; the living may not.
  assert.deepEqual(candidates("eaten", board, { x: 13, y: 11 }, "left").map(c => c.dir), ["left", "down"]);
  assert.deepEqual(candidates("normal", board, { x: 13, y: 11 }, "left").map(c => c.dir), ["left"]);
});

test("no-up tiles: a normal ghost may not turn up there; frightened and eyes may where it is open", () => {
  for (const t of NO_UP_TILES) {
    const normal = candidates("normal", board, t, "left").map(c => c.dir);
    assert.ok(!normal.includes("up"), `normal at (${t.x},${t.y})`);
    const above = isWalkable(tileAt(maze, t.x, t.y - 1));
    for (const state of ["frightened", "eaten"]) {
      const dirs = candidates(state, board, t, "left").map(c => c.dir);
      assert.equal(dirs.includes("up"), above, `${state} at (${t.x},${t.y})`);
    }
  }
  // The pair beside the spawn has open tiles above, so the rule bites there.
  assert.ok(isWalkable(tileAt(maze, 12, 22)) && isWalkable(tileAt(maze, 15, 22)));
  const g = ghostAt("blinky", 13, 23, "left");
  // Arriving at (12,23) with the target straight up: forced left instead.
  const r = run(g, 9, 1, { x: 12, y: 0 });
  assert.equal(tileOf(r.ghost, board).x, 12);
  assert.equal(r.ghost.dir, "left");
  const f = run(Object.assign({}, g, { state: "eaten" }), 9, 1, { x: 12, y: 0 });
  assert.equal(f.ghost.dir, "up", "eyes take the same turn");
});

test("chooseDirection: the nearest next tile wins, ties go up, left, down, right", () => {
  const rng = seed(1);
  const right = ghostAt("blinky", 4, 4, "right");
  assert.equal(chooseDirection(right, board, { x: 20, y: 4 }, rng).dir, "right");
  assert.equal(chooseDirection(right, board, { x: 4, y: -3 }, rng).dir, "up");
  assert.equal(chooseDirection(right, board, { x: 4, y: 20 }, rng).dir, "down");
  // Ties: (5,3) is 1 from both up (4,3) and right (5,4).
  assert.equal(chooseDirection(right, board, { x: 5, y: 3 }, rng).dir, "up");
  // (5,5) is 1 from down (4,5) and right (5,4): down comes first.
  assert.equal(chooseDirection(right, board, { x: 5, y: 5 }, rng).dir, "down");
  // Moving down, (3,5) ties left (3,4) and down (4,5): left comes first.
  assert.equal(chooseDirection(ghostAt("blinky", 4, 4, "down"), board, { x: 3, y: 5 }, rng).dir, "left");
  // The target straight behind: never reverse, the perpendicular ties resolve up.
  const c = chooseDirection(right, board, { x: 0, y: 4 }, rng);
  assert.equal(c.dir, "up");
  assert.equal(c.rng, rng, "no random draw for a normal ghost");
  assert.equal(c.reversed, false);
});

test("the reverse flag forces a reversal at the next centre and is cleared", () => {
  const g = ghostAt("blinky", 4, 4, "right", "normal", { reverse: true });
  const c = chooseDirection(g, board, { x: 20, y: 4 }, seed(1));
  assert.deepEqual(c, { dir: "left", rng: seed(1), reversed: true });
  // Mid-corridor: keeps going right until the next centre, then turns back.
  const mid = Object.assign({}, g, { x: centre(2) + 1 });
  const one = stepGhost(mid, board, maze, 1, { x: 20, y: 4 }, seed(1)).ghost;
  assert.equal(one.dir, "right", "not yet at a centre");
  assert.equal(one.x, centre(2) + 2);
  assert.equal(one.reverse, true);
  const six = run(mid, 6, 1, { x: 20, y: 4 }).ghost;
  assert.equal(six.dir, "right", "one px short of the centre of tile 3");
  assert.equal(six.x, centre(3) - 1);
  const r = run(mid, 8, 1, { x: 20, y: 4 }).ghost;
  assert.equal(r.dir, "left");
  assert.equal(r.reverse, false);
  assert.equal(r.x, centre(3) - 1, "turned back at the centre of tile 3 and took one px back");
});

test("moves at the given pixels per tick along the lane and decides at each centre", () => {
  // Row 4 from tile 1 heading right, target the top-left corner: turns up at (4,4).
  const g = ghostAt("blinky", 1, 4, "right");
  const target = { x: 4, y: -3 };
  let ghost = g;
  let turnedAt = null;
  for (let i = 0; i < 60 && turnedAt === null; i++) {
    ghost = stepGhost(ghost, board, maze, NORMAL_PX, target, seed(1)).ghost;
    if (ghost.dir === "up") turnedAt = { x: ghost.x, y: ghost.y, tick: i };
    else assert.equal(ghost.y, centre(4), "on the lane");
  }
  assert.ok(turnedAt, "turned");
  assert.equal(turnedAt.x, centre(4), "snapped to the junction column");
  assert.ok(turnedAt.y <= centre(4) && turnedAt.y > centre(4) - NORMAL_PX, `left the row by at most one tick, y ${turnedAt.y}`);
  const expectTicks = Math.ceil((centre(4) - centre(1)) / NORMAL_PX);
  assert.ok(Math.abs(turnedAt.tick + 1 - expectTicks) <= 1, `took ${turnedAt.tick + 1} ticks, expected about ${expectTicks}`);
});

test("a ghost at three tiles per tick still turns at every tile centre (decisions are never skipped)", () => {
  const g = ghostAt("blinky", 1, 4, "right");
  const target = { x: 4, y: -3 };
  const one = stepGhost(g, board, maze, 3 * TILE_PX, target, seed(1)).ghost;
  assert.equal(one.dir, "up", "turned at (4,4) inside the tick");
  assert.equal(one.x, centre(4));
  assert.equal(one.y, centre(4), "the turn consumed the whole move");
  // At 17 px per tick from tile 1: passes centres 2 and 3, stops one px past 3.
  const first = stepGhost(g, board, maze, 17, target, seed(1)).ghost;
  assert.equal(first.dir, "right");
  assert.equal(first.x, centre(3) + 1);
  const second = stepGhost(first, board, maze, 17, target, seed(1)).ghost;
  assert.equal(second.dir, "up");
  assert.equal(second.x, centre(4));
  assert.equal(second.y, centre(4) - 10, "the leftover ten px went up");
  // Absurd speed for a long run never leaves the walkable tiles or the lanes.
  let ghost = g;
  for (let i = 0; i < 500; i++) {
    ghost = stepGhost(ghost, board, maze, 3 * TILE_PX, SCATTER_TARGETS.blinky, seed(1)).ghost;
    const t = tileOf(ghost, board);
    assert.ok(isWalkable(tileAt(board, t.x, t.y)), `tick ${i}: in ${tileAt(board, t.x, t.y)} at ${ghost.x},${ghost.y}`);
    if (DIRS[ghost.dir].dx !== 0) assert.equal(ghost.y, centre(t.y)); else assert.equal(ghost.x, centre(t.x));
  }
});

test("scatter: each ghost circles its corner; none leaves the walkable tiles or its lane in 3000 ticks", () => {
  const visited = {};
  for (const name of GHOST_NAMES) {
    let ghost = ghostAt(name, 13, 11, "left");
    const tiles = new Set();
    for (let i = 0; i < 3000; i++) {
      ghost = stepGhost(ghost, board, maze, NORMAL_PX, SCATTER_TARGETS[name], seed(1)).ghost;
      const t = tileOf(ghost, board);
      assert.ok(isWalkable(tileAt(board, t.x, t.y)), `${name} tick ${i}: in ${tileAt(board, t.x, t.y)} at ${ghost.x},${ghost.y}`);
      if (DIRS[ghost.dir].dx !== 0) assert.equal(ghost.y, centre(t.y), `${name} off lane y`);
      else assert.equal(ghost.x, centre(t.x), `${name} off lane x`);
      if (i > 1500) tiles.add(`${t.x},${t.y}`);
    }
    visited[name] = tiles;
    const corner = SCATTER_TARGETS[name];
    for (const key of tiles) {
      const [x, y] = key.split(",").map(Number);
      assert.ok(Math.abs(x - corner.x) <= 14 && Math.abs(y - corner.y) <= 18, `${name} loops near its corner, not at ${key}`);
    }
    assert.ok(tiles.size >= 6 && tiles.size <= 40, `${name} settles into a loop of ${tiles.size} tiles`);
  }
});

test("through the tunnel: the ghost crosses the wrap band and comes out the other side on the lane", () => {
  let ghost = ghostAt("blinky", 1, 14, "left");
  let wrapped = null;
  for (let i = 0; i < 40 && wrapped === null; i++) {
    const prev = ghost.x;
    ghost = stepGhost(ghost, board, maze, NORMAL_PX, { x: 20, y: 14 }, seed(1)).ghost;
    assert.equal(ghost.y, centre(14));
    if (ghost.x > prev) wrapped = { prev, x: ghost.x, tick: i };
  }
  assert.ok(wrapped, "wrapped");
  assert.ok(wrapped.prev >= -4 && wrapped.prev < -4 + NORMAL_PX, `left at ${wrapped.prev}`);
  assert.ok(wrapped.x >= 220 - NORMAL_PX && wrapped.x < 220, `re-entered at ${wrapped.x}`);
  assert.equal(tileOf(ghost, board).x, 27);
  assert.equal(ghost.dir, "left");
  // And rightwards.
  ghost = ghostAt("blinky", 26, 14, "right");
  wrapped = null;
  for (let i = 0; i < 40 && wrapped === null; i++) {
    const prev = ghost.x;
    ghost = stepGhost(ghost, board, maze, NORMAL_PX, { x: 10, y: 14 }, seed(1)).ghost;
    if (ghost.x < prev) wrapped = { prev, x: ghost.x };
  }
  assert.ok(wrapped, "wrapped right");
  assert.ok(wrapped.x >= 4 && wrapped.x < 4 + NORMAL_PX, `re-entered at ${wrapped.x}`);
  assert.equal(ghost.dir, "right");
  assert.ok(inTunnel(maze, tileOf(ghost, board)));
  assert.ok(pxPerTick(tunnelSpeed(1)) < NORMAL_PX, "the tunnel speed the game applies here is slower");
});

test("frightened: the random walk is reproducible from the seed and threads the RNG", () => {
  const g = ghostAt("pinky", 4, 4, "right", "frightened");
  const a = run(g, 600, 1, null, seed(7));
  const b = run(g, 600, 1, null, seed(7));
  assert.deepEqual(a, b);
  assert.notEqual(a.rng, seed(7), "the RNG advanced");
  const c = run(g, 600, 1, null, seed(8));
  assert.notDeepEqual(a.ghost, c.ghost, "a different seed walks differently");
  // Never illegal, always on a lane.
  let ghost = g, rng = seed(3);
  const seen = new Set();
  for (let i = 0; i < 3000; i++) {
    const r = stepGhost(ghost, board, maze, 1, null, rng);
    ghost = r.ghost;
    rng = r.rng;
    const t = tileOf(ghost, board);
    assert.ok(isWalkable(tileAt(board, t.x, t.y)), `tick ${i}: in ${tileAt(board, t.x, t.y)}`);
    seen.add(`${t.x},${t.y}`);
  }
  assert.ok(seen.size > 30, `wanders: ${seen.size} tiles`);
  // A frightened ghost also honours a pending reversal.
  const rev = stepGhost(Object.assign({}, g, { reverse: true, x: centre(4) - 1 }), board, maze, 1, null, seed(1)).ghost;
  assert.equal(rev.dir, "left");
  assert.equal(rev.reverse, false);
});

test("eyes: from the far corner they reach the door, drop to the house centre and rise again as normal", () => {
  const eyes = ghostAt("clyde", 26, 29, "left", "eaten");
  const px = 2 * NORMAL_PX;
  const target = { x: 13, y: 11 };
  let ghost = eyes;
  const states = [];
  let entering = null, leaving = null, normal = null;
  for (let i = 0; i < 600 && normal === null; i++) {
    ghost = stepGhost(ghost, board, maze, px, target, seed(1)).ghost;
    if (states[states.length - 1] !== ghost.state) states.push(ghost.state);
    if (ghost.state === "entering" && entering === null) entering = { i, x: ghost.x, y: ghost.y, dir: ghost.dir };
    if (ghost.state === "leaving" && leaving === null) leaving = { i, x: ghost.x, y: ghost.y };
    if (ghost.state === "normal") normal = { i, x: ghost.x, y: ghost.y, dir: ghost.dir };
  }
  assert.deepEqual(states, ["eaten", "entering", "leaving", "normal"]);
  assert.ok(entering && entering.y === 92 && (entering.x === 108 || entering.x === 116), `entered at ${JSON.stringify(entering)}`);
  assert.deepEqual(leaving, { i: leaving.i, x: 112, y: 116 }, "dropped to the house centre");
  assert.deepEqual(normal, { i: normal.i, x: 112, y: 92, dir: "left" }, "re-emerged above the door facing left");
  assert.ok(normal.i < 300, `took ${normal.i} ticks`);
  // While entering, the eyes passed through the door tile.
  let passedDoor = false;
  ghost = eyes;
  for (let i = 0; i <= leaving.i; i++) {
    ghost = stepGhost(ghost, board, maze, px, target, seed(1)).ghost;
    if (ghost.state === "entering" && tileAt(maze, 13, tileOf(ghost, board).y) === TILE.DOOR) passedDoor = true;
  }
  assert.ok(passedDoor);
});

test("house: bobs between centre - 4 and centre + 4 at the given speed, reversing at the limits", () => {
  const [, pinky, inky] = createGhosts(maze);
  let g = pinky;
  let minY = Infinity, maxY = -Infinity, flips = 0;
  for (let i = 0; i < 400; i++) {
    const next = stepGhost(g, board, maze, 0.5, null, seed(1)).ghost;
    if (next.dir !== g.dir) flips++;
    g = next;
    minY = Math.min(minY, g.y);
    maxY = Math.max(maxY, g.y);
    assert.equal(g.x, 112, "x never changes in the house");
    assert.equal(g.state, "house");
  }
  assert.equal(minY, 116 - HOUSE_BOB);
  assert.equal(maxY, 116 + HOUSE_BOB);
  assert.ok(flips >= 10, `flipped ${flips} times`);
  const up = stepGhost(inky, board, maze, 0.5, null, seed(1)).ghost;
  assert.equal(up.y, 115.5, "Inky starts upward");
  assert.equal(up.x, 96);
});

test("leaving: levels with the centre row, slides to the door, rises to the exit row, then normal facing left", () => {
  const [, , inky] = createGhosts(maze);
  const start = Object.assign({}, inky, { state: "leaving", y: 118 });
  let g = start;
  const path = [];
  let done = null;
  for (let i = 0; i < 200 && done === null; i++) {
    g = stepGhost(g, board, maze, 0.5, null, seed(1)).ghost;
    path.push({ x: g.x, y: g.y, dir: g.dir });
    if (g.state === "normal") done = i;
  }
  assert.notEqual(done, null, "left the house");
  assert.deepEqual({ x: g.x, y: g.y, dir: g.dir, state: g.state }, { x: 112, y: 92, dir: "left", state: "normal" });
  // Phases: down/up to 116 first, then right to 112, then up.
  assert.equal(path[0].dir, "up");
  assert.equal(path[0].y, 117.5);
  const levelled = path.findIndex(p => p.y === 116);
  assert.ok(levelled >= 0 && path[levelled + 1].dir === "right" && path[levelled + 1].x === 96.5);
  const atDoor = path.findIndex(p => p.x === 112);
  assert.ok(atDoor > levelled && path[atDoor + 1].dir === "up" && path[atDoor + 1].y === 115.5);
  for (const p of path) assert.ok(p.x >= 96 && p.x <= 112 && p.y >= 92 && p.y <= 118);
  assert.equal(done, 4 + 32 + 48 - 1, "2 px down, 16 px right, 24 px up at 0.5 px a tick");
  // Pinky, already on the door column, just rises.
  const pinky = Object.assign({}, createGhosts(maze)[1], { state: "leaving" });
  const r = run(pinky, 48, 0.5, null).ghost;
  assert.deepEqual({ x: r.x, y: r.y, dir: r.dir, state: r.state }, { x: 112, y: 92, dir: "left", state: "normal" });
});

test("stepGhost never mutates its arguments and returns a new ghost", () => {
  const g = Object.freeze(ghostAt("blinky", 4, 4, "right", "normal", { x: centre(4) - 2 }));
  const frozenBoard = Object.freeze({ width: board.width, height: board.height, tiles: Object.freeze(board.tiles.slice()) });
  const before = JSON.stringify([g, frozenBoard]);
  const r = stepGhost(g, frozenBoard, maze, 5, { x: 4, y: -3 }, seed(1));
  assert.equal(JSON.stringify([g, frozenBoard]), before);
  assert.notEqual(r.ghost, g);
  assert.equal(r.ghost.dir, "up");
  assert.doesNotThrow(() => stepGhost(g, frozenBoard, maze, 0, { x: 4, y: -3 }, seed(1)));
  assert.deepEqual(stepGhost(g, frozenBoard, maze, 0, { x: 4, y: -3 }, seed(1)).ghost, g, "zero px changes nothing");
  assert.deepEqual(stepGhost(g, frozenBoard, maze, NaN, { x: 4, y: -3 }, seed(1)).ghost, g, "junk px is zero");
});
