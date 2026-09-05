pragma Singleton
import QtQuick
import Quickshell
import Quickshell.Io
import "lib/settings.mjs" as SettingsLib
import "lib/highscores.mjs" as HighScoresLib

// Persistent settings in ~/.local/state/pacman/settings.json and the
// high-score table in highscore.json beside it (a pre-table file with a
// single score is migrated on load). Missing or malformed file -> defaults;
// the next change rewrites it. The parsing and serialising live in
// lib/settings.mjs and lib/highscores.mjs so Node tests cover them.
QtObject {
    id: root

    property string mode: SettingsLib.SETTINGS_DEFAULTS.mode
    property bool muted: SettingsLib.SETTINGS_DEFAULTS.muted
    // The table, always replaced, never mutated.
    property var highScores: []
    // The HUD HIGH SCORE: the top row's score, 0 when the table is empty.
    readonly property int highScore: HighScoresLib.topScore(highScores)

    readonly property string dir: Quickshell.env("HOME") + "/.local/state/pacman"
    readonly property string path: dir + "/settings.json"
    readonly property string highScorePath: dir + "/highscore.json"

    function load(text) {
        const next = SettingsLib.parseSettings(text);
        mode = next.mode;
        muted = next.muted;
    }

    function save() {
        settingsFile.setText(SettingsLib.serialiseSettings({ mode: mode, muted: muted }));
    }

    function setMode(value) {
        mode = SettingsLib.parseSettings(JSON.stringify({ mode: value })).mode;
        save();
    }

    function toggleMode() {
        setMode(mode === "arcade" ? "smooth" : "arcade");
    }

    function toggleMuted() {
        muted = !muted;
        save();
    }

    // The rank `score` would take on the table, 0 when it would not qualify.
    function rankFor(score) {
        return HighScoresLib.rankOf(highScores, score);
    }

    // Insert a qualifying row and persist the table. Returns whether it did
    // (false when the row does not qualify).
    function insertHighScore(row) {
        const next = HighScoresLib.insert(highScores, row);
        if (next === highScores) return false;
        highScores = next;
        highScoreFile.setText(HighScoresLib.serialiseHighScores(next));
        console.info("Settings: high score " + row.initials + " " + row.score + " level " + row.level + " saved to " + highScorePath);
        return true;
    }

    // Rewrite the file from the in-memory table as-is (used to migrate an
    // old-shape file once it has loaded, off the onLoaded path).
    function rewriteHighScores() {
        highScoreFile.setText(HighScoresLib.serialiseHighScores(highScores));
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
            root.highScores = HighScoresLib.parseHighScores(raw);
            if (raw !== HighScoresLib.serialiseHighScores(root.highScores)) {
                console.warn("Settings: migrating " + root.highScorePath + " to the table shape");
                Qt.callLater(root.rewriteHighScores);
            }
        }
        onLoadFailed: root.highScores = []
        onSaveFailed: console.warn("Settings: could not write " + root.highScorePath)
    }

    Component.onCompleted: Quickshell.execDetached(["mkdir", "-p", dir])
}
