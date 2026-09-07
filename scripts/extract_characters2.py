import cv2
import numpy as np
import os

SRC = "public/characters.png"
OUT_DIR = "public/characters"
os.makedirs(OUT_DIR, exist_ok=True)

img = cv2.imread(SRC, cv2.IMREAD_COLOR)
H, W = img.shape[:2]
COLS, ROWS = 5, 3
cell_w, cell_h = W / COLS, H / ROWS
TOL = 20

def crop_generous(row, col, pad_frac=0.22):
    x0 = col * cell_w
    y0 = row * cell_h
    x1 = x0 + cell_w
    y1 = y0 + cell_h
    px = cell_w * pad_frac
    py = cell_h * pad_frac
    x0 = max(0, x0 - px)
    y0 = max(0, y0 - py)
    x1 = min(W, x1 + px)
    y1 = min(H, y1 + py)
    return int(x0), int(y0), int(x1), int(y1)

def bg_mask_for(crop_bgr, tol=TOL):
    h, w = crop_bgr.shape[:2]
    smooth = cv2.GaussianBlur(crop_bgr, (3, 3), 0)
    diff = (tol, tol, tol)
    border_points = []
    step = max(1, w // 60)
    for x in range(0, w, step):
        border_points.append((x, 0))
        border_points.append((x, h - 1))
    step = max(1, h // 60)
    for y in range(0, h, step):
        border_points.append((0, y))
        border_points.append((w - 1, y))
    work = smooth.copy()
    flood_mask = np.zeros((h + 2, w + 2), dtype=np.uint8)
    for (x, y) in border_points:
        if flood_mask[y + 1, x + 1] != 0:
            continue
        cv2.floodFill(
            work, flood_mask, (x, y), (255, 0, 255),
            loDiff=diff, upDiff=diff,
            flags=4 | cv2.FLOODFILL_MASK_ONLY | (255 << 8),
        )
    return flood_mask[1:-1, 1:-1] > 0  # True where background

def autocrop_rgba(rgba, pad=8):
    alpha = rgba[:, :, 3]
    ys, xs = np.where(alpha > 15)
    if len(xs) == 0:
        return rgba
    x0, x1 = max(0, xs.min() - pad), min(rgba.shape[1], xs.max() + pad + 1)
    y0, y1 = max(0, ys.min() - pad), min(rgba.shape[0], ys.max() + pad + 1)
    return rgba[y0:y1, x0:x1]

for row in range(ROWS):
    for col in range(COLS):
        idx = row * COLS + col
        x0, y0, x1, y1 = crop_generous(row, col)
        crop = img[y0:y1, x0:x1]
        is_bg = bg_mask_for(crop)

        fg_mask = np.where(is_bg, 0, 255).astype(np.uint8)
        kernel = np.ones((3, 3), np.uint8)
        fg_mask = cv2.morphologyEx(fg_mask, cv2.MORPH_CLOSE, kernel, iterations=2)
        fg_mask = cv2.morphologyEx(fg_mask, cv2.MORPH_OPEN, kernel, iterations=1)

        alpha = cv2.GaussianBlur(fg_mask, (5, 5), 0)

        b, g, r = cv2.split(crop)
        rgba = cv2.merge([r, g, b, alpha])
        rgba = autocrop_rgba(rgba, pad=8)

        out_path = os.path.join(OUT_DIR, f"char-{idx}.png")
        cv2.imwrite(out_path, cv2.cvtColor(rgba, cv2.COLOR_RGBA2BGRA))
        print(idx, rgba.shape)

print("done")
