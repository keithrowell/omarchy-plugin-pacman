import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseSettings, serialiseSettings, SETTINGS_DEFAULTS, MODES,
} from "../lib/settings.mjs";

test("defaults are arcade mode, sound on", () => {
  assert.deepEqual(SETTINGS_DEFAULTS, { mode: "arcade", muted: false });
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

test("parseSettings reads a valid smooth setting; sound stays on", () => {
  assert.deepEqual(parseSettings('{"mode":"smooth"}'), { mode: "smooth", muted: false });
});

test("parseSettings ignores a stored scanlines key without losing the mode", () => {
  assert.deepEqual(parseSettings('{"mode":"smooth","scanlines":false}'), { mode: "smooth", muted: false });
  assert.deepEqual(parseSettings('{"mode":"arcade","scanlines":true}'), { mode: "arcade", muted: false });
});

test("parseSettings reads muted and ignores a non-boolean one without losing the rest", () => {
  assert.deepEqual(parseSettings('{"muted":true}'), { mode: "arcade", muted: true });
  assert.deepEqual(parseSettings('{"mode":"smooth","muted":true}'), { mode: "smooth", muted: true });
  assert.deepEqual(parseSettings('{"mode":"smooth","muted":false}'), { mode: "smooth", muted: false });
  assert.deepEqual(parseSettings('{"mode":"smooth","muted":"yes"}'), { mode: "smooth", muted: false });
  assert.deepEqual(parseSettings('{"mode":"smooth","muted":1}'), { mode: "smooth", muted: false });
  assert.deepEqual(parseSettings('{"mode":"smooth","muted":null}'), { mode: "smooth", muted: false });
});

test("parseSettings ignores unknown keys", () => {
  assert.deepEqual(parseSettings('{"mode":"smooth","volume":3}'), { mode: "smooth", muted: false });
});

test("serialiseSettings emits pretty JSON ending in a newline", () => {
  const text = serialiseSettings({ mode: "smooth", muted: true });
  assert.ok(text.endsWith("\n"));
  assert.deepEqual(JSON.parse(text), { mode: "smooth", muted: true });
  assert.ok(text.includes("\n  "), "pretty printed");
});

test("serialiseSettings drops unknown keys, including a carried-over scanlines, and fixes invalid values", () => {
  assert.deepEqual(JSON.parse(serialiseSettings({ mode: "nope", extra: 1 })), { mode: "arcade", muted: false });
  assert.deepEqual(JSON.parse(serialiseSettings({ mode: "smooth", scanlines: true })), { mode: "smooth", muted: false });
  assert.deepEqual(JSON.parse(serialiseSettings({ mode: "smooth", muted: "on" })), { mode: "smooth", muted: false });
  assert.deepEqual(JSON.parse(serialiseSettings(undefined)), { mode: "arcade", muted: false });
});

test("settings round-trip", () => {
  for (const mode of MODES) {
    for (const muted of [false, true]) {
      assert.deepEqual(parseSettings(serialiseSettings({ mode, muted })), { mode, muted });
    }
  }
});

test("parseSettings never returns the shared defaults object", () => {
  const a = parseSettings("");
  a.mode = "smooth";
  a.muted = true;
  assert.equal(SETTINGS_DEFAULTS.mode, "arcade");
  assert.equal(SETTINGS_DEFAULTS.muted, false);
});
