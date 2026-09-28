---
number: 0003
title: Run the game as an omarchy-shell panel plugin
status: proposed
date: 2026-09-28
---

# ADR-0003: Run the game as an omarchy-shell panel plugin

## Status

proposed. When accepted, it supersedes the process decision in ADR-0001
(standalone `qs -p` process, `kinds: []`). ADR-0001's other commitments
stay: game rules in `lib/*.mjs` shared by QML and `node --test`, the theme
read from `colors.toml`, QML/JS for the app and Python only for the offline
sound generator.

## Context

Keith wants Pacman listed on the Omarchy plugin marketplace. The marketplace
validator (omacom/omarchy-plugin-marketplace, `scripts/build-catalog.mjs`
`validateManifest`, checked 2026-09-28) rejects a manifest whose `kinds` is
empty, and accepts only bar, bar-widget, menu, overlay, panel and service.
The ADR-0001 amendment recorded that none of those kinds fitted a windowed
game loop. Since then other game plugins have shipped as panels:
28allday/Quattroids (a full-screen transparent layer-shell `PanelWindow` with
a centred cabinet, exclusive keyboard focus, `keepLoaded: true`, sounds behind
a `Loader`) and acrogenesis/omarchy-breakout (a `FloatingWindow`). Both show
a panel can own a real-time loop and its own window.

The host (`/usr/share/omarchy/shell/shell.qml`) keeps one asynchronous
`Loader` per enabled panel plugin, active while the panel is open or always
when the manifest says `keepLoaded`. It injects `shell` and `manifest` when the
root declares them, calls `open(payloadJson)` on summon and `close()` on hide,
reads the root's `opened` to decide what `toggle` does, and exposes
`shell call <id> <method> <arg>` over IPC. A hidden window stops rendering, so
`FrameAnimation` stops; plain `Timer`s keep firing.

ADR-0001's objection still holds in part: omarchy-shell hosts the bar,
notifications and lock screen, so a stall, a leak or a crash in the game now
hurts the whole desktop, and `Qt.quit()` anywhere in the game would kill the
shell. Options considered:

1. **Stay standalone.** No marketplace listing; that is the goal this
   decision exists to meet.
2. **Panel with a standalone helper process** (the panel only launches
   `qs -p`). Listed, but the panel would be a fig leaf over an unchanged app,
   and the validator's intent is that plugins run in the shell.
3. **Panel-only, game in the shell** (chosen). Opened with
   `omarchy-shell shell toggle com.keithrowell.pacman '{}'` from the Omarchy
   menu, the app launcher or a keybind. No bar icon.

Window type: a layer-shell `PanelWindow` on the Overlay layer with exclusive
keyboard focus while open, full-screen and transparent with the game centred
(the Quattroids pattern), over a `FloatingWindow`, because a floating window's
placement and tiling are Hyprland's call and its focus follows the pointer;
the layer surface is always centred and always has the keys.

## Decision

Pacman is a `kinds: ["panel"]` plugin with `entryPoints.panel: "Panel.qml"`
and `keepLoaded: true`. `Panel.qml` at the repo root owns the lifecycle
(`opened`, `open()`, `close()`) and a layer-shell `PanelWindow` on the focused
monitor; the game content (`app/Main.qml`) runs its frame loop only while
open. Escape closes the panel and pauses the round; toggling it open again
resumes the same round, paused. Nothing in the game may call `Qt.quit()`.
Sound is optional: the QtMultimedia-backed effects are created through a
component load that can fail, and the game runs silent when it does.

`bin/pacman` runs the toggle command instead of starting `qs`. The repo-root
`shell.qml` stays only as a development host: `qs -p <repo root>` loads
`Panel.qml` with a stub `shell`, so `PACMAN_DEBUG` / `PACMAN_DEBUG_KEYS`
scripted runs work in their own process without touching the desktop shell.
In the real shell the same unattended driving is done over
`omarchy-shell shell call com.keithrowell.pacman <method> <arg>`.

## Consequences

- Easier: marketplace listing; `omarchy plugin add` / enable / disable work;
  the game opens instantly from a keybind (it stays loaded) and resumes where
  it was left; one fewer process.
- Harder: the game shares a process with the desktop shell. Every timer and
  sound loop must stop on close; file I/O must stay asynchronous; any leak
  across plugin reloads accumulates in the shell. Development still has hot
  reload through the dev host, but verifying the real host means driving
  Keith's live shell, and any write under `~/.config/omarchy/plugins/` makes
  the shell reload every plugin (which drops an in-progress round).
- Harder: the plugin must be enabled before it can be summoned; a summon on a
  disabled plugin is refused with only a log line.
- Committed to: panel lifecycle as the only way the game runs for users;
  `lib/*.mjs` loading inside omarchy-shell's engine (to be proved by the
  first task of spec panel-port; if it fails, the fallback is a generated
  `.pragma library` bundle of `lib/`, and this ADR records which one
  shipped); QtMultimedia treated as optional.
