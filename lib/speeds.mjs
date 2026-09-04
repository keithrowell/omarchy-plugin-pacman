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
