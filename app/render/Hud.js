.pragma library
.import "Sprites.js" as Sprites
.import "../lib/scale.mjs" as Scale
.import "../lib/fruit.mjs" as Fruit
.import "../lib/fruit-sprites.mjs" as FruitSprites

// The HUD rows above and below the maze, in native units (224x288 stage),
// plus the texts that sit on the board between lives (READY!, GAME OVER, a
// ghost's score). Text is the pixel font at 8 px so each glyph fills one 8x8
// tile, as in the original. No Qt, no Theme: the game state, a palette
// object and the font family name come in as arguments. `palette` now also
// needs `theme` (the resolved role -> hex object) for the fruit row's
// bitmaps.

var FONT_PX = 8;

// Row 0: labels; row 1: values, right-aligned like the arcade HUD.
var ONE_UP_X = 24;
var HIGH_SCORE_X = 72;
var SCORE_RIGHT = 56;
var HIGH_SCORE_RIGHT = 136;

// Spare lives along the bottom-left, one 16-px slot each.
var LIFE_X = 28;
var LIFE_STEP = 16;
var LIFE_Y = 280;
var LIFE_RADIUS = 5;
var LIFE_MOUTH = 35 * Math.PI / 180;

// The fruit row, bottom-right, replacing LEVEL n (the original cabinet has
// no level text either): up to FRUIT_ROW_LENGTH 16-px slots, newest (the
// level's own fruit) at the right; the leftmost slot at full length (x
// 105..119 centred on 112) clears the spare lives (at most four wedges,
// ending at x 81).
var FRUIT_RIGHT = 216;
var FRUIT_STEP = 16;
var FRUIT_Y = 280;

// MUTE / NO AUDIO, right-aligned on row 1 (row 0 is full: HIGH SCORE ends
// at 152, where NO AUDIO would start).
var STATUS_RIGHT = 216;
var STATUS_Y = FONT_PX;

// READY! and GAME OVER sit on the empty moat row below the house (maze row
// 17), centred, as the original's do below its house.
var MESSAGE_X = 112;
var MESSAGE_ROW = 17;

// The debug line takes the spare HUD row 2, above the maze.
var DEBUG_X = 8;
var DEBUG_Y = 16;

function fontString(family) {
    return FONT_PX + 'px "' + family + '"';
}

/**
 * 1UP and the score top-left, HIGH SCORE and its value top-centre, the
 * spare lives (lives - 1) bottom-left, the last seven levels' fruit
 * bottom-right (fruitRow), and READY! or GAME OVER on the board while the
 * phase says so. `palette` needs { text, muted, pacman, ready, gameOver,
 * theme }. `opts` (optional) is { blinkOn, muted, audio }: 1UP blinks, drawn
 * only while blinkOn, otherwise it is steady; MUTE sits top-right (row 1)
 * while muted, or NO AUDIO when audio is false (no device), in the muted
 * colour.
 */
function drawHud(ctx, state, palette, family, opts) {
    var showOneUp = !opts || opts.blinkOn;
    var status = !opts ? "" : opts.audio === false ? "NO AUDIO" : opts.muted ? "MUTE" : "";
    ctx.save();
    ctx.font = fontString(family);
    ctx.textBaseline = "top";
    ctx.fillStyle = palette.text;

    ctx.textAlign = "left";
    if (showOneUp) ctx.fillText("1UP", ONE_UP_X, 0);
    ctx.fillText("HIGH SCORE", HIGH_SCORE_X, 0);

    ctx.textAlign = "right";
    ctx.fillText(String(state.score), SCORE_RIGHT, FONT_PX);
    ctx.fillText(String(state.highScore), HIGH_SCORE_RIGHT, FONT_PX);

    if (status !== "") {
        ctx.fillStyle = palette.muted;
        ctx.fillText(status, STATUS_RIGHT, STATUS_Y);
        ctx.fillStyle = palette.text;
    }

    ctx.fillStyle = palette.pacman;
    for (var i = 0; i < state.lives - 1; i++) {
        Sprites.drawWedge(ctx, LIFE_X + i * LIFE_STEP, LIFE_Y, LIFE_RADIUS, Math.PI, LIFE_MOUTH);
    }

    // Slot i counted from the right: i = 0 is the newest (row's last entry,
    // the level's own fruit), at x 208; each older one steps 16 px left.
    var row = Fruit.fruitRow(state.level);
    for (var i = 0; i < row.length; i++) {
        var bitmap = FruitSprites.FRUIT_SPRITES[row[row.length - 1 - i]];
        var size = Sprites.bitmapSize(bitmap);
        var cx = FRUIT_RIGHT - FRUIT_STEP / 2 - i * FRUIT_STEP;
        Sprites.drawBitmap(ctx, bitmap, Math.round(cx - size.width / 2), Math.round(FRUIT_Y - size.height / 2), palette.theme);
    }

    var messageY = Scale.BOARD_ORIGIN.y + MESSAGE_ROW * FONT_PX;
    ctx.textAlign = "center";
    if (state.phase === "ready") {
        ctx.fillStyle = palette.ready;
        ctx.fillText("READY!", MESSAGE_X, messageY);
    } else if (state.phase === "game-over") {
        ctx.fillStyle = palette.gameOver;
        ctx.fillText("GAME OVER", MESSAGE_X, messageY);
    }
    ctx.restore();
}

/**
 * The points for a ghost just eaten, centred where it was, for as long as
 * the game freezes to show it (`state.lastEaten` is set meanwhile).
 * `palette` needs { eatenScore }.
 */
function drawEatenScore(ctx, state, palette, family) {
    var eaten = state.lastEaten;
    if (!eaten) return;
    ctx.save();
    ctx.font = fontString(family);
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    ctx.fillStyle = palette.eatenScore;
    ctx.fillText(String(eaten.score), Scale.BOARD_ORIGIN.x + eaten.x, Scale.BOARD_ORIGIN.y + eaten.y);
    ctx.restore();
}

/**
 * The fruit's points, centred where it was, for as long as the popup shows
 * (`state.fruitScore` is set meanwhile). `palette` needs { fruitScore }.
 */
function drawFruitScore(ctx, state, palette, family) {
    var popup = state.fruitScore;
    if (!popup) return;
    var spot = Fruit.fruitSpot(state.maze);
    ctx.save();
    ctx.font = fontString(family);
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    ctx.fillStyle = palette.fruitScore;
    ctx.fillText(String(popup.score), Scale.BOARD_ORIGIN.x + spot.x, Scale.BOARD_ORIGIN.y + spot.y);
    ctx.restore();
}

/**
 * One line on HUD row 2: `fps tx,ty want:dir mode phase Ln fright`. `info`
 * is { fps, tile, wantDir, mode, phase, level, fright }; the level rides
 * along here now that the HUD's bottom-right shows the fruit row instead of
 * LEVEL n.
 */
function drawDebug(ctx, info, palette, family) {
    ctx.save();
    ctx.font = fontString(family);
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    ctx.fillStyle = palette.muted;
    var want = info.wantDir ? info.wantDir : "-";
    ctx.fillText(info.fps + " " + info.tile.x + "," + info.tile.y + " " + want + " " + info.mode.charAt(0)
        + " " + info.phase + " L" + info.level + " " + info.fright, DEBUG_X, DEBUG_Y);
    ctx.restore();
}
