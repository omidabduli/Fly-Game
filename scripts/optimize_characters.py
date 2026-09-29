#!/usr/bin/env python3
"""Turns the full-size character PNGs in assets/characters/<name>/ into small WebP files
in public/characters/<name>/ (the ones the game loads).

Usage:  python3 scripts/optimize_characters.py
Needs:  pip install pillow
"""
import pathlib
from PIL import Image

SRC = pathlib.Path(__file__).resolve().parent.parent / "assets" / "characters"
DST = pathlib.Path(__file__).resolve().parent.parent / "public" / "characters"
# the game draws the sprites at most ~400 px wide on screen (x2 on retina), so 640 x 960 is plenty
SIZE = (640, 960)

count = 0
for png in sorted(SRC.rglob("*.png")):
    rel = png.relative_to(SRC)
    out = DST / rel.with_suffix(".webp")
    out.parent.mkdir(parents=True, exist_ok=True)
    if out.exists() and out.stat().st_mtime >= png.stat().st_mtime:
        continue
    im = Image.open(png).convert("RGBA")
    # poses on a taller canvas (e.g. standing) keep their aspect ratio at the same width
    h = round(SIZE[0] * im.height / im.width)
    im = im.resize((SIZE[0], h), Image.LANCZOS)
    im.save(out, "WEBP", quality=88, method=6, alpha_quality=95)
    count += 1
    print("wrote", out.relative_to(DST.parent.parent), f"{out.stat().st_size // 1024} KB")
print(f"{count} file(s) converted")
