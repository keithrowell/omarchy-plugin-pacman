// The game state and its fixed-timestep loop.
//
// Pure ES module: no Qt, no Date, no randomness. step(state, input, dt)
// returns a new state plus the events that happened; it never mutates its
// arguments. QML owns the accumulator, calls step in TICK-sized slices, and
// only renders what comes back.

import { tileAt, TILE } from "./maze.mjs";
import { createPlayer, stepPlayer, tileOf } from "./player.mjs";
import { playerSpeed, PELLET_PAUSE_TICKS, POWER_PAUSE_TICKS } from "./speeds.mjs";

export const TICK = 1 / 60;

/** Largest dt step accepts; a caller that forgot to slice time must not tunnel through walls. */
export const MAX_DT = 0.05;

export const PELLET_SCORE = 10;
export const POWER_SCORE = 50;

/**
 * A fresh game on `maze`. `board` is the mutable-by-copy view of the tiles
 * (pellets vanish as they are eaten); `maze` stays the immutable reference
 * for spawn, house and tunnels.
 */
export function createState(maze, opts) {
  const options = opts && typeof opts === "object" ? opts : {};
  const level = typeof options.level === "number" && options.level >= 1 ? Math.floor(options.level) : 1;
  return {
    board: { width: maze.width, height: maze.height, tiles: maze.tiles.slice() },
    maze,
    player: createPlayer(maze),
    score: 0,
    highScore: 0,
    lives: 3,
    level,
    pelletsLeft: maze.pellets.length + maze.powerPellets.length,
    pauseTicks: 0,
    tick: 0,
    cleared: false,
  };
}

/**
 * Advance the game by `dt` seconds (normally TICK). `input` is `{ wantDir }`,
 * the direction the keys ask for this tick or null. Returns { state, events }
 * where events is a list of { type: "pellet" | "power" | "level-clear", ... }.
 */
export function step(state, input, dt) {
  if (typeof dt !== "number" || !(dt >= 0) || dt > MAX_DT) {
    throw new Error(`game: dt must be a number in [0, ${MAX_DT}], got ${dt}`);
  }
  const wantDir = input && typeof input === "object" && input.wantDir !== undefined ? input.wantDir : null;
  const events = [];
  const next = Object.assign({}, state, { tick: state.tick + 1 });

  if (state.cleared) return { state: next, events };

  if (state.pauseTicks > 0) {
    next.pauseTicks = state.pauseTicks - 1;
    if (wantDir !== null) next.player = Object.assign({}, state.player, { wantDir });
    return { state: next, events };
  }

  const r = stepPlayer(state.player, state.board, wantDir, playerSpeed(state.level), dt);
  next.player = r.player;

  const tile = tileOf(r.player, state.board);
  const kind = tileAt(state.board, tile.x, tile.y);
  if (kind === TILE.PELLET || kind === TILE.POWER) {
    const power = kind === TILE.POWER;
    const tiles = state.board.tiles.slice();
    tiles[tile.y * state.board.width + tile.x] = TILE.EMPTY;
    next.board = Object.assign({}, state.board, { tiles });
    next.score = state.score + (power ? POWER_SCORE : PELLET_SCORE);
    next.pelletsLeft = state.pelletsLeft - 1;
    next.pauseTicks = power ? POWER_PAUSE_TICKS : PELLET_PAUSE_TICKS;
    events.push({ type: power ? "power" : "pellet", tile: { x: tile.x, y: tile.y } });
    if (next.pelletsLeft === 0) {
      next.cleared = true;
      events.push({ type: "level-clear" });
    }
  }

  return { state: next, events };
}
