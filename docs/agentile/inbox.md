# Inbox (stubs awaiting shaping)

Anything can go here as a **stub** — a one-line placeholder that is *not yet ready to build*. Capture must be instant: a title, optionally a word about why. No acceptance criteria, no estimate, no triage.

Drop stubs with `/ag-capture <idea>`. Shape them into specs with `/ag-shape`. A stub stays here until it is shaped into a Ready spec, merged into another item, or dropped.

- [ ] App shell: standalone Quickshell window, theme reader, pixel font, launcher — (captured 2026-09-04)
- [ ] Maze and renderer: original 28×31 maze, pixel-art tiles, smooth-style toggle — (captured 2026-09-04)
- [ ] Player movement: buffered turns, tunnel wrap, pellet eating, score HUD — (captured 2026-09-04)
- [ ] Ghosts: four classic personalities, scatter/chase/frightened, lives, levels — (captured 2026-09-04)
- [ ] Sound: generated chiptune WAVs, event-driven playback, mute — (captured 2026-09-04)
- [ ] Game flow: title screen, ready/pause/game over, high score, CRT polish — (captured 2026-09-04)
- [ ] Install as Omarchy plugin: menu entry, desktop file, dotfiles submodule, README — (captured 2026-09-04)
- [ ] Fruit bonus items per level (cherry, strawberry…) — v2 — (captured 2026-09-04)
- [ ] Gamepad support via Qt gamepad or evdev — v2 — (captured 2026-09-04)
- [ ] Extract PixelStage (low-res layer + integer upscale + scanlines) into a reusable Quickshell component for other Omarchy apps — v2
- [ ] CRT shader overlay (curvature, phosphor, bloom) via ShaderEffect + qsb, ported from libretro crt-pi/crt-easymode — v2
- [ ] Hand-pixelled sprite bitmaps for exact original silhouettes if the vector approximation disappoints — v2
- [ ] ASCII/terminal render style as a third graphics mode — v2 — (captured 2026-09-04)
- [ ] Intermission cutscenes between levels — v2 — (captured 2026-09-04)
- [ ] High-score table with three-letter initials — v2 — (captured 2026-09-04)
- [ ] Theme reload retry runs forever when colors.toml can never exist (HOME unset); add backoff or a cap — (captured 2026-09-04)
- [ ] install-as-plugin must preserve the app/lib and app/assets symlinks (Quickshell blackholes files outside the shell root) — (captured 2026-09-04)
- [ ] Arcade quad stretched ~0.5% at fractional device window sizes (e.g. 431×664 logical at 1.6): log surface buffer size vs stage.height*dpr in the debug line; also check dprs where native/dpr is not a whole logical pixel (1.5 → 149.33) — (captured 2026-09-04)
- [ ] F12 debug grab should count off-palette pixels and log it, so a blurred arcade texture is caught automatically — (captured 2026-09-04)
- [ ] XDG_STATE_HOME support for Theme and Settings paths (HOME unset gives "undefined/…") — (captured 2026-09-04)
- [ ] Non-Hyprland DPR source for PixelStage if the app ever runs outside Omarchy — (captured 2026-09-04)
- [ ] Clear held direction keys when the window loses focus (workspace switch mid-hold keeps Pac-Man moving) — (captured 2026-09-04)
- [ ] Tune CORNER_TOLERANCE once ghosts land: a press just after a tile centre snaps up to 4 px backwards, a small visible hop — (captured 2026-09-04)
- [ ] Debug overlay line overlaps the lives row once lives > 3 — (captured 2026-09-04)
