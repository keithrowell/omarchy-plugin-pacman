import { test } from "node:test";
import assert from "node:assert/strict";
import {
  modeAt, modeAtTick, scheduleFor, frightenedFor, frightenedTicks, flashesFor,
  FLASH_HALF_TICKS, flashWindowTicks, isFlashOn,
} from "../lib/modes.mjs";

test("level 1: S7 C20 S7 C20 S5 C20 S5 then chase for ever", () => {
  assert.equal(modeAt(1, 0), "scatter");
  assert.equal(modeAt(1, 6.99), "scatter");
  assert.equal(modeAt(1, 7), "chase");
  assert.equal(modeAt(1, 26.99), "chase");
  assert.equal(modeAt(1, 27), "scatter");
  assert.equal(modeAt(1, 33.99), "scatter");
  assert.equal(modeAt(1, 34), "chase");
  assert.equal(modeAt(1, 54), "scatter");
  assert.equal(modeAt(1, 58.99), "scatter");
  assert.equal(modeAt(1, 59), "chase");
  assert.equal(modeAt(1, 79), "scatter");
  assert.equal(modeAt(1, 84), "chase");
  assert.equal(modeAt(1, 1e6), "chase");
});

test("levels 2-4: the third chase lasts 1033 s, then a 1/60 s scatter, then chase for ever", () => {
  for (const level of [2, 3, 4]) {
    assert.equal(modeAt(level, 0), "scatter", `L${level}`);
    assert.equal(modeAt(level, 7), "chase");
    assert.equal(modeAt(level, 27), "scatter");
    assert.equal(modeAt(level, 34), "chase");
    assert.equal(modeAt(level, 54), "scatter");
    assert.equal(modeAt(level, 59), "chase");
    assert.equal(modeAt(level, 59 + 1032.99), "chase");
    // Tick-exact: the scatter lasts one tick.
    const tick = (59 + 1033) * 60;
    assert.equal(modeAtTick(level, tick - 1), "chase");
    assert.equal(modeAtTick(level, tick), "scatter");
    assert.equal(modeAtTick(level, tick + 1), "chase");
    assert.equal(modeAt(level, 59 + 1033), "scatter");
    assert.equal(modeAt(level, 59 + 1033 + 1 / 60), "chase");
    assert.equal(modeAt(level, 1e6), "chase");
  }
});

test("levels 5+: S5 C20 S5 C20 S5 C1037 S1/60 then chase for ever", () => {
  for (const level of [5, 9, 21, 255]) {
    assert.equal(modeAt(level, 0), "scatter", `L${level}`);
    assert.equal(modeAt(level, 4.99), "scatter");
    assert.equal(modeAt(level, 5), "chase");
    assert.equal(modeAt(level, 25), "scatter");
    assert.equal(modeAt(level, 30), "chase");
    assert.equal(modeAt(level, 50), "scatter");
    assert.equal(modeAt(level, 55), "chase");
    const tick = (55 + 1037) * 60;
    assert.equal(modeAtTick(level, tick - 1), "chase");
    assert.equal(modeAtTick(level, tick), "scatter");
    assert.equal(modeAtTick(level, tick + 1), "chase");
    assert.equal(modeAt(level, 1e6), "chase");
  }
});

test("scheduleFor returns the phase list in ticks with an infinite final chase", () => {
  const s1 = scheduleFor(1);
  assert.deepEqual(s1.map(p => p.mode), ["scatter", "chase", "scatter", "chase", "scatter", "chase", "scatter", "chase"]);
  assert.deepEqual(s1.map(p => p.ticks), [420, 1200, 420, 1200, 300, 1200, 300, Infinity]);
  assert.deepEqual(scheduleFor(2).map(p => p.ticks), [420, 1200, 420, 1200, 300, 1033 * 60, 1, Infinity]);
  assert.deepEqual(scheduleFor(5).map(p => p.ticks), [300, 1200, 300, 1200, 300, 1037 * 60, 1, Infinity]);
  assert.equal(scheduleFor(0), scheduleFor(1), "bad levels are level 1");
  assert.equal(scheduleFor(undefined), scheduleFor(1));
  assert.ok(Object.isFrozen(s1));
});

test("frightened seconds and flash counts follow the Dossier table", () => {
  const seconds = { 1: 6, 2: 5, 3: 4, 4: 3, 5: 2, 6: 5, 7: 2, 8: 2, 9: 1, 10: 5, 11: 2, 12: 1, 13: 1, 14: 3, 15: 1, 16: 1, 17: 0, 18: 1, 19: 0, 20: 0, 21: 0, 40: 0 };
  const flashes = { 1: 5, 2: 5, 3: 5, 4: 5, 5: 5, 6: 5, 7: 5, 8: 5, 9: 3, 10: 5, 11: 5, 12: 3, 13: 3, 14: 5, 15: 3, 16: 3, 17: 0, 18: 3, 19: 0, 20: 0, 21: 0, 40: 0 };
  for (const [level, s] of Object.entries(seconds)) {
    assert.equal(frightenedFor(Number(level)), s, `seconds L${level}`);
    assert.equal(frightenedTicks(Number(level)), s * 60, `ticks L${level}`);
    assert.equal(flashesFor(Number(level)), flashes[level], `flashes L${level}`);
  }
  assert.equal(frightenedFor(21), 0);
  assert.equal(frightenedFor(0), 6, "bad levels are level 1");
});

test("flashing: the last flashes x 2 x FLASH_HALF_TICKS ticks alternate, starting on the flash colour", () => {
  assert.equal(FLASH_HALF_TICKS, 12);
  assert.equal(flashWindowTicks(1), 5 * 24);
  assert.equal(flashWindowTicks(9), 3 * 24);
  assert.equal(flashWindowTicks(17), 0);
  // Level 1: 360 fright ticks; no flash until 120 remain.
  assert.equal(isFlashOn(1, 360), false);
  assert.equal(isFlashOn(1, 121), false);
  assert.equal(isFlashOn(1, 120), true);
  assert.equal(isFlashOn(1, 109), true);
  assert.equal(isFlashOn(1, 108), false);
  assert.equal(isFlashOn(1, 97), false);
  assert.equal(isFlashOn(1, 96), true);
  assert.equal(isFlashOn(1, 1), false);
  assert.equal(isFlashOn(1, 0), false, "not frightened: never flashing");
  // Five full on/off pairs in the window.
  let on = 0;
  for (let t = 120; t >= 1; t--) if (isFlashOn(1, t) && !isFlashOn(1, t + 1)) on++;
  assert.equal(on, 5);
  assert.equal(isFlashOn(17, 5), false, "no fright, no flash");
});
