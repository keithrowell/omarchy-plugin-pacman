import { test } from "node:test";
import assert from "node:assert/strict";
import { LEVEL_1 } from "../lib/maze-data.mjs";
import { parseMaze } from "../lib/maze.mjs";
import { DIRS } from "../lib/input.mjs";
import { createState, step, TICK } from "../lib/game.mjs";
import { mazeChecksum, attractValid, wellFormed, expandScript, attractInput, attractEnded } from "../lib/attract.mjs";
import { ATTRACT } from "../lib/attract-script.mjs";
import { generateAttract, encodeRuns, ATTRACT_SEED, ATTRACT_MAX_TICKS } from "../tools/gen-attract.mjs";

const REGEN = "maze or rules changed: run `node tools/gen-attract.mjs`";

test("mazeChecksum is a stable unsigned 32-bit FNV-1a; one changed character changes it", () => {
  assert.equal(mazeChecksum(LEVEL_1), mazeChecksum(LEVEL_1));
  const h = mazeChecksum(LEVEL_1);
  assert.ok(Number.isInteger(h) && h >= 0 && h < 2 ** 32);
  const flipped = LEVEL_1.replace("#o##", "#.##");
  assert.notEqual(flipped, LEVEL_1);
  assert.notEqual(mazeChecksum(flipped), h);
  assert.equal(mazeChecksum(""), 0x811c9dc5, "the FNV offset basis for empty input");
  assert.equal(mazeChecksum("a"), 0xe40c292c, "known FNV-1a vector");
  assert.notEqual(mazeChecksum("ab"), mazeChecksum("ba"));
});

test("the committed script carries the checksum of the current maze", () => {
  assert.equal(ATTRACT.checksum, mazeChecksum(LEVEL_1), REGEN);
  assert.ok(attractValid(ATTRACT, LEVEL_1), REGEN);
});

test("the committed script is well formed: seed, runs of valid directions adding up to its length", () => {
  assert.ok(wellFormed(ATTRACT));
  assert.equal(ATTRACT.seed, ATTRACT_SEED);
  assert.ok(ATTRACT.length >= 1200, `demo is ${ATTRACT.length} ticks, under 20 s`);
  assert.ok(ATTRACT.length <= ATTRACT_MAX_TICKS);
  let total = 0;
  for (const run of ATTRACT.runs) {
    assert.ok(run[0] === null || DIRS[run[0]] !== undefined, `bad direction ${run[0]}`);
    assert.ok(Number.isInteger(run[1]) && run[1] > 0, `bad run length ${run[1]}`);
    total += run[1];
  }
  assert.equal(total, ATTRACT.length);
  assert.equal(expandScript(ATTRACT).length, ATTRACT.length);
});

test("replaying the script from its seed reproduces the recorded score at the recorded tick", () => {
  const maze = parseMaze(LEVEL_1);
  let s = createState(maze, { seed: ATTRACT.seed });
  while (s.tick < ATTRACT.expectedTick) {
    s = step(s, { wantDir: attractInput(ATTRACT, s.tick) }, TICK).state;
  }
  assert.equal(s.tick, ATTRACT.expectedTick);
  assert.equal(s.score, ATTRACT.expectedScore, REGEN);
  assert.equal(s.phase, ATTRACT.expectedPhase, REGEN);
  assert.ok(attractEnded(ATTRACT, s.tick));
  assert.ok(s.score > 0, "the demo eats something");
});

test("the committed script is exactly what the generator produces today", () => {
  assert.deepEqual(generateAttract(), ATTRACT, REGEN);
});

test("the demo spawns fruit from the pellet count, so a fruit shows on screen unattended", () => {
  const maze = parseMaze(LEVEL_1);
  let s = createState(maze, { seed: ATTRACT.seed });
  const events = [];
  while (s.tick < ATTRACT.expectedTick) {
    const r = step(s, { wantDir: attractInput(ATTRACT, s.tick) }, TICK);
    s = r.state;
    events.push(...r.events);
  }
  assert.ok(events.some(e => e.type === "fruit"),
    "the demo is the unattended way to see a fruit; update the manual-verification recipe in specs/…/plan.md if this ever changes");
});

test("attractInput walks the runs per tick; past the end it is null and attractEnded is true", () => {
  const script = { checksum: 1, seed: 1, length: 6, runs: [["left", 2], [null, 1], ["up", 3]] };
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7].map(t => attractInput(script, t)), ["left", "left", null, "up", "up", "up", null, null]);
  assert.deepEqual(expandScript(script), ["left", "left", null, "up", "up", "up"]);
  assert.equal(attractEnded(script, 5), false);
  assert.equal(attractEnded(script, 6), true);
  assert.equal(attractInput(script, -1), null);
  assert.equal(attractInput(null, 0), null);
  assert.equal(attractEnded(null, 0), true);
});

test("attractValid rejects a changed maze and a malformed script", () => {
  assert.equal(attractValid(ATTRACT, LEVEL_1.replace("#o##", "#.##")), false);
  assert.equal(attractValid(null, LEVEL_1), false);
  assert.equal(attractValid({}, LEVEL_1), false);
  const c = mazeChecksum(LEVEL_1);
  assert.equal(attractValid({ checksum: c, seed: 1, length: 2, runs: [["left", 1]] }, LEVEL_1), false, "runs short of length");
  assert.equal(attractValid({ checksum: c, seed: 1, length: 1, runs: [["sideways", 1]] }, LEVEL_1), false, "bad direction");
  assert.equal(attractValid({ checksum: c, seed: 1, length: 1, runs: [["left", 0], ["up", 1]] }, LEVEL_1), false, "empty run");
  assert.equal(attractValid({ checksum: c, seed: 1, length: 0, runs: [] }, LEVEL_1), false, "empty script");
  assert.equal(attractValid({ checksum: c, seed: 1, length: 1, runs: [["left", 1]] }, LEVEL_1), true);
});

test("encodeRuns compresses repeats and keeps nulls", () => {
  assert.deepEqual(encodeRuns(["left", "left", null, null, null, "up"]), [["left", 2], [null, 3], ["up", 1]]);
  assert.deepEqual(encodeRuns([]), []);
});

test("generateAttract is deterministic and honours its options", () => {
  const short = generateAttract(LEVEL_1, { maxTicks: 300 });
  assert.equal(short.length, 300);
  assert.equal(short.expectedTick, 300);
  assert.deepEqual(generateAttract(LEVEL_1, { maxTicks: 300 }), short);
  assert.notEqual(generateAttract(LEVEL_1, { maxTicks: 300, seed: 3 }).expectedScore, undefined);
});
