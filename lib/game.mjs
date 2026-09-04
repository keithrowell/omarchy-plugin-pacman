// The game state and its fixed-timestep loop.
//
// Pure ES module: no Qt, no Date, no Math.random (the RNG state travels in
// `state.rng`). step(state, input, dt) returns a new state plus the events
// that happened; it never mutates its arguments. QML owns the accumulator,
// calls step in TICK-sized slices, and only renders what comes back.
//
// Ghost rules (modes, frightened time, house release, Cruise Elroy, scoring)
// follow the Pac-Man Dossier (Jamey Pittman); the tables live in modes.mjs
// and speeds.mjs, the ghosts' own movement in ghosts.mjs.
//
// Phases: ready (a pause before play), playing, dying (the death animation),
// level-clear (the board flash), game-over (step is a no-op).

import { tileAt, TILE } from "./maze.mjs";
import { createPlayer, stepPlayer, bufferWant, tileOf, TILE_PX } from "./player.mjs";
import {
  playerSpeed, playerFrightenedSpeed, ghostSpeed, ghostFrightenedSpeed, tunnelSpeed,
  elroySpeed, elroyThresholds, PELLET_PAUSE_TICKS, POWER_PAUSE_TICKS,
} from "./speeds.mjs";
import { modeAtTick, frightenedTicks, isFlashOn } from "./modes.mjs";
import { createGhosts, stepGhost, targetFor, inTunnel, HOUSE_ORDER } from "./ghosts.mjs";
import { seed } from "./rng.mjs";

export const TICK = 1 / 60;

/** Largest dt step accepts; a caller that forgot to slice time must not tunnel through walls. */
export const MAX_DT = 0.05;

export const PELLET_SCORE = 10;
export const POWER_SCORE = 50;
/** Points for the first, second, third and fourth ghost eaten on one power pellet. */
export const GHOST_SCORES = Object.freeze([200, 400, 800, 1600]);
export const EXTRA_LIFE_SCORE = 10000;

/** The READY! beat before play, at the start and after each death (2 s). */
export const READY_TICKS = 120;
/** The death animation: twelve steps of six ticks, then the burst. */
export const DYING_TICKS = 90;
/** The board flash after the last pellet. */
export const LEVEL_CLEAR_TICKS = 120;
/** Everything stands still after a ghost is eaten while its score shows. */
export const EATEN_FREEZE_TICKS = 60;

/** Ghosts in the house and leaving it move at this fraction of their speed. */
export const HOUSE_SPEED_FACTOR = 0.5;
/** Eyes move at this multiple of the ghosts' speed... */
export const EYES_SPEED_FACTOR = 2;
/** ...but never more than two tiles a tick. */
export const EYES_MAX_PX = 2 * TILE_PX;

/** Global counter limits after a life is lost (Dossier). */
export const GLOBAL_DOT_LIMITS = Object.freeze({ pinky: 7, inky: 17, clyde: 32 });

/** Personal pellet limit before `name` leaves the house at `level` (Dossier). */
export function personalDotLimit(level, name) {
  if (level === 1) return name === "inky" ? 30 : name === "clyde" ? 60 : 0;
  if (level === 2) return name === "clyde" ? 50 : 0;
  return 0;
}

/** Ticks without a pellet after which the next ghost is released anyway (Dossier: 4 s, 3 s from level 5). */
export function noPelletReleaseTicks(level) {
  return level <= 4 ? 4 * 60 : 3 * 60;
}

/**
 * A fresh game on `maze`. `board` is the mutable-by-copy view of the tiles
 * (pellets vanish as they are eaten); `maze` stays the immutable reference
 * for spawn, house and tunnels. Options: `level` (1), `seed` (1),
 * `ready` (true: start with the ready pause), `ghosts` (true; false leaves
 * the board empty of ghosts, for tests of the player alone), `highScore`
 * (0; the persisted best, shown in the HUD and raised live by step).
 */
