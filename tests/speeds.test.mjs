import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FULL_SPEED_TILES_PER_S, PELLET_PAUSE_TICKS, POWER_PAUSE_TICKS,
  playerSpeedFraction, playerSpeed,
  ghostSpeedFraction, ghostFrightenedSpeedFraction, tunnelSpeedFraction, elroySpeedFraction,
  playerFrightenedSpeedFraction, ghostSpeed, ghostFrightenedSpeed, tunnelSpeed, elroySpeed,
  playerFrightenedSpeed, elroyThresholds,
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

test("the ghost speed table follows the Dossier for levels 1, 2-4, 5-20 and 21+", () => {
  // level: [pac, pac fright, ghost, ghost fright, tunnel, elroy 1, elroy 2]
  const table = {
    1: [0.80, 0.90, 0.75, 0.50, 0.40, 0.80, 0.85],
    2: [0.90, 0.95, 0.85, 0.55, 0.45, 0.90, 0.95],
    4: [0.90, 0.95, 0.85, 0.55, 0.45, 0.90, 0.95],
    5: [1.00, 1.00, 0.95, 0.60, 0.50, 1.00, 1.05],
    20: [1.00, 1.00, 0.95, 0.60, 0.50, 1.00, 1.05],
    21: [0.90, 0.90, 0.95, 0.60, 0.50, 1.00, 1.05],
  };
  for (const [l, row] of Object.entries(table)) {
    const level = Number(l);
    assert.equal(playerSpeedFraction(level), row[0], `pac L${level}`);
    assert.equal(playerFrightenedSpeedFraction(level), row[1], `pac fright L${level}`);
    assert.equal(ghostSpeedFraction(level), row[2], `ghost L${level}`);
    assert.equal(ghostFrightenedSpeedFraction(level), row[3], `ghost fright L${level}`);
    assert.equal(tunnelSpeedFraction(level), row[4], `tunnel L${level}`);
    assert.equal(elroySpeedFraction(level, 1), row[5], `elroy 1 L${level}`);
    assert.equal(elroySpeedFraction(level, 2), row[6], `elroy 2 L${level}`);
    assert.equal(elroySpeedFraction(level, 0), row[2], "stage 0 is the normal ghost speed");
    close(ghostSpeed(level), row[2] * FULL_SPEED_TILES_PER_S, `ghostSpeed L${level}`);
    close(ghostFrightenedSpeed(level), row[3] * FULL_SPEED_TILES_PER_S);
    close(tunnelSpeed(level), row[4] * FULL_SPEED_TILES_PER_S);
    close(elroySpeed(level, 1), row[5] * FULL_SPEED_TILES_PER_S);
    close(elroySpeed(level, 2), row[6] * FULL_SPEED_TILES_PER_S);
    close(playerFrightenedSpeed(level), row[1] * FULL_SPEED_TILES_PER_S);
  }
  assert.equal(ghostSpeedFraction(undefined), 0.75, "bad levels are level 1");
});

test("Cruise Elroy thresholds by level, stage 2 at half", () => {
  const expect = { 1: 20, 2: 30, 3: 40, 5: 40, 6: 50, 8: 50, 9: 60, 11: 60, 12: 80, 14: 80, 15: 100, 18: 100, 19: 120, 40: 120 };
  for (const [l, stage1] of Object.entries(expect)) {
    assert.deepEqual(elroyThresholds(Number(l)), { stage1, stage2: stage1 / 2 }, `L${l}`);
  }
  assert.deepEqual(elroyThresholds(0), { stage1: 20, stage2: 10 });
});
