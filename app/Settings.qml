pragma Singleton
import QtQuick
import Quickshell
import Quickshell.Io
import "lib/settings.mjs" as SettingsLib

// Persistent settings in ~/.local/state/pacman/settings.json. Missing or
// malformed file -> defaults; the next change rewrites it. The parsing and
// serialising live in lib/settings.mjs so Node tests cover them.
QtObject {
    id: root

    property string mode: SettingsLib.SETTINGS_DEFAULTS.mode

    readonly property string dir: Quickshell.env("HOME") + "/.local/state/pacman"
    readonly property string path: dir + "/settings.json"

    function setMode(value) {
        const next = SettingsLib.parseSettings(JSON.stringify({ mode: value }));
        mode = next.mode;
        settingsFile.setText(SettingsLib.serialiseSettings(next));
    }

    function toggleMode() {
        setMode(mode === "arcade" ? "smooth" : "arcade");
    }

    property FileView settingsFile: FileView {
        path: root.path
        atomicWrites: true
        printErrors: false
        onLoaded: root.mode = SettingsLib.parseSettings(text()).mode
        onLoadFailed: root.mode = SettingsLib.SETTINGS_DEFAULTS.mode
        onSaveFailed: console.warn("Settings: could not write " + root.path)
    }

    Component.onCompleted: Quickshell.execDetached(["mkdir", "-p", dir])
}
