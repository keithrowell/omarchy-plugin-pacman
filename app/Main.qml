import QtQuick
import QtQuick.Window
import Quickshell
import Quickshell.Hyprland
import "lib/maze.mjs" as Maze
import "lib/maze-data.mjs" as MazeData
import "lib/game.mjs" as Game
import "lib/flow.mjs" as Flow
import "lib/attract.mjs" as Attract
import "lib/attract-script.mjs" as AttractScript
import "lib/input.mjs" as Input
import "lib/player.mjs" as Player
import "lib/sound-map.mjs" as SoundMap
import "render/Board.js" as Board
import "render/Sprites.js" as Sprites
import "render/Hud.js" as Hud
import "render/Screens.js" as Screens

// Entry point: `qs -p app/Main.qml` (via bin/pacman). One floating window in
// the theme's colours holding the PixelStage; the game is drawn every frame
// in native 224x288 units (ADR-0002), the maze offset below the HUD rows.
// The game state lives in lib/game.mjs and advances in fixed 1/60 s ticks;
// the screen flow around it (title, ready, pause, game over, the attract
// demo) in lib/flow.mjs. This file only feeds them input, draws what they
// return and hands the frame's events to lib/sound-map.mjs, whose answer
// (one-shots and the background loop) goes to the Sfx singleton.
//
// Keys: Enter/Space starts from the title; arrows / hjkl / WASD move; p or
// Escape pauses and resumes; m toggles mute; Escape on the title quits, q
// quits at once in a game and after a one-second hold on the title; any key
// leaves the demo (m and F12 do not); F12 grabs a frame when
// PACMAN_DEBUG=1. On the initials screen (after
// a qualifying game over): up/down (arrows, k/j, w/s) cycle a slot's letter,
// right/l/d/Enter confirms it (the third confirm saves), left/h/a steps
// back; q or Escape saves the current letters and quits.
//
// Debug hooks (PACMAN_DEBUG=1): the fps is logged once a second (with the
// screen, phase, mode, fright timer, the sound loop and every ghost's state
// and tile) and shown in the overlay with the player's tile and wanted
// direction, every game event, flow transition and sound call is logged, and
// PACMAN_DEBUG_KEYS="Return,3000,p,1000,p,q" replays those keys through the
// same handlers 1.5 s after start (keys are tapped: pressed and released),
// a number in the list being a pause in milliseconds (Hyprland's permission
// system blocks virtual keyboards, so this is how the build is verified
// unattended).
ShellRoot {
    FloatingWindow {
        id: window
        title: window.paused ? "Pacman — paused" : "Pacman"
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

        // The committed demo script must have been generated from this maze;
        // otherwise the title simply never starts the demo.
        readonly property var attractScript: AttractScript.ATTRACT
        readonly property bool attractOk: Attract.attractValid(attractScript, MazeData.LEVEL_1)

        // The screen flow and the whole game state: both replaced (never
        // mutated) on every tick. The game state on the title is a placeholder
        // that is never drawn; a start or the demo creates the real one.
        property var flow: Flow.createFlow({ attract: attractOk })
        property var state: Game.createState(maze)
        // The waka alternation and throttle, replaced by mapSounds as it goes.
        property var soundState: SoundMap.createSoundState()
        // Unconsumed frame time, in seconds, sliced into Game.TICK steps.
        property real acc: 0
        // Direction keys currently held (names, latest last) and the latest
        // press since the last tick, so a tap shorter than a frame still lands.
        property var pressed: []
        property var pendingPress: null
        // q is down on the title (it has to be held a second to quit).
        property bool quitHeld: false
        // Guards against saving the initials entry twice (a save-then-quit
        // on the same transition, or a stray double call).
        property bool entrySaved: false

        // Milliseconds since the loop started; drives the blinks.
        property real timeMs: 0
        property int frames: 0
        property int fps: 0

        readonly property bool paused: flow.screen === "paused"
        // Screens that own the whole stage, drawn over their own background
        // with no board or HUD.
        readonly property bool boardless: flow.screen === "title" || flow.screen === "initials"
        // 1UP blinks at 250 ms; PRESS ENTER and DEMO at 500 ms.
        readonly property bool blinkOn: Math.floor(timeMs / 250) % 2 === 0
        readonly property bool slowBlinkOn: Math.floor(timeMs / 500) % 2 === 0

        // A CSS colour string for a Canvas: `c` at alpha `a`.
        function rgba(c, a) {
            return "rgba(" + Math.round(c.r * 255) + "," + Math.round(c.g * 255) + "," + Math.round(c.b * 255) + "," + a + ")";
        }

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
                // The title, the quit bar and the pause dim (the background at 60 %).
                title: String(Theme.accent),
                quit: String(Theme.red),
                dim: rgba(Theme.background, 0.6),
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

        function isStartKey(key) {
            return key === Qt.Key_Return || key === Qt.Key_Enter || key === Qt.Key_Space;
        }

        // Every key the game reacts to; any of them ends the demo.
        function isGameKey(key) {
            return directionName(key) !== null || isStartKey(key)
                || key === Qt.Key_P || key === Qt.Key_Escape || key === Qt.Key_Q || key === Qt.Key_S;
        }

        // Replace the flow, doing what the transition asks for: a new game on
        // the way from the title into ready (the demo from its script's seed)
        // with the opening jingle (not for the demo), held keys dropped on the
        // way into a pause or the title. The loops follow the screen through
        // playSounds every frame, so a pause silences the siren at once.
        function setFlow(next) {
            const prev = flow;
            if (next === prev) return;
            if (prev.screen !== next.screen || prev.attract !== next.attract) {
                if (prev.screen === "title" && next.screen === "ready") {
                    state = Game.createState(maze, next.attract
                        ? { seed: attractScript.seed, highScore: Settings.highScore }
                        : { highScore: Settings.highScore });
                    soundState = SoundMap.createSoundState();
                    acc = 0;
                    if (!next.attract) Sfx.play("start");
                }
                if (next.screen === "paused" || next.screen === "title") {
                    pressed = [];
                    pendingPress = null;
                }
                // A real game just finished: offer the initials screen when
                // the score earns a place on the table. The demo never gets
                // here (next.attract is false only for a real game, and the
                // flow itself rejects qualify while attract is set).
                if (next.screen === "gameover" && !next.attract) {
                    const rank = Settings.rankFor(state.score);
                    if (rank > 0) {
                        next = Flow.flowAction(next, "qualify", { score: state.score, level: state.level, rank: rank });
                        if (debug) console.info("Debug: qualifies for rank " + rank);
                    }
                }
                if (next.screen === "initials") entrySaved = false;
                if (prev.screen === "initials" && next.screen === "title") saveEntry(prev.entry);
                if (debug) {
                    console.info("Debug: flow " + prev.screen + (prev.attract ? " (demo)" : "") + " -> "
                        + next.screen + (next.attract ? " (demo)" : "") + " at tick " + state.tick + " score " + state.score);
                }
            }
            flow = next;
        }

        // Save the initials entry once (a save-then-quit hitting both a
        // transition and quit() must still write only one row).
        function saveEntry(entry) {
            if (!entry || entrySaved) return;
            entrySaved = true;
            const initials = Flow.initialsOf(entry);
            Settings.insertHighScore({ initials: initials, score: entry.score, level: entry.level });
            console.info("Main: saved " + initials + " " + entry.score + " (rank " + entry.rank + ") to the high-score table");
        }

        function act(action) {
            setFlow(Flow.flowAction(flow, action));
        }

        // Leave. On the initials screen the current letters are saved first
        // (q/Escape never lose a qualifying score to an impatient quit). A
        // table row is otherwise earned only by finishing a game and
        // entering initials; a mid-game q no longer records anything (see
        // README).
        function quit() {
            if (flow.screen === "initials") saveEntry(flow.entry);
            Qt.quit();
        }

        // Returns true when the key was handled.
        function handleKey(key) {
            if (key === Qt.Key_F12 && debug) {
                grabFrame();
                return true;
            }
            if (key === Qt.Key_M) {
                Settings.toggleMuted();
                return true;
            }
            if (flow.attract) {
                if (!isGameKey(key)) return false;
                act("any-key");
                return true;
            }
            const name = directionName(key);
            switch (flow.screen) {
            case "title":
                if (isStartKey(key)) act("start");
                else if (key === Qt.Key_Escape) quit();
                else if (key === Qt.Key_Q) quitHeld = true;
                else if (name !== null) act("any-key");
                else return false;
                return true;
            case "paused":
                if (isStartKey(key) || key === Qt.Key_P || key === Qt.Key_Escape) act("resume");
                else if (key === Qt.Key_Q) quit();
                else return false;
                return true;
            case "gameover":
                if (key === Qt.Key_Q) quit();
                else return false;
                return true;
            case "initials":
                if (key === Qt.Key_Up || key === Qt.Key_K || key === Qt.Key_W) act("entry-up");
                else if (key === Qt.Key_Down || key === Qt.Key_J || key === Qt.Key_S) act("entry-down");
                else if (key === Qt.Key_Right || key === Qt.Key_L || key === Qt.Key_D || key === Qt.Key_Return || key === Qt.Key_Enter) act("entry-next");
                else if (key === Qt.Key_Left || key === Qt.Key_H || key === Qt.Key_A) act("entry-back");
                else if (key === Qt.Key_Q || key === Qt.Key_Escape) quit();
                else return false;
                return true;
            default:
                // ready, playing, dying, level-clear: the game has the keys.
                if (name !== null) {
                    pressed = Input.pressKey(pressed, name);
                    pendingPress = Input.keyToDirection(name);
                } else if (key === Qt.Key_P || key === Qt.Key_Escape) {
                    act("toggle-pause");
                } else if (key === Qt.Key_Q) {
                    quit();
                } else {
                    return false;
                }
                return true;
            }
        }

        function handleKeyRelease(key) {
            if (key === Qt.Key_Q && quitHeld) {
                quitHeld = false;
                act("quit-release");
                return true;
            }
            const name = directionName(key);
            if (name === null) return false;
            pressed = Input.releaseKey(pressed, name);
            return true;
        }

        // The window went to the background: drop every held key and the
        // quit hold, and pause a game in progress (never auto-resumed). act
        // ("pause") is illegal on `initials` and returns the same flow, so
        // the 30 s initials timeout keeps running while the window is
        // unfocused (the spec: no auto-pause on that screen).
        function loseFocus() {
            pressed = [];
            pendingPress = null;
            if (quitHeld) {
                quitHeld = false;
                act("quit-release");
            }
            if (debug) console.info("Debug: window inactive on " + flow.screen);
            act("pause");
        }

        function handleEvents(events, s, f, frameEvents) {
            for (let i = 0; i < events.length; i++) {
                const e = events[i];
                frameEvents.push(e);
                if (e.type === "level-clear") console.info("Level clear: score " + s.score + " after " + s.tick + " ticks");
                if (e.type === "game-over") console.info("Game over: score " + s.score + " on level " + s.level);
                if (debug) {
                    console.info("Debug: event " + JSON.stringify(e) + " tick " + s.tick + " score " + s.score
                        + " lives " + s.lives + " left " + s.pelletsLeft + " phase " + s.phase);
                }
            }
        }

        // The frame's events and the state they left, through the sound map
        // and on to Sfx: the loop first, so a death silences the siren before
        // death.wav starts, then the one-shots. Runs every frame, ticks or
        // not, so a pause or the title stops the loop at once.
        function playSounds(events) {
            const r = SoundMap.mapSounds(soundState, events, state, flow.screen, flow.attract);
            if (r.soundState !== soundState) soundState = r.soundState;
            Sfx.setLoop(r.loop);
            for (let i = 0; i < r.oneShots.length; i++) Sfx.play(r.oneShots[i]);
        }

        // One rendered frame: consume the elapsed time in fixed ticks. The game
        // is stepped only on the screens where it runs; the flow's own clocks
        // (idle -> demo, game over -> title, the q hold) run every tick.
        function advance(frameTime) {
            acc += Math.min(frameTime, 0.25);
            const want = pendingPress !== null ? pendingPress : Input.wantedDirection(pressed);
            pendingPress = null;
            let f = flow;
            let s = state;
            const events = [];
            while (acc >= Game.TICK) {
                acc -= Game.TICK;
                if (Flow.shouldStep(f)) {
                    const input = { wantDir: f.attract ? Attract.attractInput(attractScript, s.tick) : want };
                    const r = Game.step(s, input, Game.TICK);
                    s = r.state;
                    handleEvents(r.events, s, f, events);
                    f = Flow.syncFlow(f, s.phase);
                    if (f.attract && Attract.attractEnded(attractScript, s.tick)) {
                        if (s.score !== attractScript.expectedScore) {
                            console.warn("Attract: demo ended with score " + s.score + ", expected " + attractScript.expectedScore
                                + " (run `node tools/gen-attract.mjs`)");
                        } else if (debug) {
                            console.info("Debug: demo ended at tick " + s.tick + " with the expected score " + s.score);
                        }
                        f = Flow.flowAction(f, "attract-end");
                    }
                }
                f = Flow.flowTick(f, 1);
                if (quitHeld && f.screen === "title") {
                    f = Flow.flowAction(f, "quit-hold");
                    if (f.quitHoldTicks >= Flow.QUIT_HOLD_TICKS) {
                        state = s;
                        flow = f;
                        quit();
                        return;
                    }
                }
                if (f !== flow) {
                    // A transition may replace the game state (a new game); pick it up.
                    state = s;
                    setFlow(f);
                    s = state;
                    f = flow;
                }
            }
            state = s;
            playSounds(events);
        }

        function debugInfo() {
            const tile = Player.tileOf(state.player, state.board);
            return {
                fps: fps,
                tile: tile,
                wantDir: state.player.wantDir !== null ? state.player.wantDir : Input.wantedDirection(pressed),
                mode: state.mode,
                phase: flow.screen + (flow.attract ? "/demo" : ""),
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
                    + " (screen " + window.flow.screen + ", block " + stage.blockSize
                    + " device px, dpr " + window.devicePixelRatio + ")");
            });
        }

        Component.onCompleted: {
            if (!attractOk) console.warn("Attract: lib/attract-script.mjs does not match the maze; the demo is off (run `node tools/gen-attract.mjs`)");
        }

        FocusScope {
            id: input
            anchors.fill: parent
            focus: true

            // Held keys are tracked by press/release; auto-repeat is ignored
            // so it cannot stutter the direction. Real presses are logged in
            // debug mode so a stray keystroke from the desktop is visible.
            Keys.onPressed: event => {
                if (window.debug && !event.isAutoRepeat) console.info("Debug: key event " + event.key + " on " + window.flow.screen);
                event.accepted = event.isAutoRepeat ? true : window.handleKey(event.key);
            }
            Keys.onReleased: event => {
                event.accepted = event.isAutoRepeat ? true : window.handleKeyRelease(event.key);
            }

            // Focus leaving the window pauses the game. A debug key script
            // owns its session, so stray desktop clicks do not derail it.
            readonly property bool windowActive: Window.active
            onWindowActiveChanged: {
                if (window.debug) console.info("Debug: window " + (windowActive ? "active" : "inactive"));
                if (windowActive) return;
                if (window.debugKeys.length > 0) console.info("Debug: focus loss ignored while the key script runs");
                else window.loseFocus();
            }

            Component.onCompleted: forceActiveFocus()

            PixelStage {
                id: stage
                anchors.fill: parent
                devicePixelRatio: window.devicePixelRatio
                scanlineColor: Theme.darker_background

                // Walls and house: thousands of stroked elements, so this
                // canvas is rasterised only when the palette or size
                // changes (Canvas repaints itself on resize). Hidden on the
                // title, which has no board.
                Canvas {
                    id: backdrop
                    anchors.fill: parent
                    visible: !window.boardless
                    renderStrategy: Canvas.Cooperative
                    antialiasing: false

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
                // the death animation), the HUD, the overlays and the debug
                // line, redrawn every frame over a transparent canvas; on the
                // title, the title screen over its own background.
                Canvas {
                    id: overlay
                    anchors.fill: parent
                    renderStrategy: Canvas.Cooperative
                    antialiasing: false

                    onPaint: {
                        const ctx = getContext("2d");
                        const palette = window.palette();
                        const state = window.state;
                        const flow = window.flow;
                        ctx.clearRect(0, 0, width, height);
                        ctx.save();
                        ctx.scale(stage.resolution, stage.resolution);
                        if (flow.screen === "title" || flow.screen === "initials") {
                            ctx.fillStyle = palette.background;
                            ctx.fillRect(0, 0, stage.nativeWidth, stage.nativeHeight);
                            if (flow.screen === "title") {
                                Screens.drawTitle(ctx, {
                                    highScore: Settings.highScore,
                                    table: Settings.highScores,
                                    page: Flow.titlePage(flow),
                                    blinkOn: window.slowBlinkOn,
                                    quitHold: flow.quitHoldTicks / Flow.QUIT_HOLD_TICKS,
                                }, palette, Theme.fontFamily);
                            } else {
                                Screens.drawInitials(ctx, {
                                    initials: Flow.initialsOf(flow.entry),
                                    slot: flow.entry.slot,
                                    score: flow.entry.score,
                                    rank: flow.entry.rank,
                                    level: flow.entry.level,
                                    blinkOn: window.blinkOn,
                                }, palette, Theme.fontFamily);
                            }
                            ctx.restore();
                            return;
                        }
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
                        Hud.drawHud(ctx, state, palette, Theme.fontFamily, {
                            blinkOn: window.blinkOn, muted: Settings.muted, audio: Sfx.available,
                        });
                        Hud.drawEatenScore(ctx, state, palette, Theme.fontFamily);
                        if (flow.attract) Screens.drawAttractBanner(ctx, window.slowBlinkOn, palette, Theme.fontFamily);
                        if (flow.screen === "paused") Screens.drawPaused(ctx, palette, Theme.fontFamily);
                        if (window.debug) Hud.drawDebug(ctx, window.debugInfo(), palette, Theme.fontFamily);
                        ctx.restore();
                    }
                }
            }
        }

        // A theme change recolours both layers on the next frame.
        Connections {
            target: Theme
            function onPaletteChanged() { backdrop.requestPaint(); overlay.requestPaint(); }
        }
        Connections {
            target: stage
            function onModeChanged() { backdrop.requestPaint(); }
        }

        // The frame loop always runs; while paused (or on the title, or
        // during game over) advance() steps the flow's clocks but not the game.
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
        // "Left,3000,Up" waits three seconds). Keys are tapped (pressed and
        // released in the same frame), so q never quits from the title this
        // way; use Escape there.
        Timer {
            id: keyScript
            property int next: 0
            readonly property var names: ({
                "m": Qt.Key_M, "q": Qt.Key_Q, "p": Qt.Key_P, "Escape": Qt.Key_Escape, "F12": Qt.Key_F12,
                "Return": Qt.Key_Return, "Enter": Qt.Key_Return, "Space": Qt.Key_Space,
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
                    + " on " + window.flow.screen + " at tick " + window.state.tick);
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
                console.info("Debug: fps " + window.frames
                    + " zoom " + stage.zoom + " block " + stage.blockSize
                    + " dpr " + stage.devicePixelRatio + " stage " + stage.width + "x" + stage.height
                    + " scene " + stage.sceneSize.width + "x" + stage.sceneSize.height
                    + " at " + stage.sceneRect.x + "," + stage.sceneRect.y
                    + " box " + stage.sceneRect.width + "x" + stage.sceneRect.height
                    + " | screen " + window.flow.screen + (window.flow.attract ? "/demo" : "")
                    + (window.flow.screen === "title" ? " page " + Flow.titlePage(window.flow) : "")
                    + (window.flow.screen === "initials" ? " entry " + Flow.initialsOf(window.flow.entry) + "/" + window.flow.entry.slot : "")
                    + " idle " + window.flow.idleTicks + " title \"" + window.title + "\""
                    + " | tile " + tile.x + "," + tile.y + " pos " + window.state.player.x.toFixed(2) + "," + window.state.player.y.toFixed(2)
                    + " dir " + window.state.player.dir + " want " + window.state.player.wantDir
                    + " score " + window.state.score + " high " + window.state.highScore
                    + " lives " + window.state.lives + " level " + window.state.level
                    + " left " + window.state.pelletsLeft + " tick " + window.state.tick
                    + " | phase " + window.state.phase + " mode " + window.state.mode + " clock " + window.state.modeClock
                    + " fright " + window.state.frightTicks + " chain " + window.state.chain
                    + " loop " + (Sfx.currentLoop !== "" ? Sfx.currentLoop : "-")
                    + " | " + window.debugGhosts());
                window.frames = 0;
            }
        }
    }
}
