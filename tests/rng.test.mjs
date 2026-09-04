import { test } from "node:test";
import assert from "node:assert/strict";
import { seed, nextRandom, randomInt } from "../lib/rng.mjs";

test("seed gives an unsigned 32-bit integer state, the same for the same input", () => {
  assert.equal(seed(1), seed(1));
  assert.equal(seed(1), 1);
  assert.ok(Number.isInteger(seed(7)) && seed(7) >= 0 && seed(7) < 2 ** 32);
  assert.equal(seed(-1), 0xffffffff, "wraps to unsigned");
  assert.equal(seed(2 ** 32 + 5), 5);
  assert.equal(seed(undefined), 1, "no seed means seed 1");
  assert.equal(seed(NaN), 1);
  assert.equal(seed(3.9), 3, "floors a fraction");
});

test("the same seed gives the same sequence; different seeds differ", () => {
  const run = (s, n) => {
    const out = [];
    let state = seed(s);
    for (let i = 0; i < n; i++) {
      const r = nextRandom(state);
      out.push(r.value);
      state = r.state;
    }
    return out;
  };
  assert.deepEqual(run(7, 50), run(7, 50));
  assert.notDeepEqual(run(7, 50), run(8, 50));
  assert.notDeepEqual(run(1, 50), run(2, 50));
  const values = run(7, 50);
  assert.ok(new Set(values).size > 45, "the sequence is not stuck");
});

test("values lie in [0, 1) and the state advances every draw", () => {
  let state = seed(123);
  for (let i = 0; i < 10000; i++) {
    const r = nextRandom(state);
    assert.ok(r.value >= 0 && r.value < 1, `value ${r.value}`);
    assert.notEqual(r.state, state, "state advanced");
    assert.ok(Number.isInteger(r.state) && r.state >= 0 && r.state < 2 ** 32);
    state = r.state;
  }
});

test("nextRandom is a pure function of its state: calling it twice gives the same result", () => {
  const state = seed(99);
  const a = nextRandom(state);
  const b = nextRandom(state);
  assert.deepEqual(a, b);
  assert.equal(state, seed(99), "a number cannot be mutated, but the same input still yields the same output");
});

test("randomInt stays inside [0, n) and covers every value", () => {
  let state = seed(5);
  const seen = new Set();
  for (let i = 0; i < 2000; i++) {
    const r = randomInt(state, 4);
    assert.ok(Number.isInteger(r.value) && r.value >= 0 && r.value < 4, `value ${r.value}`);
    seen.add(r.value);
    state = r.state;
  }
  assert.deepEqual([...seen].sort(), [0, 1, 2, 3]);
  assert.equal(randomInt(state, 1).value, 0);
  assert.equal(randomInt(state, 0).value, 0, "n below 1 yields 0 without dividing by zero");
});

test("the mulberry32 reference values for seed 1", () => {
  // First three draws of mulberry32 seeded with 1, from the reference implementation.
  let state = seed(1);
  const out = [];
  for (let i = 0; i < 3; i++) {
    const r = nextRandom(state);
    out.push(Math.round(r.value * 1e6) / 1e6);
    state = r.state;
  }
  assert.deepEqual(out, [0.627074, 0.002736, 0.527447]);
});
