pragma Singleton
import QtQuick
import Quickshell
import Quickshell.Io
import "lib/theme.mjs" as ThemeLib

// The live Omarchy palette. Reads colors.toml, re-parses it whenever it changes,
// and exposes every key as a colour property. No colour literal lives here:
// the final defaults are ThemeLib.DEFAULTS in lib/theme.mjs.
QtObject {
    id: root

    // Initialised to the defaults so every binding is valid before the file loads.
    // Re-assigned as a whole object on each reload, which retriggers every binding.
    property var palette: ThemeLib.resolveTheme({})

    readonly property string mode: palette.mode

    readonly property color accent: palette.accent
    readonly property color selection: palette.selection
    readonly property color muted: palette.muted

    readonly property color background: palette.background
    readonly property color dark_background: palette.dark_background
    readonly property color darker_background: palette.darker_background
    readonly property color lighter_background: palette.lighter_background

    readonly property color foreground: palette.foreground
    readonly property color dark_foreground: palette.dark_foreground
    readonly property color light_foreground: palette.light_foreground
    readonly property color bright_foreground: palette.bright_foreground

    readonly property color red: palette.red
    readonly property color yellow: palette.yellow
    readonly property color orange: palette.orange
    readonly property color green: palette.green
    readonly property color cyan: palette.cyan
    readonly property color blue: palette.blue
    readonly property color magenta: palette.magenta
    readonly property color brown: palette.brown

    readonly property color bright_red: palette.bright_red
    readonly property color bright_yellow: palette.bright_yellow
    readonly property color bright_green: palette.bright_green
    readonly property color bright_cyan: palette.bright_cyan
    readonly property color bright_blue: palette.bright_blue
    readonly property color bright_magenta: palette.bright_magenta

    readonly property bool fontReady: pixelFont.status === FontLoader.Ready
    readonly property string fontFamily: fontReady ? pixelFont.name : "monospace"

    readonly property string colorsPath: Quickshell.env("HOME") + "/.local/state/omarchy/current/theme/colors.toml"

    function apply(text) {
        palette = ThemeLib.resolveTheme(ThemeLib.parseColors(text));
        console.info("Theme: loaded " + palette.mode + " palette (accent " + palette.accent + ", font " + fontFamily + ") from " + colorsPath);
    }

    // Quickshell refuses to load files outside the shell root (app/), so app/lib
    // and app/assets are symlinks to ../lib and ../assets; lib/ stays the single
    // source both Node and QML use.
    property FontLoader pixelFont: FontLoader {
        source: Qt.resolvedUrl("assets/fonts/PressStart2P-Regular.ttf")
    }

    // omarchy-theme-set replaces current/theme with `rm -rf` + `mv`. If a reload
    // lands in that gap it fails and FileView drops its watch on the vanished
    // file, so nothing would ever re-arm it. Retry until a load succeeds; the
    // successful load re-establishes the watch. The palette keeps its last good
    // value meanwhile (it starts as the defaults, so a missing file at startup
    // still yields the default palette).
    property Timer retry: Timer {
        interval: 250
        repeat: true
        onTriggered: root.colorsFile.reload()
    }

    property FileView colorsFile: FileView {
        path: root.colorsPath
        watchChanges: true
        printErrors: false
        onLoaded: {
            root.retry.stop();
            root.apply(text());
        }
        onLoadFailed: {
            if (!root.retry.running) {
                console.warn("Theme: could not read " + root.colorsPath + "; keeping current palette and retrying");
                root.retry.start();
            }
        }
        onFileChanged: reload()
    }
}
