// Direction input: key names to directions, and the set of held keys.
//
// Pure ES module: no Qt. Main.qml translates Qt key codes to the names below
// and keeps the `pressed` list; every tick it asks wantedDirection() for the
// direction to feed the game. Auto-repeat is the caller's problem: it must
// report presses and releases, not repeats.

/** The four directions: unit vector in tiles/pixels and the reverse direction. */
export const DIRS = Object.freeze({
  up: Object.freeze({ dx: 0, dy: -1, opposite: "down" }),
  down: Object.freeze({ dx: 0, dy: 1, opposite: "up" }),
  left: Object.freeze({ dx: -1, dy: 0, opposite: "right" }),
  right: Object.freeze({ dx: 1, dy: 0, opposite: "left" }),
});

/** Key name (lower-cased) -> direction. Arrows, vi keys and WASD. */
const KEYS = Object.freeze({
  up: "up", down: "down", left: "left", right: "right",
  k: "up", j: "down", h: "left", l: "right",
  w: "up", s: "down", a: "left", d: "right",
});

function normalise(name) {
  return typeof name === "string" ? name.trim().toLowerCase() : "";
}

/** "Up", "k", "W" ... -> "up" | "down" | "left" | "right"; anything else -> null. */
export function keyToDirection(name) {
  const dir = KEYS[normalise(name)];
  return dir === undefined ? null : dir;
}

/**
 * Record a key press. Returns a new list of held key names, most recent last;
 * a key that is already held moves to the end. Keys that are not direction
 * keys are ignored (the list is returned as a copy, unchanged).
 */
export function pressKey(pressed, name) {
  const held = Array.isArray(pressed) ? pressed.slice() : [];
  const key = normalise(name);
  if (KEYS[key] === undefined) return held;
  const at = held.indexOf(key);
  if (at !== -1) held.splice(at, 1);
  held.push(key);
  return held;
}

/** Record a key release. Returns a new list; releasing a key that is not held changes nothing. */
export function releaseKey(pressed, name) {
  const key = normalise(name);
  const held = Array.isArray(pressed) ? pressed.slice() : [];
  const at = held.indexOf(key);
  if (at !== -1) held.splice(at, 1);
  return held;
}

/** The direction of the most recently pressed key still held, or null. */
export function wantedDirection(pressed) {
  if (!Array.isArray(pressed) || pressed.length === 0) return null;
  return keyToDirection(pressed[pressed.length - 1]);
}
