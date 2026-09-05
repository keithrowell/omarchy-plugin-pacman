import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseSettings, serialiseSettings, SETTINGS_DEFAULTS,
} from "../lib/settings.mjs";

test("defaults are sound on", () => {
  assert.deepEqual(SETTINGS_DEFAULTS, { muted: false });
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

test("parseSettings returns the defaults on the wrong shape", () => {
  assert.deepEqual(parseSettings("[1,2,3]"), SETTINGS_DEFAULTS);
  assert.deepEqual(parseSettings("null"), SETTINGS_DEFAULTS);
});

test("parseSettings ignores a stored mode key", () => {
  assert.deepEqual(parseSettings('{"mode":"smooth"}'), { muted: false });
  assert.deepEqual(parseSettings('{"mode":"crt"}'), { muted: false });
});

test("parseSettings reads muted and ignores a non-boolean one without losing the rest", () => {
  assert.deepEqual(parseSettings('{"muted":true}'), { muted: true });
  assert.deepEqual(parseSettings('{"mode":"smooth","muted":true}'), { muted: true });
  assert.deepEqual(parseSettings('{"mode":"smooth","muted":false}'), { muted: false });
  assert.deepEqual(parseSettings('{"mode":"smooth","muted":"yes"}'), { muted: false });
  assert.deepEqual(parseSettings('{"mode":"smooth","muted":1}'), { muted: false });
  assert.deepEqual(parseSettings('{"mode":"smooth","muted":null}'), { muted: false });
});

test("parseSettings ignores unknown keys", () => {
  assert.deepEqual(parseSettings('{"mode":"smooth","volume":3}'), { muted: false });
});

test("serialiseSettings emits pretty JSON ending in a newline", () => {
  const text = serialiseSettings({ muted: true });
  assert.ok(text.endsWith("\n"));
  assert.deepEqual(JSON.parse(text), { muted: true });
  assert.ok(text.includes("\n  "), "pretty printed");
});

test("serialiseSettings drops unknown keys, including a carried-over mode, and fixes invalid values", () => {
  assert.deepEqual(JSON.parse(serialiseSettings({ mode: "smooth", extra: 1 })), { muted: false });
  assert.deepEqual(JSON.parse(serialiseSettings({ mode: "smooth", muted: "on" })), { muted: false });
  assert.deepEqual(JSON.parse(serialiseSettings(undefined)), { muted: false });
});

test("settings round-trip", () => {
  for (const muted of [false, true]) {
    assert.deepEqual(parseSettings(serialiseSettings({ muted })), { muted });
  }
});

test("parseSettings never returns the shared defaults object", () => {
  const a = parseSettings("");
  a.muted = true;
  assert.equal(SETTINGS_DEFAULTS.muted, false);
});
