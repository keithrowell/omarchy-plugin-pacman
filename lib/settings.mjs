// Persistent settings (~/.local/state/pacman/settings.json). The high-score
// table lives in highscore.json beside it; see lib/highscores.mjs.
//
// Pure ES module: no Qt, no I/O. app/Settings.qml hands the file text in and
// writes the serialised text back; `node --test` covers the same code.

export const SETTINGS_DEFAULTS = Object.freeze({ muted: false });

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
 * Parse settings.json text. Anything unparsable or of the wrong shape yields
 * the defaults. A stored `mode` key (from before spec 0003) is ignored.
 * Always returns a fresh object.
 */
export function parseSettings(text) {
  const settings = Object.assign({}, SETTINGS_DEFAULTS); // no object spread: QV4 (Qt) lacks it
  const parsed = parseJson(text);
  if (!isRecord(parsed)) return settings;

  if (typeof parsed.muted === "boolean") settings.muted = parsed.muted;
  return settings;
}

/** Pretty JSON with a trailing newline; unknown keys dropped, invalid values reset. */
export function serialiseSettings(settings) {
  const source = isRecord(settings) ? settings : {};
  const muted = typeof source.muted === "boolean" ? source.muted : SETTINGS_DEFAULTS.muted;
  return JSON.stringify({ muted }, null, 2) + "\n";
}
