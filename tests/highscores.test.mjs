import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TABLE_SIZE, INITIALS_LENGTH, LETTERS, EMPTY_INITIALS, MAX_HIGH_SCORE,
  topScore, qualifies, rankOf, insert, parseHighScores, serialiseHighScores,
} from "../lib/highscores.mjs";

test("constants", () => {
  assert.equal(TABLE_SIZE, 10);
  assert.equal(INITIALS_LENGTH, 3);
  assert.equal(LETTERS, "ABCDEFGHIJKLMNOPQRSTUVWXYZ");
  assert.equal(EMPTY_INITIALS, "---");
  assert.equal(MAX_HIGH_SCORE, Number.MAX_SAFE_INTEGER);
});

test("parseHighScores round-trips the canonical shape, keeping initials/score/level", () => {
  const text = JSON.stringify({
    highScores: [
      { initials: "AAA", score: 500, level: 3 },
      { initials: "BBB", score: 300, level: 1 },
    ],
  });
  assert.deepEqual(parseHighScores(text), [
    { initials: "AAA", score: 500, level: 3 },
    { initials: "BBB", score: 300, level: 1 },
  ]);
});

test("migration from the old single-score shape", () => {
  assert.deepEqual(parseHighScores('{"highScore": 500}'), [{ initials: "---", score: 500, level: 1 }]);
  assert.deepEqual(parseHighScores('{\n  "highScore": 12345\n}\n'), [{ initials: "---", score: 12345, level: 1 }]);
  assert.deepEqual(parseHighScores("12345"), [{ initials: "---", score: 12345, level: 1 }]);
  assert.deepEqual(parseHighScores('{"highScore": 0}'), []);
  assert.deepEqual(parseHighScores("0"), []);
  assert.deepEqual(parseHighScores("-7"), []);
});

test("highScores wins when both keys are present", () => {
  const text = JSON.stringify({ highScore: 999, highScores: [{ initials: "ZZZ", score: 111, level: 2 }] });
  assert.deepEqual(parseHighScores(text), [{ initials: "ZZZ", score: 111, level: 2 }]);
});

test("corrupt or missing input is an empty table", () => {
  for (const text of ["", undefined, null, "garbage", "{ highScore: 5", "[500]", "null", '{"highScores": "x"}']) {
    assert.deepEqual(parseHighScores(text), [], String(text));
  }
});

test("sanitising rows: score", () => {
  assert.deepEqual(parseHighScores(JSON.stringify({ highScores: [{ score: 999.9 }] }))[0].score, 999);
  assert.deepEqual(parseHighScores(JSON.stringify({ highScores: [{ score: 1e300 }] }))[0].score, MAX_HIGH_SCORE);
  assert.deepEqual(parseHighScores(JSON.stringify({ highScores: [{ score: "500" }] })), [], "string score: row dropped");
  assert.deepEqual(parseHighScores(JSON.stringify({ highScores: [{ score: 0 }] })), [], "0: row dropped");
  assert.deepEqual(parseHighScores(JSON.stringify({ highScores: [{ score: -5 }] })), [], "negative: row dropped");
});

test("sanitising rows: initials", () => {
  const row = (initials) => parseHighScores(JSON.stringify({ highScores: [{ initials, score: 100 }] }))[0].initials;
  assert.equal(row("abc"), "ABC");
  assert.equal(row("AB"), EMPTY_INITIALS);
  assert.equal(row("ABCD"), EMPTY_INITIALS);
  assert.equal(row("A1B"), EMPTY_INITIALS);
  assert.equal(row(42), EMPTY_INITIALS);
});

test("sanitising rows: level", () => {
  const level = (level) => parseHighScores(JSON.stringify({ highScores: [{ score: 100, level }] }))[0].level;
  assert.equal(level(0), 1);
  assert.equal(level(-1), 1);
  assert.equal(level("3"), 1);
  assert.equal(level(undefined), 1);
  assert.equal(level(2.7), 2);
});

test("parseHighScores sorts descending on parse, keeps file order for ties, and drops past 10", () => {
  const rows = [
    { initials: "AAA", score: 100, level: 1 },
    { initials: "BBB", score: 300, level: 1 },
    { initials: "CCC", score: 200, level: 1 },
  ];
  assert.deepEqual(parseHighScores(JSON.stringify({ highScores: rows })).map(r => r.score), [300, 200, 100]);

  const tied = [
    { initials: "AAA", score: 200, level: 1 },
    { initials: "BBB", score: 200, level: 1 },
  ];
  assert.deepEqual(parseHighScores(JSON.stringify({ highScores: tied })).map(r => r.initials), ["AAA", "BBB"]);

  const twelve = [];
  for (let i = 0; i < 12; i++) twelve.push({ initials: "AAA", score: 100 + i, level: 1 });
  const table = parseHighScores(JSON.stringify({ highScores: twelve }));
  assert.equal(table.length, 10);
  assert.deepEqual(table.map(r => r.score), [111, 110, 109, 108, 107, 106, 105, 104, 103, 102]);
});

test("qualifies", () => {
  assert.equal(qualifies([], 10), true);
  assert.equal(qualifies([], 0), false);
  assert.equal(qualifies([], -5), false);
  const nine = [];
  for (let i = 0; i < 9; i++) nine.push({ initials: "AAA", score: 100 - i, level: 1 });
  assert.equal(qualifies(nine, 1), true);
  const full = [];
  for (let i = 0; i < 10; i++) full.push({ initials: "AAA", score: 1000 - i * 10, level: 1 });
  const last = full[9].score;
  assert.equal(qualifies(full, last + 1), true);
  assert.equal(qualifies(full, last), false);
  assert.equal(qualifies(full, last - 1), false);
  assert.equal(qualifies(full, NaN), false);
  assert.equal(qualifies(full, "500"), false);
});

