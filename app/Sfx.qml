pragma Singleton
import QtQuick
import QtMultimedia
import Quickshell

// Playback of the generated WAVs under assets/sfx/. One preloaded
// SoundEffect per file: play(name) fires a one-shot and forgets it,
// setLoop(name) keeps exactly one background layer (a siren, fright or
// eyes) repeating until it is changed or cleared with null. Which sound
// plays when is decided in lib/sound-map.mjs; this file knows nothing of the
// game beyond the names. `muted` follows Settings.muted: muting stops
// everything at once and unmuting restarts the wanted loop. If any file
// fails to load (no QtMultimedia backend, no audio device) `available` goes
// false, one warning is logged and every call is a silent no-op, so the game
// runs the same without sound. Nothing here waits on playback.
QtObject {
    id: root

    readonly property bool debug: Quickshell.env("PACMAN_DEBUG") === "1"
    readonly property bool muted: Settings.muted
    readonly property bool available: failed === 0

    // The loop asked for (regardless of mute) and the one actually playing; "" for none.
    property string wantedLoop: ""
    property string currentLoop: ""

    property int failed: 0
    property bool reported: false

    readonly property var effects: ({
        "start": fxStart,
        "waka-a": fxWakaA,
        "waka-b": fxWakaB,
        "siren-1": fxSiren1,
        "siren-2": fxSiren2,
        "siren-3": fxSiren3,
        "siren-4": fxSiren4,
        "siren-5": fxSiren5,
        "fright": fxFright,
        "eyes": fxEyes,
        "ghost-eaten": fxGhostEaten,
        "death": fxDeath,
        "extra-life": fxExtraLife,
        "level-clear": fxLevelClear,
        "fruit": fxFruit,
    })
    readonly property var names: Object.keys(effects)
    readonly property int count: names.length

    // Fire-and-forget one-shot.
    function play(name) {
        const fx = effects[name];
        if (fx === undefined) {
            console.warn("Sfx: unknown sound " + name);
            return;
        }
        if (debug) console.info("Debug: sfx play " + name + (muted ? " (muted)" : available ? "" : " (no audio)"));
        if (muted || !available) return;
        fx.play();
    }

    // Keep `name` (or nothing, for null) as the only background loop.
    function setLoop(name) {
        const next = name === null || name === undefined ? "" : String(name);
        if (next === wantedLoop) return;
        if (next !== "" && effects[next] === undefined) {
            console.warn("Sfx: unknown loop " + next);
            return;
        }
        wantedLoop = next;
        if (debug) console.info("Debug: sfx loop " + (next === "" ? "-" : next) + (muted ? " (muted)" : available ? "" : " (no audio)"));
        applyLoop();
    }

    function stopLoops() {
        setLoop(null);
    }

    // Start or stop the loop effect so it matches wantedLoop under mute and availability.
    function applyLoop() {
        const target = muted || !available ? "" : wantedLoop;
        if (target === currentLoop) return;
        if (currentLoop !== "") effects[currentLoop].stop();
        currentLoop = target;
        if (target !== "") effects[target].play();
    }

    onMutedChanged: {
        if (debug) console.info("Debug: sfx " + (muted ? "muted" : "unmuted") + (currentLoop !== "" ? ", stopping " + currentLoop : "")
            + (!muted && wantedLoop !== "" ? ", resuming " + wantedLoop : ""));
        if (muted) for (const name of names) effects[name].stop();
        applyLoop();
    }

    // Called on every status change: once every effect has settled, report
    // the count (and the failures) exactly once.
    function checkStatus() {
        let ready = 0;
        let errors = 0;
        const bad = [];
        for (const name of names) {
            const status = effects[name].status;
            if (status === SoundEffect.Ready) ready++;
            else if (status === SoundEffect.Error) { errors++; bad.push(name); }
        }
        if (errors !== failed) {
            failed = errors;
            applyLoop();
        }
        if (reported || ready + errors < count) return;
        reported = true;
        if (errors > 0) {
            console.warn("Sfx: no audio: " + errors + " of " + count + " effects failed to load (" + bad.join(", ") + "); the game runs silent");
        } else {
            console.info("Sfx: " + ready + " of " + count + " effects loaded, audio available");
        }
    }

    Component.onCompleted: checkStatus()

    property SoundEffect fxStart: SoundEffect { source: Qt.resolvedUrl("assets/sfx/start.wav"); onStatusChanged: root.checkStatus() }
    property SoundEffect fxWakaA: SoundEffect { source: Qt.resolvedUrl("assets/sfx/waka-a.wav"); onStatusChanged: root.checkStatus() }
    property SoundEffect fxWakaB: SoundEffect { source: Qt.resolvedUrl("assets/sfx/waka-b.wav"); onStatusChanged: root.checkStatus() }
    property SoundEffect fxSiren1: SoundEffect { source: Qt.resolvedUrl("assets/sfx/siren-1.wav"); loops: SoundEffect.Infinite; onStatusChanged: root.checkStatus() }
    property SoundEffect fxSiren2: SoundEffect { source: Qt.resolvedUrl("assets/sfx/siren-2.wav"); loops: SoundEffect.Infinite; onStatusChanged: root.checkStatus() }
    property SoundEffect fxSiren3: SoundEffect { source: Qt.resolvedUrl("assets/sfx/siren-3.wav"); loops: SoundEffect.Infinite; onStatusChanged: root.checkStatus() }
    property SoundEffect fxSiren4: SoundEffect { source: Qt.resolvedUrl("assets/sfx/siren-4.wav"); loops: SoundEffect.Infinite; onStatusChanged: root.checkStatus() }
    property SoundEffect fxSiren5: SoundEffect { source: Qt.resolvedUrl("assets/sfx/siren-5.wav"); loops: SoundEffect.Infinite; onStatusChanged: root.checkStatus() }
    property SoundEffect fxFright: SoundEffect { source: Qt.resolvedUrl("assets/sfx/fright.wav"); loops: SoundEffect.Infinite; onStatusChanged: root.checkStatus() }
    property SoundEffect fxEyes: SoundEffect { source: Qt.resolvedUrl("assets/sfx/eyes.wav"); loops: SoundEffect.Infinite; onStatusChanged: root.checkStatus() }
    property SoundEffect fxGhostEaten: SoundEffect { source: Qt.resolvedUrl("assets/sfx/ghost-eaten.wav"); onStatusChanged: root.checkStatus() }
    property SoundEffect fxDeath: SoundEffect { source: Qt.resolvedUrl("assets/sfx/death.wav"); onStatusChanged: root.checkStatus() }
    property SoundEffect fxExtraLife: SoundEffect { source: Qt.resolvedUrl("assets/sfx/extra-life.wav"); onStatusChanged: root.checkStatus() }
    property SoundEffect fxLevelClear: SoundEffect { source: Qt.resolvedUrl("assets/sfx/level-clear.wav"); onStatusChanged: root.checkStatus() }
    property SoundEffect fxFruit: SoundEffect { source: Qt.resolvedUrl("assets/sfx/fruit.wav"); onStatusChanged: root.checkStatus() }
}
