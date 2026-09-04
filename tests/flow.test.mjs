import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createFlow, flowAction, syncFlow, flowTick, shouldStep,
  SCREENS, GAME_SCREENS, ATTRACT_IDLE_TICKS, GAME_OVER_TICKS, QUIT_HOLD_TICKS,
} from "../lib/flow.mjs";

/** A flow on `screen` reached through legal actions, so every field is consistent. */
function at(screen, opts) {
  let f = createFlow(opts);
  if (screen === "title") return f;
  f = flowAction(f, "start");
  if (screen === "ready") return f;
  if (screen === "paused") return flowAction(f, "pause");
  f = syncFlow(f, screen === "gameover" ? "game-over" : screen);
  return f;
}

/** Apply `ticks` single ticks. */
function tick(flow, ticks) {
  let f = flow;
  for (let i = 0; i < ticks; i++) f = flowTick(f, 1);
  return f;
}

test("constants: 10 s of idle before attract, 3 s of game over, 1 s of q", () => {
  assert.equal(ATTRACT_IDLE_TICKS, 600);
  assert.equal(GAME_OVER_TICKS, 180);
  assert.equal(QUIT_HOLD_TICKS, 60);
  assert.deepEqual(SCREENS, ["title", "ready", "playing", "paused", "dying", "level-clear", "gameover"]);
  assert.deepEqual(GAME_SCREENS, ["ready", "playing", "dying", "level-clear"]);
});

test("createFlow starts on the title with everything at zero and attract enabled", () => {
  const f = createFlow();
  assert.deepEqual(f, {
    screen: "title", ticks: 0, idleTicks: 0, attract: false, attractEnabled: true, quitHoldTicks: 0, resumeTo: null,
  });
  assert.equal(createFlow({ attract: false }).attractEnabled, false);
  assert.equal(createFlow({ attract: true }).attractEnabled, true);
  assert.equal(createFlow(null).attractEnabled, true);
});

test("title + start -> ready for a real game", () => {
  const f = flowAction(tick(createFlow(), 50), "start");
  assert.equal(f.screen, "ready");
  assert.equal(f.attract, false);
  assert.equal(f.ticks, 0);
  assert.equal(f.idleTicks, 0);
});

test("title + attract -> ready as a demo; disabled attract makes it illegal", () => {
  const f = flowAction(createFlow(), "attract");
  assert.equal(f.screen, "ready");
  assert.equal(f.attract, true);
  const off = createFlow({ attract: false });
  assert.equal(flowAction(off, "attract"), off);
});

test("the title idles 599 ticks, then the 600th starts the attract demo", () => {
  const f = tick(createFlow(), ATTRACT_IDLE_TICKS - 1);
  assert.equal(f.screen, "title");
  assert.equal(f.idleTicks, ATTRACT_IDLE_TICKS - 1);
  const demo = flowTick(f, 1);
  assert.equal(demo.screen, "ready");
  assert.equal(demo.attract, true);
  assert.equal(demo.idleTicks, 0);
});

test("flowTick accepts several ticks at once and never issues attract when disabled", () => {
  const f = flowTick(createFlow(), ATTRACT_IDLE_TICKS + 40);
  assert.equal(f.screen, "ready");
  assert.equal(f.attract, true);
  const off = tick(createFlow({ attract: false }), ATTRACT_IDLE_TICKS * 3);
  assert.equal(off.screen, "title");
  assert.equal(off.idleTicks, ATTRACT_IDLE_TICKS * 3);
  const zero = createFlow();
  assert.equal(flowTick(zero, 0), zero, "no ticks: same object");
});

test("any-key on the title resets the idle counter; any-key elsewhere in a real game is ignored", () => {
  const idle = tick(createFlow(), 300);
  const reset = flowAction(idle, "any-key");
  assert.equal(reset.screen, "title");
  assert.equal(reset.idleTicks, 0);
  const playing = at("playing");
  assert.equal(flowAction(playing, "any-key"), playing);
  const paused = at("paused");
  assert.equal(flowAction(paused, "any-key"), paused);
});

test("any key during the demo returns to the title with idle reset, from every demo screen", () => {
  for (const phase of ["ready", "playing", "dying", "level-clear", "game-over"]) {
    let f = syncFlow(flowAction(createFlow(), "attract"), phase);
    f = tick(f, 30);
    const back = flowAction(f, "any-key");
    assert.equal(back.screen, "title", `from demo ${phase}`);
    assert.equal(back.attract, false);
    assert.equal(back.idleTicks, 0);
    assert.equal(back.ticks, 0);
    const ended = flowAction(f, "attract-end");
    assert.equal(ended.screen, "title", `attract-end from demo ${phase}`);
    assert.equal(ended.attract, false);
  }
  const real = at("playing");
  assert.equal(flowAction(real, "attract-end"), real, "attract-end means nothing in a real game");
});

test("the demo cannot be paused, started or resumed: only left", () => {
  const demo = syncFlow(flowAction(createFlow(), "attract"), "playing");
  for (const action of ["pause", "toggle-pause", "resume", "start", "attract", "quit-hold"]) {
    assert.equal(flowAction(demo, action), demo, action);
  }
});

