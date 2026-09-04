import QtQuick
import QtQuick.Window
import Quickshell
import Quickshell.Hyprland
import "lib/maze.mjs" as Maze
import "lib/maze-data.mjs" as MazeData
import "render/Board.js" as Board

// Entry point: `qs -p app/Main.qml` (via bin/pacman). One floating window in
// the theme's colours holding the PixelStage; the board is drawn every frame
// in native 224x248 units (ADR-0002). Keys: g toggles arcade/smooth, q or
// Escape quits, F12 grabs a frame when PACMAN_DEBUG=1.
//
// Debug hooks (PACMAN_DEBUG=1): the fps is logged once a second, and
// PACMAN_DEBUG_KEYS="g,F12,q" replays those keys through the same handler
// 1.5 s after start, a number in the list being a pause in milliseconds
// (Hyprland's permission system blocks virtual keyboards, so this is how the
// build is verified unattended).
ShellRoot {
    FloatingWindow {
        id: window
        title: "Pacman"
        // 28x31 tiles of 8 px at 3x.
        implicitWidth: 672
        implicitHeight: 864
        color: Theme.background

        readonly property bool debug: Quickshell.env("PACMAN_DEBUG") === "1"
        readonly property var debugKeys: debug && Quickshell.env("PACMAN_DEBUG_KEYS")
            ? Quickshell.env("PACMAN_DEBUG_KEYS").split(",").map(k => k.trim()).filter(k => k !== "")
            : []
        readonly property string framePath: Quickshell.env("HOME") + "/.local/state/pacman/frame.png"

        // Device pixels per logical pixel for this window. Qt reports the
        // *screen's* integer scale through Screen.devicePixelRatio (2 here) but
        // renders the window at the compositor's fractional scale (1.6), so the
        // grab-verified truth is Hyprland's monitor scale; fall back to Qt's
        // value when the IPC has no monitor for the screen (yet).
        // Looked up by name from the monitor list (not monitorFor(), which
        // refreshes the list and would loop the binding).
        readonly property var monitor: Hyprland.monitors.values.find(m => window.screen && m.name === window.screen.name) ?? null
        readonly property real devicePixelRatio: monitor && monitor.scale > 0 ? monitor.scale : Screen.devicePixelRatio

        // Parsed once; the renderer caches its wall geometry per maze object.
        readonly property var maze: Maze.parseMaze(MazeData.LEVEL_1)

        // Milliseconds since the loop started; drives the power-pellet blink.
        property real timeMs: 0
        property int frames: 0

        function palette() {
            return {
                wall: String(Theme.blue),
                door: String(Theme.magenta),
                pellet: String(Theme.foreground),
                background: String(Theme.background),
            };
        }

        // Returns true when the key was handled.
        function handleKey(key) {
            if (key === Qt.Key_Escape || key === Qt.Key_Q) {
                Qt.quit();
            } else if (key === Qt.Key_G) {
                Settings.toggleMode();
            } else if (key === Qt.Key_F12 && debug) {
                grabFrame();
            } else {
                return false;
            }
            return true;
        }

        function grabFrame() {
            stage.grabToImage(result => {
                const ok = result.saveToFile(window.framePath);
                console.info("Debug: frame " + (ok ? "saved to " : "NOT saved to ") + window.framePath
                    + " (mode " + stage.mode + ", block " + stage.blockSize + " device px, dpr "
                    + window.devicePixelRatio + ")");
            });
        }

        FocusScope {
            id: input
            anchors.fill: parent
            focus: true

            Keys.onPressed: event => {
                event.accepted = window.handleKey(event.key);
            }

            Component.onCompleted: forceActiveFocus()

            PixelStage {
                id: stage
                anchors.fill: parent
                mode: Settings.mode
                devicePixelRatio: window.devicePixelRatio

                // Walls and house: thousands of stroked elements, so this
                // canvas is rasterised only when the palette, size or mode
                // changes (Canvas repaints itself on resize).
                Canvas {
                    id: backdrop
                    anchors.fill: parent
                    renderStrategy: Canvas.Cooperative
                    antialiasing: !stage.arcade

                    onPaint: {
                        const ctx = getContext("2d");
                        ctx.save();
                        ctx.scale(stage.resolution, stage.resolution);
                        Board.drawBackdrop(ctx, window.maze, window.palette());
                        ctx.restore();
                    }
                }

                // Pellets (and, later, sprites): redrawn every frame over a
                // transparent canvas.
                Canvas {
                    id: overlay
                    anchors.fill: parent
                    renderStrategy: Canvas.Cooperative
                    antialiasing: !stage.arcade

                    onPaint: {
                        const ctx = getContext("2d");
                        ctx.clearRect(0, 0, width, height);
                        ctx.save();
                        ctx.scale(stage.resolution, stage.resolution);
                        Board.drawPellets(ctx, window.maze, window.palette(), window.timeMs);
                        ctx.restore();
                    }
                }
            }
        }

        // A theme change recolours both layers on the next frame; a mode
        // change re-rasterises the backdrop with the new anti-aliasing.
        Connections {
            target: Theme
            function onPaletteChanged() { backdrop.requestPaint(); overlay.requestPaint(); }
        }
        Connections {
            target: stage
            function onModeChanged() { backdrop.requestPaint(); }
        }

        FrameAnimation {
            id: loop
            running: true
            onTriggered: {
                window.timeMs = elapsedTime * 1000;
                window.frames++;
                overlay.requestPaint();
            }
        }

        // Debug key script: one key every 600 ms, starting 1.5 s after launch;
        // a numeric entry pauses that many milliseconds instead.
        Timer {
            id: keyScript
            property int next: 0
            readonly property var names: ({ "g": Qt.Key_G, "q": Qt.Key_Q, "Escape": Qt.Key_Escape, "F12": Qt.Key_F12 })
            interval: 1500
            running: window.debugKeys.length > 0
            onTriggered: {
                const name = window.debugKeys[next++];
                const pause = Number(name);
                if (Number.isFinite(pause) && pause > 0) {
                    console.info("Debug: pause " + pause + " ms");
                } else {
                    const key = names[name];
                    console.info("Debug: key " + name + (key === undefined ? " (unknown, ignored)" : ""));
                    if (key !== undefined) window.handleKey(key);
                }
                if (next < window.debugKeys.length) {
                    interval = Number.isFinite(pause) && pause > 0 ? pause : 600;
                    restart();
                }
            }
        }

        Timer {
            interval: 1000
            repeat: true
            running: window.debug
            onTriggered: {
                console.info("Debug: fps " + window.frames + " mode " + stage.mode
                    + " zoom " + stage.zoom + " block " + stage.blockSize
                    + " dpr " + stage.devicePixelRatio);
                window.frames = 0;
            }
        }
    }
}
