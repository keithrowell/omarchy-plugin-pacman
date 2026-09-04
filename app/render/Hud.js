.pragma library
.import "Sprites.js" as Sprites

// The HUD rows above and below the maze, in native units (224x288 stage).
// Text is the pixel font at 8 px so each glyph fills one 8x8 tile, as in the
// original. No Qt, no Theme: the game state, a palette object and the font
// family name come in as arguments.

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

var DEBUG_X = 64;
var DEBUG_Y = 280;

function fontString(family) {
    return FONT_PX + 'px "' + family + '"';
}

/**
 * 1UP and the score top-left, HIGH SCORE and its value top-centre, the
 * spare lives (lives - 1) bottom-left. `palette` needs { text, pacman }.
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

    ctx.fillStyle = palette.pacman;
    for (var i = 0; i < state.lives - 1; i++) {
        Sprites.drawWedge(ctx, LIFE_X + i * LIFE_STEP, LIFE_Y, LIFE_RADIUS, Math.PI, LIFE_MOUTH);
    }
    ctx.restore();
}

/** One line bottom-right of the lives: `fps tx,ty want:dir`. `info` is { fps, tile, wantDir }. */
function drawDebug(ctx, info, palette, family) {
    ctx.save();
    ctx.font = fontString(family);
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    ctx.fillStyle = palette.muted;
    var want = info.wantDir ? info.wantDir : "-";
    ctx.fillText(info.fps + " " + info.tile.x + "," + info.tile.y + " want:" + want, DEBUG_X, DEBUG_Y);
    ctx.restore();
}
