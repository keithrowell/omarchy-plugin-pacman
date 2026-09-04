// Theme palette reader for Omarchy's colors.toml.
//
// Pure ES module: no Qt, no I/O. QML (app/Theme.qml) hands the file text in and
// binds to the resolved object; `node --test` covers the same code.
//
// The real colors.toml is a flat list of `key = "#rrggbb"` lines plus one
// `mode = "dark"` string. parseColors handles exactly that TOML subset and
// nothing more, on purpose.

/** Every key the theme exposes. Order matters only for readability. */
export const THEME_KEYS = Object.freeze([
  "mode",
  "accent", "selection", "muted",
  "background", "dark_background", "darker_background", "lighter_background",
  "foreground", "dark_foreground", "light_foreground", "bright_foreground",
  "red", "yellow", "orange", "green", "cyan", "blue", "magenta", "brown",
  "bright_red", "bright_yellow", "bright_green", "bright_cyan", "bright_blue", "bright_magenta",
]);

/**
 * The only place a colour literal lives in this project. A dark palette used
 * when colors.toml is missing, unreadable, or lacks a key and every fallback.
 */
export const DEFAULTS = Object.freeze({
  mode: "dark",

  accent: "#5e8b98",
  selection: "#2d3340",
  muted: "#3e4758",

  background: "#1c1f26",
  dark_background: "#161820",
  darker_background: "#15171c",
  lighter_background: "#2d3340",

  foreground: "#d5d0c0",
  dark_foreground: "#65737e",
  light_foreground: "#c4bfb0",
  bright_foreground: "#e8e3d3",

  red: "#bf616a",
  yellow: "#ebcb8b",
  orange: "#d08770",
  green: "#a3be8c",
  cyan: "#5e8b98",
  blue: "#81a1c1",
  magenta: "#b48ead",
  brown: "#8a7060",

  bright_red: "#bf616a",
  bright_yellow: "#ebcb8b",
  bright_green: "#a3be8c",
  bright_cyan: "#81aebd",
  bright_blue: "#81a1c1",
  bright_magenta: "#b48ead",
});

/**
 * Fallback chain per key: the first candidate present (and valid) in the parsed
 * file wins; if none is, DEFAULTS[key] is used. Chains are flat lookups into
 * the parsed input, not recursive resolutions, so mutual fallbacks
 * (selection <-> lighter_background) cannot loop.
 */
export const FALLBACKS = Object.freeze({
  bright_red: ["red"],
  bright_yellow: ["yellow"],
  bright_green: ["green"],
  bright_cyan: ["cyan"],
  bright_blue: ["blue"],
  bright_magenta: ["magenta"],

  orange: ["yellow"],
  brown: ["orange", "yellow"],

  dark_background: ["background"],
  darker_background: ["dark_background"],
  lighter_background: ["selection", "background"],

  dark_foreground: ["muted", "foreground"],
  light_foreground: ["foreground"],
  bright_foreground: ["light_foreground", "foreground"],

  selection: ["lighter_background", "background"],
  muted: ["dark_foreground", "selection"],
  accent: ["cyan", "foreground"],
});

const HEX_COLOUR = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/;
const KEY_VALUE = /^([A-Za-z0-9_-]+)\s*=\s*(.+)$/;

/** Strip a trailing `# comment` that is outside quotes. */
function stripComment(line) {
  let quote = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === "#") {
      return line.slice(0, i);
    }
  }
  return line;
}

/** Remove one layer of matching quotes from a value, if present. */
function unquote(value) {
  const first = value[0];
  const last = value[value.length - 1];
  if (value.length >= 2 && first === last && (first === '"' || first === "'")) {
    return value.slice(1, -1);
  }
  return value;
}

/**
 * Parse the flat `key = "value"` subset of TOML that colors.toml uses.
 * Comments, blank lines and anything that does not match are ignored; the
 * function never throws. Returns a plain object of strings.
 */
export function parseColors(text) {
  const result = {};
  if (typeof text !== "string" || text.length === 0) return result;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = stripComment(rawLine).trim();
    if (line === "") continue;
    const match = KEY_VALUE.exec(line);
    if (!match) continue;
    const value = unquote(match[2].trim());
    if (value === "") continue;
    result[match[1]] = value;
  }
  return result;
}

function validColour(value) {
  if (typeof value !== "string") return null;
  const lower = value.trim().toLowerCase();
  return HEX_COLOUR.test(lower) ? lower : null;
}

/**
 * Turn a parsed colors.toml object into a complete palette: every key in
 * THEME_KEYS present, malformed colours rejected, fallback chains applied,
 * DEFAULTS as the last resort. Always returns a new object.
 */
export function resolveTheme(parsed) {
  const source = parsed && typeof parsed === "object" ? parsed : {};
  const theme = {};

  for (const key of THEME_KEYS) {
    if (key === "mode") {
      const mode = typeof source.mode === "string" ? source.mode.trim() : "";
      theme.mode = mode !== "" ? mode : DEFAULTS.mode;
      continue;
    }

    let colour = validColour(source[key]);
    if (colour === null) {
      for (const candidate of FALLBACKS[key] ?? []) {
        colour = validColour(source[candidate]);
        if (colour !== null) break;
      }
    }
    theme[key] = colour ?? DEFAULTS[key];
  }

  return theme;
}
