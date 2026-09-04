// The four ghosts: spawn, targeting, corridor decisions, house and eyes.
//
// Pure ES module: no Qt, no Math.random. Positions are maze pixels like the
// player's (lane centres at t*8+4); x may sit in the wrap band while crossing
// the tunnel. The rules are the Pac-Man Dossier's (Jamey Pittman); game.mjs
// owns modes, speeds, the frightened timer and the house release counters and
// hands each ghost its pixels for the tick and its target tile; this module
// only moves one ghost and never touches the rest of the state.
//
// States:
//   house      bobbing inside the house, waiting to be released
//   leaving    lined up on the door and rising to the tile above it
//   normal     scatter or chase (game.mjs decides which target)
//   frightened random walk after a power pellet
//   eaten      eyes navigating back to the door
//   entering   eyes dropping through the door to the house centre (an extra
//              state over the spec's list: the door column is scripted, not
//              navigated, so it needs its own step)

import { tileAt, TILE } from "./maze.mjs";
import { NO_UP_TILES, SCATTER_TARGETS } from "./maze-data.mjs";
import { DIRS } from "./input.mjs";
import { tileOf, TILE_PX } from "./player.mjs";
import { randomInt } from "./rng.mjs";

export const GHOST_NAMES = Object.freeze(["blinky", "pinky", "inky", "clyde"]);
/** The order the house releases ghosts and counts pellets for them. */
export const HOUSE_ORDER = Object.freeze(["pinky", "inky", "clyde"]);
/** Tie-break order at a junction (Dossier). */
export const DECISION_ORDER = Object.freeze(["up", "left", "down", "right"]);
/** How far above and below the house centre a waiting ghost bobs, px. */
export const HOUSE_BOB = 4;

const HALF = TILE_PX / 2;
const WRAP_LEFT = -HALF;
/** Slack on "reached the tile centre" so a float a hair short still decides there. */
const EPS = 1e-9;

/**
 * Where the house is in pixels, from the parsed maze: `doorX` is the door's
 * centre (between two tiles, as in the original), `centreY` the interior's
 * middle row centre, `exitY` the centre of the row above the door, and
 * `exitTiles` the tiles above the door where eyes hand over to the scripted
 * descent.
 */
export function houseGeometry(maze) {
  const house = maze.house;
  let minX = Infinity, maxX = -Infinity;
  for (const d of house.door) {
    if (d.x < minX) minX = d.x;
    if (d.x > maxX) maxX = d.x;
  }
  const doorY = house.door[0].y;
  const exitTiles = [];
  for (let x = minX; x <= maxX; x++) exitTiles.push({ x, y: doorY - 1 });
  return {
    doorX: (minX * TILE_PX + (maxX + 1) * TILE_PX) / 2,
    centreY: (house.y + Math.floor(house.height / 2)) * TILE_PX + HALF,
    exitY: (doorY - 1) * TILE_PX + HALF,
    exitTiles,
  };
}

function ghost(name, x, y, dir, state) {
  return { name, x, y, dir, state, dotCounter: 0, reverse: false };
}

/**
 * The four ghosts at level start: Blinky above the door facing left, out in
 * the maze; Pinky at the house centre facing down, Inky two tiles left of her
 * facing up, Clyde two tiles right facing up, all waiting in the house.
 */
export function createGhosts(maze) {
  const g = houseGeometry(maze);
  return [
    ghost("blinky", g.doorX, g.exitY, "left", "normal"),
    ghost("pinky", g.doorX, g.centreY, "down", "house"),
    ghost("inky", g.doorX - 2 * TILE_PX, g.centreY, "up", "house"),
    ghost("clyde", g.doorX + 2 * TILE_PX, g.centreY, "up", "house"),
  ];
}

/** Tiles a ghost in `state` may enter: the corridors always, the door and house only as eyes. */
export function ghostWalkable(kind, state) {
  if (kind === TILE.PELLET || kind === TILE.POWER || kind === TILE.EMPTY || kind === TILE.TUNNEL) return true;
  if (kind === TILE.DOOR || kind === TILE.HOUSE) return state === "eaten" || state === "entering" || state === "leaving";
  return false;
}

function isNoUpTile(tile) {
  for (const t of NO_UP_TILES) if (t.x === tile.x && t.y === tile.y) return true;
  return false;
}

function isExitTile(geometry, tile) {
  for (const t of geometry.exitTiles) if (t.x === tile.x && t.y === tile.y) return true;
  return false;
}

/**
 * True when `tile` is in a tunnel: on a tunnel row and within the open run
 * that reaches the board's edge (the wrap band counts as the edge tile).
 */
export function inTunnel(maze, tile) {
  for (const t of maze.tunnels) {
    if (t.y !== tile.y) continue;
    const x = ((tile.x % maze.width) + maze.width) % maze.width;
    let left = 0;
    while (left < maze.width && tileAt(maze, left, t.y) !== TILE.WALL) left++;
    if (x < left) return true;
    let right = maze.width - 1;
    while (right >= 0 && tileAt(maze, right, t.y) !== TILE.WALL) right--;
    if (x > right) return true;
  }
  return false;
}

