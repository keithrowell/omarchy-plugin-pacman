.pragma library
.import "Sprites.js" as Sprites
.import "../lib/scale.mjs" as Scale

// The HUD rows above and below the maze, in native units (224x288 stage),
// plus the texts that sit on the board between lives (READY!, GAME OVER, a
// ghost's score). Text is the pixel font at 8 px so each glyph fills one 8x8
// tile, as in the original. No Qt, no Theme: the game state, a palette
// object and the font family name come in as arguments.

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

// The level indicator, right-aligned on the bottom row.
var LEVEL_RIGHT = 216;
var LEVEL_Y = 280;

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
 * spare lives (lives - 1) bottom-left, LEVEL n bottom-right, and READY! or
 * GAME OVER on the board while the phase says so. `palette` needs
 * { text, pacman, ready, gameOver }.
 */
function drawHud(ctx, state, palette, family) {
    ctx.save();
    ctx.font = fontString(family);
    ctx.textBaseline = "top";
    ctx.fillStyle = palette.text;

    ctx.textAlign = "left";
    ctx.fillText("1UP", ONE_UP_X, 0);
    ctx.fillText("HIGH SCORE", HIGH_SCORE_X, 0);

    ctx.textAlign = "right";
    ctx.fillText(String(state.score), SCORE_RIGHT, FONT_PX);
    ctx.fillText(String(state.highScore), HIGH_SCORE_RIGHT, FONT_PX);
    ctx.fillText("LEVEL " + state.level, LEVEL_RIGHT, LEVEL_Y);

    ctx.fillStyle = palette.pacman;
    for (var i = 0; i < state.lives - 1; i++) {
        Sprites.drawWedge(ctx, LIFE_X + i * LIFE_STEP, LIFE_Y, LIFE_RADIUS, Math.PI, LIFE_MOUTH);
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
 * One line on HUD row 2: `fps tx,ty want:dir mode phase fright`.
 * `info` is { fps, tile, wantDir, mode, phase, fright }.
 */
function drawDebug(ctx, info, palette, family) {
    ctx.save();
    ctx.font = fontString(family);
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    ctx.fillStyle = palette.muted;
    var want = info.wantDir ? info.wantDir : "-";
    ctx.fillText(info.fps + " " + info.tile.x + "," + info.tile.y + " " + want + " " + info.mode.charAt(0)
        + " " + info.phase + " " + info.fright, DEBUG_X, DEBUG_Y);
    ctx.restore();
}
