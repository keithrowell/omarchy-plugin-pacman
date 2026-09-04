pragma Singleton
import QtQuick
import Quickshell
import Quickshell.Io
import "lib/settings.mjs" as SettingsLib

// Persistent settings in ~/.local/state/pacman/settings.json and the high
// score in highscore.json beside it. Missing or malformed file -> defaults;
// the next change rewrites it (a malformed high score is rewritten as 0 at
// once). The parsing and serialising live in lib/settings.mjs so Node tests
// cover them.
QtObject {
    id: root

    property string mode: SettingsLib.SETTINGS_DEFAULTS.mode
    property bool scanlines: SettingsLib.SETTINGS_DEFAULTS.scanlines
    property int highScore: 0

    readonly property string dir: Quickshell.env("HOME") + "/.local/state/pacman"
    readonly property string path: dir + "/settings.json"
    readonly property string highScorePath: dir + "/highscore.json"

    function load(text) {
        const next = SettingsLib.parseSettings(text);
        mode = next.mode;
        scanlines = next.scanlines;
    }

    function save() {
        settingsFile.setText(SettingsLib.serialiseSettings({ mode: mode, scanlines: scanlines }));
    }

    function setMode(value) {
        mode = SettingsLib.parseSettings(JSON.stringify({ mode: value })).mode;
        save();
    }

    function toggleMode() {
        setMode(mode === "arcade" ? "smooth" : "arcade");
    }

    function toggleScanlines() {
        scanlines = !scanlines;
        save();
    }

    // Record a new best. Writes only when the score beats the stored one;
    // returns whether it did.
    function setHighScore(value) {
        const next = SettingsLib.parseHighScore(String(value));
        if (next <= highScore) return false;
        highScore = next;
        highScoreFile.setText(SettingsLib.serialiseHighScore(next));
        console.info("Settings: high score " + next + " saved to " + highScorePath);
        return true;
    }

    property FileView settingsFile: FileView {
        path: root.path
        atomicWrites: true
        printErrors: false
        onLoaded: root.load(text())
        onLoadFailed: root.load("")
        onSaveFailed: console.warn("Settings: could not write " + root.path)
    }

    property FileView highScoreFile: FileView {
        path: root.highScorePath
        atomicWrites: true
        printErrors: false
        onLoaded: {
            const raw = text();
            root.highScore = SettingsLib.parseHighScore(raw);
            const canonical = SettingsLib.serialiseHighScore(root.highScore);
            if (raw !== canonical) {
                console.warn("Settings: rewriting " + root.highScorePath + " as " + root.highScore);
                setText(canonical);
            }
        }
        onLoadFailed: root.highScore = 0
        onSaveFailed: console.warn("Settings: could not write " + root.highScorePath)
    }

    Component.onCompleted: Quickshell.execDetached(["mkdir", "-p", dir])
}
