# Pacman for Omarchy

A Pac-Man game that runs as a standalone Omarchy app and wears the live theme.
Read `docs/agentile/brief.md` (imported below) and `docs/adr/` before working.

## Layout

- `shell.qml` (repo root) — the Quickshell config root; instantiates `app/Main.qml`. No symlinks: this is what lets `app/` reach `lib/` and `assets/` as real sibling directories (ADR-0001 amendment, spec 0001-publish-standalone).
- `app/` — QML: `Main.qml` (window, game loop, input), `Theme.qml` (colors.toml reader), `PixelStage.qml` (low-res layer + upscale), `Sfx.qml` (sound), `render/` (canvas drawing in native units).
- `lib/` — game rules as ES modules (`*.mjs`): maze, entities, ghost AI, state machine. No Qt imports here.
- `tests/` — `node --test` suites over `lib/`.
- `assets/` — vendored font, sprite data, generated `sfx/*.wav`; `tools/` — the sound generator.
- `bin/pacman` — launcher (`qs -p <repo root>`); `bin/install` — idempotent installer (desktop file, `omarchy-pacman` link, menu entry, requirements check), path-agnostic (every path it prints comes from its own checkout). The game is also installed as a dotfiles submodule under `~/.config/omarchy/plugins/com.keithrowell.pacman`; to put freshly shipped work in front of Keith, fast-forward that submodule from this checkout and re-run `bin/install` — the exact steps are in README "Install on Omarchy" → "Maintainer".

## Rules

- Every colour comes from `Theme` (parsed from `~/.local/state/omarchy/current/theme/colors.toml`). Never hard-code one.
- Game logic is pure and deterministic: `step(state, input, dt)` returns a new state plus an `events` list; QML only renders and plays sound.
- One renderer draws in native arcade units (224×288: the 224×248 maze plus the HUD rows above and below, ADR-0002 amendment). `app/PixelStage.qml` turns that into integer big pixels with scanlines (PixelStage keeps a smooth fit path for reuse, unused by the game); game code never knows the window size or DPI (ADR-0002).
- Run `node --test tests/*.test.mjs` before claiming anything works (Node 26 needs the file glob; a bare directory fails). Launch with `bin/pacman` to eyeball it.

## Agentile

This project runs the **Agentile loop** (via Agentile for Claude): capture → shape → spec → plan → build → verify → ship → learn. Work builds from a written, shaped spec — never from a prompt typed from memory.

### Where things live

The backlog lives under one configurable **Agentile directory** (`docs/agentile/` by default, set in `.agentile/config.md`); the layout under it is fixed:

- **Brief** (`docs/agentile/brief.md`) — the living project context: who it's for, the prioritised outcomes, constraints, non-goals. Business Value in triage is scored against it. Imported below so it loads every session.
- **Inbox** (`docs/agentile/inbox.md`) — one-line stubs awaiting shaping. Capture freely with `/ag-capture`.
- **Specs** (`docs/agentile/specs/`) — shaped, Ready-to-build specs (`ready` / `in_progress`). A spec is a flat `NNNN-<slug>.md` until planning, then a directory `NNNN-<slug>/` holding `SPEC.md`, `plan.md`, and supporting files. The Definition of Ready is `.agentile/shape.md`.
  - `specs/done/` — shipped specs.
  - `specs/abandoned/` — specs that were dropped (via `/ag-abandon`), each with the reason recorded.
- **ADRs** (`docs/adr/`) — the *why* behind significant decisions.
- **Config** (`.agentile/`) — this project's tailoring: `config.md` (paths + triage), `shape.md` (what Ready means), `gates.json` (deterministic build/test/lint/deploy commands), and the spec/ADR templates. Any loop stage can be further customised via `.agentile/<stage>.md` (playbook frontmatter: `delegate_to`, `also_run`, `human_checkpoint`).

### How to work

- An idea arrives → `/ag-capture <one line>`. Never lose an idea for lack of a place to put it.
- Ready to develop something → `/ag-shape` to interview it into a spec, then `/ag-plan` before any code — it writes `plan.md` beside the spec; review or amend that file, it is the approved plan. Shaping asks about `depends_on` by default — list any specs (by slug) that must ship before this one can be claimed.
- Order the ready queue with `/ag-prioritise` — an interactive session that proposes a rank (Business Value × Technical Certainty, dependencies respected), you adjust it, and it renames ready specs to `specs/NNNN-<slug>.md`. An unprefixed spec is not claimable. Shipped specs move to `specs/done/`. Pull the top item with `/ag-next` — safe for concurrent loops; the claim is atomic and session-stamped so it can be resumed with `claude --resume <id>`. If the queue is blocked on dependencies or has no prefixed specs, `/ag-next` tells you which. Check what's in flight with `/ag-wip`.
- Drop work that won't ship with `/ag-abandon <slug>` — it records why, walks the dependency chain, and offers to cascade-abandon (or unblock) anything that depended on it. Abandoned specs move to `specs/abandoned/`.
- Run the loop with **`/ag-loop`** — it works through the ready queue once, then stops (a single command can't sit and wait; Claude Code is turn-based). To keep it running continuously — waiting and starting on new work as it appears — use **`/loop /ag-loop`**. It pauses at plan for `foreground`/`spike` specs (review `plan.md`, reply approved) and for your sign-off before each ship.
- Build on a short-lived branch/worktree; run the gates in `.agentile/gates.json`; a fresh-context reviewer critiques the diff before merge.
- Integrate to trunk in small, reversible, flagged batches. Close the loop with `/ag-retro`.

### Rules

- Determinism over instruction: repeatable steps (build, test, lint, deploy) are commands in `.agentile/gates.json`, not hopeful sentences.
- Trust but verify: no agent output merges until it passes tests, static analysis, a security skim, and a human read of the diff.
- Measure flow, not output: if lead time does not drop, the constraint is upstream — fix that, not the agents.

@docs/agentile/brief.md
