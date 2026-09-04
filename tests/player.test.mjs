import { test } from "node:test";
import assert from "node:assert/strict";
import { LEVEL_1 } from "../lib/maze-data.mjs";
import { parseMaze, tileAt, isWalkable } from "../lib/maze.mjs";
import { DIRS } from "../lib/input.mjs";
import { playerSpeed, playerSpeedFraction } from "../lib/speeds.mjs";
import { createPlayer, stepPlayer, tileOf, CORNER_TOLERANCE, TILE_PX } from "../lib/player.mjs";

const maze = parseMaze(LEVEL_1);
const TICK = 1 / 60;
const SPEED_1 = playerSpeed(1);
const centre = t => t * TILE_PX + TILE_PX / 2;

/** A player at the centre of tile (tx, ty) facing dir. */
function at(tx, ty, dir) {
  return Object.assign(createPlayer(maze), { x: centre(tx), y: centre(ty), dir });
}

/** Run n ticks with a constant wantDir (or a function of the tick index). */
function run(player, n, want, speed = SPEED_1) {
  let p = player;
  let moved = 0;
  for (let i = 0; i < n; i++) {
    const w = typeof want === "function" ? want(i, p) : want;
    const r = stepPlayer(p, maze, w, speed, TICK);
    p = r.player;
    moved += r.moved;
  }
  return { player: p, moved };
}

test("createPlayer starts at the spawn tile centre facing left, not stopped, no buffer", () => {
  const p = createPlayer(maze);
  assert.equal(p.x, centre(maze.spawn.x));
  assert.equal(p.y, centre(maze.spawn.y));
  assert.equal(p.dir, "left");
  assert.equal(p.wantDir, null);
  assert.equal(p.stopped, false);
  assert.equal(p.distance, 0);
  assert.deepEqual(tileOf(p, maze), maze.spawn);
});

test("moves left at level-1 speed: 60 ticks cover 60.6 px", () => {
  const start = at(26, 4, "left"); // row 4 is open all the way across
  const { player, moved } = run(start, 60, null);
  assert.ok(Math.abs((start.x - player.x) - 60.6) < 0.01, `delta ${start.x - player.x}`);
  assert.ok(Math.abs(moved - 60.6) < 0.01, `moved ${moved}`);
  assert.ok(Math.abs(player.distance - 60.6) < 0.01);
  assert.equal(player.y, start.y);
  assert.equal(player.dir, "left");
  assert.equal(player.stopped, false);
});

test("never enters a wall and stays on the lane centre at every speed in the table", () => {
  // A tiny seeded LCG so the scripted direction sequence is repeatable.
  let seed = 12345;
  const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const names = Object.keys(DIRS);
  for (const level of [1, 2, 5, 21]) {
    const speed = playerSpeed(level);
    let p = createPlayer(maze);
    let want = null;
    for (let i = 0; i < 20000; i++) {
      if (i % 7 === 0) want = rand() < 0.15 ? null : names[Math.floor(rand() * 4)];
      const r = stepPlayer(p, maze, want, speed, TICK);
      p = r.player;
      const t = tileOf(p, maze);
      assert.ok(isWalkable(tileAt(maze, t.x, t.y)), `level ${level} tick ${i}: in ${tileAt(maze, t.x, t.y)} at ${p.x},${p.y}`);
      const d = DIRS[p.dir];
      if (r.moved > 0) {
        if (d.dx !== 0) assert.equal(p.y, centre(t.y), `level ${level} tick ${i}: off lane y ${p.y}`);
        else assert.equal(p.x, centre(t.x), `level ${level} tick ${i}: off lane x ${p.x}`);
      }
      assert.ok(p.x >= -4 && p.x < 228, `level ${level} tick ${i}: x ${p.x} outside the wrap band`);
    }
    assert.equal(playerSpeedFraction(level) * 9.46875, speed);
  }
});

