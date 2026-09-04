---
number: 0001
title: Run the game as a standalone Quickshell process
status: accepted
date: 2026-09-04
---

# ADR-0001: Run the game as a standalone Quickshell process

## Status

accepted

## Context

The game must look Omarchy-native, follow the live theme, run in its own window
(not the bar), draw at 60 fps and play sound. Three stacks were considered:

1. **In-shell plugin** (`kinds: ["panel"]`, summoned via `omarchy-shell shell summon`).
   Native, but a 60 fps game loop and audio would run inside the long-lived
   `omarchy-shell` process. A stall or crash there takes the bar, notifications
   and lock screen with it. Keyboard focus in a shell-owned window is also fiddly.
2. **Standalone Quickshell process** (`qs -p app/Main.qml`). Same QML toolkit the
   shell uses, so it looks like the shell's own surfaces; its own process, so it
   cannot hurt the shell. A spike confirmed: `Canvas` + `FrameAnimation` hold 60 fps,
   `QtMultimedia.SoundEffect` plays WAVs, and `FileView` with `watchChanges` reads
   `colors.toml` live.
3. **GTK4 + cairo in Python** (the Sous pattern). Proven theme bridge, but GTK
   is a step away from the shell's look, and game rendering in cairo is slower.

## Decision

Option 2. The plugin directory carries `manifest.json` with `kinds: []` (as Sous
does) so the shell ignores it, a `bin/pacman` launcher that runs
`qs -p <plugin>/app/Main.qml`, and menu/desktop entries that call the launcher.
Game logic lives in ES modules (`lib/*.mjs`) imported by both QML and `node --test`.
Theme colours are parsed from `~/.local/state/omarchy/current/theme/colors.toml`.

## Consequences

- Easier: hot iteration (`qs` reloads on save), isolation from the shell, unit
  tests for all game rules in Node with no Qt on the test path.
- Harder: no shell IPC (`summon`/`toggle`); launching is a plain process. The
  Hyprland app id is Quickshell's, so per-app window rules key on the title.
- Committed to: QML/JS only for the app, Python only for the offline sound
  generator, WAV assets committed to the repo.
