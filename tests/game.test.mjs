import { test } from "node:test";
import assert from "node:assert/strict";
import { LEVEL_1 } from "../lib/maze-data.mjs";
import { parseMaze, tileAt, isWalkable, TILE } from "../lib/maze.mjs";
import { DIRS } from "../lib/input.mjs";
import { tileOf, TILE_PX } from "../lib/player.mjs";
import { createState, step, TICK, MAX_DT } from "../lib/game.mjs";

const maze = parseMaze(LEVEL_1);
const centre = t => t * TILE_PX + TILE_PX / 2;

function withPlayer(state, patch) {
  return Object.assign({}, state, { player: Object.assign({}, state.player, patch) });
}

test("TICK is 1/60 and the dt guard is 50 ms", () => {
  assert.equal(TICK, 1 / 60);
  assert.equal(MAX_DT, 0.05);
});

test("createState counts 260 pellets and starts with score 0, three lives, level 1", () => {
  const s = createState(maze);
  assert.equal(s.pelletsLeft, 260);
  assert.equal(s.score, 0);
  assert.equal(s.highScore, 0);
  assert.equal(s.lives, 3);
  assert.equal(s.level, 1);
  assert.equal(s.tick, 0);
  assert.equal(s.pauseTicks, 0);
  assert.equal(s.cleared, false);
  assert.equal(s.maze, maze);
  assert.equal(s.board.width, maze.width);
  assert.equal(s.board.height, maze.height);
  assert.notEqual(s.board.tiles, maze.tiles, "the board is a copy");
  assert.deepEqual(s.board.tiles, maze.tiles);
  assert.deepEqual(tileOf(s.player, s.board), maze.spawn);
});

test("createState accepts a level option", () => {
  assert.equal(createState(maze, { level: 3 }).level, 3);
});

test("one tick onto a pellet: +10, tile emptied, event, then a one-tick pause; input untouched", () => {
  // Tile 12 on the spawn row is a pellet; place the player one tick from its edge.
  assert.equal(tileAt(maze, 12, 23), TILE.PELLET);
  const s0 = withPlayer(createState(maze), { x: centre(13) - 3.5, dir: "left" });
  const frozen = JSON.stringify(s0);
  const input = Object.freeze({ wantDir: null });
  const r1 = step(s0, input, TICK);
  assert.deepEqual(r1.events, [{ type: "pellet", tile: { x: 12, y: 23 } }]);
  assert.equal(r1.state.score, 10);
  assert.equal(r1.state.pelletsLeft, 259);
  assert.equal(tileAt(r1.state.board, 12, 23), TILE.EMPTY);
  assert.equal(r1.state.pauseTicks, 1);
  assert.equal(r1.state.tick, 1);
  assert.equal(JSON.stringify(s0), frozen, "original state untouched");
  assert.equal(tileAt(s0.board, 12, 23), TILE.PELLET);
  assert.equal(tileAt(maze, 12, 23), TILE.PELLET, "the maze itself is never edited");

  const r2 = step(r1.state, input, TICK);
  assert.deepEqual(r2.events, []);
  assert.equal(r2.state.player.x, r1.state.player.x, "paused: no movement");
  assert.equal(r2.state.pauseTicks, 0);
  assert.equal(r2.state.tick, 2);

  const r3 = step(r2.state, input, TICK);
  assert.ok(r3.state.player.x < r2.state.player.x, "moving again");
  assert.deepEqual(r3.events, []);
});

