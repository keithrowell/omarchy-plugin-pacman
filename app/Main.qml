import QtQuick
import QtQuick.Window
import Quickshell
import Quickshell.Hyprland
import "lib/maze.mjs" as Maze
import "lib/maze-data.mjs" as MazeData
import "lib/game.mjs" as Game
import "lib/input.mjs" as Input
import "lib/player.mjs" as Player
import "render/Board.js" as Board
import "render/Sprites.js" as Sprites
import "render/Hud.js" as Hud

// Entry point: `qs -p app/Main.qml` (via bin/pacman). One floating window in
// the theme's colours holding the PixelStage; the game is drawn every frame
// in native 224x288 units (ADR-0002), the maze offset below the HUD rows.
// The game state lives in lib/game.mjs and advances in fixed 1/60 s ticks;
// this file only feeds it input and draws what it returns.
//
// Keys: arrows / hjkl / WASD move, g toggles arcade/smooth, q or Escape
// quits, F12 grabs a frame when PACMAN_DEBUG=1.
//
// Debug hooks (PACMAN_DEBUG=1): the fps is logged once a second (with the
// phase, mode, fright timer and every ghost's state and tile) and shown in
// the overlay with the player's tile and wanted direction, every game
// event is logged, and PACMAN_DEBUG_KEYS="Left,1500,Up,F12,q" replays those
// keys through the same handlers 1.5 s after start (direction keys are
// tapped: pressed and released), a number in the list being a pause in
// milliseconds (Hyprland's permission system blocks virtual keyboards, so
// this is how the build is verified unattended).
ShellRoot {
    FloatingWindow {
        id: window
        title: "Pacman"
        // 28x36 tiles of 8 px at 3x.
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

        // The whole game state: replaced (never mutated) on every tick.
        property var state: Game.createState(maze)
        // Unconsumed frame time, in seconds, sliced into Game.TICK steps.
        property real acc: 0
        // Direction keys currently held (names, latest last) and the latest
        // press since the last tick, so a tap shorter than a frame still lands.
        property var pressed: []
        property var pendingPress: null

        // Milliseconds since the loop started; drives the power-pellet blink.
        property real timeMs: 0
        property int frames: 0
        property int fps: 0

        function palette() {
            return {
                wall: String(Theme.blue),
                door: String(Theme.magenta),
                pellet: String(Theme.foreground),
                background: String(Theme.background),
                pacman: String(Theme.yellow),
                text: String(Theme.foreground),
                muted: String(Theme.muted),
                // Ghosts: bodies, the frightened look and its flash, the eyes.
                ghosts: {
                    blinky: String(Theme.red),
                    pinky: String(Theme.magenta),
                    inky: String(Theme.cyan),
                    clyde: String(Theme.orange),
                },
                frightened: String(Theme.blue),
                frightenedFace: String(Theme.foreground),
                flash: String(Theme.foreground),
                flashFace: String(Theme.blue),
                eyeWhite: String(Theme.bright_foreground),
                pupil: String(Theme.blue),
                // Board texts.
                ready: String(Theme.yellow),
                gameOver: String(Theme.red),
                eatenScore: String(Theme.cyan),
            };
        }

        // The level-clear blink: walls alternate every 15 ticks for the
        // 120-tick level-clear phase (four flashes).
        readonly property bool flash: state.phase === "level-clear" && Math.floor(state.phaseTicks / 15) % 2 === 1
        onFlashChanged: backdrop.requestPaint()

        // Ghosts are hidden while Pac-Man dies and while the board flashes.
        readonly property bool showGhosts: state.phase !== "dying" && state.phase !== "level-clear"

        // Qt key -> the name lib/input.mjs understands, or null.
        readonly property var directionKeys: ({
            [Qt.Key_Up]: "Up", [Qt.Key_Down]: "Down", [Qt.Key_Left]: "Left", [Qt.Key_Right]: "Right",
            [Qt.Key_H]: "h", [Qt.Key_J]: "j", [Qt.Key_K]: "k", [Qt.Key_L]: "l",
            [Qt.Key_W]: "w", [Qt.Key_A]: "a", [Qt.Key_S]: "s", [Qt.Key_D]: "d",
        })

        function directionName(key) {
            const name = directionKeys[key];
            return name === undefined ? null : name;
        }

        // Returns true when the key was handled.
        function handleKey(key) {
            const name = directionName(key);
            if (name !== null) {
                pressed = Input.pressKey(pressed, name);
                pendingPress = Input.keyToDirection(name);
            } else if (key === Qt.Key_Escape || key === Qt.Key_Q) {
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

        function handleKeyRelease(key) {
            const name = directionName(key);
            if (name === null) return false;
            pressed = Input.releaseKey(pressed, name);
            return true;
        }

        // One rendered frame: consume the elapsed time in fixed ticks.
        function advance(frameTime) {
            acc += Math.min(frameTime, 0.25);
            const want = pendingPress !== null ? pendingPress : Input.wantedDirection(pressed);
            pendingPress = null;
            const input = { wantDir: want };
            let s = state;
            while (acc >= Game.TICK) {
                const r = Game.step(s, input, Game.TICK);
                s = r.state;
                acc -= Game.TICK;
                for (let i = 0; i < r.events.length; i++) {
                    const e = r.events[i];
                    if (e.type === "level-clear") console.info("Level clear: score " + s.score + " after " + s.tick + " ticks");
                    if (e.type === "game-over") console.info("Game over: score " + s.score + " on level " + s.level);
                    if (debug) {
                        console.info("Debug: event " + JSON.stringify(e) + " tick " + s.tick + " score " + s.score
                            + " lives " + s.lives + " left " + s.pelletsLeft + " phase " + s.phase);
                    }
                }
            }
            state = s;
        }

        function debugInfo() {
            const tile = Player.tileOf(state.player, state.board);
            return {
                fps: fps,
                tile: tile,
                wantDir: state.player.wantDir !== null ? state.player.wantDir : Input.wantedDirection(pressed),
                mode: state.mode,
                phase: state.phase,
                fright: state.frightTicks,
            };
        }

        // One token per ghost for the debug log: name, state, tile, direction.
        function debugGhosts() {
            return state.ghosts.map(g => {
                const t = Player.tileOf(g, state.board);
                return g.name + ":" + g.state + "@" + t.x + "," + t.y + g.dir.charAt(0);
            }).join(" ");
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

            // Held keys are tracked by press/release; auto-repeat is ignored
            // so it cannot stutter the direction.
            Keys.onPressed: event => {
                event.accepted = event.isAutoRepeat ? true : window.handleKey(event.key);
            }
            Keys.onReleased: event => {
                event.accepted = event.isAutoRepeat ? true : window.handleKeyRelease(event.key);
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
                        const palette = window.palette();
                        ctx.save();
                        ctx.scale(stage.resolution, stage.resolution);
                        // The HUD rows share the background; the board fills its own rect.
                        ctx.fillStyle = palette.background;
                        ctx.fillRect(0, 0, stage.nativeWidth, stage.nativeHeight);
                        Board.drawBackdrop(ctx, window.maze, palette, window.flash);
                        ctx.restore();
                    }
                }

                // Everything that moves: pellets, the ghosts, the player (or
                // the death animation), the HUD and the debug line, redrawn
                // every frame over a transparent canvas.
                Canvas {
                    id: overlay
                    anchors.fill: parent
                    renderStrategy: Canvas.Cooperative
                    antialiasing: !stage.arcade

                    onPaint: {
                        const ctx = getContext("2d");
                        const palette = window.palette();
                        const state = window.state;
                        ctx.clearRect(0, 0, width, height);
                        ctx.save();
                        ctx.scale(stage.resolution, stage.resolution);
                        Board.drawPellets(ctx, state.board, palette, window.timeMs);
                        if (window.showGhosts) {
                            // Eyes last so they overlay a ghost standing on the same tile.
                            const frame = Math.floor(state.tick / 8) % 2;
                            const flashing = Game.ghostFlashing(state);
                            for (let pass = 0; pass < 2; pass++) {
                                for (let i = 0; i < state.ghosts.length; i++) {
                                    const g = state.ghosts[i];
                                    const eyes = g.state === "eaten" || g.state === "entering";
                                    if (eyes === (pass === 1)) Sprites.drawGhost(ctx, g, palette, frame, flashing);
                                }
                            }
                        }
                        if (state.phase === "dying") Sprites.drawDeath(ctx, state.player, state.phaseTicks, palette);
                        else if (state.phase !== "game-over") Sprites.drawPacman(ctx, state.player, palette);
                        Hud.drawHud(ctx, state, palette, Theme.fontFamily);
                        Hud.drawEatenScore(ctx, state, palette, Theme.fontFamily);
                        if (window.debug) Hud.drawDebug(ctx, window.debugInfo(), palette, Theme.fontFamily);
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
                window.advance(frameTime);
                overlay.requestPaint();
            }
        }

        // Debug key script: one key every 600 ms, starting 1.5 s after launch.
        // A numeric entry replaces the gap before the next key with that many
        // milliseconds (so "Left,150,Down" taps Down 150 ms after Left, and
        // "Left,3000,Up" waits three seconds). Direction keys are tapped
        // (pressed and released in the same frame).
        Timer {
            id: keyScript
            property int next: 0
            readonly property var names: ({
                "g": Qt.Key_G, "q": Qt.Key_Q, "Escape": Qt.Key_Escape, "F12": Qt.Key_F12,
                "Up": Qt.Key_Up, "Down": Qt.Key_Down, "Left": Qt.Key_Left, "Right": Qt.Key_Right,
                "h": Qt.Key_H, "j": Qt.Key_J, "k": Qt.Key_K, "l": Qt.Key_L,
                "w": Qt.Key_W, "a": Qt.Key_A, "s": Qt.Key_S, "d": Qt.Key_D,
            })
            interval: 1500
            running: window.debugKeys.length > 0

            // Consume any numeric entries at `next`; the last one is the delay
            // before the following key, else `fallback`.
            function nextDelay(fallback) {
                let delay = fallback;
                while (next < window.debugKeys.length) {
                    const pause = Number(window.debugKeys[next]);
                    if (!(Number.isFinite(pause) && pause > 0)) break;
                    delay = pause;
                    console.info("Debug: pause " + pause + " ms");
                    next++;
                }
                return delay;
            }

            Component.onCompleted: {
                if (window.debugKeys.length > 0) {
                    interval = nextDelay(1500);
                    restart();
                }
            }

            onTriggered: {
                if (next >= window.debugKeys.length) return;
                const name = window.debugKeys[next++];
                const key = names[name];
                console.info("Debug: key " + name + (key === undefined ? " (unknown, ignored)" : "")
                    + " at tick " + window.state.tick);
                if (key !== undefined) {
                    window.handleKey(key);
                    window.handleKeyRelease(key);
                }
                const delay = nextDelay(600);
                if (next < window.debugKeys.length) {
                    interval = delay;
                    restart();
                }
            }
        }

        Timer {
            interval: 1000
            repeat: true
            running: window.debug
            onTriggered: {
                window.fps = window.frames;
                const tile = Player.tileOf(window.state.player, window.state.board);
                console.info("Debug: fps " + window.frames + " mode " + stage.mode
                    + " zoom " + stage.zoom + " block " + stage.blockSize
                    + " dpr " + stage.devicePixelRatio + " stage " + stage.width + "x" + stage.height
                    + " scene " + stage.sceneSize.width + "x" + stage.sceneSize.height
                    + " at " + stage.sceneRect.x + "," + stage.sceneRect.y
                    + " box " + stage.sceneRect.width + "x" + stage.sceneRect.height
                    + " | tile " + tile.x + "," + tile.y + " pos " + window.state.player.x.toFixed(2) + "," + window.state.player.y.toFixed(2)
                    + " dir " + window.state.player.dir + " want " + window.state.player.wantDir
                    + " score " + window.state.score + " lives " + window.state.lives + " level " + window.state.level
                    + " left " + window.state.pelletsLeft + " tick " + window.state.tick
                    + " | phase " + window.state.phase + " mode " + window.state.mode + " clock " + window.state.modeClock
                    + " fright " + window.state.frightTicks + " chain " + window.state.chain
                    + " | " + window.debugGhosts());
                window.frames = 0;
            }
        }
    }
}
