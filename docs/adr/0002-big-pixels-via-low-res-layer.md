---
number: 0002
title: One vector renderer; the arcade look comes from a low-resolution layer
status: accepted
date: 2026-09-04
---

# ADR-0002: One vector renderer; the arcade look comes from a low-resolution layer

## Status

accepted

## Context

The original Pac-Man is not ASCII art; it is ordinary shapes rasterised at
224×248 and shown with big, hard-edged pixels. Keith wants that exact look by
default and a smooth modern look as a toggle. Two hand-written renderers (bitmap
sprites versus vectors) would double the drawing code and drift apart.

Qt Quick can render any item subtree into an offscreen texture of a chosen size
(`layer.enabled`, `layer.textureSize`) and scale it up without filtering
(`layer.smooth: false`). A spike drew a Pac-Man wedge, a ghost dome, wall strokes,
pellets and text with the Canvas API at 224×248, upscaled 3×, and the screenshot
showed the arcade pixel look with no extra library. `qsb` from `qt6-shadertools`
is installed, so a CRT post-process `ShaderEffect` is possible later.

Libraries considered: web engines with pixel-perfect modes (PixiJS, Phaser) do
not run in QML; libretro's CRT shaders (crt-pi, crt-easymode, crt-lottes) are
GLSL and portable to a `ShaderEffect` when a CRT layer is wanted.

## Decision

A single Canvas-based renderer draws the game in native arcade units (224×248,
8-px tiles) with smooth vector primitives. A `PixelStage` component wraps it:

- **arcade** mode: `layer.textureSize` at native resolution, `layer.smooth: false`,
  integer scale to fit the window, letterboxed. Optional scanlines on top.
- **smooth** mode: the same drawing at full window resolution with fractional
  scale and anti-aliasing.

`g` toggles modes. `PixelStage` keeps no game knowledge so it can be extracted
into a reusable Quickshell component for other Omarchy apps.

*Amended 2026-09-04 (spec 0003):* the native stage is 224×288 — the 224×248 maze plus the original's three HUD rows above and two below (`BOARD_ORIGIN` in `lib/scale.mjs`); game coordinates stay maze-relative and renderers add the offset.

*Amended 2026-09-05 (spec 0001 scanlines-always-on):* scanlines are always drawn in arcade mode; the toggle and its setting were removed.

*Amended 2026-09-05 (spec 0003 remove-smooth-mode):* smooth mode and the `g` toggle were removed from the game; `PixelStage` keeps its `mode` property and smooth fit so the component stays reusable.

## Consequences

- Easier: one drawing path, sprites are small vector routines, theme recolouring
  is trivial, both modes are guaranteed to show the same state.
- Harder: exact original sprite silhouettes are approximations of the bitmaps;
  hand-pixelled sprite data can be added later if the approximation disappoints.
- Committed to: drawing in native units everywhere; DPI is handled by the stage,
  never by the game code.
