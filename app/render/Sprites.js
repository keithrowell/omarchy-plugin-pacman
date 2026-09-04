.pragma library
.import "../lib/scale.mjs" as Scale

// Sprites drawn as small vector routines in native arcade units (ADR-0002):
// the same code serves the arcade and smooth stage modes. No Qt, no Theme:
// entities and a palette object come in as arguments.

var TILE = 8;
var BOARD_WIDTH = 224;
var BOARD_HEIGHT = 248;

// Pac-Man: a 13-px disc with a wedge mouth facing the movement direction.
var PACMAN_RADIUS = 6.5;
// Half-openings of the mouth in radians, indexed by animation phase.
var MOUTH = [0, 35 * Math.PI / 180, 70 * Math.PI / 180];
// Phase sequence by distance travelled: closed, half, open, half.
var PHASES = [0, 1, 2, 1];
var PHASE_PX = 4;

var FACING = {
    right: 0,
    down: Math.PI / 2,
    left: Math.PI,
    up: 3 * Math.PI / 2,
};

/**
 * A Pac-Man wedge: a disc of radius r centred at (cx, cy) with a mouth of
 * half-opening `half` radians centred on the `facing` angle (0 = right,
 * clockwise in canvas space). A zero opening draws a full disc.
 */
function drawWedge(ctx, cx, cy, r, facing, half) {
    ctx.beginPath();
    if (half <= 0) {
        ctx.arc(cx, cy, r, 0, 2 * Math.PI);
    } else {
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, r, facing + half, facing - half + 2 * Math.PI);
        ctx.closePath();
    }
    ctx.fill();
}

/** Mouth phase (0 closed, 1 half, 2 open) for a player. Stopped shows half open. */
function mouthPhase(player) {
    if (player.stopped) return 1;
    return PHASES[Math.floor(player.distance / PHASE_PX) % PHASES.length];
}

/**
 * Draw the player at its maze position (offset by BOARD_ORIGIN), facing its
 * direction, mouth cycling with distance travelled. While crossing a tunnel
 * edge the sprite is drawn on both sides, clipped to the board so nothing
 * leaks into the HUD rows.
 */
function drawPacman(ctx, player, palette) {
    var half = MOUTH[mouthPhase(player)];
    var facing = FACING[player.dir] !== undefined ? FACING[player.dir] : FACING.left;

    ctx.save();
    ctx.translate(Scale.BOARD_ORIGIN.x, Scale.BOARD_ORIGIN.y);
    ctx.beginPath();
    ctx.rect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);
    ctx.clip();
    ctx.fillStyle = palette.pacman;

    drawWedge(ctx, player.x, player.y, PACMAN_RADIUS, facing, half);
    if (player.x < PACMAN_RADIUS) drawWedge(ctx, player.x + BOARD_WIDTH, player.y, PACMAN_RADIUS, facing, half);
    if (player.x > BOARD_WIDTH - PACMAN_RADIUS) drawWedge(ctx, player.x - BOARD_WIDTH, player.y, PACMAN_RADIUS, facing, half);

    ctx.restore();
}
