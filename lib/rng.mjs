// Seeded random numbers for the frightened ghosts' random walk.
//
// Pure ES module: no Qt, no Math.random. The generator's whole state is one
// unsigned 32-bit integer that lives in the game state (`state.rng`), so a
// game replayed from the same seed with the same inputs makes the same
// choices. mulberry32 (Tommy Ettinger): tiny, fast, good enough for four
// ghosts picking corridors.

/** Turn any number into a valid generator state. Missing or NaN means 1. */
export function seed(n) {
  const v = typeof n === "number" && Number.isFinite(n) ? Math.floor(n) : 1;
  return v >>> 0;
}

/**
 * One draw: returns { value, state } with `value` in [0, 1) and `state` the
 * generator's next state. The input is never changed (it is a number).
 */
export function nextRandom(state) {
  const next = (seed(state) + 0x6d2b79f5) >>> 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { value, state: next };
}

/** An integer in [0, n) as { value, state }. n below 1 yields 0 and still advances the state. */
export function randomInt(state, n) {
  const r = nextRandom(state);
  const size = typeof n === "number" && Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
  return { value: Math.floor(r.value * size), state: r.state };
}
