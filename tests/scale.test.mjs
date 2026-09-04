import { test } from "node:test";
import assert from "node:assert/strict";
import { fitArcade, fitSmooth, saneDpr, NATIVE_WIDTH, NATIVE_HEIGHT } from "../lib/scale.mjs";

test("native size is the arcade 224x248", () => {
  assert.equal(NATIVE_WIDTH, 224);
  assert.equal(NATIVE_HEIGHT, 248);
});

test("fitArcade at dpr 1: 672x864 gives 3 device pixels per native pixel, letterboxed vertically", () => {
  const fit = fitArcade(672, 864, 1);
  assert.equal(fit.k, 3);
  assert.equal(fit.scale, 3);
  assert.equal(fit.width, 672);
  assert.equal(fit.height, 744);
  assert.equal(fit.x, 0);
  assert.equal(fit.y, 60);
});

test("fitArcade at dpr 1.6 scales in device pixels: 672x864 gives k 4, logical scale 2.5", () => {
  const fit = fitArcade(672, 864, 1.6);
  assert.equal(fit.k, 4); // 672*1.6/224 = 4.8 -> 4
  assert.equal(fit.scale, 2.5); // 4 / 1.6
  assert.equal(fit.width, 560);
  assert.equal(fit.height, 620);
  // Offsets land on whole device pixels so every block stays k device pixels.
  assert.ok(Number.isInteger(Math.round(fit.x * 1.6 * 1e6) / 1e6), `x ${fit.x} is not on a device pixel`);
  assert.ok(Number.isInteger(Math.round(fit.y * 1.6 * 1e6) / 1e6), `y ${fit.y} is not on a device pixel`);
  assert.ok(fit.x >= 0 && fit.x <= (672 - 560) / 2);
  assert.ok(fit.y >= 0 && fit.y <= (864 - 620) / 2);
});

test("fitArcade never goes below k 1, even when the window is smaller than native", () => {
  const fit = fitArcade(100, 100, 1);
  assert.equal(fit.k, 1);
  assert.equal(fit.scale, 1);
  assert.equal(fit.width, 224);
  assert.equal(fit.height, 248);
  assert.equal(fit.x, 0);
  assert.equal(fit.y, 0);
});

test("fitArcade picks the limiting axis", () => {
  const wide = fitArcade(2000, 496, 1);
  assert.equal(wide.k, 2);
  const tall = fitArcade(448, 2000, 1);
  assert.equal(tall.k, 2);
});

test("fitArcade accepts explicit native dimensions", () => {
  const fit = fitArcade(300, 300, 1, 100, 100);
  assert.equal(fit.k, 3);
  assert.equal(fit.width, 300);
});

test("fitSmooth: 448x496 at dpr 1 gives a fractional-capable scale of 2, centred", () => {
  const fit = fitSmooth(448, 496, 1);
  assert.equal(fit.scale, 2);
  assert.equal(fit.width, 448);
  assert.equal(fit.height, 496);
  assert.equal(fit.x, 0);
  assert.equal(fit.y, 0);
});

test("fitSmooth is fractional and independent of dpr", () => {
  const a = fitSmooth(336, 1000, 1);
  const b = fitSmooth(336, 1000, 1.6);
  assert.equal(a.scale, 1.5);
  assert.equal(b.scale, 1.5);
  assert.equal(a.width, 336);
  assert.equal(a.height, 372);
  assert.equal(a.x, 0);
  assert.equal(a.y, (1000 - 372) / 2);
});

test("fitSmooth shrinks below 1 when the window is smaller than native", () => {
  const fit = fitSmooth(112, 124, 1);
  assert.equal(fit.scale, 0.5);
});

test("fitArcade treats a missing, non-finite or sub-1 dpr as 1", () => {
  const ref = fitArcade(672, 864, 1);
  for (const bad of [undefined, null, NaN, Infinity, 0, -2, 0.5, "1.6"]) {
    assert.deepEqual(fitArcade(672, 864, bad), ref, `dpr ${String(bad)}`);
  }
  assert.equal(saneDpr(1.6), 1.6);
  assert.equal(saneDpr(1), 1);
});
