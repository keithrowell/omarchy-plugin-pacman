#!/usr/bin/env bash
# Scripted close check for spec quit-on-window-close (docs/agentile/specs/
# quit-on-window-close/SPEC.md). Launches bin/pacman under a scratch HOME
# (never the real ~/.local/state/pacman, which is shared with any other
# instance), closes the window with `hyprctl dispatch closewindow`, and
# asserts the qs pid is gone within 2 s. Needs a running Hyprland session.
#
# Usage:
#   tools/close-check.sh            # close on the title; no score assertion
#   tools/close-check.sh --score    # drive a few keys unattended (Hyprland
#                                    # blocks virtual keyboards, so this is
#                                    # PACMAN_DEBUG_KEYS, not a real input
#                                    # device), close mid-round, and assert a
#                                    # qualifying "---" row landed in
#                                    # highscore.json
#
# Never touches any pid but the one this script started (Keith may be
# running his own instance, and omarchy-shell is also Quickshell): no
# `pkill`/`killall` of qs, ever.
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
  # land on a zero-tick frame) move Pac-Man into a few pellets; the final
  # pause leaves the siren looping when the window is closed mid-round.
  (cd "$ROOT" && HOME="$SCRATCH" PACMAN_DEBUG=1 PACMAN_DEBUG_KEYS="Return,4000,Left,Left,3000" exec bin/pacman) >"$LOG" 2>&1 &
else
  (cd "$ROOT" && HOME="$SCRATCH" exec bin/pacman) >"$LOG" 2>&1 &
fi
PID=$!
echo "close-check: launched pid $PID (log: $LOG)"

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

if [ "$SCORE_MODE" = 1 ]; then
  sleep 6
else
  sleep 0.2
fi

CLOSE_START=$(date +%s.%N)
hyprctl dispatch closewindow "pid:$PID" >/dev/null

GONE=0
for _ in $(seq 1 20); do
  if ! kill -0 "$PID" 2>/dev/null; then
    GONE=1
    break
  fi
  sleep 0.1
done
CLOSE_END=$(date +%s.%N)
ELAPSED=$(awk -v a="$CLOSE_START" -v b="$CLOSE_END" 'BEGIN { printf "%.3f", b - a }')

if [ "$GONE" = 1 ]; then
  echo "close-check: PASS pid $PID exited ${ELAPSED}s after closewindow"
else
  echo "close-check: FAIL pid $PID still alive ${ELAPSED}s after closewindow"
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
