import { test } from "node:test";
import assert from "node:assert/strict";
import { LEVEL_1 } from "../lib/maze-data.mjs";
import { parseMaze } from "../lib/maze.mjs";
import { createState } from "../lib/game.mjs";
import {
  SOUNDS, LOOPS, WAKA_MIN_TICKS, SIREN_STAGES,
  createSoundState, mapSounds, sirenStage,
} from "../lib/sound-map.mjs";

const maze = parseMaze(LEVEL_1);
const TOTAL = maze.pellets.length + maze.powerPellets.length;

/** A game in play with `patch` applied on top. */
function playing(patch) {
  return Object.assign(createState(maze, { ready: false }), patch || {});
}

function withGhost(state, name, patch) {
  return Object.assign({}, state, { ghosts: state.ghosts.map(g => (g.name === name ? Object.assign({}, g, patch) : g)) });
}

function map(events, state, screen, attract, soundState) {
  return mapSounds(soundState || createSoundState(), events, state, screen || "playing", attract === true);
}

const pellet = { type: "pellet", tile: { x: 1, y: 1 } };
const power = { type: "power", tile: { x: 1, y: 3 } };

test("SOUNDS lists the fifteen files and LOOPS the seven background layers", () => {
  assert.deepEqual(SOUNDS, [
    "start", "waka-a", "waka-b", "siren-1", "siren-2", "siren-3", "siren-4", "siren-5",
    "fright", "eyes", "ghost-eaten", "death", "extra-life", "level-clear", "fruit",
  ]);
  assert.deepEqual(LOOPS, ["siren-1", "siren-2", "siren-3", "siren-4", "siren-5", "fright", "eyes"]);
  for (const name of LOOPS) assert.ok(SOUNDS.includes(name), name);
  assert.equal(SIREN_STAGES, 5);
  assert.equal(WAKA_MIN_TICKS, 5);
  assert.equal(TOTAL, 260, "the level-1 maze has 260 pellets");
});

test("createSoundState starts on waka-a with no waka played yet", () => {
  assert.deepEqual(createSoundState(), { waka: "a", lastWakaTick: -Infinity });
  assert.notEqual(createSoundState(), createSoundState(), "a fresh object each time");
});

test("waka alternates a/b across successive pellet events", () => {
  let ss = createSoundState();
  const heard = [];
  for (let i = 0; i < 4; i++) {
    const r = map([pellet], playing({ tick: 10 + i * 10 }), "playing", false, ss);
    heard.push(r.oneShots[0]);
    ss = r.soundState;
  }
  assert.deepEqual(heard, ["waka-a", "waka-b", "waka-a", "waka-b"]);
  assert.equal(ss.waka, "a");
  assert.equal(ss.lastWakaTick, 40);
});

test("a power pellet wakas too", () => {
  const r = map([power], playing({ tick: 3 }));
  assert.deepEqual(r.oneShots, ["waka-a"]);
  assert.deepEqual(r.soundState, { waka: "b", lastWakaTick: 3 });
});

test("the waka throttle drops a pellet within four ticks of the last and allows one at five", () => {
  const first = map([pellet], playing({ tick: 10 }));
  assert.deepEqual(first.oneShots, ["waka-a"]);
  const dropped = map([pellet], playing({ tick: 14 }), "playing", false, first.soundState);
  assert.deepEqual(dropped.oneShots, []);
  assert.equal(dropped.soundState, first.soundState, "a dropped waka leaves the sound state alone");
  const allowed = map([pellet], playing({ tick: 15 }), "playing", false, first.soundState);
  assert.deepEqual(allowed.oneShots, ["waka-b"]);
  assert.deepEqual(allowed.soundState, { waka: "a", lastWakaTick: 15 });
});

test("two pellet events in one batch play a single waka", () => {
  const r = map([pellet, pellet], playing({ tick: 10 }));
  assert.deepEqual(r.oneShots, ["waka-a"]);
});

test("ghost-eaten, death, extra-life, level-clear and fruit-eaten map to their files, in event order", () => {
  const events = [
    { type: "ghost-eaten", chain: 1, ghost: "blinky", score: 200 },
    { type: "extra-life" },
    { type: "death" },
    { type: "level-clear" },
    { type: "fruit-eaten", kind: "cherry", score: 100 },
  ];
  const r = map(events, playing({ tick: 100 }));
  assert.deepEqual(r.oneShots, ["ghost-eaten", "extra-life", "death", "level-clear", "fruit"]);
  assert.deepEqual(r.soundState, createSoundState(), "no waka: the sound state is untouched");
});

test("events with no sound of their own are silent, and start is never an event sound", () => {
  const events = [
    { type: "mode", mode: "chase" }, { type: "ghost-exit", ghost: "pinky" }, { type: "ready" },
    { type: "level-start", level: 2 }, { type: "game-over" }, { type: "start" }, { type: "bogus" },
    { type: "fruit", kind: "cherry" },
  ];
  assert.deepEqual(map(events, playing()).oneShots, []);
  assert.deepEqual(map([], playing()).oneShots, []);
});

