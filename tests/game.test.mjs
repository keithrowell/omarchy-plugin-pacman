import { test } from "node:test";
import assert from "node:assert/strict";
import { LEVEL_1 } from "../lib/maze-data.mjs";
import { parseMaze, tileAt, isWalkable, TILE } from "../lib/maze.mjs";
import { DIRS } from "../lib/input.mjs";
import { createPlayer, tileOf, TILE_PX } from "../lib/player.mjs";
import {
  createState, step, resetGame, TICK, MAX_DT,
  GHOST_SCORES, EXTRA_LIFE_SCORE, READY_TICKS, DYING_TICKS, LEVEL_CLEAR_TICKS, EATEN_FREEZE_TICKS,
  GLOBAL_DOT_LIMITS, personalDotLimit, noPelletReleaseTicks,
  ghostFlashing, anyFrightened, elroyStage, ghostSpeedFor,
} from "../lib/game.mjs";
import { playerSpeed, playerFrightenedSpeed, ghostSpeed, ghostFrightenedSpeed, tunnelSpeed, elroySpeed } from "../lib/speeds.mjs";
import { frightenedTicks } from "../lib/modes.mjs";
import { seed } from "../lib/rng.mjs";
import { createGhosts } from "../lib/ghosts.mjs";

const maze = parseMaze(LEVEL_1);
const centre = t => t * TILE_PX + TILE_PX / 2;

function withPlayer(state, patch) {
  return Object.assign({}, state, { player: Object.assign({}, state.player, patch) });
}

/** A game already in play (no ready pause) with any extra options. */
function fresh(opts) {
  return createState(maze, Object.assign({ ready: false }, opts));
}

function ghostNamed(state, name) {
  return state.ghosts.find(g => g.name === name);
}

function withGhost(state, name, patch) {
  return Object.assign({}, state, { ghosts: state.ghosts.map(g => (g.name === name ? Object.assign({}, g, patch) : g)) });
}

/** A ghost object at the centre of tile (tx, ty). */
function ghostAt(name, tx, ty, dir, state, extra) {
  return Object.assign({ name, x: centre(tx), y: centre(ty), dir, state, dotCounter: 0, reverse: false }, extra || {});
}

/** Run n ticks with a constant (or per-tick function) wantDir; returns { state, events }. */
function run(state, n, want) {
  let s = state;
  const events = [];
  for (let i = 0; i < n; i++) {
    const w = typeof want === "function" ? want(i, s) : (want === undefined ? null : want);
    const r = step(s, { wantDir: w }, TICK);
    s = r.state;
    for (const e of r.events) events.push(Object.assign({ tick: s.tick }, e));
  }
  return { state: s, events };
}

/**
 * Eat the next remaining pellet (never a power pellet) by teleporting the
 * player onto it, scanning from the bottom row up so the player stays far
 * from the ghosts' start. Steps until the pellet event fires (a pellet pause
 * tick may come first). Returns the state after the eat.
 */
function eatNext(state) {
  let target = null;
  for (let y = state.board.height - 1; y >= 0 && !target; y--) {
    for (let x = 0; x < state.board.width; x++) {
      if (tileAt(state.board, x, y) === TILE.PELLET) { target = { x, y }; break; }
    }
  }
  assert.ok(target, "a pellet remains");
  let s = withPlayer(state, { x: centre(target.x), y: centre(target.y), dir: "left", wantDir: null, stopped: false });
  for (let i = 0; i < 4; i++) {
    const r = step(s, { wantDir: null }, TICK);
    s = r.state;
    if (r.events.some(e => e.type === "pellet")) return s;
    s = withPlayer(s, { x: centre(target.x), y: centre(target.y) });
  }
  assert.fail(`pellet at ${target.x},${target.y} not eaten`);
}