/**
 * Chase targets (Dossier). Blinky: the player's tile. Pinky: four tiles ahead
 * of the player, and four to the left as well when the player faces up (the
 * original's overflow bug, kept on purpose). Inky: two tiles ahead of the
 * player (same quirk), then that point doubled away from Blinky. Clyde: the
 * player while eight or more tiles away, else his scatter corner. `blinky`
 * may be null, in which case Inky targets the two-ahead point itself.
 */
export function chaseTarget(ghost, player, blinky, board) {
  const p = tileOf(player, board);
  const d = DIRS[player.dir] || DIRS.left;
  const ahead = n => ({ x: p.x + d.dx * n + (player.dir === "up" ? -n : 0), y: p.y + d.dy * n });
  switch (ghost.name) {
    case "pinky":
      return ahead(4);
    case "inky": {
      const two = ahead(2);
      const b = blinky ? tileOf(blinky, board) : two;
      return { x: 2 * two.x - b.x, y: 2 * two.y - b.y };
    }
    case "clyde": {
      const g = tileOf(ghost, board);
      const dx = g.x - p.x, dy = g.y - p.y;
      return dx * dx + dy * dy >= 64 ? p : SCATTER_TARGETS.clyde;
    }
    default:
      return p;
  }
}

/**
 * The tile a ghost steers for: eyes head for the tile above the door;
 * otherwise the scatter corner in scatter mode (except Blinky as Cruise
 * Elroy, who keeps chasing) or the chase target. `ctx` is
 * { mode, player, ghosts, board, maze, elroy }.
 */
export function targetFor(ghost, ctx) {
  if (ghost.state === "eaten" || ghost.state === "entering") return houseGeometry(ctx.maze).exitTiles[0];
  const elroy = ghost.name === "blinky" && ctx.elroy > 0;
  if (ctx.mode === "scatter" && !elroy) return SCATTER_TARGETS[ghost.name];
  let blinky = null;
  if (ctx.ghosts) for (const g of ctx.ghosts) if (g.name === "blinky") blinky = g;
  return chaseTarget(ghost, ctx.player, blinky, ctx.board);
}

/**
 * Directions a ghost at `tile` travelling `dir` may take next, in tie-break
 * order: never its reverse, never into a tile it cannot walk, and never up
 * from a no-up tile in scatter or chase. Returns [{ dir, tile }].
 */
export function candidates(state, board, tile, dir) {
  const out = [];
  const back = DIRS[dir] ? DIRS[dir].opposite : null;
  for (const name of DECISION_ORDER) {
    if (name === back) continue;
    if (name === "up" && state === "normal" && isNoUpTile(tile)) continue;
    const d = DIRS[name];
    const next = { x: tile.x + d.dx, y: tile.y + d.dy };
    if (!ghostWalkable(tileAt(board, next.x, next.y), state)) continue;
    out.push({ dir: name, tile: next });
  }
  return out;
}

/**
 * The direction a ghost takes on arriving at a tile centre. A pending
 * reversal wins outright (mode flip or power pellet). Frightened ghosts pick
 * uniformly among the legal moves with the seeded RNG (the original tries a
 * random direction and rotates clockwise until one is legal; over a corridor
 * of one to three options the uniform pick is the same idea without the
 * rotation). Otherwise the move whose next tile is nearest the target by
 * squared Euclidean distance, ties to the earlier of up, left, down, right.
 * Returns { dir, rng, reversed }; a dead end keeps the current direction.
 */
export function chooseDirection(ghost, board, target, rng) {
  if (ghost.reverse) return { dir: DIRS[ghost.dir].opposite, rng, reversed: true };
  const tile = tileOf(ghost, board);
  const options = candidates(ghost.state, board, tile, ghost.dir);
  if (options.length === 0) return { dir: ghost.dir, rng, reversed: false };
  if (ghost.state === "frightened") {
    const r = randomInt(rng, options.length);
    return { dir: options[r.value].dir, rng: r.state, reversed: false };
  }
  let best = options[0];
  let bestDist = Infinity;
  for (const o of options) {
    const dx = o.tile.x - target.x, dy = o.tile.y - target.y;
    const dist = dx * dx + dy * dy;
    if (dist < bestDist) {
      bestDist = dist;
      best = o;
    }
  }
  return { dir: best.dir, rng, reversed: false };
}

/** The first lane centre strictly beyond `v` in the positive direction. */
function nextCentreAhead(v) {
  return Math.floor((v - HALF) / TILE_PX) * TILE_PX + HALF + TILE_PX;
}

/** The first lane centre strictly beyond `v` in the negative direction. */
function nextCentreBehind(v) {
  return Math.ceil((v - HALF) / TILE_PX) * TILE_PX + HALF - TILE_PX;
}