test("sirenStage follows the remaining-pellet thresholds at 75, 50, 25 and 10 percent", () => {
  assert.equal(sirenStage(260, 260), 1);
  assert.equal(sirenStage(196, 260), 1);
  assert.equal(sirenStage(195, 260), 2);
  assert.equal(sirenStage(131, 260), 2);
  assert.equal(sirenStage(130, 260), 3);
  assert.equal(sirenStage(66, 260), 3);
  assert.equal(sirenStage(65, 260), 4);
  assert.equal(sirenStage(27, 260), 4);
  assert.equal(sirenStage(26, 260), 5);
  assert.equal(sirenStage(1, 260), 5);
  assert.equal(sirenStage(0, 260), 5);
});

test("the loop while playing is the siren for the pellets left", () => {
  assert.equal(map([], playing()).loop, "siren-1");
  assert.equal(map([], playing({ pelletsLeft: 195 })).loop, "siren-2");
  assert.equal(map([], playing({ pelletsLeft: 130 })).loop, "siren-3");
  assert.equal(map([], playing({ pelletsLeft: 65 })).loop, "siren-4");
  assert.equal(map([], playing({ pelletsLeft: 26 })).loop, "siren-5");
});

test("eyes beats fright beats siren", () => {
  const frightened = withGhost(withGhost(playing(), "blinky", { state: "frightened" }), "pinky", { state: "frightened" });
  assert.equal(map([], frightened).loop, "fright");
  const eaten = withGhost(frightened, "blinky", { state: "eaten" });
  assert.equal(map([], eaten).loop, "eyes");
  const entering = withGhost(frightened, "pinky", { state: "entering" });
  assert.equal(map([], entering).loop, "eyes");
  const returned = withGhost(withGhost(eaten, "blinky", { state: "normal" }), "pinky", { state: "normal" });
  assert.equal(map([], returned).loop, "siren-1");
});

test("eyes plays with no frightened ghost left, and a ghost still in the house does not count", () => {
  const eyesOnly = withGhost(playing(), "inky", { state: "eaten" });
  assert.equal(map([], eyesOnly).loop, "eyes");
  assert.equal(playing().ghosts.find(g => g.name === "clyde").state, "house");
  assert.equal(map([], playing()).loop, "siren-1");
});

test("the loop is null on every screen but playing", () => {
  const frightened = withGhost(playing(), "blinky", { state: "frightened" });
  for (const screen of ["title", "ready", "paused", "dying", "level-clear", "gameover", "initials"]) {
    assert.equal(map([], frightened, screen).loop, null, screen);
  }
});

test("title, paused, gameover and initials discard one-shots; ready, dying and level-clear keep theirs", () => {
  const events = [pellet, { type: "death" }];
  for (const screen of ["title", "paused", "gameover", "initials"]) {
    const r = map(events, playing({ tick: 50 }), screen);
    assert.deepEqual(r.oneShots, [], screen);
    assert.deepEqual(r.soundState, createSoundState(), screen + " leaves the sound state alone");
  }
  assert.deepEqual(map([{ type: "level-clear" }], playing({ tick: 50 }), "level-clear").oneShots, ["level-clear"]);
  assert.deepEqual(map([{ type: "death" }], playing({ tick: 50 }), "dying").oneShots, ["death"]);
  assert.deepEqual(map([pellet], playing({ tick: 50 }), "ready").oneShots, ["waka-a"]);
});

test("the attract demo is silent: no one-shots and no loop", () => {
  const frightened = withGhost(playing({ tick: 50 }), "blinky", { state: "frightened" });
  const r = map([pellet, { type: "ghost-eaten", chain: 1 }, { type: "death" }, { type: "fruit-eaten", kind: "cherry", score: 100 }], frightened, "playing", true);
  assert.deepEqual(r, { oneShots: [], loop: null, soundState: createSoundState() });
});

test("a death stops the loop in the same result as its one-shot", () => {
  const r = map([{ type: "death" }], playing({ phase: "dying", tick: 50 }), "dying");
  assert.deepEqual(r, { oneShots: ["death"], loop: null, soundState: createSoundState() });
});

test("mapSounds never mutates its inputs and returns the same sound state when nothing changed", () => {
  const ss = createSoundState();
  const state = withGhost(playing({ tick: 10, pelletsLeft: 100 }), "blinky", { state: "frightened" });
  const events = [pellet, { type: "ghost-eaten", chain: 1 }];
  const ssBefore = structuredClone(ss);
  const stateBefore = structuredClone(state);
  const eventsBefore = structuredClone(events);
  const r = map(events, state, "playing", false, ss);
  assert.deepStrictEqual(ss, ssBefore);
  assert.deepStrictEqual(state, stateBefore);
  assert.deepStrictEqual(events, eventsBefore);
  assert.notEqual(r.soundState, ss, "a waka yields a new sound state");
  const quiet = map([{ type: "ghost-eaten", chain: 2 }], state, "playing", false, ss);
  assert.equal(quiet.soundState, ss, "no waka: the very same object comes back");
});

test("every loop and one-shot name mapSounds can emit is in SOUNDS", () => {
  const names = new Set();
  let ss = createSoundState();
  for (let left = TOTAL; left >= 0; left -= 1) {
    const r = map([pellet], playing({ tick: (TOTAL - left) * 10, pelletsLeft: left }), "playing", false, ss);
    ss = r.soundState;
    for (const n of r.oneShots) names.add(n);
    names.add(r.loop);
  }
  for (const n of ["ghost-eaten", "death", "extra-life", "level-clear", "fruit-eaten"]) names.add(map([{ type: n }], playing()).oneShots[0]);
  for (const n of names) assert.ok(SOUNDS.includes(n), String(n));
});
