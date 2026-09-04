import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSettings, serialiseSettings, SETTINGS_DEFAULTS, MODES } from "../lib/settings.mjs";

test("defaults are arcade mode", () => {
  assert.deepEqual(SETTINGS_DEFAULTS, { mode: "arcade" });
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

test("parseSettings reads a valid smooth setting", () => {
  assert.deepEqual(parseSettings('{"mode":"smooth"}'), { mode: "smooth" });
});

test("parseSettings ignores unknown keys", () => {
  assert.deepEqual(parseSettings('{"mode":"smooth","volume":3}'), { mode: "smooth" });
});

test("serialiseSettings emits pretty JSON ending in a newline", () => {
  const text = serialiseSettings({ mode: "smooth" });
  assert.ok(text.endsWith("\n"));
  assert.deepEqual(JSON.parse(text), { mode: "smooth" });
  assert.ok(text.includes("\n  "), "pretty printed");
});

test("serialiseSettings drops unknown keys and fixes an invalid mode", () => {
  assert.deepEqual(JSON.parse(serialiseSettings({ mode: "nope", extra: 1 })), { mode: "arcade" });
  assert.deepEqual(JSON.parse(serialiseSettings(undefined)), { mode: "arcade" });
});

test("settings round-trip", () => {
  for (const mode of MODES) {
    assert.deepEqual(parseSettings(serialiseSettings({ mode })), { mode });
  }
});

test("parseSettings never returns the shared defaults object", () => {
  const a = parseSettings("");
  a.mode = "smooth";
  assert.equal(SETTINGS_DEFAULTS.mode, "arcade");
});
