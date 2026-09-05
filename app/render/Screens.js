.pragma library
.import "Sprites.js" as Sprites
.import "../lib/scale.mjs" as Scale
.import "../lib/highscores.mjs" as HighScores

// The screens around the game, in native units (224x288 stage): the title
// with its roll-call and its HIGH SCORES page, the initials entry screen,
// the pause overlay and the demo banner. Text is the pixel font at 8 px
// (16 px for the title), one glyph per tile, as in the original. No Qt, no
// Theme: a palette object and the font family name come in as arguments.

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

// The HIGH SCORES title page: ten ranked rows, empty ones shown as "---" / "-".
var TABLE_TITLE_Y = 56;
var TABLE_HEAD_Y = 68;
var TABLE_Y = 80;
var TABLE_STEP = 12;
var RANK_RIGHT = 40;
var TABLE_NAME_X = 56;
var SCORE_RIGHT = 152;
var TABLE_LEVEL_RIGHT = 200;

// The initials entry screen: title, score/rank/level, three blinking slots.
var ENTRY_TITLE_Y = 40;
var ENTRY_SCORE_Y = 96;
var ENTRY_RANK_Y = 112;
var ENTRY_LEVEL_Y = 128;
var SLOT_Y = 168;
var SLOT_X = [88, 112, 136];
var SLOT_BAR_Y = 188;
var SLOT_BAR_WIDTH = 12;
var SLOT_BAR_HEIGHT = 2;
var ORDINALS = ["1ST", "2ND", "3RD", "4TH", "5TH", "6TH", "7TH", "8TH", "9TH", "10TH"];

// An empty score-table row shows "---" under both NAME and SCORE.
var EMPTY_ROW_SCORE = "---";

// PAUSED and DEMO: the moat row below the house and the bottom HUD row.
var MESSAGE_ROW = 17;
var BANNER_Y = 280;

function fontString(family, px) {
    return (px || FONT_PX) + 'px "' + family + '"';
}

/** The roll-call page: PACMAN, one row per ghost, Pac-Man, HIGH SCORE n. `palette` needs { pacman, text, muted, ghosts }. */
function drawRollCall(ctx, highScore, palette, family) {
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
    ctx.fillText("HIGH SCORE " + highScore, CENTRE_X, HIGH_SCORE_Y);
}

/**
 * The HIGH SCORES page: rank, initials, score and level for up to
 * HighScores.TABLE_SIZE rows; empty rows show "---" / "-" in palette.muted.
 * `palette` needs { title, text, muted }.
 */
function drawScoreTable(ctx, table, palette, family) {
    ctx.font = fontString(family, TITLE_PX);
    ctx.textAlign = "center";
    ctx.fillStyle = palette.title;
    ctx.fillText("HIGH SCORES", CENTRE_X, TABLE_TITLE_Y);

    ctx.font = fontString(family);
    ctx.fillStyle = palette.muted;
    ctx.textAlign = "right";
    ctx.fillText("NO", RANK_RIGHT, TABLE_HEAD_Y);
    ctx.textAlign = "left";
    ctx.fillText("NAME", TABLE_NAME_X, TABLE_HEAD_Y);
    ctx.textAlign = "right";
    ctx.fillText("SCORE", SCORE_RIGHT, TABLE_HEAD_Y);
    ctx.fillText("LEVEL", TABLE_LEVEL_RIGHT, TABLE_HEAD_Y);

    for (var i = 0; i < HighScores.TABLE_SIZE; i++) {
        var y = TABLE_Y + i * TABLE_STEP;
        var row = table && table[i];
        ctx.textAlign = "right";
        ctx.fillStyle = palette.muted;
        ctx.fillText(String(i + 1), RANK_RIGHT, y);
        ctx.fillStyle = row ? palette.text : palette.muted;
        ctx.textAlign = "left";
        ctx.fillText(row ? row.initials : HighScores.EMPTY_INITIALS, TABLE_NAME_X, y);
        ctx.textAlign = "right";
        ctx.fillText(row ? String(row.score) : EMPTY_ROW_SCORE, SCORE_RIGHT, y);
        ctx.fillText(row ? String(row.level) : "-", TABLE_LEVEL_RIGHT, y);
    }
}

/**
 * The title screen: PACMAN, the roll-call or the HIGH SCORES page (every
 * 5 s, `info.page`), PRESS ENTER, the quit bar and the key hints. `info` is
 * { highScore, table, page, blinkOn, quitHold } with quitHold in [0, 1], how
 * far a held q is towards quitting; `page` is "roll-call" (default) or
 * "high-scores". `palette` needs { title, text, muted, pacman, quit, ghosts,
 * eyeWhite, pupil }.
 */
function drawTitle(ctx, info, palette, family) {
    ctx.save();
    ctx.textBaseline = "top";
    ctx.textAlign = "center";

    ctx.font = fontString(family, TITLE_PX);
    ctx.fillStyle = palette.title;
    ctx.fillText("PACMAN", CENTRE_X, TITLE_Y);

    if (info.page === "high-scores") drawScoreTable(ctx, info.table, palette, family);
    else drawRollCall(ctx, info.highScore, palette, family);

    ctx.textAlign = "center";
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
    ctx.fillText("G SMOOTH", CENTRE_X, HINT_Y);
    ctx.fillText("HOLD Q TO QUIT", CENTRE_X, HINT2_Y);
    ctx.restore();
}

/** "1ST".."10TH" for a 1-based rank; out of range falls back to "n TH". */
function ordinal(rank) {
    return ORDINALS[rank - 1] || (rank + "TH");
}

/**
 * The initials entry screen (no board, no HUD, owns the whole stage like the
 * title): ENTER YOUR INITIALS, the score and rank, three slots (the active
 * one blinking) and the key hints. `info` is
 * { initials, slot, score, rank, level, blinkOn }. `palette` needs
 * { title, text, muted }.
 */
function drawInitials(ctx, info, palette, family) {
    ctx.save();
    ctx.textBaseline = "top";
    ctx.textAlign = "center";

    ctx.font = fontString(family, TITLE_PX);
    ctx.fillStyle = palette.title;
    ctx.fillText("ENTER YOUR INITIALS", CENTRE_X, ENTRY_TITLE_Y);

    ctx.font = fontString(family);
    ctx.fillStyle = palette.text;
    ctx.fillText("SCORE " + info.score, CENTRE_X, ENTRY_SCORE_Y);
    ctx.fillText("RANK " + ordinal(info.rank), CENTRE_X, ENTRY_RANK_Y);
    ctx.fillStyle = palette.muted;
    ctx.fillText("LEVEL " + info.level, CENTRE_X, ENTRY_LEVEL_Y);

    ctx.font = fontString(family, TITLE_PX);
    for (var i = 0; i < SLOT_X.length; i++) {
        var active = i === info.slot;
        if (!active || info.blinkOn) {
            ctx.fillStyle = active ? palette.title : palette.text;
            ctx.fillText(info.initials.charAt(i), SLOT_X[i], SLOT_Y);
        }
        ctx.fillStyle = palette.muted;
        ctx.fillRect(SLOT_X[i] - SLOT_BAR_WIDTH / 2, SLOT_BAR_Y, SLOT_BAR_WIDTH, SLOT_BAR_HEIGHT);
    }

    ctx.font = fontString(family);
    ctx.fillStyle = palette.muted;
    ctx.fillText("UP DOWN LETTER  ENTER NEXT", CENTRE_X, HINT_Y);
    ctx.fillText("LEFT BACK  Q SAVE AND QUIT", CENTRE_X, HINT2_Y);
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
