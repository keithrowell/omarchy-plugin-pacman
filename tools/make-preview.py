#!/usr/bin/env python3
"""Crop an F12 frame grab to its content box and write it as preview.png.

    python3 tools/make-preview.py [--blank TOP:BOTTOM] frame.png preview.png

The grab (PACMAN_DEBUG=1, F12) is the whole PixelStage, letterbox included,
at device resolution. This trims the letterbox: rows and columns that are
fully transparent, or, when the grab is opaque, that match the top-left
pixel (the window background), leaving just the stage. The PNG is decoded
and encoded with zlib + struct + numpy; there is no PIL on Omarchy.

PACMAN_DEBUG=1 also draws a debug line in the third HUD row (native rows
16-23), which is empty in play. `--blank TOP:BOTTOM` repaints those output
rows with the stage background so the preview shows what a normal run
shows: native rows times the block size the F12 log line reports, e.g.
`--blank 80:120` for "block 5 device px".

Run it right after the grab: frame.png is shared by every instance of the
game on the machine.
"""

import struct
import sys
import zlib

import numpy as np

SIGNATURE = b"\x89PNG\r\n\x1a\n"


def chunks(data):
    assert data[:8] == SIGNATURE, "not a PNG"
    pos = 8
    while pos < len(data):
        length, = struct.unpack(">I", data[pos:pos + 4])
        kind = data[pos + 4:pos + 8]
        yield kind, data[pos + 8:pos + 8 + length]
        pos += 12 + length


def unfilter(rows, channels):
    """Undo the per-row PNG filters (types 0-4); returns the pixel bytes."""
    height, stride = rows.shape[0], rows.shape[1] - 1
    out = np.zeros((height, stride), dtype=np.uint8)
    bpp = channels
    prev = np.zeros(stride, dtype=np.uint8)
    for y in range(height):
        kind = int(rows[y, 0])
        cur = rows[y, 1:]
        if kind == 0:  # None
            line = cur.copy()
        elif kind == 1:  # Sub: a running sum per channel, mod 256
            line = np.cumsum(cur.reshape(-1, bpp), axis=0, dtype=np.uint32).astype(np.uint8).reshape(-1)
        elif kind == 2:  # Up
            line = cur + prev
        elif kind == 3:  # Average: sequential in the left neighbour
            buf = bytearray(cur.tobytes())
            up = prev.tolist()
            for x in range(stride):
                left = buf[x - bpp] if x >= bpp else 0
                buf[x] = (buf[x] + ((left + up[x]) >> 1)) & 0xFF
            line = np.frombuffer(bytes(buf), dtype=np.uint8)
        elif kind == 4:  # Paeth: sequential in the left neighbour
            buf = bytearray(cur.tobytes())
            up = prev.tolist()
            for x in range(stride):
                a = buf[x - bpp] if x >= bpp else 0
                b = up[x]
                c = up[x - bpp] if x >= bpp else 0
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                pred = a if pa <= pb and pa <= pc else (b if pb <= pc else c)
                buf[x] = (buf[x] + pred) & 0xFF
            line = np.frombuffer(bytes(buf), dtype=np.uint8)
        else:
            raise ValueError(f"unknown filter type {kind} on row {y}")
        out[y] = line
        prev = line
    return out


def decode(data):
    width = height = None
    idat = bytearray()
    for kind, body in chunks(data):
        if kind == b"IHDR":
            width, height, depth, colour, _, _, interlace = struct.unpack(">IIBBBBB", body)
            assert depth == 8 and interlace == 0, "only 8-bit non-interlaced PNGs"
            channels = {2: 3, 6: 4}.get(colour)
            assert channels, f"unsupported colour type {colour} (need RGB or RGBA)"
        elif kind == b"IDAT":
            idat += body
    raw = np.frombuffer(zlib.decompress(bytes(idat)), dtype=np.uint8)
    rows = raw.reshape(height, 1 + width * channels)
    pixels = unfilter(rows, channels).reshape(height, width, channels)
    if channels == 3:
        alpha = np.full((height, width, 1), 255, dtype=np.uint8)
        pixels = np.concatenate([pixels, alpha], axis=2)
    return pixels


def content_box(pixels):
    """(top, bottom, left, right) of the pixels that are not letterbox."""
    alpha = pixels[:, :, 3]
    if alpha.min() < 255:
        mask = alpha > 0
    else:
        mask = np.any(pixels != pixels[0, 0], axis=2)
    ys = np.flatnonzero(mask.any(axis=1))
    xs = np.flatnonzero(mask.any(axis=0))
    assert ys.size and xs.size, "the grab is empty"
    return ys[0], ys[-1] + 1, xs[0], xs[-1] + 1


def chunk(kind, body):
    payload = kind + body
    return struct.pack(">I", len(body)) + payload + struct.pack(">I", zlib.crc32(payload) & 0xFFFFFFFF)


def encode(pixels):
    height, width, _ = pixels.shape
    filtered = np.concatenate([np.zeros((height, 1), dtype=np.uint8), pixels.reshape(height, -1)], axis=1)
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    return b"".join([
        SIGNATURE,
        chunk(b"IHDR", ihdr),
        chunk(b"IDAT", zlib.compress(filtered.tobytes(), 9)),
        chunk(b"IEND", b""),
    ])


def main(argv):
    args = argv[1:]
    blank = None
    if len(args) >= 2 and args[0] == "--blank":
        blank = tuple(int(v) for v in args[1].split(":"))
        args = args[2:]
    if len(args) != 2:
        print(__doc__.strip().splitlines()[2].strip(), file=sys.stderr)
        return 2
    pixels = decode(open(args[0], "rb").read())
    top, bottom, left, right = content_box(pixels)
    cropped = np.ascontiguousarray(pixels[top:bottom, left:right])
    note = ""
    if blank is not None:
        b_top, b_bottom = blank
        cropped[b_top:b_bottom, :] = cropped[b_top, 0]
        note = f", rows {b_top}:{b_bottom} blanked"
    open(args[1], "wb").write(encode(cropped))
    print(f"wrote {args[1]} ({right - left}x{bottom - top}, cropped from "
          f"{pixels.shape[1]}x{pixels.shape[0]} at x={left} y={top}{note})")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