function eatN(state, n) {
  let s = state;
  for (let i = 0; i < n; i++) s = eatNext(s);
  return s;
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

test("createState takes the persisted high score; junk means 0", () => {
  assert.equal(createState(maze, { highScore: 900 }).highScore, 900);
  assert.equal(createState(maze, { highScore: 12.9 }).highScore, 12);
  assert.equal(createState(maze, { highScore: -5 }).highScore, 0);
  assert.equal(createState(maze, { highScore: "900" }).highScore, 0);
  assert.equal(createState(maze, { highScore: NaN }).highScore, 0);
  assert.equal(createState(maze).highScore, 0);
});

test("the high score follows the score live once beaten, and not before", () => {
  let s = fresh({ ghosts: false, highScore: 95 });
  s = eatN(s, 9);
  assert.equal(s.score, 90);
  assert.equal(s.highScore, 95, "not beaten yet");
  s = eatNext(s);
  assert.equal(s.score, 100);
  assert.equal(s.highScore, 100, "raised on the tick it is beaten");
  s = eatNext(s);
  assert.equal(s.highScore, 110, "and follows from then on");
  // A power pellet's 50 counts too.
  const powered = withPlayer(fresh({ highScore: 0 }), { x: centre(1), y: centre(4) - 3.5, dir: "up" });
  assert.equal(step(powered, { wantDir: null }, TICK).state.highScore, 50);
});

test("one tick onto a pellet: +10, tile emptied, event, then a one-tick pause; input untouched", () => {
  // Tile 12 on the spawn row is a pellet; place the player one tick from its edge.
  assert.equal(tileAt(maze, 12, 23), TILE.PELLET);
  const s0 = withPlayer(createState(maze, { ready: false }), { x: centre(13) - 3.5, dir: "left" });
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
  const s0 = withPlayer(createState(maze, { ready: false }), { x: centre(1), y: centre(4) - 3.5, dir: "up" });
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
  const s0 = withPlayer(createState(maze, { ready: false }), { x: centre(13) - 3.5, dir: "left" });
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
  let s = withPlayer(createState(maze, { ready: false }), { x: centre(6), y: centre(4), dir: "left" });
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
  const s0 = withPlayer(createState(maze, { ready: false }), { x: centre(13) - 3.5, dir: "left" });
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
  let s = createState(maze, { ghosts: false });
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

// --- Ghosts, modes and frightened ---------------------------------------

test("createState: four ghosts, the ready phase, scatter mode, RNG from the seed; options switch each off", () => {
  const s = createState(maze);
  assert.deepEqual(s.ghosts, createGhosts(maze));
  assert.equal(s.phase, "ready");
  assert.equal(s.phaseTicks, 0);
  assert.equal(s.freezeTicks, 0);
  assert.equal(s.mode, "scatter");
  assert.equal(s.modeClock, 0);
  assert.equal(s.frightTicks, 0);
  assert.equal(s.chain, 0);
  assert.equal(s.lastEaten, null);
  assert.deepEqual(s.globalDots, { active: false, count: 0 });
  assert.equal(s.dotTimer, 0);
  assert.equal(s.extraLifeAwarded, false);
  assert.equal(s.rng, seed(1));
  assert.equal(createState(maze, { seed: 7 }).rng, seed(7));
  assert.equal(createState(maze, { ready: false }).phase, "playing");
  assert.deepEqual(createState(maze, { ghosts: false }).ghosts, []);
});

test("the ready phase holds everything for READY_TICKS (2 s), buffers input, then play starts", () => {
  assert.equal(READY_TICKS, 120);
  const s0 = createState(maze);
  const r = run(s0, READY_TICKS - 1, "up");
  assert.equal(r.state.phase, "ready");
  assert.deepEqual(r.state.player, Object.assign({}, s0.player, { wantDir: "up" }), "buffered, not moved");
  assert.deepEqual(r.state.ghosts, s0.ghosts, "ghosts wait too");
  assert.equal(r.state.modeClock, 0);
  assert.deepEqual(r.events, []);
  const p = run(r.state, 1).state;
  assert.equal(p.phase, "playing");
  assert.equal(p.phaseTicks, 0);
  const moved = run(p, 1).state;
  assert.ok(moved.player.x < p.player.x, "moving left once play starts");
});

test("Pinky leaves the house at once on level 1 and comes out above the door facing left", () => {
  const s = fresh();
  const one = run(s, 1).state;
  assert.equal(ghostNamed(one, "pinky").state, "leaving");
  assert.equal(ghostNamed(one, "inky").state, "house");
  assert.equal(ghostNamed(one, "clyde").state, "house");
  const r = run(one, 120);
  const exit = r.events.find(e => e.type === "ghost-exit");
  assert.ok(exit && exit.ghost === "pinky", "ghost-exit event for Pinky");
  const pinky = ghostNamed(run(one, exit.tick - one.tick).state, "pinky");
  assert.deepEqual({ x: pinky.x, y: pinky.y, dir: pinky.dir, state: pinky.state }, { x: 112, y: 92, dir: "left", state: "normal" });
});

test("mode flips at the schedule times, with a mode event, and every living ghost turns back", () => {
  const s = fresh();
  const to419 = run(s, 419);
  assert.equal(to419.state.mode, "scatter");
  assert.ok(!to419.events.some(e => e.type === "mode"));
  const flip = step(to419.state, { wantDir: null }, TICK);
  assert.equal(flip.state.mode, "chase");
  assert.equal(flip.state.modeClock, 420);
  assert.deepEqual(flip.events.filter(e => e.type === "mode"), [{ type: "mode", mode: "chase" }]);
  for (const g of flip.state.ghosts) {
    if (g.state === "normal") assert.equal(g.reverse, true, `${g.name} flagged`);
  }
  const blinkyDir = ghostNamed(flip.state, "blinky").dir;
  // The flag is consumed at the next tile centre, within a tile's travel.
  let s2 = flip.state;
  let reversed = false;
  for (let i = 0; i < 10 && !reversed; i++) {
    s2 = step(s2, { wantDir: null }, TICK).state;
    const b = ghostNamed(s2, "blinky");
    if (b.dir === DIRS[blinkyDir].opposite) reversed = true;
  }
  assert.ok(reversed, "Blinky reversed");
  assert.equal(ghostNamed(s2, "blinky").reverse, false);
  // Next boundaries: 27 s back to scatter, 34 s chase (without ghosts, so no
  // death resets the clock on the way).
  const alone = fresh({ ghosts: false });
  const at1620 = run(alone, 1620);
  assert.equal(at1620.state.mode, "scatter");
  assert.deepEqual(at1620.events.filter(e => e.type === "mode").map(e => [e.tick, e.mode]), [[420, "chase"], [1620, "scatter"]]);
  assert.equal(run(alone, 1619).state.mode, "chase");
  assert.equal(run(alone, 2040).state.mode, "chase");
  assert.equal(run(alone, 2039).state.mode, "scatter");
});

test("a power pellet frightens and reverses the ghosts in the maze for the level's time; house ghosts are untouched", () => {
  // (1,3) is a power pellet; approach from (1,4) moving up. Put Blinky out on
  // row 4 heading right, well away.
  let s = withPlayer(fresh(), { x: centre(1), y: centre(4) - 3.5, dir: "up" });
  s = withGhost(s, "blinky", { x: centre(20), y: centre(4), dir: "right" });
  const r = step(s, { wantDir: null }, TICK);
  assert.deepEqual(r.events.filter(e => e.type === "power"), [{ type: "power", tile: { x: 1, y: 3 } }]);
  assert.equal(r.state.frightTicks, frightenedTicks(1), "360 ticks on level 1, untouched by the pellet tick");
  assert.equal(r.state.chain, 0);
  assert.equal(anyFrightened(r.state), true);
  const blinky = ghostNamed(r.state, "blinky");
  assert.equal(blinky.state, "frightened");
  // Blinky was mid-tile; the reversal happens at the next centre.
  assert.ok(blinky.reverse === true || blinky.dir === "left");
  assert.equal(ghostNamed(r.state, "pinky").state, "leaving", "already released, untouched");
  assert.equal(ghostNamed(r.state, "inky").state, "house");
  assert.equal(ghostNamed(r.state, "clyde").state, "house");
  // The player speeds up while any ghost is frightened.
  const paused = run(r.state, 3).state; // the power-pellet pause
  const move = step(paused, { wantDir: null }, TICK).state;
  const px = Math.abs(move.player.y - paused.player.y);
  assert.ok(Math.abs(px - playerFrightenedSpeed(1) * TILE_PX * TICK) < 1e-9, `frightened speed, moved ${px}`);
  assert.ok(Math.abs(ghostSpeedFor(move, ghostNamed(move, "blinky")) - ghostFrightenedSpeed(1)) < 1e-9);
  // The mode clock pauses while frightened; the fright counts down.
  const later = run(r.state, 100).state;
  assert.equal(later.modeClock, r.state.modeClock);
  assert.equal(later.frightTicks, frightenedTicks(1) - 100);
  // Flashing near the end, not at the start.
  assert.equal(ghostFlashing(r.state), false);
  assert.equal(ghostFlashing(Object.assign({}, r.state, { frightTicks: 120 })), true);
});

test("a level with no frightened time: the power pellet reverses the ghosts, scores 50, no fright", () => {
  let s = withPlayer(fresh({ level: 19 }), { x: centre(1), y: centre(4) - 3.5, dir: "up" });
  s = withGhost(s, "blinky", { x: centre(20) + 1, y: centre(4), dir: "right" });
  const r = step(s, { wantDir: null }, TICK);
  assert.equal(r.state.score, 50);
  assert.equal(r.state.frightTicks, 0);
  const b = ghostNamed(r.state, "blinky");
  assert.equal(b.state, "normal");
  assert.equal(b.reverse, true);
  assert.equal(anyFrightened(r.state), false);
  assert.equal(ghostFlashing(r.state), false);
  assert.equal(run(r.state, 10).state.modeClock, r.state.modeClock + 10, "the mode clock keeps running");
});

test("when the fright runs out the frightened ghosts turn normal without reversing; the house is unaffected", () => {
  let s = fresh();
  s = Object.assign({}, s, {
    frightTicks: 3,
    ghosts: [
      ghostAt("blinky", 20, 4, "right", "frightened"),
      ghostAt("pinky", 22, 4, "right", "frightened"),
      ghostAt("inky", 12, 14, "up", "house"),
      ghostAt("clyde", 16, 14, "up", "house"),
    ],
  });
  const two = run(s, 2).state;
  assert.equal(two.frightTicks, 1);
  assert.equal(ghostNamed(two, "blinky").state, "frightened");
  const out = run(two, 1).state;
  assert.equal(out.frightTicks, 0);
  assert.equal(ghostNamed(out, "blinky").state, "normal");
  assert.equal(ghostNamed(out, "pinky").state, "normal");
  assert.equal(ghostNamed(out, "blinky").reverse, false);
  assert.equal(ghostNamed(out, "inky").state, "house");
  // Inky is next out (personal limit 30): feed him pellets and he leaves normal.
  let fed = out;
  for (let i = 0; i < 30; i++) fed = eatNext(fed);
  assert.equal(ghostNamed(fed, "inky").state, "leaving");
  const r = run(fed, 200);
  const exit = r.events.find(e => e.type === "ghost-exit" && e.ghost === "inky");
  assert.ok(exit, "Inky came out");
  assert.equal(ghostNamed(run(fed, exit.tick - fed.tick).state, "inky").state, "normal");
});

test("eating a chain of four frightened ghosts scores 200, 400, 800, 1600 with a freeze after each", () => {
  // Row 7 between columns 10 and 17 is a plain corridor: the player heads
  // left from (18,7) into four frightened ghosts coming the other way.
  let s = withPlayer(fresh(), { x: centre(18), y: centre(7), dir: "left" });
  s = Object.assign({}, s, {
    frightTicks: frightenedTicks(1),
    ghosts: [
      ghostAt("blinky", 16, 7, "right", "frightened"),
      ghostAt("pinky", 14, 7, "right", "frightened"),
      ghostAt("inky", 12, 7, "right", "frightened"),
      ghostAt("clyde", 10, 7, "right", "frightened"),
    ],
  });
  const r = run(s, 400);
  const eaten = r.events.filter(e => e.type === "ghost-eaten");
  assert.equal(eaten.length, 4, `eaten: ${JSON.stringify(eaten)}`);
  assert.deepEqual(eaten.map(e => e.chain), [1, 2, 3, 4]);
  assert.deepEqual(eaten.map(e => e.score), GHOST_SCORES);
  assert.deepEqual(eaten.map(e => e.ghost), ["blinky", "pinky", "inky", "clyde"]);
  assert.equal(r.state.chain, 4);
  const pellets = r.events.filter(e => e.type === "pellet").length;
  assert.equal(r.state.score, 200 + 400 + 800 + 1600 + pellets * 10);
  assert.ok(!r.events.some(e => e.type === "death"));
  // Each eat froze the game for 60 ticks: the tick after the first eat moves nothing.
  const first = eaten[0].tick;
  const atEat = run(s, first - s.tick).state;
  assert.equal(atEat.freezeTicks, EATEN_FREEZE_TICKS);
  assert.deepEqual(atEat.lastEaten, { x: ghostNamed(atEat, "blinky").x, y: ghostNamed(atEat, "blinky").y, score: 200, ghost: "blinky" });
  assert.equal(ghostNamed(atEat, "blinky").state, "eaten");
  const frozen = run(atEat, 1).state;
  assert.equal(frozen.player.x, atEat.player.x);
  assert.deepEqual(frozen.ghosts, atEat.ghosts);
  assert.equal(frozen.frightTicks, atEat.frightTicks, "the fright clock stops during the freeze");
  const thawed = run(atEat, EATEN_FREEZE_TICKS).state;
  assert.equal(thawed.freezeTicks, 0);
  assert.equal(thawed.lastEaten, null);
  assert.ok(run(thawed, 1).state.player.x !== thawed.player.x, "moving again");
  // Eaten ghosts head home as eyes at double speed, through the door.
  const eyes = ghostNamed(r.state, "blinky");
  assert.ok(["eaten", "entering", "leaving", "normal"].includes(eyes.state), eyes.state);
  assert.ok(Math.abs(ghostSpeedFor(r.state, ghostAt("blinky", 4, 4, "up", "eaten")) - 2 * ghostSpeed(1)) < 1e-9);
});

test("a second power pellet restarts the timer and resets the chain to zero", () => {
  let s = withPlayer(fresh(), { x: centre(1), y: centre(4) - 3.5, dir: "up" });
  s = Object.assign({}, s, { chain: 3, frightTicks: 40, ghosts: [ghostAt("blinky", 20, 4, "right", "frightened")] });
  const r = step(s, { wantDir: null }, TICK).state;
  assert.equal(r.chain, 0);
  assert.equal(r.frightTicks, frightenedTicks(1));
  const b = ghostNamed(r, "blinky");
  assert.equal(b.state, "frightened");
  assert.equal(b.reverse, true, "reversed again");
});

test("an eaten ghost returns to the house and re-emerges normal", () => {
  let s = withPlayer(fresh(), { x: centre(1), y: centre(29), dir: "right", stopped: true });
  s = Object.assign({}, s, { ghosts: [ghostAt("clyde", 26, 4, "left", "eaten")] });
  const r = run(s, 600, "right");
  const exit = r.events.find(e => e.type === "ghost-exit");
  assert.ok(exit && exit.ghost === "clyde", "Clyde came back out");
  const back = ghostNamed(r.state, "clyde");
  assert.equal(back.state, "normal");
  assert.ok(!r.events.some(e => e.type === "death"));
  // Its speed home was double, capped at two tiles a tick.
  assert.ok(Math.abs(ghostSpeedFor(s, ghostNamed(s, "clyde")) - 2 * ghostSpeed(1)) < 1e-9);
});

// --- Collisions, death, lives -------------------------------------------

test("touching a living ghost on the same tile kills: death event, dying phase, nothing moves for 90 ticks", () => {
  const s = withGhost(fresh(), "blinky", { x: centre(12) + 1, y: centre(23), dir: "left" });
  // The player starts at (13,23) heading left; Blinky is one tile left heading at him.
  const r = run(s, 10);
  const death = r.events.find(e => e.type === "death");
  assert.ok(death, "death event");
  assert.equal(r.state.phase, "dying");
  const atDeath = run(s, death.tick - s.tick).state;
  assert.equal(atDeath.phaseTicks, 0);
  const still = run(atDeath, DYING_TICKS - 1);
  assert.deepEqual(still.events, []);
  assert.equal(still.state.phase, "dying");
  assert.equal(still.state.phaseTicks, DYING_TICKS - 1);
  assert.equal(still.state.player.x, atDeath.player.x);
  assert.deepEqual(still.state.ghosts, atDeath.ghosts);
  assert.equal(still.state.lives, 3);
});

test("after the death animation a life is lost, positions reset, the ready pause runs, and the global counter takes over", () => {
  // Some pellets first, so the board is not fresh; then back to spawn with
  // Blinky one tile left, heading at the player.
  let eaten = eatN(fresh(), 5);
  eaten = withPlayer(eaten, { x: centre(13), y: centre(23), dir: "left", stopped: false });
  eaten = withGhost(eaten, "blinky", { x: centre(12) + 1, y: centre(23), dir: "left", state: "normal" });
  const r = run(eaten, 400);
  const death = r.events.find(e => e.type === "death");
  assert.ok(death);
  const ready = r.events.find(e => e.type === "ready");
  assert.ok(ready, "ready event");
  assert.equal(ready.tick, death.tick + DYING_TICKS);
  const atReady = run(eaten, ready.tick - eaten.tick).state;
  assert.equal(atReady.lives, 2);
  assert.equal(atReady.phase, "ready");
  assert.equal(atReady.phaseTicks, 0);
  assert.deepEqual(atReady.player, createPlayer(maze), "player back at spawn");
  assert.deepEqual(tileOf(atReady.player, atReady.board), maze.spawn);
  assert.equal(atReady.player.dir, "left");
  assert.deepEqual(atReady.ghosts.map(g => [g.name, g.state, g.x, g.y]), createGhosts(maze).map(g => [g.name, g.state, g.x, g.y]));
  assert.equal(atReady.mode, "scatter");
  assert.equal(atReady.modeClock, 0);
  assert.equal(atReady.frightTicks, 0);
  assert.deepEqual(atReady.globalDots, { active: true, count: 0 });
  // The board is not reset (the player took a pellet or two on the way to Blinky).
  assert.ok(atReady.pelletsLeft < 260 && atReady.pelletsLeft <= eaten.pelletsLeft, `pellets left ${atReady.pelletsLeft}`);
  assert.ok(atReady.score >= eaten.score);
  const playing = run(atReady, READY_TICKS).state;
  assert.equal(playing.phase, "playing");
  assert.equal(ghostNamed(playing, "pinky").state, "house", "on the global counter Pinky waits for seven pellets");
});

test("swapping tiles with a ghost in one tick is a collision", () => {
  // Player at x 103.9 on row 4 heading right (tile 12, about to enter 13);
  // Blinky at 104.1 heading left (tile 13, about to enter 12).
  let s = withPlayer(fresh(), { x: 103.9, y: centre(4), dir: "right" });
  s = Object.assign({}, s, { ghosts: [ghostAt("blinky", 13, 4, "left", "normal", { x: 104.1 })] });
  const r = step(s, { wantDir: null }, TICK);
  assert.deepEqual(tileOf(r.state.player, r.state.board), { x: 13, y: 4 });
  assert.deepEqual(tileOf(r.state.ghosts[0], r.state.board), { x: 12, y: 4 });
  assert.ok(r.events.some(e => e.type === "death"), "swapped tiles still collide");
});

test("eyes and house ghosts never collide; a frightened ghost on the tile is eaten instead", () => {
  const base = withPlayer(fresh(), { x: centre(13), y: centre(23), dir: "left" });
  const eyes = Object.assign({}, base, { ghosts: [ghostAt("blinky", 13, 23, "left", "eaten")] });
  const r1 = run(eyes, 3);
  assert.ok(!r1.events.some(e => e.type === "death" || e.type === "ghost-eaten"));
  const scared = Object.assign({}, base, { frightTicks: 100, ghosts: [ghostAt("blinky", 13, 23, "left", "frightened")] });
  const r2 = step(scared, { wantDir: null }, TICK);
  assert.deepEqual(r2.events.filter(e => e.type === "ghost-eaten"), [{ type: "ghost-eaten", chain: 1, ghost: "blinky", score: 200 }]);
  assert.equal(r2.state.score, 200);
  assert.ok(!r2.events.some(e => e.type === "death"));
});

test("three deaths end the game: game-over event, then step is a no-op; resetGame keeps the high score", () => {
  let s = fresh();
  const events = [];
  for (let life = 3; life >= 1; life--) {
    s = Object.assign({}, s, { ghosts: [ghostAt("blinky", 13, 23, "left", "normal")] });
    const r = run(s, 1);
    events.push(...r.events);
    assert.ok(r.events.some(e => e.type === "death"), `death ${4 - life}`);
    const after = run(r.state, DYING_TICKS);
    events.push(...after.events);
    s = after.state;
    if (life > 1) {
      assert.equal(s.lives, life - 1);
      assert.equal(s.phase, "ready");
      s = run(s, READY_TICKS).state;
      assert.equal(s.phase, "playing");
    }
  }
  assert.equal(s.lives, 0);
  assert.equal(s.phase, "game-over");
  assert.equal(events.filter(e => e.type === "death").length, 3);
  assert.equal(events.filter(e => e.type === "ready").length, 2);
  assert.deepEqual(events.filter(e => e.type === "game-over").map(e => e.type), ["game-over"]);
  const frozen = JSON.stringify(Object.assign({}, s, { tick: 0 }));
  const r = run(s, 30, "up");
  assert.deepEqual(r.events, []);
  assert.equal(JSON.stringify(Object.assign({}, r.state, { tick: 0 })), frozen, "nothing but the tick changes");
  const again = resetGame(Object.assign({}, s, { score: 4321, highScore: 100 }));
  assert.equal(again.highScore, 4321);
  assert.equal(again.score, 0);
  assert.equal(again.lives, 3);
  assert.equal(again.level, 1);
  assert.equal(again.phase, "ready");
  assert.equal(again.pelletsLeft, 260);
  assert.equal(again.rng, s.rng, "the RNG carries on where it was");
});

test("an extra life at 10,000 points, once", () => {
  const s = Object.assign({}, fresh({ ghosts: false }), { score: EXTRA_LIFE_SCORE - 10 });
  const r = run(withPlayer(s, { x: centre(13) - 3.5, dir: "left" }), 1);
  assert.equal(r.state.score, EXTRA_LIFE_SCORE);
  assert.equal(r.state.lives, 4);
  assert.deepEqual(r.events.filter(e => e.type === "extra-life"), [{ tick: 1, type: "extra-life" }]);
  assert.equal(r.state.extraLifeAwarded, true);
  const again = run(Object.assign({}, r.state, { score: 20000 }), 5);
  assert.equal(again.state.lives, 4);
  assert.ok(!again.events.some(e => e.type === "extra-life"));
});

// --- House release and Cruise Elroy -------------------------------------

test("the Dossier's house tables: personal limits, global limits, no-pellet timer", () => {
  assert.deepEqual([personalDotLimit(1, "pinky"), personalDotLimit(1, "inky"), personalDotLimit(1, "clyde")], [0, 30, 60]);
  assert.deepEqual([personalDotLimit(2, "pinky"), personalDotLimit(2, "inky"), personalDotLimit(2, "clyde")], [0, 0, 50]);
  for (const level of [3, 4, 10, 21]) {
    assert.deepEqual([personalDotLimit(level, "pinky"), personalDotLimit(level, "inky"), personalDotLimit(level, "clyde")], [0, 0, 0], `L${level}`);
  }
  assert.deepEqual(GLOBAL_DOT_LIMITS, { pinky: 7, inky: 17, clyde: 32 });
  assert.equal(noPelletReleaseTicks(1), 240);
  assert.equal(noPelletReleaseTicks(4), 240);
  assert.equal(noPelletReleaseTicks(5), 180);
  assert.equal(noPelletReleaseTicks(30), 180);
});

test("level 1 personal counters: Inky leaves after 30 pellets, Clyde after 60 more; each pellet counts for the first waiting ghost", () => {
  let s = run(fresh(), 1).state;
  assert.equal(ghostNamed(s, "pinky").state, "leaving");
  s = eatN(s, 29);
  assert.equal(ghostNamed(s, "inky").state, "house");
  assert.equal(ghostNamed(s, "inky").dotCounter, 29);
  assert.equal(ghostNamed(s, "clyde").dotCounter, 0, "Clyde's counter waits its turn");
  s = eatNext(s);
  assert.equal(ghostNamed(s, "inky").state, "leaving");
  assert.equal(ghostNamed(s, "inky").dotCounter, 30);
  s = eatN(s, 59);
  assert.equal(ghostNamed(s, "clyde").state, "house");
  assert.equal(ghostNamed(s, "clyde").dotCounter, 59);
  s = eatNext(s);
  assert.equal(ghostNamed(s, "clyde").state, "leaving");
  assert.equal(s.phase, "playing", "no death along the way");
  assert.deepEqual(s.globalDots, { active: false, count: 0 });
});

test("level 2: Pinky and Inky leave at once, Clyde after 50 pellets", () => {
  let s = run(fresh({ level: 2 }), 1).state;
  assert.equal(ghostNamed(s, "pinky").state, "leaving");
  assert.equal(ghostNamed(s, "inky").state, "house", "one release per tick");
  s = run(s, 1).state;
  assert.equal(ghostNamed(s, "inky").state, "leaving");
  s = eatN(s, 49);
  assert.equal(ghostNamed(s, "clyde").state, "house");
  s = eatNext(s);
  assert.equal(ghostNamed(s, "clyde").state, "leaving");
});

test("after a death the global counter releases Pinky at 7, Inky at 17, Clyde at 32, then switches off", () => {
  let s = Object.assign({}, fresh(), { ghosts: [ghostAt("blinky", 13, 23, "left", "normal")].concat(createGhosts(maze).slice(1)) });
  s = run(s, 1 + DYING_TICKS + READY_TICKS).state;
  assert.equal(s.phase, "playing");
  assert.equal(s.lives, 2);
  assert.deepEqual(s.globalDots, { active: true, count: 0 });
  // Park the player against a wall on an empty tile so only eatNext eats.
  s = run(withPlayer(s, { x: centre(5), y: centre(17), dir: "up" }), 5).state;
  assert.equal(ghostNamed(s, "pinky").state, "house", "Pinky's zero limit is ignored on the global counter");
  s = eatN(s, 6);
  assert.equal(ghostNamed(s, "pinky").state, "house");
  assert.equal(s.globalDots.count, 6);
  s = eatNext(s);
  assert.equal(ghostNamed(s, "pinky").state, "leaving");
  s = eatN(s, 9);
  assert.equal(ghostNamed(s, "inky").state, "house");
  s = eatNext(s);
  assert.equal(ghostNamed(s, "inky").state, "leaving");
  assert.equal(s.globalDots.count, 17);
  s = eatN(s, 14);
  assert.equal(ghostNamed(s, "clyde").state, "house");
  s = eatNext(s);
  assert.equal(ghostNamed(s, "clyde").state, "leaving");
  assert.deepEqual(s.globalDots, { active: false, count: 0 }, "back to the personal counters");
  for (const g of s.ghosts) assert.equal(g.dotCounter, 0, `${g.name}'s personal counter was not touched`);
});

test("four seconds without a pellet releases the next ghost", () => {
  // Park the player against a wall on an empty tile in the moat row so nothing is eaten.
  let s = withPlayer(fresh(), { x: centre(5), y: centre(17), dir: "up" });
  s = withGhost(s, "blinky", { x: centre(26), y: centre(1), dir: "left" });
  s = run(s, 1).state;
  assert.equal(ghostNamed(s, "pinky").state, "leaving");
  const t1 = run(s, noPelletReleaseTicks(1) - 2);
  assert.equal(ghostNamed(t1.state, "inky").state, "house");
  assert.ok(!t1.events.some(e => e.type === "pellet"), "nothing eaten");
  let t2 = run(s, noPelletReleaseTicks(1) - 1).state;
  assert.equal(ghostNamed(t2, "inky").state, "leaving");
  assert.equal(t2.dotTimer, 0, "the timer restarts");
  // Only Clyde stays for the second round, so no chaser reaches the parked player meanwhile.
  t2 = Object.assign({}, t2, { ghosts: t2.ghosts.filter(g => g.name === "clyde") });
  const t3 = run(t2, noPelletReleaseTicks(1) - 1).state;
  assert.equal(ghostNamed(t3, "clyde").state, "house");
  const t4 = run(t2, noPelletReleaseTicks(1)).state;
  assert.equal(ghostNamed(t4, "clyde").state, "leaving");
  assert.equal(t4.phase, "playing");
});

test("Cruise Elroy: Blinky speeds up at 20 and 10 pellets left on level 1, but not while Clyde is home", () => {
  const out = Object.assign({}, fresh(), { ghosts: createGhosts(maze).map(g => Object.assign({}, g, { state: "normal", y: 92 })) });
  const blinky = ghostNamed(out, "blinky");
  const at = n => Object.assign({}, out, { pelletsLeft: n });
  assert.equal(elroyStage(at(21)), 0);
  assert.equal(elroyStage(at(20)), 1);
  assert.equal(elroyStage(at(11)), 1);
  assert.equal(elroyStage(at(10)), 2);
  assert.equal(elroyStage(at(1)), 2);
  assert.equal(ghostSpeedFor(at(21), blinky), ghostSpeed(1));
  assert.equal(ghostSpeedFor(at(20), blinky), elroySpeed(1, 1));
  assert.equal(ghostSpeedFor(at(10), blinky), elroySpeed(1, 2));
  assert.equal(ghostSpeedFor(at(10), ghostNamed(out, "pinky")), ghostSpeed(1), "only Blinky");
  const home = withGhost(at(10), "clyde", { state: "house", y: 116 });
  assert.equal(elroyStage(home), 0);
  assert.equal(ghostSpeedFor(home, blinky), ghostSpeed(1));
  // Level 5: thresholds 40 and 20.
  const l5 = Object.assign({}, out, { level: 5 });
  assert.equal(elroyStage(Object.assign({}, l5, { pelletsLeft: 40 })), 1);
  assert.equal(elroyStage(Object.assign({}, l5, { pelletsLeft: 41 })), 0);
  assert.equal(elroyStage(Object.assign({}, l5, { pelletsLeft: 20 })), 2);
  // Measured on the board: an Elroy Blinky in a straight corridor covers more px a tick.
  const corridor = withGhost(at(10), "blinky", { x: centre(2), y: centre(4), dir: "right" });
  const slow = withGhost(at(30), "blinky", { x: centre(2), y: centre(4), dir: "right" });
  const dFast = ghostNamed(run(corridor, 1).state, "blinky").x - centre(2);
  const dSlow = ghostNamed(run(slow, 1).state, "blinky").x - centre(2);
  assert.ok(Math.abs(dFast - elroySpeed(1, 2) * TILE_PX * TICK) < 1e-9, `elroy 2 moved ${dFast}`);
  assert.ok(Math.abs(dSlow - ghostSpeed(1) * TILE_PX * TICK) < 1e-9, `normal moved ${dSlow}`);
});

test("ghost speeds by state: house and leaving at half, tunnel slows the living, eyes double", () => {
  const s = fresh();
  assert.equal(ghostSpeedFor(s, ghostNamed(s, "pinky")), ghostSpeed(1) / 2);
  assert.equal(ghostSpeedFor(s, ghostAt("pinky", 13, 14, "up", "leaving")), ghostSpeed(1) / 2);
  assert.equal(ghostSpeedFor(s, ghostAt("blinky", 1, 14, "left", "normal")), tunnelSpeed(1));
  assert.equal(ghostSpeedFor(s, ghostAt("blinky", 1, 14, "left", "frightened")), tunnelSpeed(1));
  assert.equal(ghostSpeedFor(s, ghostAt("blinky", 1, 14, "left", "eaten")), 2 * ghostSpeed(1), "eyes ignore the tunnel");
  assert.equal(ghostSpeedFor(s, ghostAt("blinky", 1, 4, "left", "frightened")), ghostFrightenedSpeed(1));
  assert.equal(ghostSpeedFor(s, ghostAt("blinky", 1, 4, "left", "normal")), ghostSpeed(1));
  const l5 = fresh({ level: 5 });
  assert.equal(ghostSpeedFor(l5, ghostAt("inky", 1, 4, "left", "normal")), ghostSpeed(5));
});

// --- Level clear, determinism, purity -----------------------------------

/** A level-1 game with every pellet gone but the one at (12,23), next to the spawn. */
function lastPellet(opts) {
  const s = fresh(opts);
  const tiles = s.board.tiles.map(t => (t === TILE.PELLET || t === TILE.POWER ? TILE.EMPTY : t));
  tiles[23 * s.board.width + 12] = TILE.PELLET;
  return Object.assign({}, s, { board: Object.assign({}, s.board, { tiles }), pelletsLeft: 1, score: 2750 });
}

test("the last pellet starts the level-clear flash: 120 frozen ticks, then level 2 with the board and positions reset", () => {
  const s = withGhost(lastPellet(), "blinky", { x: centre(26), y: centre(1), dir: "left" });
  const r = run(s, 8);
  const clear = r.events.find(e => e.type === "level-clear");
  assert.ok(clear, "level-clear event");
  const atClear = run(s, clear.tick - s.tick).state;
  assert.equal(atClear.phase, "level-clear");
  assert.equal(atClear.cleared, true);
  assert.equal(atClear.phaseTicks, 0);
  assert.equal(atClear.pelletsLeft, 0);
  assert.equal(atClear.score, 2760);
  const flashing = run(atClear, LEVEL_CLEAR_TICKS - 1);
  assert.deepEqual(flashing.events, []);
  assert.equal(flashing.state.phase, "level-clear");
  assert.equal(flashing.state.phaseTicks, LEVEL_CLEAR_TICKS - 1);
  assert.deepEqual(flashing.state.ghosts, atClear.ghosts, "ghosts freeze");
  assert.equal(flashing.state.player.x, atClear.player.x);
  const next = step(flashing.state, { wantDir: "up" }, TICK);
  assert.deepEqual(next.events, [{ type: "level-start", level: 2 }]);
  const l2 = next.state;
  assert.equal(l2.level, 2);
  assert.equal(l2.phase, "ready");
  assert.equal(l2.cleared, false);
  assert.equal(l2.pelletsLeft, 260);
  assert.deepEqual(l2.board.tiles, maze.tiles);
  assert.equal(l2.score, 2760, "score carries");
  assert.equal(l2.lives, 3);
  assert.deepEqual(l2.player, createPlayer(maze));
  assert.deepEqual(l2.ghosts, createGhosts(maze));
  assert.equal(l2.mode, "scatter");
  assert.equal(l2.modeClock, 0);
  assert.deepEqual(l2.globalDots, { active: false, count: 0 });
  // Level 2 speeds and tables are in use once play resumes.
  const playing = run(l2, READY_TICKS).state;
  assert.equal(playing.phase, "playing");
  const moved = run(playing, 1).state;
  const px = playing.player.x - moved.player.x;
  assert.ok(Math.abs(px - playerSpeed(2) * TILE_PX * TICK) < 1e-9, `level 2 player speed, moved ${px}`);
  assert.equal(ghostSpeedFor(playing, ghostNamed(playing, "blinky")), ghostSpeed(2));
  assert.equal(ghostNamed(run(playing, 2).state, "inky").state, "leaving", "level 2: Inky's limit is 0");
});

test("level 2 clears into level 3, and the frightened time follows the level", () => {
  const s = lastPellet({ level: 2, ghosts: false });
  const r = run(s, 8 + LEVEL_CLEAR_TICKS);
  assert.deepEqual(r.events.filter(e => e.type === "level-start").map(e => e.level), [3]);
  assert.equal(r.state.level, 3);
  const l3 = withPlayer(run(r.state, READY_TICKS).state, { x: centre(1), y: centre(4) - 3.5, dir: "up" });
  const p = step(Object.assign({}, l3, { pauseTicks: 0 }), { wantDir: null }, TICK).state;
  assert.equal(p.frightTicks, frightenedTicks(3));
});

test("determinism: seed 7 and a 3000-tick scripted game twice give identical event logs and final states", () => {
  const script = ["left", "left", "up", null, "down", "right", null, "right", "up", "left", null, "down"];
  const want = i => script[Math.floor(i / 37) % script.length];
  const play = () => {
    const r = run(createState(maze, { seed: 7 }), 3000, want);
    return { events: r.events, state: r.state };
  };
  const a = play();
  const b = play();
  assert.deepStrictEqual(a.events, b.events);
  assert.deepStrictEqual(a.state, b.state);
  assert.ok(a.events.some(e => e.type === "pellet"));
  assert.ok(a.events.some(e => e.type === "mode"), "the mode flipped during the run");
  assert.ok(a.events.some(e => e.type === "ghost-exit"));
  assert.notEqual(a.state.rng, seed(7), "the RNG was used");
  const other = run(createState(maze, { seed: 8 }), 3000, want);
  assert.notDeepStrictEqual(other.state.ghosts, a.state.ghosts, "another seed plays differently once ghosts were frightened or died");
});

test("step never mutates its arguments: a deep-frozen state survives 1500 ticks of play", () => {
  function deepFreeze(o) {
    if (o && typeof o === "object" && !Object.isFrozen(o)) {
      Object.freeze(o);
      for (const k of Object.keys(o)) deepFreeze(o[k]);
    }
    return o;
  }
  let s = deepFreeze(createState(maze, { seed: 3 }));
  const input = deepFreeze({ wantDir: "up" });
  for (let i = 0; i < 1500; i++) {
    const a = step(s, input, TICK);
    const b = step(s, input, TICK);
    assert.deepStrictEqual(a, b);
    s = deepFreeze(a.state);
  }
  assert.ok(s.tick === 1500);
});

test("level 21: no frightened time, no NaN, no throw through 2000 ticks of autopilot", () => {
  const script = ["left", "up", "right", "down", null, "left", "down", "up"];
  const r = run(createState(maze, { level: 21, ready: false, seed: 5 }), 2000, i => script[Math.floor(i / 23) % script.length]);
  assert.equal(r.state.frightTicks, 0);
  for (const e of r.events) assert.notEqual(e.type, "ghost-eaten");
  const s = r.state;
  for (const g of s.ghosts) {
    assert.ok(Number.isFinite(g.x) && Number.isFinite(g.y), `${g.name} at ${g.x},${g.y}`);
    assert.notEqual(g.state, "frightened");
  }
  assert.ok(Number.isFinite(s.player.x) && Number.isFinite(s.player.y));
  assert.ok(Number.isFinite(s.score));
  // A power pellet at level 21 reverses only.
  const p = withPlayer(fresh({ level: 21 }), { x: centre(1), y: centre(4) - 3.5, dir: "up" });
  const after = step(p, { wantDir: null }, TICK).state;
  assert.equal(after.frightTicks, 0);
  assert.equal(after.score, 50);
  assert.equal(ghostNamed(after, "blinky").reverse, true);
  assert.equal(ghostNamed(after, "blinky").state, "normal");
});
