#!/usr/bin/env python3
"""Extract 15 character sprites from a 5x3 grid sprite sheet, removing
the blurred background glow so each character sits on transparent bg.

Background-removal strategy: the source art has a smooth, heavily-blurred
radial background glow behind a much sharper/higher-contrast character.
A large-radius Gaussian blur of the crop closely reproduces the background
(since it's already smooth) but differs a lot from the character (sharp
edges/saturated detail get smoothed away). The per-pixel distance between
the original and this blurred version is therefore a strong foreground/
background discriminator, robust to the background's color varying across
the cell and from cell to cell (unlike a fixed corner-color-distance test).
"""

import os
import numpy as np
from PIL import Image, ImageFilter

SRC = "/sessions/upbeat-loving-darwin/mnt/app/public/characters.png"
OUT_DIR = "/sessions/upbeat-loving-darwin/mnt/app/public/characters"

COLS, ROWS = 5, 3
IMG_W, IMG_H = 1536, 1024
CELL_W = IMG_W / COLS   # 307.2
CELL_H = IMG_H / ROWS   # 341.33...

EXPAND_FRAC = 0.20    # expand 20% of cell dimension on each side
MAX_CROSS_FRAC = 0.5  # never cross more than halfway into neighbor cell

BG_BLUR_RADIUS = 18   # radius used to estimate the local background
D_TRANSPARENT = 10    # diff <= this => fully transparent (background)
D_OPAQUE = 35         # diff >= this => fully opaque (character)
ALPHA_BLUR_RADIUS = 2
AUTOCROP_PAD = 6
CONTACT_SHEET_PAD = 20


def nominal_bounds(row, col):
    x0 = col * CELL_W
    y0 = row * CELL_H
    return x0, y0, x0 + CELL_W, y0 + CELL_H


def expanded_bounds(row, col):
    x0, y0, x1, y1 = nominal_bounds(row, col)
    ex = min(CELL_W * EXPAND_FRAC, CELL_W * MAX_CROSS_FRAC)
    ey = min(CELL_H * EXPAND_FRAC, CELL_H * MAX_CROSS_FRAC)

    nx0 = max(0, x0 - ex)
    ny0 = max(0, y0 - ey)
    nx1 = min(IMG_W, x1 + ex)
    ny1 = min(IMG_H, y1 + ey)

    return int(round(nx0)), int(round(ny0)), int(round(nx1)), int(round(ny1))


def remove_background(crop_rgb):
    """crop_rgb: PIL Image RGB. Returns RGBA image with bg made transparent."""
    arr = np.asarray(crop_rgb).astype(np.float32)
    blurred = crop_rgb.filter(ImageFilter.GaussianBlur(radius=BG_BLUR_RADIUS))
    barr = np.asarray(blurred).astype(np.float32)

    diff = np.sqrt(((arr - barr) ** 2).sum(axis=2))

    alpha = np.clip((diff - D_TRANSPARENT) / (D_OPAQUE - D_TRANSPARENT), 0, 1) * 255
    alpha_img = Image.fromarray(alpha.astype(np.uint8))
    alpha_img = alpha_img.filter(ImageFilter.GaussianBlur(radius=ALPHA_BLUR_RADIUS))

    rgba = crop_rgb.convert("RGBA")
    r, g, b, _ = rgba.split()
    rgba = Image.merge("RGBA", (r, g, b, alpha_img))
    return rgba


def autocrop(rgba, pad=AUTOCROP_PAD):
    alpha = rgba.split()[-1]
    mask = alpha.point(lambda a: 255 if a > 10 else 0)
    bbox = mask.getbbox()
    if bbox is None:
        return rgba
    x0, y0, x1, y1 = bbox
    w, h = rgba.size
    x0 = max(0, x0 - pad)
    y0 = max(0, y0 - pad)
    x1 = min(w, x1 + pad)
    y1 = min(h, y1 + pad)
    return rgba.crop((x0, y0, x1, y1))


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    sheet = Image.open(SRC).convert("RGB")
    assert sheet.size == (IMG_W, IMG_H), f"unexpected size {sheet.size}"

    results = []
    for row in range(ROWS):
        for col in range(COLS):
            idx = row * COLS + col
            bx0, by0, bx1, by1 = expanded_bounds(row, col)
            crop = sheet.crop((bx0, by0, bx1, by1))
            rgba = remove_background(crop)
            cropped = autocrop(rgba)
            out_path = os.path.join(OUT_DIR, f"char-{idx}.png")
            cropped.save(out_path)
            results.append((idx, cropped.size, out_path))
            print(f"char-{idx}: crop box=({bx0},{by0},{bx1},{by1}) "
                  f"final size={cropped.size}")

    max_w = max(sz[0] for _, sz, _ in results)
    max_h = max(sz[1] for _, sz, _ in results)
    cell_w = max_w + CONTACT_SHEET_PAD * 2
    cell_h = max_h + CONTACT_SHEET_PAD * 2
    sheet_w = cell_w * COLS
    sheet_h = cell_h * ROWS

    debug = Image.new("RGB", (sheet_w, sheet_h), (128, 128, 128))
    for idx, sz, path in results:
        row = idx // COLS
        col = idx % COLS
        img = Image.open(path).convert("RGBA")
        cx = col * cell_w + (cell_w - img.width) // 2
        cy = row * cell_h + (cell_h - img.height) // 2
        debug.paste(img, (cx, cy), img)

    debug_path = os.path.join(OUT_DIR, "_debug_preview.png")
    debug.save(debug_path)
    print(f"Saved debug preview: {debug_path} size={debug.size}")


if __name__ == "__main__":
    main()
