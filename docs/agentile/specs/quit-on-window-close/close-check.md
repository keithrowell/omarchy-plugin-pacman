# close-check.md — before/after for `tools/close-check.sh`

Recorded 2026-09-28 (updated after review: `windowClosed()` now guards on
`quitting` itself, before `closeSave()`, and the evidence below covers the
double-signal and q-then-close races that guard fixes). All runs use a
scratch `HOME` (never `~/.local/state/pacman`) and touch only the pid each
run started (`kill` of `$!`, never a compositor close). See the plan's
"Amendment 2026-09-28" for why: a first attempt at this check drove
`hyprctl eval 'return hl.dispatch(hl.dsp.window.close())'` with no target,
which closed Keith's focused window (a running Claude session), not the
game. `tools/close-check.sh` never touches `hyprctl dispatch`, `killactive`,
`hl.dsp.window.close(...)` or any other compositor close/kill since; it
exercises the close by driving the game's own `FloatingWindow` from inside
the process, via two new `PACMAN_DEBUG_KEYS` tokens on `app/Main.qml`'s
`keyScript` — `closewin` (sets `visible = false`, the same hook a compositor
close drives) and `qthenclose` (quits exactly as `q` would, then simulates a
second, stray close signal in the same synchronous call).

**Which hook actually fires:** `onVisibleChanged` (`window.visible = false`
from `closewin` is picked up by `FloatingWindow`'s own `onVisibleChanged`),
logged every run as `Main: quitting (window closed: visibleChanged)`.
`Quickshell.onLastWindowClosed` never fired first in any run recorded below;
both hooks stay wired regardless (`windowClosed()`'s own `quitting` guard
makes a second call, from either hook, a no-op).

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

## After (fixed): all three modes pass

Default mode (close on the title):

```
close-check: mode default, scratch HOME /tmp/pacman-close-check.GdMjkf
close-check: launched pid 1418375 (log: /tmp/pacman-close-check.GdMjkf/qs.log)
close-check: window present for pid 1418375
close-check: PASS pid 1418375 exited 0.103s after Debug: closewin
...
  INFO qml: Debug: closewin on title at tick 0
  INFO qml: Main: quitting (window closed: visibleChanged)
```

`--score` mode (play a little, close mid-round with the siren looping;
`closewin` also fires a *second*, simulated `lastWindowClosed` right after —
a real SUPER+W often raises both signals for the same close — proving
`windowClosed()`'s own `quitting` guard stops the second call from re-running
`closeSave()`):

```
close-check: mode --score, scratch HOME /tmp/pacman-close-check.d7Yevs
close-check: launched pid 1418916 (log: /tmp/pacman-close-check.d7Yevs/qs.log)
close-check: window present for pid 1418916
close-check: PASS pid 1418916 exited 0.104s after Debug: closewin
close-check: PASS highscore.json has exactly one row: [{"initials":"---","score":40,"level":1}]
...
  INFO qml: Debug: closewin on playing at tick 455
  INFO qml: Settings: high score --- 40 level 1 saved to /tmp/pacman-close-check.d7Yevs/.local/state/pacman/highscore.json
  INFO qml: Main: window closed, saved --- 40 to the high-score table
  INFO qml: Main: quitting (window closed: visibleChanged)
```

Exactly one `Settings: high score ...` / `Main: window closed, saved ...`
line — the simulated second `windowClosed("lastWindowClosed (simulated second
signal)")` call is a silent no-op (it returns before `closeSave()` even runs).

`--q-then-close` mode (`q` quits mid-round exactly as it always has — records
nothing — then, in the same synchronous call, simulates a stray
`lastWindowClosed` as if it arrived during `Qt.quit()`'s own teardown; must
not save either):

```
close-check: mode --q-then-close, scratch HOME /tmp/pacman-close-check.W5ZIXa
close-check: launched pid 1417172 (log: /tmp/pacman-close-check.W5ZIXa/qs.log)
close-check: window present for pid 1417172
close-check: PASS pid 1417172 exited 0.104s after Debug: qthenclose
close-check: PASS /tmp/pacman-close-check.W5ZIXa/.local/state/pacman/highscore.json was not written (q, then a stray close signal, saved nothing)
...
  INFO qml: Debug: event {"type":"pellet","tile":{"x":9,"y":23}} tick 151 score 40 ...
  INFO qml: Debug: qthenclose on playing at tick 457
  INFO qml: Main: quitting (key)
```

Only `Main: quitting (key)` is logged (the same as a plain `q`); the
simulated `windowClosed("lastWindowClosed (simulated post-quit)")` call
right after `window.quit()` hits the `quitting` guard immediately and never
reaches `closeSave()`.

Muted (a scratch `settings.json` of `{"muted": true}`, close on the title):

```
muted-check: launched pid 1421027
muted-check: PASS pid 1421027 exited while muted
```

## Regression: q, Escape on the title (AC "q, game-over and level-clear behave exactly as before")

`q` mid-game still records nothing (README "High scores" is unchanged: only
a finished game earns a row):

```
=== q mid-game (no score recorded) (pid 1420235) ===
q mid-game (no score recorded): PASS pid 1420235 exited
q mid-game (no score recorded): highscore.json not written (expected for q mid-game)
```

Escape on the title:

```
=== Escape on title (pid 1420544) ===
Escape on title: PASS pid 1420544 exited
```

Level-clear and the existing game-over -> initials -> save path are untouched
in code (only `quit()` gained `shutdown()`, and the `flow`/`game` `node --test`
suites already cover level-clear); `tests/flow.test.mjs`'s `closeRow` cases
cover the pure decision for every screen. `node --test tests/*.test.mjs`:
302 passed, 0 failed.

## Note on `exitWatchdog`

The 1.5 s `exitWatchdog` `Timer` is a fallback for a hang **after**
`Qt.quit()` is called (e.g. Qt itself failing to tear down) — it runs on the
same thread as `shutdown()`'s `Settings.flush()`, which blocks that thread,
so the watchdog cannot fire *during* a slow flush and does not bound its
worst case. Every run recorded above exits within ~0.1 s, so `flush()` is not
observed to be slow in practice; the watchdog is belt-and-braces for teardown
itself hanging, not a guaranteed 2 s ceiling on a stuck write.
