#!/usr/bin/env python3
"""Crop the engineering board into angular sectors for visual inspection."""
import math
from pathlib import Path
from PIL import Image

BOARD = Path(__file__).with_name("extracted") / "p03_Im1.jp2_caa357f6f286.png"
OUT_DIR = Path(__file__).with_name("cropped")
OUT_DIR.mkdir(exist_ok=True)

img = Image.open(BOARD)
w, h = img.size
print(f"Board size: {w}x{h}")
cx, cy = w / 2, h / 2
r_min, r_max = 160, 580

# 6 sectors, 60 deg each, slight overlap
deg2rad = math.pi / 180
sectors = []
for i in range(6):
    theta1 = (i * 60 - 32) * deg2rad
    theta2 = (i * 60 + 32) * deg2rad
    xs, ys = [], []
    for a in (theta1, theta2):
        for r in (r_min, r_max):
            xs.append(cx + r * math.cos(a))
            ys.append(cy + r * math.sin(a))
    # include extremes if arc spans axis
    for a in [0, math.pi/2, math.pi, 3*math.pi/2]:
        if theta1 <= a <= theta2:
            xs.append(cx + r_max * math.cos(a))
            ys.append(cy + r_max * math.sin(a))
    left, top = max(0, int(min(xs))), max(0, int(min(ys)))
    right, bottom = min(w, int(max(xs))), min(h, int(max(ys)))
    crop = img.crop((left, top, right, bottom))
    # scale up for readability
    scale = 1400 / crop.width
    crop = crop.resize((int(crop.width*scale), int(crop.height*scale)), Image.LANCZOS)
    out = OUT_DIR / f"sector_{i+1}.png"
    crop.save(out, optimize=True)
    print(f"Saved {out}: {crop.size}")

# central sun crop
sun_r = 150
sun_crop = img.crop((cx - sun_r, cy - sun_r, cx + sun_r, cy + sun_r))
sun_crop = sun_crop.resize((800, 800), Image.LANCZOS)
sun_out = OUT_DIR / "sun.png"
sun_crop.save(sun_out, optimize=True)
print(f"Saved {sun_out}: {sun_crop.size}")
