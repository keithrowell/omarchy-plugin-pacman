// Ghost mode schedule and frightened timing per level.
//
// Pure ES module: no Qt, no I/O. Every number below is transcribed from the
// Pac-Man Dossier (Jamey Pittman), "Scatter/Chase" and "Frightened" tables.
// The clock is in ticks (1/60 s); game.mjs advances it only while the ghosts
// are not frightened, as the original pauses the timer then.

const TICKS_PER_S = 60;

/** Phase durations in ticks; the modes alternate scatter, chase, ... and the last chase never ends. */
const SCHEDULE_TICKS = Object.freeze({
  // Level 1: S7 C20 S7 C20 S5 C20 S5 C∞.
  level1: Object.freeze([7, 20, 7, 20, 5, 20, 5, Infinity].map(s => s * TICKS_PER_S)),
  // Levels 2-4: S7 C20 S7 C20 S5 C1033 S1/60 C∞.
  level2to4: Object.freeze([7, 20, 7, 20, 5, 1033].map(s => s * TICKS_PER_S).concat([1, Infinity])),
  // Levels 5+: S5 C20 S5 C20 S5 C1037 S1/60 C∞.
  level5plus: Object.freeze([5, 20, 5, 20, 5, 1037].map(s => s * TICKS_PER_S).concat([1, Infinity])),
});

function saneLevel(level) {
  return typeof level === "number" && Number.isFinite(level) && level >= 1 ? Math.floor(level) : 1;
}

function build(ticks) {
  return Object.freeze(ticks.map((t, i) => Object.freeze({ mode: i % 2 === 0 ? "scatter" : "chase", ticks: t })));
}

const SCHEDULES = Object.freeze({
  level1: build(SCHEDULE_TICKS.level1),
  level2to4: build(SCHEDULE_TICKS.level2to4),
  level5plus: build(SCHEDULE_TICKS.level5plus),
});

/** The phase list for `level`: [{ mode, ticks }, ...], the final chase Infinity. Frozen, shared. */
export function scheduleFor(level) {
  const n = saneLevel(level);
  if (n === 1) return SCHEDULES.level1;
  if (n <= 4) return SCHEDULES.level2to4;
  return SCHEDULES.level5plus;
}

/** "scatter" | "chase" at `tick` ticks into the level's mode clock. */
export function modeAtTick(level, tick) {
  const schedule = scheduleFor(level);
  let t = typeof tick === "number" && tick > 0 ? tick : 0;
  for (let i = 0; i < schedule.length; i++) {
    if (t < schedule[i].ticks) return schedule[i].mode;
    t -= schedule[i].ticks;
  }
  return "chase";
}

/** "scatter" | "chase" at `seconds` into the level, for callers that think in seconds. */
export function modeAt(level, seconds) {
  const s = typeof seconds === "number" && seconds > 0 ? seconds : 0;
  // Floor with a hair of slack so 7.0 s is tick 420, not 419.999.
  return modeAtTick(level, Math.floor(s * TICKS_PER_S + 1e-6));
}

// Frightened duration (s) and flash count by level, index 0 = level 1; the last
// entry covers every later level (Dossier: 19+ has no frightened time).
const FRIGHT_SECONDS = Object.freeze([6, 5, 4, 3, 2, 5, 2, 2, 1, 5, 2, 1, 1, 3, 1, 1, 0, 1, 0]);
const FRIGHT_FLASHES = Object.freeze([5, 5, 5, 5, 5, 5, 5, 5, 3, 5, 5, 3, 3, 5, 3, 3, 0, 3, 0]);

function frightIndex(level) {
  return Math.min(saneLevel(level), FRIGHT_SECONDS.length) - 1;
}

/** Seconds the ghosts stay frightened at `level`; 0 means a power pellet only reverses them. */
export function frightenedFor(level) {
  return FRIGHT_SECONDS[frightIndex(level)];
}

/** The same in ticks. */
export function frightenedTicks(level) {
  return frightenedFor(level) * TICKS_PER_S;
}

/** How many times the ghosts flash before the frightened time ends. */
export function flashesFor(level) {
  return FRIGHT_FLASHES[frightIndex(level)];
}

/**
 * Half a flash in ticks: the ghost shows the flash colour for this long, then
 * the frightened colour for as long again. 12 ticks makes the level-1 five
 * flashes fill the spec's "last two seconds" exactly.
 */
export const FLASH_HALF_TICKS = 12;

/** Ticks of frightened time during which the ghosts flash. */
export function flashWindowTicks(level) {
  return flashesFor(level) * 2 * FLASH_HALF_TICKS;
}

/**
 * True when a frightened ghost should be drawn in the flash colour, given the
 * frightened ticks still remaining. Flashing starts on the flash colour and
 * ends on the frightened colour.
 */
export function isFlashOn(level, remainingTicks) {
  const r = typeof remainingTicks === "number" ? remainingTicks : 0;
  const window = flashWindowTicks(level);
  if (r <= 0 || window === 0 || r > window) return false;
  return Math.floor((window - r) / FLASH_HALF_TICKS) % 2 === 0;
}
