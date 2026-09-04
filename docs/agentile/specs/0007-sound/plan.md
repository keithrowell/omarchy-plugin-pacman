# Plan — Chiptune sound effects generated offline, played from game events

Written by the plan stage into the spec's directory as `plan.md`. Review and
amend this file directly — the build stage follows what it says.

## Facts checked during planning

- `qt6-multimedia` 6.11.2 is installed (`/usr/lib/qt6/qml/QtMultimedia/`); the
  first spike played a generated WAV through `SoundEffect` under `qs`.
- numpy 2.5.2 is present; `wave` is stdlib. The audio server is PipeWire
  (PulseAudio compatibility), default sink present.
- Game events today: `pellet`, `power`, `ghost-eaten`, `ghost-exit`, `death`,
  `ready`, `level-start`, `level-clear`, `game-over`, `extra-life`, `mode`.
  `anyFrightened(state)` exists in `lib/game.mjs`; ghosts carry `state:
  "eaten" | "entering"` while returning.
- Flow screens: `title`, `ready`, `playing`, `paused`, `dying`, `level-clear`,
  `gameover`; `flow.attract` marks the demo. Settings are `{ mode, scanlines }`.

## Files to touch

| File | Why |
|---|---|
| `tools/gen_sounds.py` | The synthesiser. numpy + `wave` only. Deterministic. |
| `assets/sfx/*.wav` | Generated and committed (remove `.gitkeep`). |
| `lib/sound-map.mjs` | Pure mapping: `createSoundState()`, `mapSounds(soundState, events, state, screen, attract)` → `{ oneShots, loop, soundState }`, `sirenStage(pelletsLeft, total)`, `SOUNDS` (the file list). |
| `lib/settings.mjs` | `muted: false` in defaults, parse and serialise. |
| `tests/sound-map.test.mjs`, `tests/gen-sounds.test.mjs`, `tests/settings.test.mjs` (extend) | The gate. |
| `app/Sfx.qml` + `app/qmldir` (`singleton Sfx 1.0 Sfx.qml`) | Playback wrapper over `QtMultimedia.SoundEffect`. |
| `app/Settings.qml` | `muted`, `toggleMuted()`. |
| `app/Main.qml` | Wire events → `SoundMap` → `Sfx`; `m` key; start jingle on `start`; stop loops on pause. |
| `app/render/Hud.js` | `MUTE` / `NO AUDIO` text top-right when muted or unavailable. |
| `README.md` | Document `m` and the sound generator (the README currently says "coming with the sound spec"). |

## Approach

### Generator (`tools/gen_sounds.py`)

Sample rate 22 050 Hz, mono, 16-bit. Building blocks: `square(freq, t, duty)`,
`triangle(freq, t)`, `noise(t)` (deterministic LCG, not `numpy.random`
unseeded — seed it explicitly so the output is byte-stable), an ADSR
envelope, `sweep(f0, f1, dur)`, and `note(freq, dur, wave, env)`. Normalise
each file to −3 dBFS peak, apply a 2 ms fade at both ends of every one-shot to
kill clicks, and make loops **seamless**: a loop file contains an integer
number of sweep cycles and starts and ends at a zero crossing of the same
phase. `--out DIR` writes elsewhere (the test uses it); with no args it writes
to `assets/sfx/`. Running twice produces identical bytes (the test checks).

Compositions (original, in the arcade idiom — not transcriptions):

| File | Length | Sketch |
|---|---|---|
| `start.wav` | ~4.0 s | Two-voice jingle at 120 bpm: a square-wave lead of 16 eighth notes over a triangle bass on the root and fifth, ending on a held major chord. Write your own melody in C major. |
| `waka-a.wav`, `waka-b.wav` | 70 ms each | Square sweep 420 → 260 Hz (a) and 260 → 420 Hz (b), 25 % duty, short decay. |
| `siren-1..5.wav` | 0.50 s loop each | Triangle wave sweeping up then down over one cycle; base frequency 300, 340, 380, 430, 490 Hz, sweep span +120 Hz. Stage 5 slightly faster (0.42 s). |
| `fright.wav` | 0.30 s loop | Square 12.5 % duty, rapid 8-step descending arpeggio 900 → 500 Hz. |
| `eyes.wav` | 0.25 s loop | High triangle blips 1400/1600 Hz alternating, quiet (−9 dBFS). |
| `ghost-eaten.wav` | 0.45 s | Square rising sweep 400 → 1200 Hz with vibrato, then a short high chirp. |
| `death.wav` | 1.6 s | Descending warble (square, 700 → 150 Hz in 6 dips), then two noise bursts. |
| `extra-life.wav` | 0.6 s | Fast ascending square arpeggio C–E–G–C repeated twice. |
| `level-clear.wav` | 1.2 s | Triangle fanfare: three ascending notes and a held fifth. |

### Mapping (`lib/sound-map.mjs`)

```
soundState = { waka: "a", lastWakaTick: -Infinity, jinglePlayed: false }
mapSounds(soundState, events, state, screen, attract) → { oneShots: [...], loop: name | null, soundState }
```

- **Silent cases**: `attract` true → `{ oneShots: [], loop: null }`; screens
  `title`, `paused`, `gameover` → no one-shots, `loop: null`.
- **One-shots** from events, in order:
  - `pellet` / `power` → `waka-a`/`waka-b` alternating, but only when
    `state.tick − lastWakaTick ≥ WAKA_MIN_TICKS (5 ≈ 80 ms)`; otherwise drop
    it (the spec's "retrigger only when finished or every 80 ms": a 70 ms
    file plus the 5-tick throttle covers both).
  - `ghost-eaten` → `ghost-eaten`; `death` → `death`; `extra-life` →
    `extra-life`; `level-clear` → `level-clear`.
  - The start jingle is not an event: `Main.qml` plays `start` on the flow
    `start` action (title → ready). `mapSounds` never emits it.