test("a power pellet scores 50 and pauses three ticks", () => {
  // (1,3) is a power pellet; approach from (1,4) moving up.
  assert.equal(tileAt(maze, 1, 3), TILE.POWER);
  const s0 = withPlayer(createState(maze), { x: centre(1), y: centre(4) - 3.5, dir: "up" });
  const r1 = step(s0, { wantDir: null }, TICK);
  assert.deepEqual(r1.events, [{ type: "power", tile: { x: 1, y: 3 } }]);
  assert.equal(r1.state.score, 50);
  assert.equal(r1.state.pelletsLeft, 259);
  assert.equal(r1.state.pauseTicks, 3);
  assert.equal(tileAt(r1.state.board, 1, 3), TILE.EMPTY);
  let s = r1.state;
  for (let i = 0; i < 3; i++) {
    const r = step(s, { wantDir: null }, TICK);
    assert.equal(r.state.player.y, s.player.y, `paused tick ${i}`);
    s = r.state;
  }
  assert.equal(s.pauseTicks, 0);
  assert.ok(step(s, { wantDir: null }, TICK).state.player.y < s.player.y, "moving again after the pause");
});

test("a direction pressed during a pause is buffered, not lost", () => {
  const s0 = withPlayer(createState(maze), { x: centre(13) - 3.5, dir: "left" });
  const paused = step(s0, { wantDir: null }, TICK).state;
  assert.equal(paused.pauseTicks, 1);
  const r = step(paused, { wantDir: "right" }, TICK);
  assert.equal(r.state.player.x, paused.player.x, "still paused");
  assert.equal(r.state.player.wantDir, "right");
  const next = step(r.state, { wantDir: null }, TICK).state;
  assert.equal(next.player.dir, "right");
});

test("holding the current direction through pellet pauses keeps a tapped pre-turn", () => {
  // Row 4, moving left from tile 6: pellets at 5 and 4, up legal only at 4.
  // Every pellet eaten is a pause tick, so the pause branch must buffer
  // exactly like stepPlayer or the held key wipes the tap.
  assert.equal(tileAt(maze, 5, 4), TILE.PELLET);
  assert.equal(tileAt(maze, 4, 4), TILE.PELLET);
  assert.ok(isWalkable(tileAt(maze, 4, 3)) && !isWalkable(tileAt(maze, 5, 3)));
  let s = withPlayer(createState(maze), { x: centre(6), y: centre(4), dir: "left" });
  s = step(s, { wantDir: "up" }, TICK).state; // tap up
  let turned = null;
  let paused = 0;
  for (let i = 0; i < 200 && turned === null; i++) {
    if (s.pauseTicks > 0) paused++;
    s = step(s, { wantDir: "left" }, TICK).state; // hold left
    if (s.player.dir === "up") turned = { x: s.player.x, tick: i };
    else assert.equal(s.player.wantDir, "up", `buffer kept at tick ${i} (pauseTicks ${s.pauseTicks})`);
  }
  assert.ok(paused >= 1, "at least one pellet pause happened before the junction");
  assert.ok(turned, "the tapped up turn is still taken");
  assert.equal(turned.x, centre(4), "taken at the junction");
});

test("an invalid wantDir during a pause is ignored, not stored", () => {
  const s0 = withPlayer(createState(maze), { x: centre(13) - 3.5, dir: "left" });
  const paused = step(s0, { wantDir: null }, TICK).state;
  assert.equal(paused.pauseTicks, 1);
  for (const bad of ["sideways", "", 7, {}, true]) {
    const r = step(paused, { wantDir: bad }, TICK);
    assert.equal(r.state.player.wantDir, null, `ignored ${String(bad)}`);
    assert.doesNotThrow(() => step(r.state, { wantDir: null }, TICK), `next tick after ${String(bad)}`);
  }
  // A valid perpendicular tap during the pause is buffered; the current direction is a no-op.
  assert.equal(step(paused, { wantDir: "up" }, TICK).state.player.wantDir, "up");
  assert.equal(step(paused, { wantDir: "left" }, TICK).state.player.wantDir, null);
});

test("step rejects a dt above 50 ms or a non-finite or negative one", () => {
  const s = createState(maze);
  assert.throws(() => step(s, { wantDir: null }, 0.0501), /dt/);
  assert.throws(() => step(s, { wantDir: null }, 0.25), /dt/);
  assert.throws(() => step(s, { wantDir: null }, NaN), /dt/);
  assert.throws(() => step(s, { wantDir: null }, -TICK), /dt/);
  assert.doesNotThrow(() => step(s, { wantDir: null }, MAX_DT));
  assert.doesNotThrow(() => step(s, { wantDir: null }, 0));
});

