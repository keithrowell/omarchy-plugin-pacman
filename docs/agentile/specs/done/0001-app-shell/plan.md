# Plan — Stand up the app shell: window, theme reader, font, launcher

Written by the plan stage into the spec's directory as `plan.md`. Review and
amend this file directly — the build stage follows what it says.

## Files to touch

All new; nothing existing changes except `.gitignore`.

| File | Why |
|---|---|
| `bin/pacman` | Executable bash launcher. Resolves its own directory (`$(dirname "$(readlink -f "$0")")/..`), checks `command -v qs` (prints an install hint and exits 1 if missing), then `exec qs -p "$ROOT/app/Main.qml"`. |
| `app/Main.qml` | `ShellRoot` holding one `FloatingWindow` (title `Pacman`, `implicitWidth: 672`, `implicitHeight: 864`, `color: Theme.background`). Contains a focused `Item` with `Keys.onPressed` (Escape / `q` → `Qt.quit()`) and the placeholder "PACMAN" `Text` in `Theme.accent`, `font.family: Theme.fontFamily`. |
| `app/Theme.qml` | `pragma Singleton` `QtObject`. Owns the `FileView` on `colors.toml`, calls `parseColors` from `lib/theme.mjs`, exposes every colour key as a `readonly property color`, plus `mode` (string), `fontFamily` (string) and `fontReady` (bool). Owns the `FontLoader`. |
| `app/qmldir` | `singleton Theme 1.0 Theme.qml` so `Theme` resolves by name from `Main.qml`. |
| `lib/theme.mjs` | Pure ES module: `parseColors(text) → object` (minimal TOML subset: `key = "value"`, `#` comments, blank lines) and `resolveTheme(parsed) → object` that applies the fallback chain and final defaults. `DEFAULTS` and `FALLBACKS` exported so tests can assert them. No Qt imports. |
| `tests/theme.test.mjs` | `node --test` suite for both functions. |
| `assets/fonts/PressStart2P-Regular.ttf`, `assets/fonts/OFL.txt` | Vendored font and its licence, fetched from `https://raw.githubusercontent.com/google/fonts/main/ofl/pressstart2p/` (both URLs return 200; verified during planning). |
| `manifest.json` | `schemaVersion: 1`, `id: com.keithrowell.pacman`, `name: Pacman`, `version: 0.1.0`, `author: Keith Rowell`, `license: MIT`, `description`, `kinds: []`, `keepLoaded: false` — same shape as the Agentile plugin manifest. |
| `LICENSE` | MIT, copyright 2026 Keith Rowell. |
| `.gitignore` | Keep the existing `.pull.lock` line; add `node_modules/`. Keep it minimal. |
| `app/render/.gitkeep`, `tools/.gitkeep`, `assets/sfx/.gitkeep` | Skeleton directories the later specs fill in (`CLAUDE.md` layout). |

## Approach

### Theme parser (`lib/theme.mjs`)

Real `colors.toml` on this machine (checked during planning) is exactly the flat
form `key = "#rrggbb"` with one `mode = "dark"` string; no tables, no arrays.
`parseColors` handles only that subset, deliberately:

1. Split on `\n`; for each line strip a trailing `#…` comment **outside quotes**,
   trim, skip empty.
2. Match `/^([A-Za-z0-9_]+)\s*=\s*"([^"]*)"$/` (also accept single quotes and
   bare unquoted values); collect into a plain object of strings. Ignore lines that
   do not match (never throw). Return `{}` for empty or non-string input.

`resolveTheme(parsed)` returns an object with **every** key the spec lists
present, using this fallback chain (first present wins), then `DEFAULTS`:

- `bright_<c>` → `<c>` for red/yellow/green/cyan/blue/magenta
- `orange` → `yellow`; `brown` → `orange` → `yellow`
- `dark_background` → `background`; `darker_background` → `dark_background`; `lighter_background` → `selection` → `background`
- `dark_foreground` → `muted` → `foreground`; `light_foreground` → `foreground`; `bright_foreground` → `light_foreground` → `foreground`
- `selection` → `lighter_background` → `background`; `muted` → `dark_foreground` → `selection`
- `accent` → `cyan` → `foreground`
- `mode` → `"dark"`

`DEFAULTS` is one dark palette (may be the Nord-ish values in the current
`colors.toml`); it is the **only** place a hex literal lives. `Theme.qml` must
not contain a colour literal.

### Theme singleton (`app/Theme.qml`)

```
pragma Singleton
import QtQuick
import Quickshell
import Quickshell.Io
import "../lib/theme.mjs" as ThemeLib
```

- `property var palette: ThemeLib.resolveTheme({})` — initialised to defaults so
  bindings are valid before the file loads.
