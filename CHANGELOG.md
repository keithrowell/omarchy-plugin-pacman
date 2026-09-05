# Changelog

## 1.0.0 — 2026-09-06

First public release: a playable Pac-Man round, Omarchy-native and
installable by anyone with a `git clone` and `bin/install`.

- App shell: standalone Quickshell window, live theme reader, vendored
  pixel font, launcher (spec 0001-app-shell).
- Maze data model, board renderer and the big-pixel `PixelStage` (spec
  0002-maze-and-renderer).
- Player movement: buffered turns, tunnel wrap, pellet eating, score HUD
  (spec 0003-player-movement).
- Four ghosts with classic scatter/chase/frightened behaviour, lives and
  level progression (spec 0004-ghosts).
- Title screen, ready/pause/game-over flow, high score and retro polish
  (spec 0005-game-flow-and-hud).
- Shipped as an Omarchy plugin: menu entry, desktop file, dotfiles
  submodule, README (spec 0006-install-as-plugin).
- Chiptune sound effects generated offline and played from game events,
  with a mute key (spec 0007-sound).
- Scanlines always on; the smooth/arcade toggle removed in favour of one
  look (specs 0001-scanlines-always-on, 0003-remove-smooth-mode).
- A ten-row high-score table with three-letter initials entry (spec
  0002-high-score-table).
- Fruit bonus items per level, drawn as theme-coloured pixel bitmaps (spec
  0004-fruit-bonus).
- No symlinks: `app/` reaches `lib/` and `assets/` through a root
  `shell.qml` and relative imports, so a plain public clone (or any host
  with `core.symlinks=false`) works unmodified; `bin/install` derives every
  path from wherever it is run and checks for `quickshell` and
  `qt6-multimedia` (spec 0001-publish-standalone).

See `docs/agentile/specs/done/` for the full spec and plan behind each of
the above.
