// Persistent settings (~/.local/state/pacman/settings.json).
//
// Pure ES module: no Qt, no I/O. app/Settings.qml hands the file text in and
// writes the serialised text back; `node --test` covers the same code.

export const MODES = Object.freeze(["arcade", "smooth"]);

export const SETTINGS_DEFAULTS = Object.freeze({ mode: "arcade" });

/**
 * Parse settings.json text. Anything unparsable, of the wrong shape, or with an
 * unknown mode yields the defaults. Always returns a fresh object.
 */
export function parseSettings(text) {
  const settings = { ...SETTINGS_DEFAULTS };
  if (typeof text !== "string" || text.trim() === "") return settings;

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return settings;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return settings;

  if (MODES.includes(parsed.mode)) settings.mode = parsed.mode;
  return settings;
}

/** Pretty JSON with a trailing newline; unknown keys dropped, invalid modes reset. */
export function serialiseSettings(settings) {
  const source = settings && typeof settings === "object" ? settings : {};
  const mode = MODES.includes(source.mode) ? source.mode : SETTINGS_DEFAULTS.mode;
  return JSON.stringify({ mode }, null, 2) + "\n";
}