export function createState(maze, opts) {
  const options = opts && typeof opts === "object" ? opts : {};
  const level = typeof options.level === "number" && options.level >= 1 ? Math.floor(options.level) : 1;
  const ready = options.ready !== false;
  const highScore = typeof options.highScore === "number" && options.highScore > 0 ? Math.floor(options.highScore) : 0;
  return {
    board: { width: maze.width, height: maze.height, tiles: maze.tiles.slice() },
    maze,
    player: createPlayer(maze),
    ghosts: options.ghosts === false ? [] : createGhosts(maze),
    score: 0,
    highScore,
    lives: 3,
    level,
    pelletsLeft: maze.pellets.length + maze.powerPellets.length,
    pauseTicks: 0,
    tick: 0,
    cleared: false,
    phase: ready ? "ready" : "playing",
    phaseTicks: 0,
    freezeTicks: 0,
    mode: "scatter",
    modeClock: 0,
    frightTicks: 0,
    chain: 0,
    lastEaten: null,
    globalDots: { active: false, count: 0 },
    dotTimer: 0,
    extraLifeAwarded: false,
    rng: seed(options.seed),
  };
}

/** A new level-1 game after game over, keeping the high score and the RNG where it was. */
export function resetGame(state) {
  return createState(state.maze, { seed: state.rng, highScore: Math.max(state.highScore, state.score) });
}

/** True when frightened ghosts should be drawn in the flash colour this tick. */
export function ghostFlashing(state) {
  return isFlashOn(state.level, state.frightTicks);
}

/** True when any ghost is frightened (the player speeds up, the siren changes). */
export function anyFrightened(state) {
  for (const g of state.ghosts) if (g.state === "frightened") return true;
  return false;
}

/**
 * Blinky's Cruise Elroy stage: 0, 1 or 2 by pellets left, but 0 while Clyde
 * is in the house (Dossier: Elroy is suspended after a life is lost until
 * Clyde has left).
 */
export function elroyStage(state) {
  for (const g of state.ghosts) if (g.name === "clyde" && g.state === "house") return 0;
  const t = elroyThresholds(state.level);
  if (state.pelletsLeft <= t.stage2) return 2;
  if (state.pelletsLeft <= t.stage1) return 1;
  return 0;
}

/** The speed one ghost moves at this tick, tiles per second. */
export function ghostSpeedFor(state, ghost) {
  const level = state.level;
  switch (ghost.state) {
    case "house":
    case "leaving":
      return ghostSpeed(level) * HOUSE_SPEED_FACTOR;
    case "eaten":
    case "entering":
      return ghostSpeed(level) * EYES_SPEED_FACTOR;
    case "frightened":
      return inTunnel(state.maze, tileOf(ghost, state.board)) ? tunnelSpeed(level) : ghostFrightenedSpeed(level);
    default: {
      if (inTunnel(state.maze, tileOf(ghost, state.board))) return tunnelSpeed(level);
      const stage = ghost.name === "blinky" ? elroyStage(state) : 0;
      return stage > 0 ? elroySpeed(level, stage) : ghostSpeed(level);
    }
  }
}

function sameTile(a, b) {
  return a.x === b.x && a.y === b.y;
}

function findGhost(ghosts, name) {
  for (const g of ghosts) if (g.name === name) return g;
  return null;
}

/** The first ghost waiting in the house, in release order, or null. */
function firstWaiting(ghosts) {
  for (const name of HOUSE_ORDER) {
    const g = findGhost(ghosts, name);
    if (g && g.state === "house") return g;
  }
  return null;
}

function replaceGhost(ghosts, ghost) {
  return ghosts.map(g => (g.name === ghost.name ? ghost : g));
}

/** Set `patch` on every ghost whose state is in `states`. */
function patchGhosts(ghosts, states, patch) {
  return ghosts.map(g => (states.indexOf(g.state) !== -1 ? Object.assign({}, g, patch) : g));
}

