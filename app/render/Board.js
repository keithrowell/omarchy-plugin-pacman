.pragma library
.import "../lib/maze.mjs" as Maze

// Draws the maze on a Canvas 2D context in native arcade units (8-px tiles,
// 224x248). Smooth vector primitives only; PixelStage decides whether they
// become big pixels or stay crisp. No Qt, no Theme: the parsed maze, a
// palette object and the time come in as arguments, so a theme change
// recolours on the very next paint.
//
// Walls are auto-tiled from Maze.wallMask: the outline runs along every
// wall/non-wall boundary, inset into the wall, twice (an outer and an inner
// line) to give the classic double line. Convex block corners are rounded
// with a radius; concave corners (where the open corridor turns) are rounded
// with the inset itself, so the two lines stay concentric. The ghost house is
// the only one-tile-thick wall and is drawn as its own double rounded
// rectangle with a gap for the door.

var TILE = 8;
var HALF_PI = Math.PI / 2;

// Insets keep .5 so 1-px strokes land on pixel centres in arcade mode.
var STYLES = [
    { inset: 2.5, radius: 3 },
    { inset: 4.5, radius: 1 },
];

// Geometry is colour-independent; build it once per maze and replay each frame.
var cache = { maze: null, lines: null, arcs: null };

function inHouse(house, x, y) {
    return x >= house.x && x < house.x + house.width && y >= house.y && y < house.y + house.height;
}

function buildOutline(maze) {
    var lines = [];
    var arcs = [];
    var house = maze.house;

    for (var y = 0; y < maze.height; y++) {
        for (var x = 0; x < maze.width; x++) {
            if (Maze.tileAt(maze, x, y) !== Maze.TILE.WALL) continue;
            if (inHouse(house, x, y)) continue;

            var mask = Maze.wallMask(maze, x, y);
            // Open (non-wall) flags for the eight neighbours.
            var n = !(mask & 1), ne = !(mask & 2), e = !(mask & 4), se = !(mask & 8);
            var s = !(mask & 16), sw = !(mask & 32), w = !(mask & 64), nw = !(mask & 128);
            if (!(n || e || s || w || ne || se || sw || nw)) continue;

            var x0 = x * TILE, y0 = y * TILE, x1 = x0 + TILE, y1 = y0 + TILE;

            for (var i = 0; i < STYLES.length; i++) {
                var d = STYLES[i].inset;
                var r = STYLES[i].radius;
                var xl = w ? x0 + d + r : x0;
                var xr = e ? x1 - d - r : x1;
                var yt = n ? y0 + d + r : y0;
                var yb = s ? y1 - d - r : y1;

                // Faces that look onto open tiles.
                if (n) lines.push([xl, y0 + d, xr, y0 + d]);
                if (s) lines.push([xl, y1 - d, xr, y1 - d]);
                if (w) lines.push([x0 + d, yt, x0 + d, yb]);
                if (e) lines.push([x1 - d, yt, x1 - d, yb]);

                // Convex block corners: two open faces meet.
                if (n && w) arcs.push([x0 + d + r, y0 + d + r, r, Math.PI, 3 * HALF_PI]);
                if (n && e) arcs.push([x1 - d - r, y0 + d + r, r, 3 * HALF_PI, 2 * Math.PI]);
                if (s && e) arcs.push([x1 - d - r, y1 - d - r, r, 0, HALF_PI]);
                if (s && w) arcs.push([x0 + d + r, y1 - d - r, r, HALF_PI, Math.PI]);

                // Concave corners: both adjacent faces are wall, the diagonal is open.
                if (!n && !e && ne) arcs.push([x1, y0, d, HALF_PI, Math.PI]);
                if (!s && !e && se) arcs.push([x1, y1, d, Math.PI, 3 * HALF_PI]);
                if (!s && !w && sw) arcs.push([x0, y1, d, 3 * HALF_PI, 2 * Math.PI]);
                if (!n && !w && nw) arcs.push([x0, y0, d, 0, HALF_PI]);
            }
        }
    }
    return { lines: lines, arcs: arcs };
}

function outlineFor(maze) {
    if (cache.maze !== maze) {
        var built = buildOutline(maze);
        cache = { maze: maze, lines: built.lines, arcs: built.arcs };
    }
    return cache;
}

