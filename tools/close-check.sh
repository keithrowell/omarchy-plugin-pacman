#!/usr/bin/env bash
# Scripted close check for spec quit-on-window-close (docs/agentile/specs/
# quit-on-window-close/SPEC.md, "Amendment 2026-09-28"). Launches bin/pacman
# under a scratch HOME with a PACMAN_DEBUG_KEYS script that ends in the
# "closewin" token, which drives the game's own FloatingWindow to
# visible=false from inside the process (the same hook a compositor window
# close drives) and asserts the pid this script started (`$!`) exits within
# 2 s.
#
# This script must NEVER ask the compositor to close a window: no
# `hyprctl dispatch closewindow`, `killactive`, `hl.dsp.window.close(...)` or
# any other compositor close/kill. A prior version of this check did, and it
# closed a window that was not this game's (Keith's focused terminal) — see
# the plan's "Amendment 2026-09-28". The only way this script ever ends a
# process is `kill` of the exact pid it started.
#
# Usage:
#   tools/close-check.sh            # close on the title; no score assertion
#   tools/close-check.sh --score    # play a few ticks first, close mid-round
#                                    # with the siren looping, and assert a
#                                    # qualifying "---" row landed in
#                                    # highscore.json
set -euo pipefail

ROOT="$(cd "$(dirname "$(readlink -f "$0")")/.." && pwd)"
SCORE_MODE=0
if [ "${1:-}" = "--score" ]; then
  SCORE_MODE=1
fi

SCRATCH="$(mktemp -d "${TMPDIR:-/tmp}/pacman-close-check.XXXXXX")"
mkdir -p "$SCRATCH/.local/state/pacman"
LOG="$SCRATCH/qs.log"
PID=""

cleanup() {
  if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; then
    echo "close-check: cleanup killing leftover pid $PID"
    kill "$PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

echo "close-check: scratch HOME $SCRATCH"

if [ "$SCORE_MODE" = 1 ]; then
  # Return starts the game; two double-tapped Left presses (a single tap can
  # land on a zero-tick frame) move Pac-Man into a few pellets; a long pause
  # leaves the siren looping, then closewin closes the window mid-round.
  KEYS="Return,4000,Left,Left,3000,closewin"
else
  # closewin fires 1.5 s after launch, straight from the title.
  KEYS="closewin"
fi

(cd "$ROOT" && HOME="$SCRATCH" PACMAN_DEBUG=1 PACMAN_DEBUG_KEYS="$KEYS" exec bin/pacman) >"$LOG" 2>&1 &
PID=$!
echo "close-check: launched pid $PID (log: $LOG)"

# Wait for the window (title screen) so the timing below starts from a
# running game, not a still-loading process.
FOUND=0
for _ in $(seq 1 100); do
  if command -v hyprctl >/dev/null 2>&1 && command -v jq >/dev/null 2>&1 \
      && hyprctl clients -j 2>/dev/null | jq -e --argjson p "$PID" 'any(.[]; .pid == $p)' >/dev/null 2>&1; then
    FOUND=1
    break
  fi
  if ! kill -0 "$PID" 2>/dev/null; then
    echo "close-check: FAIL pid $PID exited before its window appeared"
    cat "$LOG"
    exit 1
  fi
  sleep 0.1
done
if [ "$FOUND" != 1 ]; then
  echo "close-check: FAIL window for pid $PID never appeared within 10 s"
  cat "$LOG"
  exit 1
fi
echo "close-check: window present for pid $PID"

# The debug key script's own timing drives when closewin fires (see KEYS
# above); wait for its log line, then clock the exit from there, so this
# measures the same 2 s the spec's AC means (from the close to the pid gone),
# not the debug key script's own lead-in delay.
CLOSE_START=""
GONE=0
for _ in $(seq 1 200); do
  if [ -z "$CLOSE_START" ] && grep -q "Debug: closewin" "$LOG" 2>/dev/null; then
    CLOSE_START=$(date +%s.%N)
  fi
  if ! kill -0 "$PID" 2>/dev/null; then
    GONE=1
    break
  fi
  sleep 0.1
done
CLOSE_END=$(date +%s.%N)
if [ -z "$CLOSE_START" ]; then
  echo "close-check: FAIL closewin never fired (pid $PID, see log)"
  cat "$LOG"
  exit 1
fi
ELAPSED=$(awk -v a="$CLOSE_START" -v b="$CLOSE_END" 'BEGIN { printf "%.3f", b - a }')

if [ "$GONE" = 1 ] && awk -v e="$ELAPSED" 'BEGIN { exit !(e <= 2.0) }'; then
  echo "close-check: PASS pid $PID exited ${ELAPSED}s after closewin"
elif [ "$GONE" = 1 ]; then
  echo "close-check: FAIL pid $PID exited but took ${ELAPSED}s after closewin (> 2 s)"
  exit 1
else
  echo "close-check: FAIL pid $PID still alive ${ELAPSED}s after closewin"
  cat "$LOG"
  exit 1
fi

STATUS=0
if [ "$SCORE_MODE" = 1 ]; then
  HS="$SCRATCH/.local/state/pacman/highscore.json"
  if [ ! -f "$HS" ]; then
    echo "close-check: FAIL $HS was not written"
    cat "$LOG"
    STATUS=1
  elif jq -e '.highScores[0].initials == "---" and .highScores[0].score > 0' "$HS" >/dev/null 2>&1; then
    echo "close-check: PASS highscore.json row: $(jq -c '.highScores[0]' "$HS")"
  else
    echo "close-check: FAIL highscore.json did not have the expected row: $(cat "$HS")"
    cat "$LOG"
    STATUS=1
  fi
fi

if [ "$STATUS" = 0 ]; then
  echo "close-check: log tail:"
  tail -n 20 "$LOG"
  rm -rf "$SCRATCH"
else
  echo "close-check: scratch kept for diagnosis: $SCRATCH"
fi

exit "$STATUS"