/** Keep the buffered turn alive on ticks where the player does not move. */
function bufferInput(next, wantDir) {
  const want = bufferWant(next.player, wantDir);
  if (want !== next.player.wantDir) next.player = Object.assign({}, next.player, { wantDir: want });
}

/** Fresh ghosts for a respawn, carrying over the personal pellet counters. */
function respawnGhosts(state) {
  if (state.ghosts.length === 0) return [];
  return createGhosts(state.maze).map(g => {
    const old = findGhost(state.ghosts, g.name);
    return old ? Object.assign({}, g, { dotCounter: old.dotCounter }) : g;
  });
}

/** Positions, timers and mode back to the start of a life; the board stays as it is. */
function resetPositions(next) {
  next.player = createPlayer(next.maze);
  next.ghosts = respawnGhosts(next);
  next.mode = "scatter";
  next.modeClock = 0;
  next.frightTicks = 0;
  next.chain = 0;
  next.freezeTicks = 0;
  next.pauseTicks = 0;
  next.lastEaten = null;
  next.dotTimer = 0;
  next.phase = "ready";
  next.phaseTicks = 0;
}

function loseLife(next, events) {
  next.lives = next.lives - 1;
  if (next.lives <= 0) {
    next.lives = 0;
    next.phase = "game-over";
    next.phaseTicks = 0;
    events.push({ type: "game-over" });
    return;
  }
  resetPositions(next);
  // From here the global counter releases the house (Dossier).
  next.globalDots = { active: true, count: 0 };
  events.push({ type: "ready" });
}

function advanceLevel(next, events) {
  next.level = next.level + 1;
  next.board = { width: next.maze.width, height: next.maze.height, tiles: next.maze.tiles.slice() };
  next.pelletsLeft = next.maze.pellets.length + next.maze.powerPellets.length;
  next.cleared = false;
  const keepGhosts = next.ghosts.length > 0;
  resetPositions(next);
  // A new level starts on the personal counters, all at zero.
  next.ghosts = keepGhosts ? createGhosts(next.maze) : [];
  next.globalDots = { active: false, count: 0 };
  events.push({ type: "level-start", level: next.level });
}

/** The pellet or power pellet under the player, if any: score, counters, frightened. */
function eat(next, events) {
  const tile = tileOf(next.player, next.board);
  const kind = tileAt(next.board, tile.x, tile.y);
  if (kind !== TILE.PELLET && kind !== TILE.POWER) return;
  const power = kind === TILE.POWER;
  const tiles = next.board.tiles.slice();
  tiles[tile.y * next.board.width + tile.x] = TILE.EMPTY;
  next.board = Object.assign({}, next.board, { tiles });
  next.score = next.score + (power ? POWER_SCORE : PELLET_SCORE);
  next.pelletsLeft = next.pelletsLeft - 1;
  next.pauseTicks = power ? POWER_PAUSE_TICKS : PELLET_PAUSE_TICKS;
  events.push({ type: power ? "power" : "pellet", tile: { x: tile.x, y: tile.y } });

  // House counters: the global one after a death, else the first waiting ghost's.
  next.dotTimer = 0;
  if (next.globalDots.active) {
    next.globalDots = { active: true, count: next.globalDots.count + 1 };
  } else {
    const waiting = firstWaiting(next.ghosts);
    if (waiting) next.ghosts = replaceGhost(next.ghosts, Object.assign({}, waiting, { dotCounter: waiting.dotCounter + 1 }));
  }

  if (power) {
    // Every ghost in the maze turns back; the living turn frightened for the
    // level's time (none at all on levels with no frightened time). Ghosts in
    // the house are untouched and leave in their normal state.
    const ticks = frightenedTicks(next.level);
    next.chain = 0;
    if (ticks > 0) {
      next.frightTicks = ticks;
      next.ghosts = patchGhosts(next.ghosts, ["normal", "frightened"], { state: "frightened", reverse: true });
    } else {
      next.ghosts = patchGhosts(next.ghosts, ["normal"], { reverse: true });
    }
  }

  if (next.pelletsLeft === 0) {
    next.phase = "level-clear";
    next.phaseTicks = 0;
    next.cleared = true;
    next.frightTicks = 0;
    next.pauseTicks = 0;
    events.push({ type: "level-clear" });
  }
}

