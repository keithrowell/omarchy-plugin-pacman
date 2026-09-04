---
title: Four ghosts with classic behaviour, lives and level progression
slug: ghosts
status: ready
depends_on: [player-movement]
type: feature
route: background
business_value: high
technical_certainty: medium
created: 2026-09-04
outcome: a full game can be lost (three deaths) and won (level cleared and speed-up) against ghosts whose behaviour matches the documented Pac-Man rules
claimed_by:
label:
claimed_at:
---

# Four ghosts with classic behaviour, lives and level progression

## Problem / why now

Ghosts are the game. Without them there is no danger, no power-pellet payoff, no
lives. Their personalities are what make the original feel right, and they are
well documented (the Pac-Man Dossier), so the risk is in getting the details
faithful, not in discovering them.

## Acceptance criteria

- [ ] `lib/ghosts.mjs`: four ghosts with the classic targeting — Blinky targets the player tile; Pinky four tiles ahead (with the original "up" offset quirk reproduced deliberately); Inky the vector from Blinky through two tiles ahead of the player, doubled; Clyde chases until within 8 tiles then retreats to his corner. Colours: `Theme.red`, `Theme.magenta`, `Theme.cyan`, `Theme.orange`.
- [ ] Movement rules: ghosts choose a direction at each tile centre by minimum straight-line distance to target with tie-break order up, left, down, right; never reverse except on mode change; cannot turn up at the four marked "no-up" tiles; slower in tunnels.
- [ ] Mode schedule per level (`lib/modes.mjs`): scatter/chase phases with the original timings for levels 1, 2–4, 5+; `scatter` targets the four corners; a mode switch forces a reversal.
- [ ] Frightened: power pellet → ghosts reverse, move slowly and randomly (seeded RNG in state), drawn in `Theme.blue` then flashing `Theme.foreground` for the last two seconds; duration from the level table; eating a ghost scores 200/400/800/1600 per pellet chain and emits `{ type: "ghost-eaten", chain }`; the eaten ghost becomes eyes, returns to the house at speed, and re-emerges.
- [ ] Ghost house: Pinky, Inky and Clyde start inside and are released by the pellet-counter rule (personal dot limits, plus a global timer when no pellet is eaten for 4 s); Blinky starts outside. "Cruise Elroy" speed-up for Blinky at the level's remaining-pellet thresholds.
- [ ] Collision: same tile as a non-frightened ghost → `{ type: "death" }`; the death animation plays (the wedge's mouth widens over 12 steps until Pac-Man vanishes, then a small burst of `Theme.yellow` dots), a life is lost, the board resets positions; three lives, extra life at 10,000; zero lives → `{ type: "game-over" }`.
- [ ] Level clear: board flashes (walls alternate `Theme.blue` / `Theme.foreground` four times), next level loads with the speed and mode tables advanced; level indicator in the HUD.
- [ ] Ghost sprites in `app/render/Sprites.js`, native units: 14-px dome body with a wavy hem alternating between two frames, eyes with pupils offset by direction, frightened face (`Theme.blue` body, `Theme.foreground` features, flashing), and eyes-only when eaten. One routine for both stage modes (ADR-0002).
- [ ] Every rule above has a `node --test` case driven by scripted states, including a determinism test (same seed and inputs → identical event log).

## Scope boundary

**In scope:** ghost AI, modes, frightened/eaten, house release, collisions, lives, death, level progression, ghost sprites, events.

**Out of scope:** sound, title/attract/game-over screens (game-flow), fruit, per-level maze changes.

## Edge cases and failure paths

- Player and ghost swapping tiles in one tick must still count as a collision (check both before and after the move).
- Two ghosts eaten in one frightened window: chain scoring resets on the next power pellet, not per ghost.
- Frightened timer expiring while a ghost is inside the house: it leaves in its normal state.
- Level 21+ (no frightened time) must not divide by zero or hang in the table lookups.
- Ghost speed exceeding one tile per tick at high levels: clamp movement to tile-by-tile stepping so decisions are never skipped.

## Affected areas

`lib/ghosts.mjs`, `lib/modes.mjs`, `lib/speeds.mjs`, `lib/game.mjs` (collisions, lives, level advance), `lib/rng.mjs`, `tests/ghosts.test.mjs`, `tests/modes.test.mjs`, `app/render/Sprites.js`.

## Open questions

- Exact original timing values are documented in the Pac-Man Dossier; the planner should transcribe them into `lib/modes.mjs` with a source comment rather than approximating. Certainty is "medium" only because of the volume of small rules, not any unknown.

## Verification

- `node --test tests/` covering each rule; determinism test.
- Manual: play until game over; eat a full chain of four ghosts; clear level 1 and confirm level 2 speeds.
