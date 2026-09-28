<!-- SNAPSHOT — not the source of truth.
     Spec panel-port read from Agentile Projects at 2026-09-28T10:29:04Z.
     Rank, claim and status live in the store; re-run /ag-plan to refresh.
     Never edit this file: edits are lost, and the store will not see them. -->
---
title: Run Pacman as an omarchy-shell panel
slug: panel-port
status: in_progress
type: feature
route: foreground
business_value: high
technical_certainty: medium
rank: 1
created_at: 2026-09-28T10:19:48Z
tags: [shell, packaging]
outcome: omarchy-shell shell toggle com.keithrowell.pacman opens a playable, theme-coloured game in a centered panel, Escape closes it, and reopening resumes the paused round
claimed_by: b4e29312-3c62-4d68-ac7e-4b08acce72a8
claimed_at: 2026-09-28T10:23:20Z
claimed_by_member: keith@keithrowell.com
captured_by: keith@keithrowell.com
shaped_by: [keith@keithrowell.com]
source_inbox: Run Pacman as an omarchy-shell panel
---

# Run Pacman as an omarchy-shell panel

## Problem / why now

Keith wants Pacman listed on the Omarchy plugin marketplace. The marketplace validator (omacom/omarchy-plugin-marketplace `scripts/build-catalog.mjs:784`, checked 2026-09-28) rejects a manifest whose `kinds` is empty; the only accepted kinds are bar, bar-widget, menu, overlay, panel and service. Pacman today is a standalone `qs -p` process (ADR-0001) with `"kinds": []`, so it cannot be listed. Keith does not want a bar icon, so the game becomes a **panel-only** plugin: it runs inside omarchy-shell and is opened with `omarchy-shell shell toggle com.keithrowell.pacman '{}'` from the Omarchy menu, an app launcher entry or a keybind. The standalone window is retired. This is the first of two specs; `marketplace-readiness` (hardening, README, submission) depends on it.

## Acceptance criteria

- [ ] `manifest.json` declares `"kinds": ["panel"]`, `"entryPoints": {"panel": "Panel.qml"}` and `"keepLoaded": true`; no bar-widget, no bar icon anywhere.
- [ ] The marketplace validator's `validateManifest`/`validateManifestFiles` rules pass for the repo (no symlinks, entry point is a blob, id lowercase), checked by running the marketplace's own validation locally.
- [ ] With the plugin enabled, `omarchy-shell shell toggle com.keithrowell.pacman '{}'` opens the game centered on the focused monitor, drawn at the largest integer pixel scale that fits, with scanlines, in the live theme's colours.
- [ ] The panel takes exclusive keyboard focus while open; arrows/hjkl/WASD, Enter, P (pause), M (mute) and the high-score initials entry all work as before.
- [ ] Escape closes the panel (via `shell.hide(id)`) and pauses the game; toggling it open again shows the same round, paused, and play resumes on input. The render loop does not run while hidden.
- [ ] Sounds play when QtMultimedia is available; when the `QtMultimedia` import fails the panel still loads and the game runs silent (sound components loaded through a `Loader`, as Quattroids does).
- [ ] Switching the Omarchy theme recolours the open game live; high scores and mute persist in `~/.local/state/pacman/` as today.
- [ ] `bin/pacman` no longer starts its own `qs` window: it runs the toggle command (or is removed), and `bin/install` writes a `.desktop` file and prints an omarchy-menu entry whose action is the toggle command.
- [ ] ADR-0001 is amended (or superseded by a new ADR) recording the move from a standalone process to a panel and why.
- [ ] `node --test tests/*.test.mjs` passes; `lib/` keeps no Qt imports.
- [ ] Keith's installed copy (`~/.config/omarchy/plugins/com.keithrowell.pacman`, dotfiles submodule) is fast-forwarded, enabled and opens from his Omarchy menu.

## Scope boundary

**In scope:** Panel entry point and window (layer-shell or floating window, centered, exclusive focus), manifest changes, lifecycle (open/close/pause via `open()` and `shell.hide`), moving the game loop, input, PixelStage, Theme, Sfx and Settings under the panel, the silent-sound fallback, retiring the standalone launcher, `bin/install` launcher changes, the ADR, README usage section for launching.

**Out of scope:** Security hardening of file reads/writes, theme retry backoff, F12 grab path, README Removing section, untracking CLAUDE.md, marketplace submission (all in `marketplace-readiness`). Any bar widget. Gameplay or rendering changes. Gamepad. Replacing Theme.qml with the shell's `Color` singleton (it only exposes a few roles; keep reading colors.toml).

## Edge cases and failure paths

- `lib/*.mjs` imports inside omarchy-shell are unproven: no shell code or example plugin imports `.mjs`. Prove it first; if the shell's loader refuses them, fall back to a mechanical conversion approach the plan must name, without breaking `node --test`.
- omarchy-shell is shared by the whole desktop: the game must not hold the frame loop, timers or audio running while hidden, and must not block on file I/O.
- Summon refuses a plugin that is not enabled; the README and `bin/install` output must say to enable it.
- A hidden panel stops rendering but plain `Timer`s keep firing; every timer that drives game time pauses on close.
- Multi-monitor: open on the focused monitor; a monitor too small for 1x (224×288) still shows the game scaled down rather than cropped.
- Opening while already open is a toggle (closes); `open(payload)` ignores its payload.
- `PACMAN_DEBUG` / `PACMAN_DEBUG_KEYS` read the shell's environment now; keep a way to drive the game unattended for verification, or document the replacement.
- Keith often has the standalone game running from the lab checkout; after this ships, `bin/pacman` must not start a second shell.

## Affected areas

`manifest.json`, new `Panel.qml` (root), `shell.qml` (retire or keep only for development), `app/Main.qml` (window to panel content), `app/PixelStage.qml`, `app/Theme.qml`, `app/Sfx.qml` (Loader fallback), `app/Settings.qml`, `app/qmldir`, `bin/pacman`, `bin/install`, `README.md` (launching), `docs/adr/0001-standalone-quickshell-process.md` (amend) or a new ADR, `CLAUDE.md` layout notes, `tests/` if any lib seam changes.

## Open questions

- Does omarchy-shell's QML engine load `.mjs` ES modules from a plugin folder? First task of the plan answers it.
- Layer-shell `PanelWindow` with exclusive focus (Quattroids) vs `FloatingWindow` (Breakout): the plan picks one against the "centered, floating, exclusive keys" requirement.

## Verification

Node suite green. Manual run in omarchy-shell: toggle opens, play a round, Escape, reopen resumes, theme switch recolours, mute persists, silent run with QtMultimedia import forced to fail. Marketplace validator run locally against the pushed commit. F12 grab (or panel equivalent) of the title and play screens recorded with the theme name.
