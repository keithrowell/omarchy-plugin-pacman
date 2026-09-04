// The player: position, direction, buffered turn, and the movement rules.
//
// Pure ES module: no Qt. Positions are maze pixels (8-px tiles, x in [0,224),
// y in [0,248), a tile's centre at tx*8+4, ty*8+4); the renderer adds the HUD
// offset, never this module. Nothing here knows about score or pellets:
// game.mjs looks at the tile the player lands on.

import { tileAt, isWalkable } from "./maze.mjs";
import { DIRS } from "./input.mjs";

export const TILE_PX = 8;
const HALF = TILE_PX / 2;

/**
 * How far from a tile's centre (along the movement axis) a perpendicular turn
 * is still taken, snapping to that centre. Half a tile means the turn commits
 * as soon as the junction tile is entered: the classic pre-turn. Tune here.
 */
export const CORNER_TOLERANCE = 4;

/** Wrap band: the sprite is 13 px wide, so keep drawing continuous across the edge. */
const WRAP_LEFT = -HALF;

function centreOf(t) {
  return t * TILE_PX + HALF;
}

/** Tile coordinates of a point, x wrapped into the board (tunnel). */
export function tileOf(p, board) {
  const tx = Math.floor(p.x / TILE_PX);
  const ty = Math.floor(p.y / TILE_PX);
  return { x: ((tx % board.width) + board.width) % board.width, y: ty };
}

/** Spawn tile centre, facing left, nothing buffered. */
export function createPlayer(maze) {
  return {
    x: centreOf(maze.spawn.x),
    y: centreOf(maze.spawn.y),
    dir: "left",
    wantDir: null,
    distance: 0,
    stopped: false,
  };
}

function canEnter(board, tx, ty, dirName) {
  const d = DIRS[dirName];
  return isWalkable(tileAt(board, tx + d.dx, ty + d.dy));
}

/**
 * The buffered direction after this tick's input. `wantDir` replaces the
 * buffer when it is a valid direction other than the one already being
 * travelled; asking for the current direction is a no-op that leaves the
 * buffer alone (so a held key does not cancel a tapped pre-turn), and
 * anything else (null, unknown names) keeps the buffer as it is. The one
 * place these rules live: stepPlayer and the game's pause ticks both use it.
 */
export function bufferWant(player, wantDir) {
  const valid = typeof wantDir === "string" && DIRS[wantDir] !== undefined;
  return valid && wantDir !== player.dir ? wantDir : player.wantDir;
}

/**
 * Advance the player by `dt` seconds at `speedTilesPerS`. `wantDir` is the
 * direction the input wants this tick (or null); see bufferWant for how it
 * combines with the buffered wish, which persists until it can be taken.
 * Returns { player, moved } with a new player object; `moved` is the
 * distance travelled in px (snaps excluded).
 */
export function stepPlayer(player, board, wantDir, speedTilesPerS, dt) {
  let x = player.x, y = player.y, dir = player.dir;
  let want = bufferWant(player, wantDir);
  let stopped = player.stopped;
  let moved = 0;

  // Unwrapped tile coordinates: x may sit just outside [0, 224) while crossing
  // the tunnel; tileAt wraps for the lookup, centreOf must not.
  const tx = Math.floor(x / TILE_PX);
  const ty = Math.floor(y / TILE_PX);

  if (want !== null) {
    if (want === dir) {
      want = null;
    } else if (want === DIRS[dir].opposite) {
      dir = want;
      want = null;
      stopped = false;
    } else if (canEnter(board, tx, ty, want)) {
      const along = DIRS[dir].dx !== 0 ? x - centreOf(tx) : y - centreOf(ty);
      if (Math.abs(along) <= CORNER_TOLERANCE) {
        x = centreOf(tx);
        y = centreOf(ty);
        dir = want;
        want = null;
        stopped = false;
      }
    }
  }

  const d = DIRS[dir];
  const stepPx = speedTilesPerS * TILE_PX * dt;
  if (stepPx > 0) {
    if (d.dx !== 0) {
      const c = centreOf(tx);
      let nx = x + d.dx * stepPx;
      if (!canEnter(board, tx, ty, dir) && (nx - c) * d.dx > 0) {
        nx = c;
        stopped = true;
      } else {
        stopped = false;
      }
      moved = Math.abs(nx - x);
      x = nx;
      y = centreOf(ty);
    } else {
      const c = centreOf(ty);
      let ny = y + d.dy * stepPx;
      if (!canEnter(board, tx, ty, dir) && (ny - c) * d.dy > 0) {
        ny = c;
        stopped = true;
      } else {
        stopped = false;
      }
      moved = Math.abs(ny - y);
      y = ny;
      x = centreOf(tx);
    }
  }

  // Tunnel wrap.
  const widthPx = board.width * TILE_PX;
  if (x < WRAP_LEFT) x += widthPx;
  else if (x >= widthPx + HALF) x -= widthPx;

  return {
    player: { x, y, dir, wantDir: want, distance: player.distance + moved, stopped },
    moved,
  };
}
