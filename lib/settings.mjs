// Persistent settings (~/.local/state/pacman/settings.json) and the high
// score (~/.local/state/pacman/highscore.json).
//
// Pure ES module: no Qt, no I/O. app/Settings.qml hands the file text in and
// writes the serialised text back; `node --test` covers the same code.

export const MODES = Object.freeze(["arcade", "smooth"]);

export const SETTINGS_DEFAULTS = Object.freeze({ mode: "arcade", scanlines: false });

/** The largest high score the file will hold; anything beyond is clamped. */
export const MAX_HIGH_SCORE = Number.MAX_SAFE_INTEGER;

function parseJson(text) {
  if (typeof text !== "string" || text.trim() === "") return undefined;
  try {
    return JSON.parse(text);
  } catch (err) {
    return undefined;
  }
}

function isRecord(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/**
 * Parse settings.json text. Anything unparsable, of the wrong shape, or with an
 * unknown mode yields the defaults; each key falls back on its own, so a bad
 * `scanlines` does not lose a good `mode`. Always returns a fresh object.
 */
export function parseSettings(text) {
  const settings = Object.assign({}, SETTINGS_DEFAULTS); // no object spread: QV4 (Qt) lacks it
  const parsed = parseJson(text);
  if (!isRecord(parsed)) return settings;

  if (MODES.includes(parsed.mode)) settings.mode = parsed.mode;
  if (typeof parsed.scanlines === "boolean") settings.scanlines = parsed.scanlines;
  return settings;
}

/** Pretty JSON with a trailing newline; unknown keys dropped, invalid values reset. */
export function serialiseSettings(settings) {
  const source = isRecord(settings) ? settings : {};
  const mode = MODES.includes(source.mode) ? source.mode : SETTINGS_DEFAULTS.mode;
  const scanlines = typeof source.scanlines === "boolean" ? source.scanlines : SETTINGS_DEFAULTS.scanlines;
  return JSON.stringify({ mode, scanlines }, null, 2) + "\n";
}

/** A non-negative safe integer from any value: floors floats, clamps huge, else 0. */
function saneScore(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return 0;
  return Math.min(Math.floor(value), MAX_HIGH_SCORE);
}

/**
 * Parse highscore.json text: the canonical `{ "highScore": n }` (a bare
 * number is accepted too). Corrupt, negative or missing means 0; the caller
 * rewrites the file on the next save.
 */
export function parseHighScore(text) {
  const parsed = parseJson(text);
  if (typeof parsed === "number") return saneScore(parsed);
  if (!isRecord(parsed)) return 0;
  return saneScore(parsed.highScore);
}

/** The canonical highscore.json text for `n`. */
export function serialiseHighScore(n) {
  return JSON.stringify({ highScore: saneScore(n) }, null, 2) + "\n";
}
