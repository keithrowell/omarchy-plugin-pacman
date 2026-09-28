<!-- SNAPSHOT — not the source of truth.
     Spec quit-on-window-close read from Agentile Projects at 2026-09-28T11:23:10Z.
     Rank, claim and status live in the store; re-run /ag-plan to refresh.
     Never edit this file: edits are lost, and the store will not see them. -->
---
title: Quit and save when the game window is closed
slug: quit-on-window-close
status: in_progress
type: bug
route: background
rank: 1
created_at: 2026-09-28T11:19:51Z
tags: [lifecycle, sound]
outcome: Closing the Pacman window with SUPER+W leaves no qs process running and no sound playing, and a qualifying score is on the high-score table afterwards
claimed_by: b4e29312-3c62-4d68-ac7e-4b08acce72a8
claimed_at: 2026-09-28T11:21:18Z
claimed_by_member: keith@keithrowell.com
captured_by: keith@keithrowell.com
shaped_by: [keith@keithrowell.com]
source_inbox: Audio Continues After App Quit
---

# Quit and save when the game window is closed

## Problem / why now

Closing the game with SUPER+W (or any compositor close) only closes the `FloatingWindow` in `app/Main.qml`; the `qs -p <repo>` process keeps running, windowless, and the looping `SoundEffect`s in `app/Sfx.qml` (sirens, fright, eyes: `loops: SoundEffect.Infinite`) keep playing. Each relaunch adds another process, so soundtracks stack. Only `q` exits cleanly (`Qt.quit()`, `app/Main.qml:247`). Seen by Keith on 2026-09-28: three windowless processes (started 19:57, 21:15, 21:16) were alive at once. It also folds in the older file-inbox stub "Save the high score on window close (compositor kill / SUPER+W), not only game-over, level-clear and q", which shares the code path.

## Acceptance criteria

- [ ] A scripted check (under `tests/` or `tools/`, run by hand and recorded in the spec dir): launch `bin/pacman` with a scratch `HOME`, wait for the window, close it with `hyprctl dispatch closewindow pid:<pid>`, assert the `qs` pid is gone within 2 s. Fails before the fix, passes after.
- [ ] Closing the window mid-round with a score that qualifies for the table writes it to `highscore.json` (scratch HOME) before exit; the planner records which initials a close-without-entry uses.
- [ ] `q`, game-over and level-clear behave exactly as before.
- [ ] Any save-on-close decision logic that lands in `lib/` has a `node --test` case; `node --test tests/*.test.mjs` passes.

## Scope boundary

**In scope:** 

**Out of scope:** 

## Edge cases and failure paths

- The high-score FileView write is async: quitting in the same tick can lose it. Exit only after the save completes or fails (with a short timeout), never hang.
- A close during the initials screen, the attract demo or the title must still exit promptly.
- Muted state: nothing to stop, still exits.
- Never touch other `qs` processes (Keith may run several instances; omarchy-shell is also Quickshell).

## Affected areas



## Open questions



## Verification

The scripted close check before and after, the node suite, and a listen test: close mid-siren, silence immediately.
