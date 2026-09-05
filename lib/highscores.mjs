// The high-score table (~/.local/state/pacman/highscore.json): up to
// TABLE_SIZE rows of { initials, score, level }, sorted by score descending.
//
// Pure ES module: no Qt, no I/O. app/Settings.qml hands the file text in and
// writes the serialised text back; `node --test` covers the same code. The
// table is always rebuilt by folding rows through `insert`, never sorted
// with Array.prototype.sort — QV4's sort stability is not guaranteed, and
// the tie rule (a newer entry ranks below an equal older one) depends on
// insertion order being preserved.

export const TABLE_SIZE = 10;
export const INITIALS_LENGTH = 3;
export const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
export const EMPTY_INITIALS = "---";

/** The largest score a row will hold; anything beyond is clamped. */
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

/** A non-negative safe integer from any value: floors floats, clamps huge, else 0. */
function saneScore(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return 0;
  return Math.min(Math.floor(value), MAX_HIGH_SCORE);
}

/** Exactly INITIALS_LENGTH letters (or `-`) upper-cased, else EMPTY_INITIALS. */
function saneInitials(value) {
  if (typeof value !== "string" || value.length !== INITIALS_LENGTH) return EMPTY_INITIALS;
  const upper = value.toUpperCase();
  for (let i = 0; i < upper.length; i++) {
    const ch = upper.charAt(i);
    if (LETTERS.indexOf(ch) === -1 && ch !== "-") return EMPTY_INITIALS;
  }
  return upper;
}

/** A whole number at least 1, else 1. */
function saneLevel(value) {
  if (typeof value === "number" && Number.isFinite(value) && value >= 1) return Math.floor(value);
  return 1;
}

/** A fresh sane row from any value, or null when its score sanitises to 0 (never a row). */
function saneRow(value) {
  const source = isRecord(value) ? value : {};
  const score = saneScore(source.score);
  if (score === 0) return null;
  return { initials: saneInitials(source.initials), score: score, level: saneLevel(source.level) };
}

/** table[0].score, or 0 for an empty or invalid table. */
export function topScore(table) {
  if (!Array.isArray(table) || table.length === 0) return 0;
  const first = table[0];
  return isRecord(first) && typeof first.score === "number" && Number.isFinite(first.score) ? first.score : 0;
}

/** Would `score` earn a place on `table`: positive, and better than the worst row of a full table. */
export function qualifies(table, score) {
  const t = Array.isArray(table) ? table : [];
  return saneScore(score) > 0 && (t.length < TABLE_SIZE || score > t[TABLE_SIZE - 1].score);
}

/**
 * The 1-based rank `score` would take on `table`, or 0 when it would not
 * qualify. Ties rank the newer entry below every existing row with the same
 * score. `insert` places a qualifying entry at exactly index `rankOf - 1`.
 */
export function rankOf(table, score) {
  const t = Array.isArray(table) ? table : [];
  if (!qualifies(t, score)) return 0;
  let count = 0;
  for (let i = 0; i < t.length; i++) {
    if (t[i].score >= score) count++;
  }
  return count + 1;
}

/**
 * A new table with `entry` inserted in rank order, capped at TABLE_SIZE (the
 * 11th row falls off). Returns the very same `table` object, unchanged, when
 * `entry` does not sanitise to a qualifying row. Never mutates `table` or its
 * rows; every row it adds is a fresh object.
 */
export function insert(table, entry) {
  const t = Array.isArray(table) ? table : [];
  const row = saneRow(entry);
  if (row === null || !qualifies(t, row.score)) return table;
  const rank = rankOf(t, row.score);
  const next = t.slice();
  next.splice(rank - 1, 0, row);
  return next.slice(0, TABLE_SIZE);
}

/**
 * Parse highscore.json text into a table. The canonical shape is
 * `{ "highScores": [ ...rows ] }`, folded through `insert` in file order (so
 * ties keep file order and anything past TABLE_SIZE falls off; rows that do
 * not sanitise to a qualifying entry are dropped silently). The pre-table
 * shape (`{ "highScore": n }` or a bare number) migrates to a single row with
 * initials EMPTY_INITIALS and level 1. If both `highScores` and `highScore`
 * are present, `highScores` wins. Anything else (corrupt, missing, wrong
 * type) is an empty table. Always returns a fresh array of fresh rows.
 */
export function parseHighScores(text) {
  const parsed = parseJson(text);
  let rows;
  if (isRecord(parsed) && Array.isArray(parsed.highScores)) {
    rows = parsed.highScores;
  } else if (isRecord(parsed) && typeof parsed.highScore === "number") {
    rows = [{ score: parsed.highScore, initials: EMPTY_INITIALS, level: 1 }];
  } else if (typeof parsed === "number") {
    rows = [{ score: parsed, initials: EMPTY_INITIALS, level: 1 }];
  } else {
    rows = [];
  }
  let table = [];
  for (let i = 0; i < rows.length; i++) table = insert(table, rows[i]);
  return table;
}

/**
 * Pretty JSON with a trailing newline, `{ "highScores": [...] }`, each row
 * `{ initials, score, level }` in that key order. `table` is re-folded
 * through `insert` first, so junk input serialises to a valid table. A
 * non-array input serialises as an empty table.
 */
export function serialiseHighScores(table) {
  const source = Array.isArray(table) ? table : [];
  let rows = [];
  for (let i = 0; i < source.length; i++) rows = insert(rows, source[i]);
  const clean = rows.map(r => ({ initials: r.initials, score: r.score, level: r.level }));
  return JSON.stringify({ highScores: clean }, null, 2) + "\n";
}