- `FileView { path: Quickshell.env("HOME") + "/.local/state/omarchy/current/theme/colors.toml"; watchChanges: true; printErrors: false; onLoaded: apply(text()); onLoadFailed: { console.warn(...); palette = resolveTheme({}) }; onFileChanged: reload() }`.
  `FileView` has `reload()` and a `fileChanged` signal when `watchChanges` is on
  (this is the Quickshell 0.3.1 on this machine). Re-assigning `palette` as a whole
  object retriggers every colour binding.
- One `readonly property color <key>: palette.<key>` per spec key, and
  `readonly property string mode: palette.mode`.
- `FontLoader { id: pixelFont; source: Qt.resolvedUrl("../assets/fonts/PressStart2P-Regular.ttf") }`;
  `readonly property string fontFamily: pixelFont.status === FontLoader.Ready ? pixelFont.name : "monospace"`.
- The Omarchy theme switcher replaces the `current/theme` symlink target rather
  than rewriting the file in place. If `watchChanges` does not fire on a symlink
  swap, add a 1 s `Timer` that calls `reload()` as a belt-and-braces poll — the
  acceptance criterion is "recolours within a second", so a 1 s poll satisfies it.
  Prefer the watcher; add the poll only if the manual test shows it is needed, and
  say so in the commit message.

### Window and input (`app/Main.qml`)

`FloatingWindow` from `Quickshell`. Inside it a full-size `FocusScope`/`Item`
with `focus: true` and `Keys.onPressed`: `Qt.Key_Escape` or `Qt.Key_Q` →
`Qt.quit()`. Call `forceActiveFocus()` in `Component.onCompleted` so the window
has keyboard focus on open. Placeholder: centred `Text { text: "PACMAN"; color: Theme.accent; font.family: Theme.fontFamily; font.pixelSize: 48 }` and a
smaller `Theme.foreground` line reading `press q to quit` so both text colours
are exercised. Nothing else — no game loop, no canvas, no PixelStage (spec 0002).

### Launcher and manifest

`bin/pacman` as described above; `chmod +x`. `manifest.json` at the repo root.

## Test strategy

- Gate `test`: `node --test tests/` (from `.agentile/gates.json`). Must pass.
  `tests/theme.test.mjs` covers: quoted hex values; single quotes; a comment line
  and a trailing comment; blank lines; a line with no `=`; `mode`; empty input;
  a missing `bright_red` falling back to `red`; a missing `red` falling back to
  the default; every spec key present in `resolveTheme({})`; the real
  `colors.toml` content from this machine (inlined as a fixture) round-tripping
  unchanged.
- Other gates (`format`, `lint`, `build`) are empty and skipped.
- Manual (builder does this and records the result in its report): `bin/pacman`
  opens the window; `omarchy-theme-set <other theme>` twice recolours it without
  restart; `q` closes it; `bin/pacman` with `PATH` lacking `qs` prints the hint
  and exits 1. `qs -p app/Main.qml` must print no QML warnings on start. Grab a
  screenshot (`grabToImage` on the window's content or `desktop_screenshot`) and
  store it beside this plan as `shell-screenshot.png` if convenient.

## Risks and unknowns

- **ES-module import from outside the shell root.** `qs -p app/Main.qml` makes
  `app/` the config root; `Theme.qml` imports `../lib/theme.mjs` by relative
  URL. Plain Qt resolves this as a file URL and should work. If Quickshell refuses
  it, fall back to moving the entry point: keep `bin/pacman` calling
  `qs -p "$ROOT/app/Main.qml"` but load the parser via an absolute
  `Qt.resolvedUrl` computed from `Quickshell.shellDir` (do not copy the module
  into `app/`; `lib/` must stay the single source both Node and QML use).
- **Singleton resolution.** A `qmldir` with a `singleton` line in the same
  directory as `Main.qml` is the documented Quickshell pattern; if `Theme` is
  unresolved, check the `qmldir` module line and that `Theme.qml` starts with
  `pragma Singleton`.
- **`fileChanged` on symlink swap** — see the poll fallback above.
- **Font name.** `FontLoader.name` for Press Start 2P is `"Press Start 2P"`; use
  the loader's `name`, never the literal.
- **Colour parse of a bad value.** `Qt.color`/`color` property assignment of a
  malformed string logs a warning and yields transparent. `resolveTheme` should
  validate `#rgb`/`#rrggbb`/`#rrggbbaa` with a regex and substitute the fallback
  for anything else, so the window never goes transparent.
- Assumed: Quickshell 0.3.1 and Node 26 (both verified on this machine).

## ADR

None — ADR-0001 already fixes the stack this spec implements.