/** Move every ghost by its speed for the tick, threading the RNG. Emits ghost-exit as one leaves the house. */
function moveGhosts(next, dt, events) {
  const elroy = elroyStage(next);
  const ctx = { mode: next.mode, player: next.player, ghosts: next.ghosts, board: next.board, maze: next.maze, elroy };
  let rng = next.rng;
  const moved = [];
  for (const g of next.ghosts) {
    const px = Math.min(EYES_MAX_PX, ghostSpeedFor(next, g) * TILE_PX * dt);
    const r = stepGhost(g, next.board, next.maze, px, targetFor(g, ctx), rng);
    rng = r.rng;
    if (g.state === "leaving" && r.ghost.state === "normal") events.push({ type: "ghost-exit", ghost: g.name });
    moved.push(r.ghost);
  }
  next.ghosts = moved;
  next.rng = rng;
}

/**
 * Player against ghosts: a hit when the tiles match after the move or the
 * two swapped tiles during it. A living ghost kills; a frightened one is
 * eaten (200, 400, 800, 1600 along the chain) and the game freezes a moment.
 */
function collide(next, before, events) {
  const after = tileOf(next.player, next.board);
  const hits = [];
  for (let i = 0; i < next.ghosts.length; i++) {
    const g = next.ghosts[i];
    if (g.state !== "normal" && g.state !== "frightened" && g.state !== "leaving") continue;
    const gBefore = tileOf(before.ghosts[i], next.board);
    const gAfter = tileOf(g, next.board);
    const hit = sameTile(gAfter, after) || (sameTile(gBefore, after) && sameTile(gAfter, before.player));
    if (hit) hits.push(g);
  }
  for (const g of hits) {
    if (g.state === "frightened") continue;
    next.phase = "dying";
    next.phaseTicks = 0;
    next.lastEaten = null;
    events.push({ type: "death" });
    return;
  }
  for (const g of hits) {
    const chain = next.chain + 1;
    const points = GHOST_SCORES[Math.min(chain, GHOST_SCORES.length) - 1];
    next.chain = chain;
    next.score = next.score + points;
    next.freezeTicks = EATEN_FREEZE_TICKS;
    next.lastEaten = { x: g.x, y: g.y, score: points, ghost: g.name };
    next.ghosts = replaceGhost(next.ghosts, Object.assign({}, g, { state: "eaten", reverse: false }));
    events.push({ type: "ghost-eaten", chain, ghost: g.name, score: points });
  }
}

/**
 * The frightened countdown (not on the tick that started it), else the
 * scatter/chase clock; a flip turns every living ghost around.
 */
function tickTimers(next, events, powered) {
  if (next.frightTicks > 0) {
    if (!powered) next.frightTicks = next.frightTicks - 1;
    if (next.frightTicks === 0) next.ghosts = patchGhosts(next.ghosts, ["frightened"], { state: "normal" });
    return;
  }
  next.modeClock = next.modeClock + 1;
  const mode = modeAtTick(next.level, next.modeClock);
  if (mode !== next.mode) {
    next.mode = mode;
    next.ghosts = patchGhosts(next.ghosts, ["normal"], { reverse: true });
    events.push({ type: "mode", mode });
  }
}

