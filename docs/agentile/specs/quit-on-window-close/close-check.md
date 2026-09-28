# close-check.md — before/after for `tools/close-check.sh`

Recorded 2026-09-28. All runs use a scratch `HOME` (never `~/.local/state/pacman`)
and touch only the pid each run started (`kill` of `$!`, never a compositor
close). See the plan's "Amendment 2026-09-28" for why: a first attempt at this
check drove `hyprctl eval 'return hl.dispatch(hl.dsp.window.close())'` with no
target, which closed Keith's focused window (a running Claude session), not
the game. `tools/close-check.sh` never touches `hyprctl dispatch`,
`killactive`, `hl.dsp.window.close(...)` or any other compositor close/kill
since; it exercises the close by driving the game's own `FloatingWindow` to
`visible = false` from inside the process, via a new `PACMAN_DEBUG_KEYS`
token, `closewin` (see `app/Main.qml`'s `keyScript`), the same hook a
compositor close would trigger.

**Which hook actually fires:** `onVisibleChanged` (`window.visible = false`
from `closewin` is picked up by `FloatingWindow`'s own `onVisibleChanged`),
logged every run as `Main: quitting (window closed: visibleChanged)`.
`Quickshell.onLastWindowClosed` never fired first in any run recorded below;
both hooks stay wired regardless (the `quitting` guard makes a second no-op).

## Before (unfixed): window closes, process keeps running

Reproduced by taking the fixed `app/Main.qml` and removing only the two
close hooks (`Connections { target: Quickshell ... }` and
`onVisibleChanged: ...`), so `closewin` still drives `visible = false` (proving
the mechanism) but nothing reacts to it — exactly the original bug (a
compositor close hides the window; `qs` keeps running). Default mode
(`tools/close-check.sh`, close on the title):

```
close-check: scratch HOME /tmp/pacman-close-check.3BHMJB
close-check: launched pid 1357521 (log: /tmp/pacman-close-check.3BHMJB/qs.log)
close-check: window present for pid 1357521
close-check: FAIL pid 1357521 still alive 19.868s after closewin
...
  INFO qml: Debug: closewin on title at tick 0
  INFO qml: Debug: fps 60 ... screen title page roll-call idle 142 ...
  INFO qml: Debug: fps 60 ... screen title page high-scores idle 318 ...
  INFO qml: Debug: flow title -> ready (demo) at tick 0 score 0
  INFO qml: Debug: flow ready (demo) -> playing (demo) at tick 120 score 0
  INFO qml: Debug: event {"type":"pellet",...} tick 124 score 10 ...
  ... (the attract demo keeps running behind the hidden window; score
      climbs past 750 before the check's 20 s cap gives up)
close-check: cleanup killing leftover pid 1357521
```

FAIL, as expected: the window disappears (`visible = false` took effect) but
`qs` runs on windowless — even the attract demo keeps advancing — exactly
"Audio Continues After App Quit" (source_inbox) and the three stacked
windowless processes Keith saw on 2026-09-28. The check's own cleanup trap
killed the leftover pid; nothing else was touched.

## After (fixed): both modes pass

Default mode (close on the title):

```
close-check: scratch HOME /tmp/pacman-close-check.FdqPHY
close-check: launched pid 1362858 (log: /tmp/pacman-close-check.FdqPHY/qs.log)
close-check: window present for pid 1362858
close-check: PASS pid 1362858 exited 0.103s after closewin
...
  INFO qml: Debug: closewin on title at tick 0
  INFO qml: Main: quitting (window closed: visibleChanged)
```

`--score` mode (play a little, close mid-round with the siren looping,
assert the high-score row):

```
close-check: scratch HOME /tmp/pacman-close-check.9qjk5k
close-check: launched pid 1365688 (log: /tmp/pacman-close-check.9qjk5k/qs.log)
close-check: window present for pid 1365688
close-check: PASS pid 1365688 exited 0.001s after closewin
close-check: PASS highscore.json row: {"initials":"---","score":40,"level":1}
...
  INFO qml: Debug: event {"type":"pellet","tile":{"x":9,"y":23}} tick 151 score 40 ...
  INFO qml: Debug: closewin on playing at tick 456
  INFO qml: Settings: high score --- 40 level 1 saved to /tmp/pacman-close-check.9qjk5k/.local/state/pacman/highscore.json
  INFO qml: Main: window closed, saved --- 40 to the high-score table
  INFO qml: Main: quitting (window closed: visibleChanged)
```

Muted (a scratch `settings.json` of `{"muted": true}`, close on the title):

```
muted-check: launched pid 1373660
muted-check: PASS pid 1373660 exited while muted
```

## Regression: q, Escape on the title (AC "q, game-over and level-clear behave exactly as before")

`q` mid-game still records nothing (README "High scores" is unchanged: only
a finished game earns a row):

```
=== q mid-game (no score recorded) (pid 1374731) ===
  INFO qml: Debug: event {"type":"ghost-exit","ghost":"pinky"} tick 173 score 40 ...
  INFO qml: Debug: key q on playing at tick 179
  INFO qml: Main: quitting (key)
q mid-game (no score recorded): PASS pid 1374731 exited
q mid-game (no score recorded): highscore.json not written (expected for q mid-game)
```

Escape on the title:

```
=== Escape on title (pid 1375000) ===
  INFO qml: Debug: key Escape on title at tick 0
  INFO qml: Main: quitting (key)
Escape on title: PASS pid 1375000 exited
```

Level-clear and the existing game-over -> initials -> save path are untouched
in code (only `quit()` gained `shutdown()`, and the `flow`/`game` `node --test`
suites already cover level-clear); `tests/flow.test.mjs`'s `closeRow` cases
cover the pure decision for every screen. `node --test tests/*.test.mjs`:
302 passed, 0 failed.
