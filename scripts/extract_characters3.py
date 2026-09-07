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
THRESH = 12

def crop_generous(row, col, pad_frac=0.28):
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

def focus_mask(crop_bgr, thresh=THRESH):
    gray = cv2.cvtColor(crop_bgr, cv2.COLOR_BGR2GRAY)
    lap = cv2.Laplacian(gray, cv2.CV_32F, ksize=3)
    energy = cv2.blur(np.abs(lap), (9, 9))
    fg = (energy > thresh).astype(np.uint8) * 255
    return fg

def clean_mask(fg):
    h, w = fg.shape
    kernel_close = np.ones((17, 17), np.uint8)
    closed = cv2.morphologyEx(fg, cv2.MORPH_CLOSE, kernel_close, iterations=2)
    contours, _ = cv2.findContours(closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    if not contours:
        return np.zeros_like(fg)
    largest = max(contours, key=cv2.contourArea)
    solid = np.zeros((h, w), dtype=np.uint8)
    cv2.drawContours(solid, [largest], -1, 255, thickness=-1)
    # reclaim a thin edge that closing may have eroded, then smooth
    solid = cv2.dilate(solid, np.ones((5, 5), np.uint8), iterations=1)
    return solid

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
        fg = focus_mask(crop)
        solid = clean_mask(fg)
        alpha = cv2.GaussianBlur(solid, (7, 7), 0)

        b, g, r = cv2.split(crop)
        rgba = cv2.merge([r, g, b, alpha])
        rgba = autocrop_rgba(rgba, pad=8)

        out_path = os.path.join(OUT_DIR, f"char-{idx}.png")
        cv2.imwrite(out_path, cv2.cvtColor(rgba, cv2.COLOR_RGBA2BGRA))
        print(idx, rgba.shape)

print("done")
