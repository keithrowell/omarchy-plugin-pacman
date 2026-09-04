import { test } from "node:test";
import assert from "node:assert/strict";
import { parseColors, resolveTheme, DEFAULTS, FALLBACKS, THEME_KEYS } from "../lib/theme.mjs";

// The real colors.toml from this machine (decorative-stitch theme), inlined as a fixture.
const REAL_COLORS_TOML = `mode = "dark"

accent = "#5e8b98"
selection = "#2d3340"
muted = "#3e4758"

background = "#1c1f26"
dark_background = "#161820"
darker_background = "#15171c"
lighter_background = "#2d3340"

foreground = "#d5d0c0"
dark_foreground = "#65737e"
light_foreground = "#c4bfb0"
bright_foreground = "#e8e3d3"

red = "#bf616a"
yellow = "#ebcb8b"
orange = "#d08770"
green = "#a3be8c"
cyan = "#5e8b98"
blue = "#81a1c1"
magenta = "#b48ead"
brown = "#8a7060"

bright_red = "#bf616a"
bright_yellow = "#ebcb8b"
bright_green = "#a3be8c"
bright_cyan = "#81aebd"
bright_blue = "#81a1c1"
bright_magenta = "#b48ead"
`;

const SPEC_KEYS = [
  "mode", "accent", "selection", "muted",
  "background", "dark_background", "darker_background", "lighter_background",
  "foreground", "dark_foreground", "light_foreground", "bright_foreground",
  "red", "yellow", "orange", "green", "cyan", "blue", "magenta", "brown",
  "bright_red", "bright_yellow", "bright_green", "bright_cyan", "bright_blue", "bright_magenta",
];

test("parseColors reads quoted hex values", () => {
  assert.deepEqual(parseColors('red = "#bf616a"\nblue = "#81a1c1"'), { red: "#bf616a", blue: "#81a1c1" });
});

test("parseColors accepts single-quoted and bare values", () => {
  assert.deepEqual(parseColors("red = '#bf616a'\nmode = dark"), { red: "#bf616a", mode: "dark" });
});

test("parseColors ignores comment lines and trailing comments", () => {
  const text = '# a comment\nred = "#bf616a" # trailing\n  # indented comment\nblue = "#81a1c1"';
  assert.deepEqual(parseColors(text), { red: "#bf616a", blue: "#81a1c1" });
});

test("parseColors keeps a # inside quotes", () => {
  assert.deepEqual(parseColors('accent = "#5e8b98"'), { accent: "#5e8b98" });
});

test("parseColors skips blank and whitespace-only lines", () => {
  assert.deepEqual(parseColors('\n\n  \nred = "#bf616a"\n\n'), { red: "#bf616a" });
});

test("parseColors ignores lines without an equals sign", () => {
  assert.deepEqual(parseColors('[table]\nnonsense\nred = "#bf616a"'), { red: "#bf616a" });
});

test("parseColors reads mode as a plain string", () => {
  assert.equal(parseColors('mode = "light"').mode, "light");
});

test("parseColors returns {} for empty or non-string input", () => {
  assert.deepEqual(parseColors(""), {});
  assert.deepEqual(parseColors(undefined), {});
  assert.deepEqual(parseColors(null), {});
  assert.deepEqual(parseColors(42), {});
});

test("parseColors handles CRLF line endings", () => {
  assert.deepEqual(parseColors('red = "#bf616a"\r\nblue = "#81a1c1"\r\n'), { red: "#bf616a", blue: "#81a1c1" });
});

test("resolveTheme falls back bright_red -> red", () => {
  const theme = resolveTheme({ red: "#ff0000" });
  assert.equal(theme.bright_red, "#ff0000");
});

test("resolveTheme falls back a missing red to the default", () => {
  const theme = resolveTheme({ blue: "#0000ff" });
  assert.equal(theme.red, DEFAULTS.red);
});

test("resolveTheme follows the documented chains", () => {
  const theme = resolveTheme({ yellow: "#ffff00", foreground: "#ffffff", background: "#000000" });
  assert.equal(theme.orange, "#ffff00");
  assert.equal(theme.brown, "#ffff00");
  assert.equal(theme.dark_background, "#000000");
  // darker_background -> dark_background only; dark_background is absent from the parsed input
  assert.equal(theme.darker_background, DEFAULTS.darker_background);
  assert.equal(theme.lighter_background, "#000000");
  assert.equal(theme.selection, "#000000");
  assert.equal(theme.dark_foreground, "#ffffff");
  assert.equal(theme.light_foreground, "#ffffff");
  assert.equal(theme.bright_foreground, "#ffffff");
  assert.equal(theme.accent, "#ffffff");
});

test("resolveTheme prefers the nearer neighbour in a chain", () => {
  const theme = resolveTheme({ orange: "#ffa500", yellow: "#ffff00", cyan: "#00ffff", foreground: "#ffffff" });
  assert.equal(theme.brown, "#ffa500");
  assert.equal(theme.accent, "#00ffff");
});

test("resolveTheme defaults mode to dark", () => {
  assert.equal(resolveTheme({}).mode, "dark");
  assert.equal(resolveTheme({ mode: "light" }).mode, "light");
});

test("resolveTheme({}) has every spec key, all from DEFAULTS", () => {
  const theme = resolveTheme({});
  for (const key of SPEC_KEYS) {
    assert.ok(key in theme, `missing ${key}`);
    assert.equal(theme[key], DEFAULTS[key], `${key} should come from DEFAULTS`);
  }
  assert.deepEqual([...THEME_KEYS].sort(), [...SPEC_KEYS].sort());
});

test("resolveTheme handles undefined input like {}", () => {
  assert.deepEqual(resolveTheme(undefined), resolveTheme({}));
});

test("resolveTheme substitutes the fallback for a malformed colour", () => {
  const theme = resolveTheme({ red: "not-a-colour", bright_red: "#12345", green: "#0f0", cyan: "#00ffff80" });
  assert.equal(theme.red, DEFAULTS.red);
  assert.equal(theme.bright_red, DEFAULTS.bright_red); // bright_red and red both malformed
  assert.equal(theme.green, "#0f0"); // #rgb accepted
  assert.equal(theme.cyan, "#00ffff80"); // #rrggbbaa accepted
});

test("resolveTheme lowercases hex values", () => {
  assert.equal(resolveTheme({ red: "#BF616A" }).red, "#bf616a");
});

test("every DEFAULTS colour is a valid hex and every FALLBACKS target is a known key", () => {
  for (const key of SPEC_KEYS) {
    if (key === "mode") continue;
    assert.match(DEFAULTS[key], /^#[0-9a-f]{6}$/, `DEFAULTS.${key}`);
  }
  for (const [key, chain] of Object.entries(FALLBACKS)) {
    assert.ok(SPEC_KEYS.includes(key), `FALLBACKS has unknown key ${key}`);
    for (const target of chain) assert.ok(SPEC_KEYS.includes(target), `FALLBACKS.${key} -> unknown ${target}`);
  }
});

test("the real colors.toml round-trips unchanged through parse + resolve", () => {
  const parsed = parseColors(REAL_COLORS_TOML);
  const theme = resolveTheme(parsed);
  assert.deepEqual(theme, parsed);
  assert.equal(Object.keys(theme).length, SPEC_KEYS.length);
});