/** Release the next ghost in order when its counter allows, or when pellets have dried up. */
function releaseFromHouse(next) {
  const waiting = firstWaiting(next.ghosts);
  if (!waiting) return;
  let release = false;
  if (next.dotTimer >= noPelletReleaseTicks(next.level)) {
    release = true;
    next.dotTimer = 0;
  } else if (next.globalDots.active) {
    release = next.globalDots.count >= GLOBAL_DOT_LIMITS[waiting.name];
  } else {
    release = waiting.dotCounter >= personalDotLimit(next.level, waiting.name);
  }
  if (!release) return;
  next.ghosts = replaceGhost(next.ghosts, Object.assign({}, waiting, { state: "leaving" }));
  // Clyde out on the global counter: back to the personal counters (Dossier).
  if (next.globalDots.active && waiting.name === "clyde") next.globalDots = { active: false, count: 0 };
}

/**
 * Advance the game by `dt` seconds (normally TICK). `input` is `{ wantDir }`,
 * the direction the keys ask for this tick or null. Returns { state, events }
 * where events is a list of { type, ... } with type one of pellet, power,
 * level-clear, level-start, ghost-eaten, ghost-exit, death, ready, game-over,
 * extra-life, mode. `highScore` follows the score live, so the HUD shows a
 * beaten record as it happens.
 */
export function step(state, input, dt) {
  if (typeof dt !== "number" || !(dt >= 0) || dt > MAX_DT) {
    throw new Error(`game: dt must be a number in [0, ${MAX_DT}], got ${dt}`);
  }
  const wantDir = input && typeof input === "object" && input.wantDir !== undefined ? input.wantDir : null;
  const r = advance(state, wantDir, dt);
  if (r.state.score > r.state.highScore) r.state.highScore = r.state.score;
  return r;
}

/** One tick of the phase machine on a fresh copy of `state`; `step` finishes it off. */
function advance(state, wantDir, dt) {
  const events = [];
  const next = Object.assign({}, state, { tick: state.tick + 1 });

  switch (state.phase) {
    case "game-over":
      return { state: next, events };
    case "ready":
      next.phaseTicks = state.phaseTicks + 1;
      bufferInput(next, wantDir);
      if (next.phaseTicks >= READY_TICKS) {
        next.phase = "playing";
        next.phaseTicks = 0;
      }
      return { state: next, events };
    case "dying":
      next.phaseTicks = state.phaseTicks + 1;
      if (next.phaseTicks >= DYING_TICKS) loseLife(next, events);
      return { state: next, events };
    case "level-clear":
      next.phaseTicks = state.phaseTicks + 1;
      if (next.phaseTicks >= LEVEL_CLEAR_TICKS) advanceLevel(next, events);
      return { state: next, events };
    default:
      break;
  }

  if (state.freezeTicks > 0) {
    next.freezeTicks = state.freezeTicks - 1;
    if (next.freezeTicks === 0) next.lastEaten = null;
    bufferInput(next, wantDir);
    return { state: next, events };
  }

  const before = { player: tileOf(state.player, state.board), ghosts: state.ghosts };

  if (state.pauseTicks > 0) {
    // The player stands still but input is not lost: the same buffering
    // rules as stepPlayer apply, so a held current-direction key cannot
    // wipe a tapped pre-turn on a pellet tick. The ghosts keep moving.
    next.pauseTicks = state.pauseTicks - 1;
    bufferInput(next, wantDir);
  } else {
    const speed = anyFrightened(state) ? playerFrightenedSpeed(state.level) : playerSpeed(state.level);
    next.player = stepPlayer(state.player, state.board, wantDir, speed, dt).player;
    eat(next, events);
    if (next.phase === "level-clear") return { state: next, events };
  }

  moveGhosts(next, dt, events);
  collide(next, before, events);
  if (next.phase === "dying") return { state: next, events };

  let powered = false;
  for (const e of events) if (e.type === "power") powered = true;
  tickTimers(next, events, powered);
  next.dotTimer = next.dotTimer + 1;
  releaseFromHouse(next);

  if (!next.extraLifeAwarded && next.score >= EXTRA_LIFE_SCORE) {
    next.extraLifeAwarded = true;
    next.lives = next.lives + 1;
    events.push({ type: "extra-life" });
  }

  return { state: next, events };
}
