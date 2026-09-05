// Game events and state -> the sounds to play this frame.
//
// Pure ES module: no Qt, no clock. Main.qml collects the events of a frame's
// ticks and asks mapSounds what to do; app/Sfx.qml only knows the names it
// gets back. Keeping the mapping here means `node --test` pins the waka
// alternation, the throttle, the siren stages and the loop priority without
// an audio device.
//
//   { oneShots: ["waka-a", "ghost-eaten"], loop: "fright" | null, soundState }
//
// The start jingle is not an event: Main.qml plays "start" on the flow's
// start action (title -> ready). mapSounds never emits it.

import { anyFrightened } from "./game.mjs";

/** Every WAV under assets/sfx/, without the extension. */
export const SOUNDS = Object.freeze([
  "start", "waka-a", "waka-b",
  "siren-1", "siren-2", "siren-3", "siren-4", "siren-5",
  "fright", "eyes",
  "ghost-eaten", "death", "extra-life", "level-clear", "fruit",
]);

/** The background layers; exactly one of these loops at a time. */
export const LOOPS = Object.freeze(["siren-1", "siren-2", "siren-3", "siren-4", "siren-5", "fright", "eyes"]);

export const SIREN_STAGES = 5;

/** Ticks between two wakas (~80 ms): rapid pellets at Elroy speeds must not stack. */
export const WAKA_MIN_TICKS = 5;

/** Siren stage thresholds as the fraction of pellets left; below the last one is the top stage. */
const SIREN_THRESHOLDS = Object.freeze([0.75, 0.5, 0.25, 0.1]);

/** One-shot sounds keyed by the event that plays them (pellets are handled apart). */
const EVENT_SOUNDS = Object.freeze({
  "ghost-eaten": "ghost-eaten",
  death: "death",
  "extra-life": "extra-life",
  "level-clear": "level-clear",
  "fruit-eaten": "fruit",
});

/** Screens on which nothing at all is played (one-shots are discarded). */
const SILENT_SCREENS = Object.freeze(["title", "paused", "gameover", "initials"]);

const SILENCE = Object.freeze({ oneShots: Object.freeze([]), loop: null });

/** The waka side to play next and when the last one was played. */
export function createSoundState() {
  return { waka: "a", lastWakaTick: -Infinity };
}

/**
 * The siren stage, 1 to SIREN_STAGES, for `left` of `total` pellets: 1 while
 * more than three quarters remain, then 2, 3 and 4 at a half, a quarter and
 * a tenth, and 5 for the last few.
 */
export function sirenStage(left, total) {
  for (let i = 0; i < SIREN_THRESHOLDS.length; i++) {
    if (left > SIREN_THRESHOLDS[i] * total) return i + 1;
  }
  return SIREN_STAGES;
}

/** True while any ghost is a pair of eyes on its way home. */
function anyReturning(state) {
  for (const g of state.ghosts) if (g.state === "eaten" || g.state === "entering") return true;
  return false;
}

/** The background loop for a game in play: eyes over fright over the siren. */
function loopFor(state) {
  if (anyReturning(state)) return "eyes";
  if (anyFrightened(state)) return "fright";
  const total = state.maze.pellets.length + state.maze.powerPellets.length;
  return "siren-" + sirenStage(state.pelletsLeft, total);
}

/**
 * Map `events` (the ticks of one frame, in order) and the game `state` they
 * produced on the flow `screen` to the sounds to play. Never mutates its
 * arguments; `soundState` comes back as the very same object unless a waka
 * was played. The demo (`attract`) and the title, pause and game-over
 * screens are silent; the loop only runs while playing.
 */
export function mapSounds(soundState, events, state, screen, attract) {
  if (attract || SILENT_SCREENS.indexOf(screen) !== -1) {
    return { oneShots: SILENCE.oneShots, loop: SILENCE.loop, soundState };
  }

  const oneShots = [];
  let next = soundState;
  for (const e of events) {
    if (e.type === "pellet" || e.type === "power") {
      if (state.tick - next.lastWakaTick < WAKA_MIN_TICKS) continue;
      oneShots.push("waka-" + next.waka);
      next = { waka: next.waka === "a" ? "b" : "a", lastWakaTick: state.tick };
    } else if (EVENT_SOUNDS[e.type] !== undefined) {
      oneShots.push(EVENT_SOUNDS[e.type]);
    }
  }

  return { oneShots, loop: screen === "playing" ? loopFor(state) : null, soundState: next };
}
