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
- [ ] Gamepad support via Qt gamepad or evdev — v2 — (captured 2026-09-04)
- [ ] Extract PixelStage (low-res layer + integer upscale + scanlines) into a reusable Quickshell component for other Omarchy apps — v2
- [ ] CRT shader overlay (curvature, phosphor, bloom) via ShaderEffect + qsb, ported from libretro crt-pi/crt-easymode — v2
- [ ] Hand-pixelled sprite bitmaps for exact original silhouettes if the vector approximation disappoints — v2
- [ ] Intermission cutscenes between levels — v2 — (captured 2026-09-04)
- [ ] Theme reload retry runs forever when colors.toml can never exist (HOME unset); add backoff or a cap — (captured 2026-09-04)
- [ ] install-as-plugin must preserve the app/lib and app/assets symlinks (Quickshell blackholes files outside the shell root) — (captured 2026-09-04)
- [ ] Arcade quad stretched ~0.5% at fractional device window sizes (e.g. 431×664 logical at 1.6): log surface buffer size vs stage.height*dpr in the debug line; also check dprs where native/dpr is not a whole logical pixel (1.5 → 149.33) — (captured 2026-09-04)
- [ ] F12 debug grab should count off-palette pixels and log it, so a blurred arcade texture is caught automatically — (captured 2026-09-04)
- [ ] XDG_STATE_HOME support for Theme and Settings paths (HOME unset gives "undefined/…") — (captured 2026-09-04)
- [ ] Non-Hyprland DPR source for PixelStage if the app ever runs outside Omarchy — (captured 2026-09-04)
- [ ] Clear held direction keys when the window loses focus (workspace switch mid-hold keeps Pac-Man moving) — (captured 2026-09-04)
- [ ] Tune CORNER_TOLERANCE once ghosts land: a press just after a tile centre snaps up to 4 px backwards, a small visible hop — (captured 2026-09-04)
- [ ] Debug overlay line overlaps the lives row once lives > 3, and overflows 224 px in the demo so the L<n> token clips; print L<n> before the phase token — (captured 2026-09-04, updated 2026-09-05)
- [ ] Decide whether the row-11 no-up tiles should move to this maze's real up-junctions (cols 9 and 18) — (captured 2026-09-04)
- [ ] Clear a pending ghost `reverse` when frightened expires (one-word fix in game.mjs) — (captured 2026-09-04)
- [ ] Arcade fidelity: ghosts in the house turn blue on a power pellet and emerge frightened — (captured 2026-09-04)
- [ ] Ghost-eaten score in a smaller digit sprite instead of the 8-px font — (captured 2026-09-04)
- [ ] Narrow the debug-script focus-loss exception to "while the key script is running", not the whole session — (captured 2026-09-04)
- [ ] Allow auto-pause from dying and level-clear (focus loss there is dropped and the next READY runs unfocused) — (captured 2026-09-04)
- [ ] Demo HUD climbs the live high score above the real one; pin Settings.highScore in the HUD while attract runs — (captured 2026-09-04)
- [ ] s/g/q on the title do not reset the attract idle timer; send any-key — (captured 2026-09-04)
- [ ] Save the high score on window close (compositor kill / SUPER+W), not only game-over, level-clear and q — (captured 2026-09-04)
- [ ] Guard the debug key-script names lookup with hasOwnProperty — (captured 2026-09-04)
- [ ] Attract demo ends by the 40 s cap; a longer cap or smarter autopilot would give a real game-over ending — (captured 2026-09-04)
- [ ] Env switch to hide the debug overlay while keeping F12, so preview grabs need no --blank — (captured 2026-09-04)
- [ ] Listen test: the 4 s start jingle overlaps the siren for 2 s — shorten the jingle or hold the siren until it ends — (captured 2026-09-04)
- [ ] Loop seam: end loops one sample short of the wrap phase instead of duplicating the zero sample — (captured 2026-09-04)
- [ ] Main.qml drops a tap that lands on a zero-tick frame (pendingPress cleared before the tick loop) — (captured 2026-09-04)
- [ ] A deterministic debug script that eats a ghost, so ghost-eaten/eyes sounds can be verified unattended — (captured 2026-09-04)
