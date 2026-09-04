---
title: "Stand up the app shell: window, theme reader, font, launcher"
slug: app-shell
status: ready
depends_on: []
type: feature
route: background
business_value: high
technical_certainty: high
created: 2026-09-04
outcome: bin/pacman opens a themed window that recolours within a second of an Omarchy theme switch
claimed_by:
label:
claimed_at:
---

# Stand up the app shell: window, theme reader, font, launcher

## Problem / why now

Nothing exists yet. Every other spec needs a window to draw in, a theme palette to
draw with, a pixel font, and a way to launch. This is the foundation the brief's
"Omarchy-native, follows the theme" outcome rests on, so it goes first. ADR-0001
fixes the stack: a standalone Quickshell process.

## Acceptance criteria

- [ ] `bin/pacman` (executable bash) runs `qs -p <plugin-dir>/app/Main.qml` and opens one `FloatingWindow` titled `Pacman`, default 672×864 (28×31 tiles at 3×), resizable.
- [ ] `app/Theme.qml` is a singleton (via `qmldir`) that parses `~/.local/state/omarchy/current/theme/colors.toml` with `Quickshell.Io.FileView` (`watchChanges: true`, reload on change) and exposes every key as a `color` property: `mode`, `accent`, `selection`, `muted`, `background`, `dark_background`, `darker_background`, `lighter_background`, `foreground`, `dark_foreground`, `light_foreground`, `bright_foreground`, `red`, `yellow`, `orange`, `green`, `cyan`, `blue`, `magenta`, `brown`, and the `bright_*` variants. Missing keys fall back to a sensible neighbour (e.g. `bright_red` → `red`), never to a hard-coded hex except the final defaults.
- [ ] The TOML parser lives in `lib/theme.mjs` (pure function `parseColors(text) → object`) with `node --test` coverage: quoted hex values, comments, blank lines, missing keys, `mode`.
- [ ] Window background is `Theme.background`; a placeholder "PACMAN" title in `Theme.accent` is drawn in the vendored font; switching theme with `omarchy-theme-set` (or `desktop_theme_set`) recolours the running window without restart.
- [ ] `assets/fonts/PressStart2P-Regular.ttf` (OFL, licence file beside it) loaded with `FontLoader`; `Theme.fontFamily` resolves to it, falling back to `monospace` if the load fails.
- [ ] `Escape` or `q` closes the window; the window has keyboard focus on open (a focused `Item` with `Keys` handlers in `Main.qml`).
- [ ] `manifest.json` at the repo root (`id: com.keithrowell.pacman`, `kinds: []`, `keepLoaded: false`, name, version 0.1.0, author, MIT licence, description) mirrors the Sous pattern so the shell ignores it.
- [ ] Repo skeleton in place: `app/`, `lib/`, `tests/`, `assets/`, `tools/`, `bin/`, `LICENSE` (MIT), `.gitignore`. `node --test tests/` passes.

## Scope boundary

**In scope:** window, theme singleton and parser, font, launcher, manifest, skeleton, one placeholder screen.

**Out of scope:** any game logic, maze, sprites, sound, menu/desktop entries (install-as-plugin), Hyprland window rules.

## Edge cases and failure paths

- `colors.toml` missing or unreadable → defaults (a dark palette) and a `console.warn`, no crash.
- A theme whose file lacks some keys → fallbacks per the mapping above.
- Theme file rewritten mid-frame → `FileView` reload is atomic; re-parse on `fileChanged`; the window may flash the old colours for one frame, which is fine.
- `qs` not on PATH → launcher prints an install hint and exits 1.
- Running two instances is allowed (each is its own process); no lock needed.

## Affected areas

New files only: `bin/pacman`, `app/Main.qml`, `app/Theme.qml`, `app/qmldir`, `lib/theme.mjs`, `tests/theme.test.mjs`, `assets/fonts/*`, `manifest.json`, `LICENSE`, `.gitignore`.

## Open questions

None. The spike in the design session confirmed `FileView`, `FrameAnimation` and `SoundEffect` all work under a standalone `qs` process.

## Verification

- `node --test tests/` green (theme parser).
- Manual: run `bin/pacman`, switch theme twice with `omarchy-theme-set`, confirm recolour; press `q`, window closes.