/** Move `v` toward `goal` by at most `px`; returns the new value. */
function approach(v, goal, px) {
  if (v < goal) return Math.min(goal, v + px);
  if (v > goal) return Math.max(goal, v - px);
  return v;
}

/**
 * Corridor movement for normal, frightened and eaten ghosts: advance `px`
 * along `dir`, stopping at every tile centre on the way to decide the next
 * direction, so no decision is ever skipped however fast the ghost moves.
 * Eyes arriving at a tile above the door switch to `entering`.
 */
function moveCorridor(g, board, geometry, px, target, rng) {
  let x = g.x, y = g.y, dir = g.dir, state = g.state, reverse = g.reverse;
  let remaining = px;
  const widthPx = board.width * TILE_PX;
  const maxIter = Math.ceil(px / HALF) + 1;
  for (let i = 0; i < maxIter && remaining > 0; i++) {
    const d = DIRS[dir];
    let centre, dist;
    if (d.dx !== 0) {
      centre = d.dx > 0 ? nextCentreAhead(x) : nextCentreBehind(x);
      dist = Math.abs(centre - x);
    } else {
      centre = d.dy > 0 ? nextCentreAhead(y) : nextCentreBehind(y);
      dist = Math.abs(centre - y);
    }
    if (remaining + EPS >= dist) {
      if (d.dx !== 0) x = centre; else y = centre;
      remaining = Math.max(0, remaining - dist);
      const tile = tileOf({ x, y }, board);
      if (state === "eaten" && isExitTile(geometry, tile)) {
        state = "entering";
        dir = Math.abs(x - geometry.doorX) < EPS ? "down" : (x < geometry.doorX ? "right" : "left");
        remaining = 0;
      } else {
        const c = chooseDirection({ name: g.name, x, y, dir, state, reverse }, board, target, rng);
        dir = c.dir;
        rng = c.rng;
        if (c.reversed) reverse = false;
      }
    } else {
      x += d.dx * remaining;
      y += d.dy * remaining;
      remaining = 0;
    }
    if (x < WRAP_LEFT) x += widthPx;
    else if (x >= widthPx + HALF) x -= widthPx;
  }
  return { ghost: Object.assign({}, g, { x, y, dir, state, reverse }), rng };
}

/** Waiting in the house: bob between centreY - HOUSE_BOB and centreY + HOUSE_BOB. */
function moveHouse(g, geometry, px) {
  let y = g.y, dir = g.dir === "up" ? "up" : "down";
  y += (dir === "up" ? -1 : 1) * px;
  if (y >= geometry.centreY + HOUSE_BOB) {
    y = geometry.centreY + HOUSE_BOB;
    dir = "up";
  } else if (y <= geometry.centreY - HOUSE_BOB) {
    y = geometry.centreY - HOUSE_BOB;
    dir = "down";
  }
  return Object.assign({}, g, { y, dir });
}

/** Released: level with the centre row, slide to the door's x, rise to the exit row, then out facing left. */
function moveLeaving(g, geometry, px) {
  let x = g.x, y = g.y, dir = g.dir, state = g.state;
  if (x !== geometry.doorX && y !== geometry.centreY) {
    dir = y < geometry.centreY ? "down" : "up";
    y = approach(y, geometry.centreY, px);
  } else if (x !== geometry.doorX) {
    dir = x < geometry.doorX ? "right" : "left";
    x = approach(x, geometry.doorX, px);
  } else {
    dir = "up";
    y = approach(y, geometry.exitY, px);
    if (y === geometry.exitY) {
      state = "normal";
      dir = "left";
    }
  }
  return Object.assign({}, g, { x, y, dir, state });
}

/** Eyes at the door: slide to the door's x, drop to the house centre, then leave again. */
function moveEntering(g, geometry, px) {
  let x = g.x, y = g.y, dir = g.dir, state = g.state;
  if (x !== geometry.doorX) {
    dir = x < geometry.doorX ? "right" : "left";
    x = approach(x, geometry.doorX, px);
  } else {
    dir = "down";
    y = approach(y, geometry.centreY, px);
    if (y === geometry.centreY) {
      state = "leaving";
      dir = "up";
    }
  }
  return Object.assign({}, g, { x, y, dir, state });
}

/**
 * Advance one ghost by `px` pixels this tick. `target` is the tile it steers
 * for (ignored in the house), `rng` the game's RNG state, threaded through
 * frightened choices. Returns { ghost, rng } with a new ghost object; the
 * input is never changed.
 */
export function stepGhost(g, board, maze, px, target, rng) {
  const geometry = houseGeometry(maze);
  const move = typeof px === "number" && px > 0 ? px : 0;
  switch (g.state) {
    case "house":
      return { ghost: moveHouse(g, geometry, move), rng };
    case "leaving":
      return { ghost: moveLeaving(g, geometry, move), rng };
    case "entering":
      return { ghost: moveEntering(g, geometry, move), rng };
    default:
      return moveCorridor(g, board, geometry, move, target, rng);
  }
}