test("rankOf", () => {
  assert.equal(rankOf([], 10), 1);
  const t = [{ initials: "AAA", score: 300, level: 1 }, { initials: "BBB", score: 200, level: 1 }, { initials: "CCC", score: 100, level: 1 }];
  assert.equal(rankOf(t, 250), 2);
  assert.equal(rankOf(t, 200), 3, "tie ranks below");
  assert.equal(rankOf(t, 300), 2, "tie with the top ranks below it");
  assert.equal(rankOf(t, 400), 1);
  const full = [];
  for (let i = 0; i < 10; i++) full.push({ initials: "AAA", score: 1000 - i * 10, level: 1 });
  assert.equal(rankOf(full, full[9].score), 0, "a tie with the worst row of a full table does not qualify");

  for (const score of [250, 200, 300, 400]) {
    const rank = rankOf(t, score);
    const inserted = insert(t, { initials: "ZZZ", score, level: 1 });
    assert.equal(inserted[rank - 1].initials, "ZZZ", `rank ${rank} for score ${score}`);
  }
});

test("insert into an empty table", () => {
  const result = insert([], { initials: "AAA", score: 500, level: 2 });
  assert.deepEqual(result, [{ initials: "AAA", score: 500, level: 2 }]);
});

test("insert in the middle", () => {
  const t = [{ initials: "AAA", score: 300, level: 1 }, { initials: "BBB", score: 100, level: 1 }];
  const result = insert(t, { initials: "CCC", score: 200, level: 1 });
  assert.deepEqual(result.map(r => r.initials), ["AAA", "CCC", "BBB"]);
});

test("a tie ranks the new entry below the existing one, which stays at its index (same object)", () => {
  const existing = { initials: "AAA", score: 200, level: 1 };
  const t = [existing];
  const result = insert(t, { initials: "BBB", score: 200, level: 1 });
  assert.equal(result[0], existing, "the existing row keeps its identity and position");
  assert.equal(result[1].initials, "BBB");
});

test("insert into a full table: a higher score displaces the 10th row", () => {
  const full = [];
  for (let i = 0; i < 10; i++) full.push({ initials: "AAA", score: 1000 - i * 10, level: 1 });
  const dropped = full[9];
  const result = insert(full, { initials: "ZZZ", score: 950, level: 1 });
  assert.equal(result.length, 10);
  assert.ok(result.includes(dropped) === false, "the old 10th row is gone");
  assert.ok(result.some(r => r.initials === "ZZZ" && r.score === 950));
});

test("insert into a full table: a tie with the 10th row changes nothing (same object back)", () => {
  const full = [];
  for (let i = 0; i < 10; i++) full.push({ initials: "AAA", score: 1000 - i * 10, level: 1 });
  const result = insert(full, { initials: "ZZZ", score: full[9].score, level: 1 });
  assert.equal(result, full);
});

test("insert with a non-qualifying entry returns the same table object", () => {
  const t = [{ initials: "AAA", score: 500, level: 1 }];
  assert.equal(insert(t, { initials: "BBB", score: 0, level: 1 }), t);
  assert.equal(insert(t, { initials: "BBB", score: -5, level: 1 }), t);
  assert.equal(insert(t, {}), t);
});

test("insert never mutates the input table or its rows, and returns fresh row objects", () => {
  const t = [{ initials: "AAA", score: 500, level: 1 }];
  const before = JSON.stringify(t);
  const entry = { initials: "BBB", score: 300, level: 1 };
  const result = insert(t, entry);
  assert.equal(JSON.stringify(t), before);
  assert.notEqual(result[1], entry, "the stored row is a fresh object, not the entry passed in");
  assert.deepEqual(result[1], entry);
});

test("topScore", () => {
  assert.equal(topScore([]), 0);
  assert.equal(topScore([{ initials: "AAA", score: 500, level: 1 }]), 500);
  assert.equal(topScore(undefined), 0);
  assert.equal(topScore("junk"), 0);
  assert.equal(topScore([{ initials: "AAA" }]), 0);
});

test("serialiseHighScores: pretty JSON, trailing newline, key order, round trip", () => {
  const table = [{ initials: "AAA", score: 500, level: 3 }, { initials: "BBB", score: 300, level: 1 }];
  const text = serialiseHighScores(table);
  assert.ok(text.endsWith("\n"));
  assert.ok(text.includes("\n  "), "pretty printed");
  const parsed = JSON.parse(text);
  assert.deepEqual(Object.keys(parsed.highScores[0]), ["initials", "score", "level"]);
  assert.deepEqual(parseHighScores(text), table);
});

test("serialiseHighScores sanitises junk input to a valid (possibly empty) table", () => {
  assert.deepEqual(JSON.parse(serialiseHighScores(undefined)), { highScores: [] });
  assert.deepEqual(JSON.parse(serialiseHighScores("junk")), { highScores: [] });
  const withJunkRows = serialiseHighScores([{ initials: "abc", score: 999.9, level: 0 }, { score: 0 }, null]);
  assert.deepEqual(JSON.parse(withJunkRows), { highScores: [{ initials: "ABC", score: 999, level: 1 }] });
});
