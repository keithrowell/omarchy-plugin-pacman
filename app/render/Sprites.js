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

// Ghosts: a 14-px body (a dome over a skirt with a wavy hem that alternates
// between two frames), eyes whose pupils look the way the ghost moves, a
// frightened face, or eyes alone when eaten.
var GHOST_RADIUS = 7;
/** Hem points (dx, dy from the centre) right to left, one list per frame. */
var HEMS = [
    [[7, 7], [4.67, 4], [2.33, 7], [0, 4], [-2.33, 7], [-4.67, 4], [-7, 7]],
    [[7, 4], [5.25, 7], [3.5, 4], [1.75, 7], [0, 4], [-1.75, 7], [-3.5, 4], [-5.25, 7], [-7, 4]],
];
/** Pixel offset of the eyes and pupils toward the direction of travel. */
var LOOK = {
    up: { dx: 0, dy: -1 },
    down: { dx: 0, dy: 1 },
    left: { dx: -1, dy: 0 },
    right: { dx: 1, dy: 0 },
};

/** The body outline: dome on top, straight sides, the hem for `frame` (0 or 1). */
function ghostBody(ctx, cx, cy, frame) {
    var hem = HEMS[frame === 1 ? 1 : 0];
    ctx.beginPath();
    ctx.moveTo(cx - GHOST_RADIUS, cy);
    ctx.arc(cx, cy, GHOST_RADIUS, Math.PI, 2 * Math.PI);
    ctx.lineTo(cx + GHOST_RADIUS, cy + 4);
    for (var i = 0; i < hem.length; i++) ctx.lineTo(cx + hem[i][0], cy + hem[i][1]);
    ctx.closePath();
    ctx.fill();
}

/** Two 4x5 whites with 2x2 pupils, both nudged one px toward `dir`. */
function ghostEyes(ctx, cx, cy, dir, palette) {
    var look = LOOK[dir] || LOOK.left;
    for (var s = -1; s <= 1; s += 2) {
        var ex = cx + s * 3 + look.dx;
        var ey = cy - 2 + look.dy;
        ctx.fillStyle = palette.eyeWhite;
        ctx.fillRect(ex - 1, ey - 2, 2, 5);
        ctx.fillRect(ex - 2, ey - 1, 4, 3);
        ctx.fillStyle = palette.pupil;
        ctx.fillRect(ex - 1 + look.dx, ey - 1 + look.dy, 2, 2);
    }
}

/** The frightened face: two dot eyes and a zigzag mouth. */
function ghostScaredFace(ctx, cx, cy, colour) {
    ctx.fillStyle = colour;
    ctx.fillRect(cx - 4, cy - 3, 2, 2);
    ctx.fillRect(cx + 2, cy - 3, 2, 2);
    ctx.fillRect(cx - 5, cy + 2, 2, 1);
    ctx.fillRect(cx - 1, cy + 2, 2, 1);
    ctx.fillRect(cx + 3, cy + 2, 2, 1);
    ctx.fillRect(cx - 3, cy + 3, 2, 1);
    ctx.fillRect(cx + 1, cy + 3, 2, 1);
}

function ghostAt(ctx, ghost, cx, cy, palette, frame, flashing) {
    var eyesOnly = ghost.state === "eaten" || ghost.state === "entering";
    if (eyesOnly) {
        ghostEyes(ctx, cx, cy, ghost.dir, palette);
        return;
    }
    if (ghost.state === "frightened") {
        ctx.fillStyle = flashing ? palette.flash : palette.frightened;
        ghostBody(ctx, cx, cy, frame);
        ghostScaredFace(ctx, cx, cy, flashing ? palette.flashFace : palette.frightenedFace);
        return;
    }
    ctx.fillStyle = palette.ghosts[ghost.name];
    ghostBody(ctx, cx, cy, frame);
    ghostEyes(ctx, cx, cy, ghost.dir, palette);
}

/**
 * Draw one ghost at its maze position (offset by BOARD_ORIGIN). `frame` picks
 * the hem (0 or 1; the caller alternates it every few ticks), `flashing`
 * swaps a frightened ghost's colours for the flash. `palette` needs
 * { ghosts: { blinky, pinky, inky, clyde }, frightened, frightenedFace,
 * flash, flashFace, eyeWhite, pupil }. Drawn on both sides of a tunnel edge.
 */
function drawGhost(ctx, ghost, palette, frame, flashing) {
    ctx.save();
    ctx.translate(Scale.BOARD_ORIGIN.x, Scale.BOARD_ORIGIN.y);
    ctx.beginPath();
    ctx.rect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);
    ctx.clip();

    ghostAt(ctx, ghost, ghost.x, ghost.y, palette, frame, flashing);
    if (ghost.x < GHOST_RADIUS) ghostAt(ctx, ghost, ghost.x + BOARD_WIDTH, ghost.y, palette, frame, flashing);
    if (ghost.x > BOARD_WIDTH - GHOST_RADIUS) ghostAt(ctx, ghost, ghost.x - BOARD_WIDTH, ghost.y, palette, frame, flashing);

    ctx.restore();
}

// The death: the wedge turns to face up and its mouth widens over twelve
// steps of six ticks until nothing is left, then a ring of dots bursts out.
var DEATH_STEPS = 12;
var DEATH_STEP_TICKS = 6;
var DEATH_BURST_END = 90;
var DEATH_MOUTH_FROM = 70 * Math.PI / 180;
var DEATH_MOUTH_TO = Math.PI;
var BURST_DOTS = 8;
var BURST_RADIUS_FROM = 2;
var BURST_RADIUS_TO = 8;

/**
 * The death animation at `ticks` (0 to 89) into the dying phase; draws
 * nothing outside that range. `palette` needs { pacman }.
 */
function drawDeath(ctx, player, ticks, palette) {
    if (!(ticks >= 0) || ticks >= DEATH_BURST_END) return;
    ctx.save();
    ctx.translate(Scale.BOARD_ORIGIN.x, Scale.BOARD_ORIGIN.y);
    ctx.fillStyle = palette.pacman;
    var wedgeTicks = DEATH_STEPS * DEATH_STEP_TICKS;
    if (ticks < wedgeTicks) {
        var step = Math.floor(ticks / DEATH_STEP_TICKS);
        var half = DEATH_MOUTH_FROM + (DEATH_MOUTH_TO - DEATH_MOUTH_FROM) * step / (DEATH_STEPS - 1);
        if (half < DEATH_MOUTH_TO) drawWedge(ctx, player.x, player.y, PACMAN_RADIUS, FACING.up, half);
    } else {
        var t = (ticks - wedgeTicks) / (DEATH_BURST_END - 1 - wedgeTicks);
        var r = BURST_RADIUS_FROM + (BURST_RADIUS_TO - BURST_RADIUS_FROM) * t;
        for (var i = 0; i < BURST_DOTS; i++) {
            var a = i * 2 * Math.PI / BURST_DOTS;
            ctx.fillRect(Math.round(player.x + r * Math.cos(a)) - 1, Math.round(player.y + r * Math.sin(a)) - 1, 2, 2);
        }
    }
    ctx.restore();
}
