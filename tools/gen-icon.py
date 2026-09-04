#!/usr/bin/env python3
"""Generate assets/icon.png: a 256x256 pixel-art Pac-Man for the desktop file.

A 16x16 design scaled 16x with nearest-neighbour, RGBA on transparent. The
PNG is written with zlib + struct only (no PIL on Omarchy) and the output is
byte-for-byte deterministic, so tests/icon.test.mjs regenerates it and fails
when the committed file drifts. Rerun after editing the grid:

    python3 tools/gen-icon.py            # writes assets/icon.png
    python3 tools/gen-icon.py out.png    # writes elsewhere (the test does this)

The yellow below is a literal on purpose: the icon is a static asset the app
launcher shows before the game runs, not app chrome, so it cannot follow the
Omarchy theme the way every colour inside the game does (CLAUDE.md rule).
"""

import struct
import sys
import zlib
from pathlib import Path

SIZE = 256
SCALE = 16

# Facing right, mouth open, one-pixel darker outline, one eye.
GRID = [
    ".....oooooo.....",
    "...oo######oo...",
    "..o##########o..",
    ".o#######e###o..",
    ".o#########oo...",
    "o#########o.....",
    "o########o......",
    "o#######o.......",
    "o#######o.......",
    "o########o......",
    "o#########o.....",
    ".o#########oo...",
    ".o###########o..",
    "..o##########o..",
    "...oo######oo...",
    ".....oooooo.....",
]

# Neutral yellow: not a theme colour (see the module docstring).
PALETTE = {
    ".": (0, 0, 0, 0),
    "#": (255, 204, 0, 255),
    "o": (176, 128, 0, 255),
    "e": (40, 30, 0, 255),
}


def chunk(kind, data):
    body = kind + data
    return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)


def render():
    assert len(GRID) == SIZE // SCALE and all(len(row) == SIZE // SCALE for row in GRID)
    raw = bytearray()
    for row in GRID:
        line = bytearray(b"\x00")  # filter type 0 (None) for the row
        for cell in row:
            line += bytes(PALETTE[cell]) * SCALE
        raw += line * SCALE
    return bytes(raw)


def png(raw):
    ihdr = struct.pack(">IIBBBBB", SIZE, SIZE, 8, 6, 0, 0, 0)  # 8-bit RGBA
    return b"".join([
        b"\x89PNG\r\n\x1a\n",
        chunk(b"IHDR", ihdr),
        chunk(b"IDAT", zlib.compress(raw, 9)),
        chunk(b"IEND", b""),
    ])


def main(argv):
    root = Path(__file__).resolve().parent.parent
    out = Path(argv[1]) if len(argv) > 1 else root / "assets" / "icon.png"
    out.write_bytes(png(render()))
    print(f"wrote {out} ({SIZE}x{SIZE})")


if __name__ == "__main__":
    main(sys.argv)
