# Spike: big pixels from a low-res layer (2026-09-04)

`spike-pixelstage.qml` draws a Pac-Man wedge, a ghost dome, wall strokes, pellets
and text with the Canvas API at 224×248 inside an Item with `layer.enabled`,
`layer.textureSize: Qt.size(224, 248)`, `layer.smooth: false`, scaled 3×.
`spike-pixelstage.png` is the `grabToImage` result: hard-edged 3×3 pixel blocks,
the original arcade look, no library. Run with `qs -p spike-pixelstage.qml`.

Findings that shaped the spec:
- `Canvas` has no `roundRect`; draw rounded corners with `arcTo`.
- `grabToImage` must target an `Item` (the stage), not the window's content item.
- The grab is in device pixels (DPI scale applied), so the stage must size its
  texture in native units and scale in device pixels.
- A first spike also confirmed `FrameAnimation` holds 60 fps, `SoundEffect`
  plays generated WAVs, and `FileView` reads `colors.toml` live.