test("pause from ready and from playing; resume returns to the same screen", () => {
  for (const screen of ["ready", "playing"]) {
    const game = at(screen);
    const paused = flowAction(game, "pause");
    assert.equal(paused.screen, "paused");
    assert.equal(paused.resumeTo, screen);
    assert.equal(flowAction(paused, "resume").screen, screen);
    assert.equal(flowAction(paused, "resume").resumeTo, null);
    assert.equal(flowAction(paused, "toggle-pause").screen, screen);
    assert.equal(flowAction(game, "toggle-pause").screen, "paused");
    assert.equal(flowAction(paused, "pause"), paused, "pausing twice changes nothing");
    assert.equal(flowAction(paused, "start"), paused);
  }
});

test("pause is illegal on the title, while dying, on the level flash and on game over", () => {
  for (const screen of ["title", "dying", "level-clear", "gameover"]) {
    const f = at(screen);
    assert.equal(flowAction(f, "pause"), f, screen);
    assert.equal(flowAction(f, "toggle-pause"), f, screen);
    assert.equal(flowAction(f, "resume"), f, screen);
  }
});

test("syncFlow maps every game phase onto a screen and keeps the demo flag", () => {
  const game = at("ready");
  assert.equal(syncFlow(game, "ready"), game, "already there: same object");
  assert.equal(syncFlow(game, "playing").screen, "playing");
  assert.equal(syncFlow(game, "dying").screen, "dying");
  assert.equal(syncFlow(game, "level-clear").screen, "level-clear");
  const over = syncFlow(tick(syncFlow(game, "playing"), 500), "game-over");
  assert.equal(over.screen, "gameover");
  assert.equal(over.ticks, 0, "game over restarts the clock");
  const demo = syncFlow(flowAction(createFlow(), "attract"), "playing");
  assert.equal(demo.attract, true);
  assert.equal(syncFlow(demo, "game-over").attract, true);
});

test("syncFlow leaves the title, the pause and the game-over screen alone", () => {
  for (const screen of ["title", "paused", "gameover"]) {
    const f = at(screen);
    for (const phase of ["ready", "playing", "dying", "level-clear", "game-over"]) {
      assert.equal(syncFlow(f, phase), f, `${screen} / ${phase}`);
    }
  }
  const game = at("playing");
  assert.equal(syncFlow(game, "nonsense"), game, "an unknown phase changes nothing");
});

test("game over returns to the title after 180 ticks and not before", () => {
  const over = at("gameover");
  const almost = tick(over, GAME_OVER_TICKS - 1);
  assert.equal(almost.screen, "gameover");
  assert.equal(almost.ticks, GAME_OVER_TICKS - 1);
  const title = flowTick(almost, 1);
  assert.equal(title.screen, "title");
  assert.equal(title.idleTicks, 0);
  assert.equal(title.ticks, 0);
  assert.equal(title.attract, false);
  assert.equal(title.resumeTo, null);
});

test("a demo game over also returns to the title, with the demo flag cleared", () => {
  const over = syncFlow(flowAction(createFlow(), "attract"), "game-over");
  const title = tick(over, GAME_OVER_TICKS);
  assert.equal(title.screen, "title");
  assert.equal(title.attract, false);
});

test("shouldStep only while the game itself advances", () => {
  const expected = {
    title: false, ready: true, playing: true, paused: false, dying: true, "level-clear": true, gameover: false,
  };
  for (const screen of SCREENS) assert.equal(shouldStep(at(screen)), expected[screen], screen);
});

test("ticks count on every screen; the idle counter only on the title", () => {
  const playing = tick(at("playing"), 7);
  assert.equal(playing.ticks, 7);
  assert.equal(playing.idleTicks, 0);
  const paused = tick(at("paused"), 3000);
  assert.equal(paused.screen, "paused", "a pause never times out");
  assert.equal(paused.idleTicks, 0);
});

test("holding q on the title counts up; releasing resets; illegal elsewhere", () => {
  let f = createFlow();
  for (let i = 1; i <= 5; i++) {
    f = flowAction(f, "quit-hold");
    assert.equal(f.quitHoldTicks, i);
    assert.equal(f.screen, "title");
  }
  const released = flowAction(f, "quit-release");
  assert.equal(released.quitHoldTicks, 0);
  assert.equal(flowAction(released, "quit-release"), released, "releasing an unheld key changes nothing");
  assert.equal(flowAction(tick(f, 10), "quit-hold").idleTicks, 0, "holding q is activity");
  for (const screen of ["ready", "playing", "paused", "gameover"]) {
    const g = at(screen);
    assert.equal(flowAction(g, "quit-hold"), g, screen);
  }
  assert.equal(flowAction(f, "start").quitHoldTicks, 0, "leaving the title drops the hold");
});

test("unknown actions and unknown screens are ignored", () => {
  const f = createFlow();
  assert.equal(flowAction(f, "dance"), f);
  assert.equal(flowAction(f, undefined), f);
  assert.equal(flowAction(f, 42), f);
});

test("purity: no action or tick mutates its input", () => {
  const f = tick(createFlow(), 5);
  const frozen = JSON.stringify(f);
  flowAction(f, "start");
  flowAction(f, "attract");
  flowAction(f, "any-key");
  flowAction(f, "quit-hold");
  flowTick(f, ATTRACT_IDLE_TICKS);
  assert.equal(JSON.stringify(f), frozen);
  const game = at("playing");
  const frozenGame = JSON.stringify(game);
  flowAction(game, "pause");
  syncFlow(game, "game-over");
  flowTick(game, 1);
  assert.equal(JSON.stringify(game), frozenGame);
  const over = at("gameover");
  const frozenOver = JSON.stringify(over);
  flowTick(over, GAME_OVER_TICKS);
  assert.equal(JSON.stringify(over), frozenOver);
});
