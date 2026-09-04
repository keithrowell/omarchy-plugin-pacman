// The screen flow around the game: title, the READY! beat, play, pause, the
// death and level-clear animations, GAME OVER, and the attract demo.
//
// Pure ES module: no Qt, no clock. A flow is a small object that Main.qml
// replaces (never mutates) on every action and tick, beside the game state.
// The game state (lib/game.mjs) knows nothing of screens; syncFlow maps its
// phase onto the flow so the renderer has one source of truth for what is on
// screen and shouldStep says whether the game advances at all.
//
//   title --start/attract--> ready <-> playing <-> paused
//                            ready/playing -> dying -> ready | gameover -> title
//                            playing -> level-clear -> ready
//
// Any key during the demo (attract: true) returns to the title.

export const SCREENS = Object.freeze(["title", "ready", "playing", "paused", "dying", "level-clear", "gameover"]);

/** Screens on which the game state is stepped. */
export const GAME_SCREENS = Object.freeze(["ready", "playing", "dying", "level-clear"]);

/** Idle ticks on the title before the attract demo starts (10 s). */
export const ATTRACT_IDLE_TICKS = 600;
/** GAME OVER stays on screen this long before the title (3 s). */
export const GAME_OVER_TICKS = 180;
/** `q` must be held this long on the title to quit (1 s); the caller quits. */
export const QUIT_HOLD_TICKS = 60;

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
  };
}

function toTitle(flow) {
  return Object.assign({}, flow, {
    screen: "title", ticks: 0, idleTicks: 0, attract: false, quitHoldTicks: 0, resumeTo: null,
  });
}

function toReady(flow, attract) {
  return Object.assign({}, flow, {
    screen: "ready", ticks: 0, idleTicks: 0, attract, quitHoldTicks: 0, resumeTo: null,
  });
}

/**
 * Apply an action: start, attract, any-key, attract-end, pause, resume,
 * toggle-pause, quit-hold, quit-release. Returns a new flow, or the very same
 * object when the action is not legal on the current screen (so callers can
 * test identity to learn whether anything happened).
 */
export function flowAction(flow, action) {
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
 * counter runs and starts the demo at ATTRACT_IDLE_TICKS; on game over the
 * title returns after GAME_OVER_TICKS. Returns the same object for zero ticks.
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
      if (next.ticks >= GAME_OVER_TICKS) return toTitle(next);
      return next;
    default:
      return next;
  }
}