// A rounded rectangle outline with an optional gap in the top edge (the door).
function roundedRect(ctx, x, y, w, h, r, gapX0, gapX1) {
    var right = x + w, bottom = y + h;
    ctx.moveTo(x + r, y);
    if (gapX1 > gapX0) {
        ctx.lineTo(gapX0, y);
        ctx.moveTo(gapX1, y);
    }
    ctx.lineTo(right - r, y);
    ctx.arc(right - r, y + r, r, 3 * HALF_PI, 2 * Math.PI);
    ctx.lineTo(right, bottom - r);
    ctx.arc(right - r, bottom - r, r, 0, HALF_PI);
    ctx.lineTo(x + r, bottom);
    ctx.arc(x + r, bottom - r, r, HALF_PI, Math.PI);
    ctx.lineTo(x, y + r);
    ctx.arc(x + r, y + r, r, Math.PI, 3 * HALF_PI);
}

function drawHouse(ctx, house, palette) {
    var x = house.x * TILE, y = house.y * TILE;
    var w = house.width * TILE, h = house.height * TILE;
    var doorX0 = Infinity, doorX1 = -Infinity;
    for (var i = 0; i < house.door.length; i++) {
        doorX0 = Math.min(doorX0, house.door[i].x * TILE);
        doorX1 = Math.max(doorX1, house.door[i].x * TILE + TILE);
    }

    var outer = STYLES[0].inset;
    var inner = TILE - outer; // inset from the outside to the interior-facing line
    ctx.strokeStyle = palette.wall;
    ctx.lineWidth = 1;
    ctx.beginPath();
    roundedRect(ctx, x + outer, y + outer, w - 2 * outer, h - 2 * outer, STYLES[0].radius, doorX0, doorX1);
    roundedRect(ctx, x + inner, y + inner, w - 2 * inner, h - 2 * inner, STYLES[1].radius, doorX0, doorX1);
    ctx.stroke();

    // The door: a flat bar filling the two whole pixel rows between the two
    // lines (which sit on rows 2 and 5). Fills must align to whole pixels;
    // the .5 offsets are only for 1-px strokes.
    ctx.fillStyle = palette.door;
    ctx.fillRect(doorX0, y + Math.ceil(outer), doorX1 - doorX0, Math.floor(inner) - Math.ceil(outer));
}

function drawWalls(ctx, maze, palette) {
    var outline = outlineFor(maze);
    var lines = outline.lines, arcs = outline.arcs;

    ctx.strokeStyle = palette.wall;
    ctx.lineWidth = 1;
    // Segments and arcs abut exactly, so flat caps leave no gaps; round caps
    // would add two curved caps per segment and triple the raster cost.
    ctx.lineCap = "butt";
    ctx.lineJoin = "miter";
    ctx.beginPath();
    for (var i = 0; i < lines.length; i++) {
        var l = lines[i];
        ctx.moveTo(l[0], l[1]);
        ctx.lineTo(l[2], l[3]);
    }
    for (var j = 0; j < arcs.length; j++) {
        var a = arcs[j];
        ctx.moveTo(a[0] + a[2] * Math.cos(a[3]), a[1] + a[2] * Math.sin(a[3]));
        ctx.arc(a[0], a[1], a[2], a[3], a[4]);
    }
    ctx.stroke();
}

function drawPellets(ctx, maze, palette, timeMs) {
    ctx.fillStyle = palette.pellet;
    for (var i = 0; i < maze.pellets.length; i++) {
        var p = maze.pellets[i];
        ctx.fillRect(p.x * TILE + 3, p.y * TILE + 3, 2, 2);
    }
    if (Math.floor(timeMs / 200) % 2 === 0) {
        ctx.beginPath();
        for (var j = 0; j < maze.powerPellets.length; j++) {
            var q = maze.powerPellets[j];
            var cx = q.x * TILE + TILE / 2, cy = q.y * TILE + TILE / 2;
            ctx.moveTo(cx + 4, cy);
            ctx.arc(cx, cy, 4, 0, 2 * Math.PI);
        }
        ctx.fill();
    }
}

/**
 * The static part of the board: background, walls and house. Costly to
 * rasterise (thousands of stroked elements), so Main.qml keeps it on its own
 * canvas and repaints it only when the palette, size or mode changes.
 * `palette` is a plain object { wall, door, pellet, background } of colour
 * strings.
 */
function drawBackdrop(ctx, maze, palette) {
    ctx.fillStyle = palette.background;
    ctx.fillRect(0, 0, maze.width * TILE, maze.height * TILE);
    drawWalls(ctx, maze, palette);
    drawHouse(ctx, maze.house, palette);
}

/** Draw the whole board in one go (backdrop plus pellets). */
function drawBoard(ctx, maze, palette, timeMs) {
    drawBackdrop(ctx, maze, palette);
    drawPellets(ctx, maze, palette, timeMs);
}
