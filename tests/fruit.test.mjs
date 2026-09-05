import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { LEVEL_1 } from "../lib/maze-data.mjs";
import { parseMaze, tileAt, isWalkable, TILE } from "../lib/maze.mjs";
import { THEME_KEYS } from "../lib/theme.mjs";
import {
  FRUITS, FRUIT_KINDS, FRUIT_ROW_LENGTH, FRUIT_SPAWN_COUNTS, FRUIT_TICKS, FRUIT_SCORE_TICKS,
  fruitForLevel, fruitRow, fruitTile, fruitSpot,
} from "../lib/fruit.mjs";
import { FRUIT_SPRITES } from "../lib/fruit-sprites.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const maze = parseMaze(LEVEL_1);

test("the constants match the plan", () => {
  assert.deepEqual(FRUIT_SPAWN_COUNTS, [70, 170]);
  assert.equal(FRUIT_TICKS, 540);
  assert.equal(FRUIT_SCORE_TICKS, 120);
  assert.equal(FRUIT_ROW_LENGTH, 7);
  assert.deepEqual(FRUIT_KINDS, ["cherry", "strawberry", "orange", "apple", "melon", "galaxian", "bell", "key"]);
  assert.ok(Object.isFrozen(FRUITS));
  for (const row of FRUITS) assert.ok(Object.isFrozen(row), row.kind);
});

test("fruitForLevel follows the classic table for levels 1 to 20", () => {
  const scores = [100, 300, 500, 500, 700, 700, 1000, 1000, 2000, 2000, 3000, 3000, 5000, 5000, 5000, 5000, 5000, 5000, 5000, 5000];
  const kinds = ["cherry", "strawberry", "orange", "orange", "apple", "apple", "melon", "melon",
    "galaxian", "galaxian", "bell", "bell", "key", "key", "key", "key", "key", "key", "key", "key"];
  for (let level = 1; level <= 20; level++) {
    const f = fruitForLevel(level);
    assert.equal(f.score, scores[level - 1], `level ${level}`);
    assert.equal(f.kind, kinds[level - 1], `level ${level}`);
  }
});

test("fruitForLevel sanitises junk to level 1 (cherry) and floors fractions", () => {
  for (const level of [21, 99, 255]) assert.equal(fruitForLevel(level).kind, "key", String(level));
  for (const junk of [0, -1, "3", undefined, null, NaN, {}, true]) assert.equal(fruitForLevel(junk).kind, "cherry", String(junk));
  assert.equal(fruitForLevel(2.5).kind, "strawberry", "2.5 floors to level 2");
});

test("fruitRow is the last min(level, 7) levels' fruit, oldest first, newest last, a fresh array each time", () => {
  for (let level = 1; level <= 20; level++) {
    const row = fruitRow(level);
    assert.equal(row.length, Math.min(level, 7), `level ${level}`);
    assert.equal(row[row.length - 1], fruitForLevel(level).kind, `level ${level} newest`);
    for (let i = 0; i < row.length; i++) {
      assert.equal(row[i], fruitForLevel(level - (row.length - 1 - i)).kind, `level ${level} entry ${i}`);
    }
  }
  assert.deepEqual(fruitRow(1), ["cherry"]);
  assert.deepEqual(fruitRow(3), ["cherry", "strawberry", "orange"]);
  assert.deepEqual(fruitRow(7), ["cherry", "strawberry", "orange", "orange", "apple", "apple", "melon"]);
  assert.deepEqual(fruitRow(8), ["strawberry", "orange", "orange", "apple", "apple", "melon", "melon"]);
  assert.deepEqual(fruitRow(13), ["melon", "melon", "galaxian", "galaxian", "bell", "bell", "key"]);
  assert.deepEqual(fruitRow(20), ["key", "key", "key", "key", "key", "key", "key"]);
  const a = fruitRow(5);
  a.push("junk");
  assert.notDeepEqual(fruitRow(5), a);
});

test("fruitRow sanitises like fruitForLevel", () => {
  assert.deepEqual(fruitRow(0), ["cherry"]);
  assert.deepEqual(fruitRow(-3), ["cherry"]);
  assert.deepEqual(fruitRow("3"), ["cherry"]);
});

test("fruitTile is the maze-derived tile below the house door, not a hard-coded constant", () => {
  const t = fruitTile(maze);
  assert.deepEqual(t, { x: 13, y: 17 });
  assert.deepEqual(t, { x: maze.house.door[0].x, y: maze.house.y + maze.house.height });
  assert.equal(tileAt(maze, t.x, t.y), TILE.EMPTY);
  assert.ok(isWalkable(tileAt(maze, t.x, t.y)));
  assert.equal(tileAt(maze, 14, 17), TILE.EMPTY, "the door's other tile is open too");
  for (const [x, y] of [[13, 16], [14, 16], [13, 18], [14, 18]]) {
    assert.equal(tileAt(maze, x, y), TILE.WALL, `${x},${y}`);
  }
  for (const tunnel of maze.tunnels) assert.notEqual(tunnel.y, t.y, "the fruit tile is not on a tunnel row");
});

test("fruitSpot is the house's centre line at the fruit tile's row: (112, 140)", () => {
  assert.deepEqual(fruitSpot(maze), { x: 112, y: 140 });
});

test("FRUIT_SPRITES has exactly the eight kinds, well-formed bitmaps, and no colour literal", () => {
  assert.deepEqual(Object.keys(FRUIT_SPRITES), FRUIT_KINDS);
  assert.ok(Object.isFrozen(FRUIT_SPRITES));
  for (const kind of FRUIT_KINDS) {
    const bitmap = FRUIT_SPRITES[kind];
    assert.ok(Object.isFrozen(bitmap), kind);
    assert.ok(Object.isFrozen(bitmap.rows), kind);
    assert.ok(Object.isFrozen(bitmap.roles), kind);
    assert.ok(Array.isArray(bitmap.rows) && bitmap.rows.length > 0, kind);
    const width = bitmap.rows[0].length;
    assert.ok(width >= 1 && width <= 14, `${kind} width ${width}`);
    assert.ok(bitmap.rows.length >= 1 && bitmap.rows.length <= 14, `${kind} height ${bitmap.rows.length}`);
    let opaque = false;
    const used = new Set();
    for (const row of bitmap.rows) {
      assert.equal(row.length, width, `${kind} row width`);
      for (const ch of row) {
        if (ch === ".") continue;
        opaque = true;
        used.add(ch);
        assert.ok(Object.prototype.hasOwnProperty.call(bitmap.roles, ch), `${kind}: '${ch}' is not a declared letter`);
      }
    }
    assert.ok(opaque, `${kind} has at least one opaque pixel`);
    for (const letter of Object.keys(bitmap.roles)) {
      assert.ok(used.has(letter), `${kind}: letter '${letter}' is declared but never drawn`);
      const role = bitmap.roles[letter];
      assert.ok(THEME_KEYS.includes(role), `${kind}: '${letter}' -> unknown role '${role}'`);
      assert.notEqual(role, "mode", `${kind}: '${letter}' maps to 'mode', not a colour`);
    }
  }
});

test("lib/fruit-sprites.mjs contains no colour literal", () => {
  const text = readFileSync(resolve(ROOT, "lib", "fruit-sprites.mjs"), "utf8");
  assert.doesNotMatch(text, /#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/);
});