test("step tolerates a missing input object", () => {
  const s = createState(maze);
  assert.doesNotThrow(() => step(s, undefined, TICK));
  assert.doesNotThrow(() => step(s, {}, TICK));
});

test("step is deterministic: the same inputs give the same states", () => {
  let sa = createState(maze);
  let sb = createState(maze);
  const script = ["left", "left", "up", null, "down", "right", null, null, "up"];
  for (let i = 0; i < 600; i++) {
    const want = script[i % script.length];
    sa = step(sa, { wantDir: want }, TICK).state;
    sb = step(sb, { wantDir: want }, TICK).state;
  }
  assert.deepEqual(sa, sb);
  assert.ok(sa.score > 0);
});

/** Neighbours of a tile over walkable tiles, with tunnel wrap. */
function neighbours(board, tile) {
  const out = [];
  for (const name of Object.keys(DIRS)) {
    const d = DIRS[name];
    const nx = ((tile.x + d.dx) % board.width + board.width) % board.width;
    const ny = tile.y + d.dy;
    if (ny < 0 || ny >= board.height || !isWalkable(tileAt(board, nx, ny))) continue;
    out.push({ x: nx, y: ny, dir: name });
  }
  return out;
}

/** BFS from `from`: the nearest remaining pellet and the first step's direction towards `to`. */
function bfs(board, from, to) {
  const key = t => t.y * board.width + t.x;
  const firstDir = new Map([[key(from), null]]);
  const queue = [from];
  let nearest = null;
  while (queue.length) {
    const cur = queue.shift();
    const kind = tileAt(board, cur.x, cur.y);
    if (nearest === null && (kind === TILE.PELLET || kind === TILE.POWER)) nearest = cur;
    if (to && cur.x === to.x && cur.y === to.y) return { nearest, dir: firstDir.get(key(cur)) };
    for (const n of neighbours(board, cur)) {
      const k = key(n);
      if (firstDir.has(k)) continue;
      firstDir.set(k, firstDir.get(key(cur)) ?? n.dir);
      queue.push(n);
    }
  }
  return { nearest, dir: null };
}

test("autopilot clears every pellet through the real movement engine", () => {
  let s = createState(maze);
  const events = [];
  let target = null;
  let ticks = 0;
  while (s.pelletsLeft > 0 && ticks < 200000) {
    const tile = tileOf(s.player, s.board);
    if (!target || tileAt(s.board, target.x, target.y) === TILE.EMPTY) target = bfs(s.board, tile).nearest;
    assert.ok(target, `no pellet reachable from ${tile.x},${tile.y} with ${s.pelletsLeft} left`);
    const want = bfs(s.board, tile, target).dir;
    const r = step(s, { wantDir: want }, TICK);
    s = r.state;
    events.push(...r.events);
    ticks++;
  }
  assert.equal(s.pelletsLeft, 0, `stalled after ${ticks} ticks with ${s.pelletsLeft} pellets left`);
  assert.equal(s.score, 256 * 10 + 4 * 50); // 2760
  assert.equal(s.cleared, true);
  assert.equal(events.filter(e => e.type === "pellet").length, 256);
  assert.equal(events.filter(e => e.type === "power").length, 4);
  assert.equal(events.filter(e => e.type === "level-clear").length, 1);
  assert.equal(events[events.length - 1].type, "level-clear", "level-clear is the last event");
  for (const t of s.board.tiles) assert.ok(t !== TILE.PELLET && t !== TILE.POWER);
  // Further steps are no-ops that emit nothing.
  const x = s.player.x, y = s.player.y;
  for (let i = 0; i < 10; i++) {
    const r = step(s, { wantDir: "up" }, TICK);
    assert.deepEqual(r.events, []);
    assert.equal(r.state.score, 2760);
    assert.equal(r.state.cleared, true);
    assert.equal(r.state.player.x, x);
    assert.equal(r.state.player.y, y);
    s = r.state;
  }
});
