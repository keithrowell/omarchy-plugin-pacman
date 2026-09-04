// The attract demo: a scripted game replayed deterministically on the title
// screen after ten idle seconds.
//
// Pure ES module: no Qt, no I/O. The script (lib/attract-script.mjs, written
// by tools/gen-attract.mjs) is a run-length list of per-tick directions plus
// the checksum of the maze text it was generated from, so a changed maze is
// noticed (attractValid) instead of walking Pac-Man into a wall.

import { DIRS } from "./input.mjs";

/**
 * FNV-1a, 32-bit, over the UTF-16 code units of `text`. Returns an unsigned
 * integer; the same text always gives the same number and a single changed
 * character gives a different one.
 */
export function mazeChecksum(text) {
  const s = String(text);
  let hash = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    hash ^= s.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function validDir(dir) {
  return dir === null || (typeof dir === "string" && DIRS[dir] !== undefined);
}

function validRun(run) {
  return Array.isArray(run) && run.length === 2 && validDir(run[0])
    && typeof run[1] === "number" && Number.isInteger(run[1]) && run[1] > 0;
}

/** True when `script` has the expected shape and its runs add up to its length. */
export function wellFormed(script) {
  if (!script || typeof script !== "object" || !Array.isArray(script.runs)) return false;
  if (typeof script.length !== "number" || script.length <= 0) return false;
  let total = 0;
  for (const run of script.runs) {
    if (!validRun(run)) return false;
    total += run[1];
  }
  return total === script.length;
}

/** The script was generated from this maze text and is usable. */
export function attractValid(script, mazeText) {
  return wellFormed(script) && script.checksum === mazeChecksum(mazeText);
}

/** The per-tick directions the runs stand for, one entry per tick. */
export function expandScript(script) {
  const dirs = [];
  if (!script || !Array.isArray(script.runs)) return dirs;
  for (const run of script.runs) {
    for (let i = 0; i < run[1]; i++) dirs.push(run[0]);
  }
  return dirs;
}

/**
 * The direction to feed the game on `tick` (the state's tick before the
 * step), or null once the script has run out.
 */
export function attractInput(script, tick) {
  if (!script || !Array.isArray(script.runs) || !(tick >= 0)) return null;
  let at = 0;
  for (const run of script.runs) {
    at += run[1];
    if (tick < at) return run[0];
  }
  return null;
}

/** True once the state's tick has reached the end of the script. */
export function attractEnded(script, tick) {
  return !script || typeof script.length !== "number" || tick >= script.length;
}
