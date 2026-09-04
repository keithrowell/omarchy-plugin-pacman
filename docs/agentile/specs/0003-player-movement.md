---
title: Player movement, pellet eating and score HUD
slug: player-movement
status: ready
depends_on: [maze-and-renderer]
type: feature
route: background
business_value: high
technical_certainty: high
created: 2026-09-04
outcome: Pac-Man moves through the whole maze under keyboard control and clears every pellet, with the score climbing correctly
claimed_by:
label:
claimed_at:
---

# Player movement, pellet eating and score HUD

## Problem / why now

First interactive slice. The feel of Pac-Man is in the movement: buffered turns,
cornering, constant speed, tunnel wrap. It also establishes the pure game loop
(`step`) and the event contract that sound and ghosts build on.

## Acceptance criteria

- [ ] `lib/game.mjs` exports `createState(maze)` and `step(state, input, dt)` → `{ state, events }`, pure and deterministic (no Date, no randomness without a seeded RNG passed in). Fixed timestep: `Main.qml` accumulates `FrameAnimation.frameTime` and calls `step` in 1/60 s ticks.
- [ ] Player entity: tile position plus sub-tile offset, direction, wanted direction. Input: arrows, `hjkl`, `WASD`. A wanted direction is **buffered** and applied at the next tile where it is legal; cornering snaps to the lane centre when turning.
- [ ] Speed from a per-level table (`lib/speeds.mjs`, starting at 80 % of 75.75 px/s in original units, slowing briefly on each pellet eaten) expressed in tiles per second; tests assert the table and that the player never passes through a wall at any speed.
- [ ] Side tunnels wrap the player to the opposite edge; the player is drawn partially on both sides while crossing.
- [ ] Eating: pellet → `+10`, power pellet → `+50`, tile becomes empty; `events` include `{ type: "pellet" }`, `{ type: "power" }`, `{ type: "level-clear" }` when the last pellet goes.
- [ ] Sprite: `app/render/Sprites.js` draws Pac-Man in `Theme.yellow` as a 13-px wedge in native units, mouth angle cycling through closed/half/open by distance travelled, facing the movement direction. The same routine serves both stage modes (ADR-0002).
- [ ] HUD in the pixel font: `1UP` and score top-left, `HIGH SCORE` top-centre (value 0 for now), three life icons bottom-left, all from `Theme`.
- [ ] Debug overlay (`PACMAN_DEBUG=1`): fps, tile coords, wanted direction.

## Scope boundary

**In scope:** game loop, player, input, eating, score, HUD, player sprite in both styles, the events contract.

**Out of scope:** ghosts, lives loss, death animation, level progression beyond emitting `level-clear`, sound, title screen, high-score persistence.

## Edge cases and failure paths

- Opposite-direction reversal is applied immediately, not at the next tile.
- Pressing a direction into a wall keeps the buffer until a legal turn or a new press.
- Large `dt` (window was hidden) → clamp accumulated time to 250 ms so the player does not tunnel through walls.
- Key auto-repeat must not stutter movement: track pressed/released, not key events.

## Affected areas

`lib/game.mjs`, `lib/player.mjs`, `lib/speeds.mjs`, `lib/input.mjs`, `tests/player.test.mjs`, `tests/game.test.mjs`, `app/Main.qml` (loop, keys), `app/render/Sprites.js`, `app/render/Hud.js`.

## Open questions

None.

## Verification

- `node --test tests/`: scripted input sequences traverse the maze; pellet count reaches zero and `level-clear` fires; wall collision never occurs across the speed table.
- Manual: play a full pellet clear in both styles.
