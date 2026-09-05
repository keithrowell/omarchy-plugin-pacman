import QtQuick
import "../lib/scale.mjs" as Scale

// The stage from ADR-0002. Holds one child scene drawn in native units
// (224x248 by default) and shows it either as big hard-edged pixels (arcade)
// or as a crisp full-resolution drawing (smooth). Contains no game knowledge:
// it could be lifted out as a reusable component.
//
// Arcade: the scene is rendered through a layer whose texture is exactly
// native-sized, then scaled up with nearest-neighbour sampling by an integer
// number of *device* pixels per native pixel (k), so blocks stay square under
// fractional compositor scaling. Children such as Canvas rasterise at item
// size x device pixel ratio, so the scene is laid out at native / dpr logical
// pixels: the canvas raster is then exactly native-sized and lands 1:1 in the
// layer texture with no resampling (laying it out at native size made the
// canvas raster 1.6x too big and the layer blurred it down). Letterboxed and
// centred; the parent's colour shows through the borders. Optional scanlines
// are drawn above the upscaled scene, one device-pixel line per native row.
//
// Smooth: no layer. The scene is laid out at the fitted size so children
// rasterise at full resolution. Scanlines are never drawn.
//
// Either way, content draws in native units multiplied by `resolution`.
Item {
    id: root

    property int nativeWidth: Scale.NATIVE_WIDTH
    property int nativeHeight: Scale.NATIVE_HEIGHT
    // "arcade" | "smooth"
    property string mode: "arcade"
    // Device pixels per logical pixel, from the window's screen. Only the fit
    // maths sees it; the scene stays in native units.
    property real devicePixelRatio: 1

    // Scanlines (arcade only): the last device-pixel row of every native row
    // is covered by `scanlineColor` at `scanlineAlpha`.
    property bool scanlines: true
    property color scanlineColor
    property real scanlineAlpha: 0.15

    default property alias content: scene.data

    readonly property bool arcade: mode === "arcade"

    readonly property var fit: arcade
        ? Scale.fitArcade(width, height, devicePixelRatio, nativeWidth, nativeHeight)
        : Scale.fitSmooth(width, height, devicePixelRatio, nativeWidth, nativeHeight)

    // Logical pixels per native unit as shown on screen.
    readonly property real zoom: fit.scale
    // Integer device pixels per native pixel in arcade mode; equals zoom * dpr.
    readonly property int blockSize: arcade ? fit.k : 0
    // Layout units per native unit inside the scene: 1 / dpr in arcade mode
    // (one native unit is one device pixel; the layer does the enlarging), the
    // fitted scale in smooth mode.
    readonly property real resolution: arcade ? 1 / devicePixelRatio : fit.scale
    // The scene's on-screen box in logical pixels (for debugging the fit).
    readonly property rect sceneRect: Qt.rect(scene.x, scene.y, scene.width * scene.scale, scene.height * scene.scale)
    readonly property size sceneSize: Qt.size(scene.width, scene.height)

    clip: true

    Item {
        id: scene
        x: root.fit.x
        y: root.fit.y
        width: root.nativeWidth * root.resolution
        height: root.nativeHeight * root.resolution
        transformOrigin: Item.TopLeft
        // Arcade: native / dpr logical px * k = native * k device px.
        scale: root.arcade ? root.fit.k : 1

        layer.enabled: root.arcade
        layer.textureSize: Qt.size(root.nativeWidth, root.nativeHeight)
        layer.smooth: false
        layer.mipmap: false
    }

    // Drawn in device pixels (the canvas rasterises at item size x dpr) so
    // each line is exactly one device row, the bottom row of its block.
    Canvas {
        id: lines
        anchors.fill: parent
        visible: root.arcade && root.scanlines
        renderStrategy: Canvas.Cooperative
        antialiasing: false

        onPaint: {
            const ctx = getContext("2d");
            ctx.clearRect(0, 0, width, height);
            if (!root.arcade || !root.scanlines) return;
            const fit = root.fit;
            const dpr = root.devicePixelRatio;
            const k = fit.k;
            const c = root.scanlineColor;
            ctx.save();
            ctx.scale(1 / dpr, 1 / dpr);
            ctx.fillStyle = "rgba(" + Math.round(c.r * 255) + "," + Math.round(c.g * 255) + ","
                + Math.round(c.b * 255) + "," + root.scanlineAlpha + ")";
            const x = Math.round(fit.x * dpr);
            const y0 = Math.round(fit.y * dpr);
            const w = root.nativeWidth * k;
            for (let row = 0; row < root.nativeHeight; row++) ctx.fillRect(x, y0 + row * k + k - 1, w, 1);
            ctx.restore();
        }

        onVisibleChanged: requestPaint()
    }

    onFitChanged: lines.requestPaint()
    onScanlineColorChanged: lines.requestPaint()
    onScanlineAlphaChanged: lines.requestPaint()
}