test("pre-turn buffering: up held two tiles early turns exactly at the junction centre, not before", () => {
  // Row 4, moving left from tile 6: up is a wall at columns 6 and 5, open at column 4.
  assert.ok(!isWalkable(tileAt(maze, 6, 3)) && !isWalkable(tileAt(maze, 5, 3)) && isWalkable(tileAt(maze, 4, 3)));
  let p = at(6, 4, "left");
  let turnedAt = null;
  for (let i = 0; i < 200 && turnedAt === null; i++) {
    p = stepPlayer(p, maze, "up", SPEED_1, TICK).player;
    if (p.dir === "up") turnedAt = { x: p.x, y: p.y, tick: i };
    else {
      assert.equal(p.dir, "left");
      assert.ok(p.x > centre(4), `still before the junction at tick ${i}: x ${p.x}`);
      assert.equal(p.wantDir, "up", "the buffer holds while the turn is illegal");
    }
  }
  assert.ok(turnedAt, "turned");
  assert.equal(turnedAt.x, centre(4), "snapped to the junction's x centre");
  // The turn tick also advances, so y is at most one tick's travel above the row.
  assert.ok(turnedAt.y < centre(4) && turnedAt.y > centre(4) - 1.1, `turned from the row centre, y ${turnedAt.y}`);
  assert.equal(p.wantDir, null, "buffer consumed");
  // Continues upward afterwards, x locked to the lane.
  const after = run(p, 30, null).player;
  assert.ok(after.y < centre(4));
  assert.equal(after.x, centre(4));
  assert.equal(after.dir, "up");
});

test("a single press into a wall keeps the buffer and turns at the next legal tile", () => {
  let p = at(6, 4, "left");
  p = stepPlayer(p, maze, "up", SPEED_1, TICK).player; // tap once
  assert.equal(p.dir, "left");
  assert.equal(p.wantDir, "up");
  const r = run(p, 100, null); // no further input at all
  assert.equal(r.player.dir, "up");
  assert.equal(r.player.x, centre(4));
  assert.equal(r.player.wantDir, null);
});

test("a new press replaces the buffered direction", () => {
  let p = at(6, 4, "left");
  p = stepPlayer(p, maze, "up", SPEED_1, TICK).player;
  p = stepPlayer(p, maze, "down", SPEED_1, TICK).player;
  assert.equal(p.wantDir, "down");
});

test("holding the current direction does not cancel a buffered turn", () => {
  let p = at(6, 4, "left");
  p = stepPlayer(p, maze, "up", SPEED_1, TICK).player; // tap up
  let turned = null;
  for (let i = 0; i < 100 && turned === null; i++) {
    p = stepPlayer(p, maze, "left", SPEED_1, TICK).player; // keep holding left
    if (p.dir === "up") turned = { x: p.x, y: p.y };
    else assert.equal(p.wantDir, "up", `buffer kept at tick ${i}`);
  }
  assert.ok(turned, "the tapped pre-turn is still taken");
  assert.equal(turned.x, centre(4));
  assert.ok(turned.y < centre(4));
});

test("reversal is immediate mid-tile, without a snap", () => {
  let p = run(createPlayer(maze), 3, null).player;
  const before = p.x;
  assert.ok(before % TILE_PX !== TILE_PX / 2, "mid-tile");
  p = stepPlayer(p, maze, "right", SPEED_1, TICK).player;
  assert.equal(p.dir, "right");
  assert.ok(p.x > before, `moved right from ${before} to ${p.x}`);
  assert.ok(p.x - before < 1.1, "no snap: only one tick's travel");
  assert.equal(p.wantDir, null);
});

test("a wall ahead clamps to the tile centre and stops", () => {
  // Spawn row: tiles 12..9 to the left are pellets, 8 is wall.
  assert.ok(!isWalkable(tileAt(maze, 8, 23)));
  const r = run(createPlayer(maze), 120, null);
  assert.equal(r.player.x, centre(9));
  assert.equal(r.player.y, centre(23));
  assert.equal(r.player.stopped, true);
  assert.equal(r.player.dir, "left");
  assert.ok(Math.abs(r.moved - (centre(13) - centre(9))) < 1e-9, `moved ${r.moved}`);
  const again = stepPlayer(r.player, maze, null, SPEED_1, TICK);
  assert.equal(again.moved, 0);
  assert.equal(again.player.x, centre(9));
  // Any legal direction restarts it at once.
  const down = stepPlayer(r.player, maze, "down", SPEED_1, TICK).player;
  assert.equal(down.dir, "down");
  assert.equal(down.stopped, false);
  assert.ok(down.y > centre(23));
});

