// The screen flow around the game: title, the READY! beat, play, pause, the
// death and level-clear animations, GAME OVER, initials entry, and the
// attract demo.
//
// Pure ES module: no Qt, no clock. A flow is a small object that Main.qml
// replaces (never mutates) on every action and tick, beside the game state.
// The game state (lib/game.mjs) knows nothing of screens; syncFlow maps its
// phase onto the flow so the renderer has one source of truth for what is on
// screen and shouldStep says whether the game advances at all.
//
//   title --start/attract--> ready <-> playing <-> paused
//                            ready/playing -> dying -> ready
//                            playing -> level-clear -> ready
//                            gameover -> title | initials -> title
//
// Any key during the demo (attract: true) returns to the title.

import { LETTERS, EMPTY_INITIALS } from "./highscores.mjs";

export const SCREENS = Object.freeze(["title", "ready", "playing", "paused", "dying", "level-clear", "gameover", "initials"]);

/** Screens on which the game state is stepped. */
export const GAME_SCREENS = Object.freeze(["ready", "playing", "dying", "level-clear"]);

/** Idle ticks on the title before the attract demo starts (10 s). */
export const ATTRACT_IDLE_TICKS = 600;
/** GAME OVER stays on screen this long before the title (3 s). */
export const GAME_OVER_TICKS = 180;
/** `q` must be held this long on the title to quit (1 s); the caller quits. */
export const QUIT_HOLD_TICKS = 60;
/** No input on the initials screen this long saves whatever is showing (30 s). */
export const INITIALS_TIMEOUT_TICKS = 1800;
/** The title alternates its roll-call and high-scores pages this often (5 s). */
export const TITLE_PAGE_TICKS = 300;

/** Game phase -> flow screen. */
const PHASE_SCREENS = Object.freeze({
  ready: "ready",
  playing: "playing",
  dying: "dying",
  "level-clear": "level-clear",
  "game-over": "gameover",
});

/**
 * A fresh flow on the title. Options: `attract` (true; false never starts
 * the demo, for when the committed script does not match the maze).
 */
export function createFlow(opts) {
  const options = opts && typeof opts === "object" ? opts : {};
  return {
    screen: "title",
    ticks: 0,
    idleTicks: 0,
    attract: false,
    attractEnabled: options.attract !== false,
    quitHoldTicks: 0,
    resumeTo: null,
    entry: null,
  };
}

function toTitle(flow) {
  return Object.assign({}, flow, {
    screen: "title", ticks: 0, idleTicks: 0, attract: false, quitHoldTicks: 0, resumeTo: null, entry: null,
  });
}

function toReady(flow, attract) {
  return Object.assign({}, flow, {
    screen: "ready", ticks: 0, idleTicks: 0, attract, quitHoldTicks: 0, resumeTo: null, entry: null,
  });
}

/** gameover -> initials once a qualifying entry is set; keeps `entry`. */
function toInitials(flow) {
  return Object.assign({}, flow, { screen: "initials", ticks: 0, idleTicks: 0, quitHoldTicks: 0, resumeTo: null });
}

/** A fresh `entry` object; `letters` are indices into LETTERS, never mutated in place. */
function withLetters(entry, letters) {
  return Object.assign({}, entry, { letters: letters });
}

/**
 * Apply an action: start, attract, any-key, attract-end, pause, resume,
 * toggle-pause, quit-hold, quit-release, qualify, entry-up, entry-down,
 * entry-next, entry-back. `payload` is only used by `qualify`. Returns a new
 * flow, or the very same object when the action is not legal on the current
 * screen (so callers can test identity to learn whether anything happened).
 */
