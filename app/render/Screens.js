.pragma library
.import "Sprites.js" as Sprites
.import "../lib/scale.mjs" as Scale

// The screens around the game, in native units (224x288 stage): the title
// with its roll-call, the pause overlay and the demo banner. Text is the
// pixel font at 8 px (16 px for the title), one glyph per tile, as in the
// original. No Qt, no Theme: a palette object and the font family name come
// in as arguments.

var FONT_PX = 8;
var TITLE_PX = 16;
var CENTRE_X = 112;

// The title: PACMAN, then one row per ghost (sprite, name, nickname) and
// one for Pac-Man, the high score, the blinking prompt, the quit bar while
// q is held, and the key hints.
var TITLE_Y = 40;
var ROLL_Y = 88;
var ROLL_STEP = 24;
var SPRITE_X = 40;
var NAME_X = 64;
var NICK_X = 136;
var HIGH_SCORE_Y = 208;
var PRESS_Y = 232;
var QUIT_Y = 248;
var QUIT_LABEL_X = 48;
var QUIT_BAR_X = 88;
var QUIT_BAR_WIDTH = 88;
var QUIT_BAR_HEIGHT = 4;
var HINT_Y = 264;
var HINT2_Y = 276;

var ROLL_CALL = [
    { name: "blinky", label: "BLINKY", nick: "SHADOW" },
    { name: "pinky", label: "PINKY", nick: "SPEEDY" },
    { name: "inky", label: "INKY", nick: "BASHFUL" },
    { name: "clyde", label: "CLYDE", nick: "POKEY" },
];
var PACMAN_MOUTH = 35 * Math.PI / 180;
var PACMAN_RADIUS = 6.5;

// PAUSED and DEMO: the moat row below the house and the bottom HUD row.
var MESSAGE_ROW = 17;
var BANNER_Y = 280;

function fontString(family, px) {
    return (px || FONT_PX) + 'px "' + family + '"';
}

/**
 * The title screen. `info` is { highScore, blinkOn, quitHold } with
 * quitHold in [0, 1], how far a held q is towards quitting. `palette`
 * needs { title, text, muted, pacman, quit, ghosts, eyeWhite, pupil }.
 */
function drawTitle(ctx, info, palette, family) {
    ctx.save();
    ctx.textBaseline = "top";
    ctx.textAlign = "center";

    ctx.font = fontString(family, TITLE_PX);
    ctx.fillStyle = palette.title;
    ctx.fillText("PACMAN", CENTRE_X, TITLE_Y);

    ctx.font = fontString(family);
    ctx.textAlign = "left";
    var y = ROLL_Y;
    for (var i = 0; i < ROLL_CALL.length; i++) {
        var entry = ROLL_CALL[i];
        // A still ghost facing right, in maze coordinates (drawGhost adds the board origin).
        var ghost = { name: entry.name, x: SPRITE_X, y: y + FONT_PX / 2 - Scale.BOARD_ORIGIN.y, dir: "right", state: "normal" };
        Sprites.drawGhost(ctx, ghost, palette, 0, false);
        ctx.fillStyle = palette.ghosts[entry.name];
        ctx.fillText(entry.label, NAME_X, y);
        ctx.fillStyle = palette.text;
        ctx.fillText('"' + entry.nick + '"', NICK_X, y);
        y += ROLL_STEP;
    }
    ctx.fillStyle = palette.pacman;
    Sprites.drawWedge(ctx, SPRITE_X, y + FONT_PX / 2, PACMAN_RADIUS, 0, PACMAN_MOUTH);
    ctx.fillText("PACMAN", NAME_X, y);

    ctx.textAlign = "center";
    ctx.fillStyle = palette.text;
    ctx.fillText("HIGH SCORE " + info.highScore, CENTRE_X, HIGH_SCORE_Y);

    if (info.blinkOn) {
        ctx.fillStyle = palette.title;
        ctx.fillText("PRESS ENTER", CENTRE_X, PRESS_Y);
    }

    if (info.quitHold > 0) {
        ctx.fillStyle = palette.quit;
        ctx.textAlign = "left";
        ctx.fillText("QUIT", QUIT_LABEL_X, QUIT_Y);
        var w = Math.round(QUIT_BAR_WIDTH * Math.min(1, info.quitHold));
        ctx.fillRect(QUIT_BAR_X, QUIT_Y + (FONT_PX - QUIT_BAR_HEIGHT) / 2, w, QUIT_BAR_HEIGHT);
        ctx.textAlign = "center";
    }

    ctx.fillStyle = palette.muted;
    ctx.fillText("S SCANLINES  G SMOOTH", CENTRE_X, HINT_Y);
    ctx.fillText("HOLD Q TO QUIT", CENTRE_X, HINT2_Y);
    ctx.restore();
}

/**
 * The pause overlay: the board dimmed under `palette.dim` (a translucent
 * background colour the caller derives) and PAUSED on the moat row.
 * `palette` needs { dim, text }.
 */
function drawPaused(ctx, palette, family) {
    ctx.save();
    ctx.fillStyle = palette.dim;
    ctx.fillRect(Scale.BOARD_ORIGIN.x, Scale.BOARD_ORIGIN.y, Sprites.BOARD_WIDTH, Sprites.BOARD_HEIGHT);
    ctx.font = fontString(family);
    ctx.textBaseline = "top";
    ctx.textAlign = "center";
    ctx.fillStyle = palette.text;
    ctx.fillText("PAUSED", CENTRE_X, Scale.BOARD_ORIGIN.y + MESSAGE_ROW * FONT_PX);
    ctx.restore();
}

/** DEMO, blinking, on the bottom HUD row between the lives and the level. `palette` needs { title }. */
function drawAttractBanner(ctx, blinkOn, palette, family) {
    if (!blinkOn) return;
    ctx.save();
    ctx.font = fontString(family);
    ctx.textBaseline = "top";
    ctx.textAlign = "center";
    ctx.fillStyle = palette.title;
    ctx.fillText("DEMO", CENTRE_X, BANNER_Y);
    ctx.restore();
}
