import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FULL_SPEED_TILES_PER_S, PELLET_PAUSE_TICKS, POWER_PAUSE_TICKS,
  playerSpeedFraction, playerSpeed,
} from "../lib/speeds.mjs";

const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg ?? ""} expected ${b}, got ${a}`);

test("full speed is the original 75.75 px/s in 8-px tiles", () => {
  close(FULL_SPEED_TILES_PER_S, 9.46875);
});

test("the level table follows the classic fractions", () => {
  assert.equal(playerSpeedFraction(1), 0.8);
  assert.equal(playerSpeedFraction(2), 0.9);
  assert.equal(playerSpeedFraction(3), 0.9);
  assert.equal(playerSpeedFraction(4), 0.9);
  assert.equal(playerSpeedFraction(5), 1.0);
  assert.equal(playerSpeedFraction(12), 1.0);
  assert.equal(playerSpeedFraction(20), 1.0);
  assert.equal(playerSpeedFraction(21), 0.9);
  assert.equal(playerSpeedFraction(99), 0.9);
});

test("playerSpeed is the fraction times full speed, in tiles per second", () => {
  close(playerSpeed(1), 0.8 * 9.46875, "level 1");
  close(playerSpeed(1) * 8, 60.6, "level 1 in px/s");
  close(playerSpeed(2), 0.9 * 9.46875, "level 2");
  close(playerSpeed(5), 9.46875, "level 5");
  close(playerSpeed(21), 0.9 * 9.46875, "level 21");
});

test("levels below 1 or non-numeric are treated as level 1", () => {
  assert.equal(playerSpeed(0), playerSpeed(1));
  assert.equal(playerSpeed(-3), playerSpeed(1));
  assert.equal(playerSpeed(undefined), playerSpeed(1));
  assert.equal(playerSpeed(NaN), playerSpeed(1));
});

test("eating pauses the player one tick per pellet and three per power pellet", () => {
  assert.equal(PELLET_PAUSE_TICKS, 1);
  assert.equal(POWER_PAUSE_TICKS, 3);
});
