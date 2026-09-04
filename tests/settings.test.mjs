import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseSettings, serialiseSettings, SETTINGS_DEFAULTS, MODES,
  parseHighScore, serialiseHighScore, MAX_HIGH_SCORE,
} from "../lib/settings.mjs";

test("defaults are arcade mode without scanlines", () => {
  assert.deepEqual(SETTINGS_DEFAULTS, { mode: "arcade", scanlines: false });
  assert.deepEqual(MODES, ["arcade", "smooth"]);
});

test("parseSettings returns the defaults on empty or non-string input", () => {
  assert.deepEqual(parseSettings(""), SETTINGS_DEFAULTS);
  assert.deepEqual(parseSettings(undefined), SETTINGS_DEFAULTS);
  assert.deepEqual(parseSettings(null), SETTINGS_DEFAULTS);
  assert.deepEqual(parseSettings(42), SETTINGS_DEFAULTS);
});

test("parseSettings returns the defaults on invalid JSON", () => {
  assert.deepEqual(parseSettings("{ mode: smooth"), SETTINGS_DEFAULTS);
  assert.deepEqual(parseSettings("not json at all"), SETTINGS_DEFAULTS);
});

test("parseSettings returns the defaults on an unknown mode or wrong shape", () => {
  assert.deepEqual(parseSettings('{"mode":"crt"}'), SETTINGS_DEFAULTS);
  assert.deepEqual(parseSettings('{"mode":7}'), SETTINGS_DEFAULTS);
  assert.deepEqual(parseSettings("[1,2,3]"), SETTINGS_DEFAULTS);
  assert.deepEqual(parseSettings("null"), SETTINGS_DEFAULTS);
});

test("parseSettings reads a valid smooth setting; a pre-scanlines file keeps them off", () => {
  assert.deepEqual(parseSettings('{"mode":"smooth"}'), { mode: "smooth", scanlines: false });
});

test("parseSettings reads scanlines and ignores a non-boolean one without losing the mode", () => {
  assert.deepEqual(parseSettings('{"mode":"smooth","scanlines":true}'), { mode: "smooth", scanlines: true });
  assert.deepEqual(parseSettings('{"mode":"arcade","scanlines":false}'), { mode: "arcade", scanlines: false });
  assert.deepEqual(parseSettings('{"mode":"smooth","scanlines":"yes"}'), { mode: "smooth", scanlines: false });
  assert.deepEqual(parseSettings('{"mode":"smooth","scanlines":1}'), { mode: "smooth", scanlines: false });
  assert.deepEqual(parseSettings('{"scanlines":true}'), { mode: "arcade", scanlines: true });
});

test("parseSettings ignores unknown keys", () => {
  assert.deepEqual(parseSettings('{"mode":"smooth","volume":3}'), { mode: "smooth", scanlines: false });
});

test("serialiseSettings emits pretty JSON ending in a newline", () => {
  const text = serialiseSettings({ mode: "smooth", scanlines: true });
  assert.ok(text.endsWith("\n"));
  assert.deepEqual(JSON.parse(text), { mode: "smooth", scanlines: true });
  assert.ok(text.includes("\n  "), "pretty printed");
});

test("serialiseSettings drops unknown keys and fixes invalid values", () => {
  assert.deepEqual(JSON.parse(serialiseSettings({ mode: "nope", extra: 1 })), { mode: "arcade", scanlines: false });
  assert.deepEqual(JSON.parse(serialiseSettings({ mode: "smooth", scanlines: "on" })), { mode: "smooth", scanlines: false });
  assert.deepEqual(JSON.parse(serialiseSettings(undefined)), { mode: "arcade", scanlines: false });
});

test("settings round-trip", () => {
  for (const mode of MODES) {
    for (const scanlines of [false, true]) {
      assert.deepEqual(parseSettings(serialiseSettings({ mode, scanlines })), { mode, scanlines });
    }
  }
});

test("parseSettings never returns the shared defaults object", () => {
  const a = parseSettings("");
  a.mode = "smooth";
  a.scanlines = true;
  assert.equal(SETTINGS_DEFAULTS.mode, "arcade");
  assert.equal(SETTINGS_DEFAULTS.scanlines, false);
});

test("parseHighScore reads the canonical object and a bare number", () => {
  assert.equal(parseHighScore('{"highScore": 500}'), 500);
  assert.equal(parseHighScore('{\n  "highScore": 12345\n}\n'), 12345);
  assert.equal(parseHighScore("12345"), 12345);
  assert.equal(parseHighScore("0"), 0);
});

test("parseHighScore treats corrupt, missing, negative and non-numeric values as 0", () => {
  assert.equal(parseHighScore(""), 0);
  assert.equal(parseHighScore(undefined), 0);
  assert.equal(parseHighScore(null), 0);
  assert.equal(parseHighScore("{ highScore: 5"), 0);
  assert.equal(parseHighScore("garbage"), 0);
  assert.equal(parseHighScore("[500]"), 0);
  assert.equal(parseHighScore("null"), 0);
  assert.equal(parseHighScore('{"highScore": -20}'), 0);
  assert.equal(parseHighScore('{"highScore": "500"}'), 0);
  assert.equal(parseHighScore('{"highScore": null}'), 0);
  assert.equal(parseHighScore('{"score": 500}'), 0);
  assert.equal(parseHighScore("-7"), 0);
});

test("parseHighScore floors floats and clamps huge values", () => {
  assert.equal(parseHighScore('{"highScore": 999.9}'), 999);
  assert.equal(parseHighScore("1e300"), MAX_HIGH_SCORE);
  assert.equal(parseHighScore('{"highScore": 1e300}'), MAX_HIGH_SCORE);
  assert.equal(MAX_HIGH_SCORE, Number.MAX_SAFE_INTEGER);
});

test("serialiseHighScore writes the canonical form and round-trips", () => {
  const text = serialiseHighScore(2760);
  assert.ok(text.endsWith("\n"));
  assert.deepEqual(JSON.parse(text), { highScore: 2760 });
  assert.equal(parseHighScore(text), 2760);
  for (const n of [0, 10, 12345, 99999999]) assert.equal(parseHighScore(serialiseHighScore(n)), n);
});

test("serialiseHighScore sanitises junk to 0, floors and clamps", () => {
  assert.deepEqual(JSON.parse(serialiseHighScore(undefined)), { highScore: 0 });
  assert.deepEqual(JSON.parse(serialiseHighScore("500")), { highScore: 0 });
  assert.deepEqual(JSON.parse(serialiseHighScore(-1)), { highScore: 0 });
  assert.deepEqual(JSON.parse(serialiseHighScore(NaN)), { highScore: 0 });
  assert.deepEqual(JSON.parse(serialiseHighScore(12.7)), { highScore: 12 });
  assert.deepEqual(JSON.parse(serialiseHighScore(Infinity)), { highScore: 0 });
  assert.deepEqual(JSON.parse(serialiseHighScore(1e300)), { highScore: MAX_HIGH_SCORE });
});
