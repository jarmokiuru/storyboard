# Makes samples/kitchen-plan.png: a generic plan of the SPEC §10 test kitchen, drawn like a scanned or
# photographed plan — paper margin around it and turned 3°, so lining it up in the app has something to do.
# Kitchen: 5.0 m west–east × 4.0 m north–south, door centred in the east wall, window centred in the south
# wall, a 1.4 × 0.9 m table in the middle. North is up. Standard library only.
#   python3 samples/make_kitchen_plan.py

import math
import struct
import zlib
from pathlib import Path

W, H = 1600, 1300          # picture size, px
PPM = 250                  # px per metre on the "paper"
RW, RD = 5.0, 4.0          # room inside, metres
WALL = 0.1                 # drawn wall thickness, metres (outside the inside faces)
TURN = math.radians(3)     # the paper is slightly turned
CX, CY = 800, 660          # where the room's centre lands in the picture

PAPER = (244, 241, 234)
WHITE = (255, 255, 255)
INK = (34, 34, 34)
GLASS = (150, 200, 240)
LINE = (120, 120, 120)


def colour(px, py):
    # Back from picture to room metres (x east, z south), undoing the turn.
    dx, dy = px - CX, py - CY
    x = (dx * math.cos(TURN) + dy * math.sin(TURN)) / PPM
    z = (-dx * math.sin(TURN) + dy * math.cos(TURN)) / PPM
    hw, hd = RW / 2, RD / 2
    inside = abs(x) <= hw and abs(z) <= hd
    in_wall = abs(x) <= hw + WALL and abs(z) <= hd + WALL and not inside
    if in_wall:
        if x > hw and abs(z) <= 0.45:
            return WHITE   # door opening, east wall, 0.9 m
        if z > hd and abs(x) <= 0.7:
            return GLASS   # window, south wall, 1.4 m
        return INK
    if inside:
        # Table outline, 1.4 × 0.9 m, 1.5 cm lines.
        tx, tz = abs(x), abs(z)
        if tx <= 0.7 and tz <= 0.45 and (tx >= 0.685 or tz >= 0.435):
            return LINE
        return WHITE
    return PAPER


def png(path, w, h, rows):
    def chunk(kind, data):
        c = kind + data
        return struct.pack(">I", len(data)) + c + struct.pack(">I", zlib.crc32(c) & 0xFFFFFFFF)
    raw = b"".join(b"\x00" + bytes(v for p in row for v in p) for row in rows)
    path.write_bytes(
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )


if __name__ == "__main__":
    out = Path(__file__).with_name("kitchen-plan.png")
    png(out, W, H, ([colour(x, y) for x in range(W)] for y in range(H)))
    print(out)