test("a stopped player holding a still-illegal direction stays put", () => {
  const stuck = run(createPlayer(maze), 120, null).player;
  const r = run(stuck, 10, "up"); // (9,22) is wall
  assert.equal(r.moved, 0);
  assert.equal(r.player.x, centre(9));
  assert.equal(r.player.wantDir, "up");
});

test("tunnel: walking left from (1,14) wraps to the right edge and keeps going", () => {
  let p = at(1, 14, "left");
  let wrapped = null;
  for (let i = 0; i < 40 && wrapped === null; i++) {
    const prev = p.x;
    p = stepPlayer(p, maze, null, SPEED_1, TICK).player;
    if (p.x > prev) wrapped = { tick: i, x: p.x, prev };
  }
  assert.ok(wrapped, "wrapped");
  // `prev` is the x before the tick that crossed the -4 wrap line.
  assert.ok(wrapped.prev >= -4 && wrapped.prev < -4 + 1.1, `left the map at ${wrapped.prev}`);
  assert.ok(wrapped.x >= 218.9 && wrapped.x < 220, `re-entered at ${wrapped.x}`);
  assert.equal(tileOf(p, maze).x, 27);
  assert.equal(p.y, centre(14));
  // The far side of the tunnel row is open for five tiles (27..23); 20 ticks stay inside it.
  const later = run(p, 20, null).player;
  assert.ok(later.x < wrapped.x, "continues left along the far side");
  assert.equal(later.dir, "left");
  assert.equal(later.stopped, false);
  assert.equal(run(p, 120, null).player.x, centre(23), "then stops at the wall at column 22");
});

test("tunnel: walking right from (26,14) wraps to the left edge and keeps going", () => {
  let p = at(26, 14, "right");
  let wrapped = null;
  for (let i = 0; i < 40 && wrapped === null; i++) {
    const prev = p.x;
    p = stepPlayer(p, maze, null, SPEED_1, TICK).player;
    if (p.x < prev) wrapped = { x: p.x, prev };
  }
  assert.ok(wrapped, "wrapped");
  assert.ok(wrapped.prev >= 228 - 1.1 && wrapped.prev < 228, `left the map at ${wrapped.prev}`);
  assert.ok(wrapped.x >= 4 && wrapped.x < 5.1, `re-entered at ${wrapped.x}`);
  assert.equal(tileOf(p, maze).x, 0);
  const later = run(p, 20, null).player;
  assert.ok(later.x > wrapped.x);
  assert.equal(later.dir, "right");
  assert.equal(later.stopped, false);
  assert.equal(run(p, 120, null).player.x, centre(4), "then stops at the wall at column 5");
});

test("tileOf wraps a player who is past the edge", () => {
  assert.deepEqual(tileOf({ x: -3, y: centre(14) }, maze), { x: 27, y: 14 });
  assert.deepEqual(tileOf({ x: 226, y: centre(14) }, maze), { x: 0, y: 14 });
});

test("stepPlayer does not mutate its arguments", () => {
  const p = Object.freeze(createPlayer(maze));
  const board = Object.freeze({ width: maze.width, height: maze.height, tiles: Object.freeze(maze.tiles.slice()) });
  const snapshot = JSON.stringify([p, board]);
  const r = stepPlayer(p, board, "up", SPEED_1, TICK);
  assert.equal(JSON.stringify([p, board]), snapshot);
  assert.notEqual(r.player, p);
});

test("CORNER_TOLERANCE is exported for tuning", () => {
  assert.equal(CORNER_TOLERANCE, 4);
  assert.equal(TILE_PX, 8);
});
