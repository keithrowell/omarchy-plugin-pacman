import { test } from "node:test";
import assert from "node:assert/strict";
import { DIRS, keyToDirection, pressKey, releaseKey, wantedDirection } from "../lib/input.mjs";

test("DIRS has the four directions with unit vectors and opposites", () => {
  assert.deepEqual(Object.keys(DIRS).sort(), ["down", "left", "right", "up"]);
  assert.deepEqual(DIRS.up, { dx: 0, dy: -1, opposite: "down" });
  assert.deepEqual(DIRS.down, { dx: 0, dy: 1, opposite: "up" });
  assert.deepEqual(DIRS.left, { dx: -1, dy: 0, opposite: "right" });
  assert.deepEqual(DIRS.right, { dx: 1, dy: 0, opposite: "left" });
  for (const d of Object.keys(DIRS)) assert.equal(DIRS[DIRS[d].opposite].opposite, d);
  assert.ok(Object.isFrozen(DIRS));
});

test("keyToDirection maps arrows, hjkl and WASD in either case", () => {
  const expect = {
    Up: "up", Down: "down", Left: "left", Right: "right",
    k: "up", j: "down", h: "left", l: "right",
    w: "up", s: "down", a: "left", d: "right",
  };
  for (const [name, dir] of Object.entries(expect)) {
    assert.equal(keyToDirection(name), dir, name);
    assert.equal(keyToDirection(name.toUpperCase()), dir, name.toUpperCase());
    assert.equal(keyToDirection(name.toLowerCase()), dir, name.toLowerCase());
  }
});

test("keyToDirection returns null for anything else", () => {
  for (const name of ["g", "q", "F12", "Escape", "", " ", "x", 7, null, undefined, {}]) {
    assert.equal(keyToDirection(name), null, String(name));
  }
});

test("pressKey then wantedDirection: the latest press wins", () => {
  let pressed = [];
  pressed = pressKey(pressed, "Left");
  assert.equal(wantedDirection(pressed), "left");
  pressed = pressKey(pressed, "Up");
  assert.equal(wantedDirection(pressed), "up");
  pressed = pressKey(pressed, "Left"); // re-press makes it the latest again
  assert.equal(wantedDirection(pressed), "left");
  assert.equal(pressed.length, 2);
});

test("releaseKey falls back to the key still held; releasing an unheld key is a no-op", () => {
  let pressed = pressKey(pressKey([], "a"), "w");
  assert.equal(wantedDirection(pressed), "up");
  pressed = releaseKey(pressed, "w");
  assert.equal(wantedDirection(pressed), "left");
  const same = releaseKey(pressed, "Right");
  assert.deepEqual(same, pressed);
  pressed = releaseKey(pressed, "A"); // case-insensitive
  assert.equal(wantedDirection(pressed), null);
  assert.deepEqual(pressed, []);
});

test("non-direction keys are never tracked", () => {
  const pressed = pressKey([], "g");
  assert.deepEqual(pressed, []);
  assert.equal(wantedDirection(pressKey(pressed, "F12")), null);
});

test("wantedDirection of an empty or missing list is null", () => {
  assert.equal(wantedDirection([]), null);
  assert.equal(wantedDirection(undefined), null);
});

test("pressKey and releaseKey do not mutate their input", () => {
  const original = Object.freeze(["left"]);
  const after = pressKey(original, "Up");
  assert.deepEqual(original, ["left"]);
  assert.notEqual(after, original);
  const released = releaseKey(after, "Left");
  assert.deepEqual(after, ["left", "up"]);
  assert.deepEqual(released, ["up"]);
});