export function flowAction(flow, action, payload) {
  const screen = flow.screen;

  if (flow.attract) {
    // The demo: every key, and the script running out, lead back to the title.
    if (action === "any-key" || action === "attract-end") return toTitle(flow);
    return flow;
  }

  switch (action) {
    case "start":
      return screen === "title" ? toReady(flow, false) : flow;
    case "attract":
      return screen === "title" && flow.attractEnabled ? toReady(flow, true) : flow;
    case "any-key":
      return screen === "title" ? Object.assign({}, flow, { idleTicks: 0 }) : flow;
    case "pause":
      return screen === "ready" || screen === "playing"
        ? Object.assign({}, flow, { screen: "paused", resumeTo: screen })
        : flow;
    case "resume":
      return screen === "paused" ? Object.assign({}, flow, { screen: flow.resumeTo, resumeTo: null }) : flow;
    case "toggle-pause":
      return flowAction(flow, screen === "paused" ? "resume" : "pause");
    case "quit-hold":
      return screen === "title" ? Object.assign({}, flow, { quitHoldTicks: flow.quitHoldTicks + 1, idleTicks: 0 }) : flow;
    case "quit-release":
      return flow.quitHoldTicks > 0 ? Object.assign({}, flow, { quitHoldTicks: 0 }) : flow;
    case "qualify": {
      if (screen !== "gameover" || flow.entry !== null) return flow;
      const p = payload && typeof payload === "object" ? payload : {};
      if (!(typeof p.score === "number" && p.score > 0) || !(typeof p.rank === "number" && p.rank >= 1)) return flow;
      const level = typeof p.level === "number" && p.level >= 1 ? p.level : 1;
      return Object.assign({}, flow, { entry: { score: p.score, level: level, rank: p.rank, letters: [0, 0, 0], slot: 0 } });
    }
    case "entry-up": {
      if (screen !== "initials") return flow;
      const letters = flow.entry.letters.slice();
      letters[flow.entry.slot] = (letters[flow.entry.slot] + 1) % LETTERS.length;
      return Object.assign({}, flow, { ticks: 0, entry: withLetters(flow.entry, letters) });
    }
    case "entry-down": {
      if (screen !== "initials") return flow;
      const letters = flow.entry.letters.slice();
      letters[flow.entry.slot] = (letters[flow.entry.slot] + LETTERS.length - 1) % LETTERS.length;
      return Object.assign({}, flow, { ticks: 0, entry: withLetters(flow.entry, letters) });
    }
    case "entry-next": {
      if (screen !== "initials") return flow;
      if (flow.entry.slot < 2) {
        return Object.assign({}, flow, { ticks: 0, entry: Object.assign({}, flow.entry, { slot: flow.entry.slot + 1 }) });
      }
      return toTitle(flow); // the third confirm saves; the caller reads flow.entry before this call
    }
    case "entry-back": {
      if (screen !== "initials") return flow;
      return Object.assign({}, flow, { ticks: 0, entry: Object.assign({}, flow.entry, { slot: Math.max(0, flow.entry.slot - 1) }) });
    }
    default:
      return flow;
  }
}

/**
 * Map the game's phase onto the flow while a game is running (not on the
 * title, not paused, not already on game over). Entering game over restarts
 * the tick count so flowTick can time the return to the title.
 */
export function syncFlow(flow, phase) {
  if (GAME_SCREENS.indexOf(flow.screen) === -1) return flow;
  const screen = PHASE_SCREENS[phase];
  if (screen === undefined || screen === flow.screen) return flow;
  return Object.assign({}, flow, { screen, ticks: screen === "gameover" ? 0 : flow.ticks });
}

/** True while the game state should be stepped. */
export function shouldStep(flow) {
  return GAME_SCREENS.indexOf(flow.screen) !== -1;
}

/**
 * Advance the flow's clocks by `ticks` (1 by default). On the title the idle
 * counter runs and starts the demo at ATTRACT_IDLE_TICKS; the title's page
 * (see titlePage) cycles from the same `ticks` without touching idleTicks, so
 * a key press neither flips the page nor resets the demo timer. On game over
 * the title returns after GAME_OVER_TICKS, or the initials screen when a
 * qualifying entry was set. On initials, `ticks` counts since the last entry
 * action (every entry-* action resets it, mirroring how gameover uses
 * `ticks`); no action for INITIALS_TIMEOUT_TICKS saves whatever is showing.
 * Returns the same object for zero ticks.
 */
export function flowTick(flow, ticks) {
  const n = typeof ticks === "number" && ticks > 0 ? Math.floor(ticks) : ticks === undefined ? 1 : 0;
  if (n === 0) return flow;
  const next = Object.assign({}, flow, { ticks: flow.ticks + n });
  switch (flow.screen) {
    case "title":
      next.idleTicks = flow.idleTicks + n;
      if (next.idleTicks >= ATTRACT_IDLE_TICKS) return flowAction(next, "attract");
      return next;
    case "gameover":
      if (next.ticks >= GAME_OVER_TICKS) return flow.entry !== null ? toInitials(next) : toTitle(next);
      return next;
    case "initials":
      if (next.ticks >= INITIALS_TIMEOUT_TICKS) return toTitle(next);
      return next;
    default:
      return next;
  }
}

/** `"AAA"`-style string from an entry's letters, or EMPTY_INITIALS for no entry. */
export function initialsOf(entry) {
  if (!entry) return EMPTY_INITIALS;
  let s = "";
  for (let i = 0; i < entry.letters.length; i++) s += LETTERS.charAt(entry.letters[i]);
  return s;
}

/** "roll-call" or "high-scores": the title page for the current tick count, cycling every TITLE_PAGE_TICKS. */
export function titlePage(flow) {
  return Math.floor(flow.ticks / TITLE_PAGE_TICKS) % 2 === 0 ? "roll-call" : "high-scores";
}