- **Loop** while `screen === "playing"` (and only then; `ready`, `dying`,
  `level-clear` are silent apart from their one-shots):
  - any ghost in `eaten`/`entering` → `eyes`;
  - else `anyFrightened(state)` → `fright`;
  - else `siren-N` with `N = sirenStage(state.pelletsLeft, total)`, `total =
    maze.pellets.length + maze.powerPellets.length`: stage 1 while `left >
    0.75·total`, 2 while `> 0.5`, 3 while `> 0.25`, 4 while `> 0.1`, else 5.
- Pure: never mutate inputs; import `anyFrightened` from `game.mjs`.
- `SOUNDS` = the 14 file names, exported so `Sfx.qml` and the tests share it.

### Playback (`app/Sfx.qml`)

Singleton `QtObject`:

- One `SoundEffect { source: Qt.resolvedUrl("assets/sfx/<name>.wav") }` per
  entry in `SOUNDS`, created in `Component.onCompleted` with
  `Qt.createQmlObject` or declared statically (static is clearer: 14
  declarations, `loops: SoundEffect.Infinite` on the five siren files,
  `fright` and `eyes`). Preloaded by construction.
- `property bool muted` bound from `Settings.muted`.
- `readonly property bool available`: false once any effect reports
  `status === SoundEffect.Error`; log a single `console.warn("Sfx: no
  audio …")` and stay silent thereafter.
- `function play(name)`: if `!muted && available` → `effects[name].play()`.
  Fire-and-forget; never wait on status.
- `property string currentLoop: ""`; `function setLoop(name)`: if `name ===
  currentLoop` return; stop the current loop effect, start the new one (or
  none). Mute toggling while a loop plays stops it; unmuting lets the next
  tick's `setLoop` restart it (clear `currentLoop` on mute).
- No `Theme` use, no game knowledge beyond names.

### Wiring (`app/Main.qml`)

- After the tick loop: `const r = SoundMap.mapSounds(soundState, events, state,
  flow.screen, flow.attract)`; `soundState = r.soundState`; `Sfx.setLoop(r.loop)`
  **before** `r.oneShots.forEach(Sfx.play)` so a death stops the siren before
  `death.wav`. Call this every frame even with no ticks so a pause stops loops
  immediately.
- `start` action → `Sfx.play("start")`; the `ready` beat stays 2 s.
- `m` on any screen → `Settings.toggleMuted()`; it is not a movement key.
- Add `m` to the debug key table. Debug log line gains `loop <name|->`.

### HUD

`Hud.drawHud` gets `opts.muted` and `opts.audio`: draw `MUTE` (muted) or `NO
AUDIO` (unavailable) right-aligned at x = 216 on row 0 in `palette.muted`.

### README

Replace the "coming with the sound spec" note: `m` toggles mute (persisted);
`python3 tools/gen_sounds.py` regenerates the WAVs; the sounds are original
chiptune pieces.

## Test strategy

Gate: `node --test tests/*.test.mjs`.

- `sound-map.test.mjs`: waka alternates a/b across pellet events; throttle
  drops a second pellet within 4 ticks and allows one at 5; ghost-eaten,
  death, extra-life, level-clear map to their files; siren stage boundaries
  at 75/50/25/10 % (use total 260: 196 → 1, 195 → 2, 130 → 3, 65 → 4, 26 →
  5); eyes beats fright beats siren; loop null on title/paused/gameover/
  ready/dying/level-clear and during attract; attract emits no one-shots;
  purity (inputs unchanged, `deepStrictEqual` before/after).
- `gen-sounds.test.mjs`: skip with a message if `python3 -c "import numpy"`
  fails; else run `tools/gen_sounds.py --out <tmp>` and compare the sha256 of
  every file with `assets/sfx/`; parse each WAV header (RIFF, 22 050 Hz, mono,
  16-bit); loop files start and end within ±64 of zero amplitude; every file
  in `SOUNDS` exists.
- `settings.test.mjs`: `muted` default false, round trip, non-boolean ignored.
- Manual (builder reports with evidence): `qs` launch clean with the 14
  effects loaded (log the count and `available`); scripted play with sound
  on: audible? — the builder cannot hear, so log every `play`/`setLoop` call
  in debug mode and quote the sequence: `start` on Return, `waka-a/b` during
  play, `siren-1` loop, `fright` after a power pellet, `ghost-eaten`,
  `eyes`, `death` with the loop stopped just before, `siren-1` again after
  READY. `m` → `settings.json` has `"muted": true`, the HUD shows MUTE
  (F12 grab), then toggle back. Debug fps stays 60 with sound on.

## Risks and unknowns

- **SoundEffect and PipeWire**: Qt's `SoundEffect` uses the platform audio
  backend; the spike worked. If `status` reports `Error` on this machine
  under the sandbox (no audio socket), the `available` path must still keep
  the game silent and running — that is the spec's failure path and is
  testable by launching with `PULSE_SERVER=/nonexistent`.
- **Loop seams**: a click at the loop point is the classic failure; the
  zero-crossing test plus an integer cycle count prevent it.
- **Latency**: `SoundEffect` is low-latency by design; do not use
  `MediaPlayer`.
- **Volume**: the files are normalised to −3 dBFS; `SoundEffect.volume` stays
  1.0, `eyes` is quieter by design.
- **Rapid waka at Elroy speeds**: the throttle handles it; the test pins it.

## ADR

None. The sound approach is already fixed in the brief's constraints.
