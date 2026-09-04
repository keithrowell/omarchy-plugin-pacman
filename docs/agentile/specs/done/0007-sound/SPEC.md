---
title: Chiptune sound effects generated offline, played from game events
slug: sound
status: shipped
shipped_at: 2026-09-04T07:43:21Z
depends_on: [ghosts]
type: feature
route: background
business_value: medium
technical_certainty: high
created: 2026-09-04
outcome: every game event in the events contract has a sound, the siren loops during play, and m mutes everything persistently
claimed_by: a7420d79-880d-4334-8062-82d6934a6047
label: 
claimed_at: 2026-09-04T07:09:55Z
---

# Chiptune sound effects generated offline, played from game events

## Problem / why now

Old-school sound is half the nostalgia. The design fixes a zero-dependency
approach: a Python script synthesises square/triangle-wave WAVs once, the
files are committed, and QtMultimedia plays them in response to the events the
game loop already emits. It depends on `ghosts` so the full event list exists.

## Acceptance criteria

- [ ] `tools/gen_sounds.py` (numpy + `wave`, no other deps) writes 22.05 kHz mono 16-bit WAVs into `assets/sfx/`: `start.wav` (opening jingle, ~4 s), `waka-a.wav` / `waka-b.wav` (alternating chomp), `siren-1..5.wav` (loopable, rising pitch per remaining-pellet stage), `fright.wav` (loopable), `eyes.wav` (loopable, while a ghost returns), `ghost-eaten.wav`, `death.wav`, `extra-life.wav`, `level-clear.wav`. All original compositions in the style of the arcade, not samples of it. Script is deterministic and idempotent; a test regenerates to a temp dir and compares checksums to the committed files.
- [ ] `app/Sfx.qml`: a `SoundEffect` per file, preloaded at start; `play(name)` for one-shots; `loop(name)` / `stopLoops()` for the siren/fright/eyes layers with exactly one background loop active at a time (priority: eyes > fright > siren).
- [ ] `lib/sound-map.mjs` (pure, tested): maps an events list plus state to `{ oneShots: [...], loop: name|null }` so the mapping logic is unit-tested without Qt. Waka alternates a/b on successive pellet events; siren stage follows the remaining-pellet thresholds.
- [ ] `m` toggles mute; the state persists in `settings.json`; a small muted glyph shows in the HUD when muted.
- [ ] No audio thread stalls the frame loop: playback calls are fire-and-forget; measured fps unchanged with sound on.

## Scope boundary

**In scope:** generator, assets, playback wrapper, event mapping, mute, HUD glyph.

**Out of scope:** music beyond the start jingle, volume slider, per-sound settings, PipeWire-specific routing.

## Edge cases and failure paths

- No audio device (or QtMultimedia missing) → `SoundEffect.status === Error`: log once, continue silent, mute glyph shows "no audio".
- Rapid pellet events (one per tick at high speed) must not stack: waka retriggers only when the previous one finished or every 80 ms, whichever is later.
- Death: stop all loops before playing `death.wav`; resume the siren after the board resets.
- Game paused: loops pause, one-shots are discarded.

## Affected areas

`tools/gen_sounds.py`, `assets/sfx/*.wav`, `app/Sfx.qml`, `lib/sound-map.mjs`, `tests/sound-map.test.mjs`, `tests/gen-sounds.test.mjs` (spawns python3; skips with a note if numpy is absent), `app/Main.qml` (wire events → Sfx, `m` key), `app/render/Hud.js`.

## Open questions

None; the spike confirmed `SoundEffect` loads and plays a generated WAV under `qs`.

## Verification

- `node --test tests/*.test.mjs` green including the checksum test.
- Manual: play a level with sound; confirm waka, siren rising, fright loop, ghost-eaten, death, level-clear; `m` silences and persists across restart.
