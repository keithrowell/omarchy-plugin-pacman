// Speed tables, in tiles per second.
//
// Pure ES module: no Qt, no I/O. The original runs Pac-Man at up to 75.75 px/s
// over 8-px tiles; each level plays at a fraction of that. Eating pauses the
// player for a tick per pellet (three per power pellet), which is the classic
// "slows down while eating" feel.

export const FULL_SPEED_TILES_PER_S = 75.75 / 8;

export const PELLET_PAUSE_TICKS = 1;
export const POWER_PAUSE_TICKS = 3;

/** Fraction of full speed for the player at `level` (1-based); the classic table. */
export function playerSpeedFraction(level) {
  const n = typeof level === "number" && Number.isFinite(level) && level >= 1 ? Math.floor(level) : 1;
  if (n === 1) return 0.8;
  if (n <= 4) return 0.9;
  if (n <= 20) return 1.0;
  return 0.9;
}

/** The player's speed at `level`, in tiles per second. */
export function playerSpeed(level) {
  return playerSpeedFraction(level) * FULL_SPEED_TILES_PER_S;
}

// Ghost speeds, transcribed from the Pac-Man Dossier's speed table; every
// value is a fraction of the same 75.75 px/s full speed. Levels 21+ have no
// frightened time, so the frightened columns there carry the level-5+ values
// for the ghosts and the normal speed for the player; they are never used.

function saneLevel(level) {
  return typeof level === "number" && Number.isFinite(level) && level >= 1 ? Math.floor(level) : 1;
}

/** Row of the Dossier table for `level`: 0 = level 1, 1 = levels 2-4, 2 = levels 5-20, 3 = 21+. */
function band(level) {
  const n = saneLevel(level);
  if (n === 1) return 0;
  if (n <= 4) return 1;
  if (n <= 20) return 2;
  return 3;
}

const GHOST = Object.freeze([0.75, 0.85, 0.95, 0.95]);
const GHOST_FRIGHT = Object.freeze([0.50, 0.55, 0.60, 0.60]);
const TUNNEL = Object.freeze([0.40, 0.45, 0.50, 0.50]);
const ELROY_1 = Object.freeze([0.80, 0.90, 1.00, 1.00]);
const ELROY_2 = Object.freeze([0.85, 0.95, 1.05, 1.05]);
const PLAYER_FRIGHT = Object.freeze([0.90, 0.95, 1.00, 0.90]);

export function ghostSpeedFraction(level) { return GHOST[band(level)]; }
export function ghostFrightenedSpeedFraction(level) { return GHOST_FRIGHT[band(level)]; }
export function tunnelSpeedFraction(level) { return TUNNEL[band(level)]; }
export function playerFrightenedSpeedFraction(level) { return PLAYER_FRIGHT[band(level)]; }

/** Cruise Elroy fraction for `stage` 1 or 2; any other stage is Blinky's normal speed. */
export function elroySpeedFraction(level, stage) {
  if (stage === 1) return ELROY_1[band(level)];
  if (stage === 2) return ELROY_2[band(level)];
  return GHOST[band(level)];
}

/** Ghosts' normal speed at `level`, tiles per second. */
export function ghostSpeed(level) { return ghostSpeedFraction(level) * FULL_SPEED_TILES_PER_S; }
/** Frightened ghosts' speed, tiles per second. */
export function ghostFrightenedSpeed(level) { return ghostFrightenedSpeedFraction(level) * FULL_SPEED_TILES_PER_S; }
/** Any ghost in the tunnel, tiles per second. */
export function tunnelSpeed(level) { return tunnelSpeedFraction(level) * FULL_SPEED_TILES_PER_S; }
/** Blinky as Cruise Elroy at `stage` 1 or 2, tiles per second. */
export function elroySpeed(level, stage) { return elroySpeedFraction(level, stage) * FULL_SPEED_TILES_PER_S; }
/** The player while any ghost is frightened, tiles per second. */
export function playerFrightenedSpeed(level) { return playerFrightenedSpeedFraction(level) * FULL_SPEED_TILES_PER_S; }

/**
 * Pellets left on the board at which Blinky becomes Cruise Elroy (Dossier):
 * { stage1, stage2 }, stage 2 at half of stage 1.
 */
export function elroyThresholds(level) {
  const n = saneLevel(level);
  let stage1;
  if (n === 1) stage1 = 20;
  else if (n === 2) stage1 = 30;
  else if (n <= 5) stage1 = 40;
  else if (n <= 8) stage1 = 50;
  else if (n <= 11) stage1 = 60;
  else if (n <= 14) stage1 = 80;
  else if (n <= 18) stage1 = 100;
  else stage1 = 120;
  return { stage1, stage2: stage1 / 2 };
}
