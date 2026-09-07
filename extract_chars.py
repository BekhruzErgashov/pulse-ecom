import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage
import os, sys

SRC = "/sessions/upbeat-loving-darwin/mnt/app/public/characters.png"
OUTDIR = "/sessions/upbeat-loving-darwin/mnt/app/public/characters"
os.makedirs(OUTDIR, exist_ok=True)

img = Image.open(SRC).convert("RGB")
W, H = img.size
arr = np.array(img).astype(np.int32)

COLS, ROWS = 5, 3
CELL_W = W / COLS
CELL_H = H / ROWS

STEP_THRESH = 25  # tune
BORDER_RING = 4

def cell_bounds(idx, expand_frac):
    row = idx // COLS
    col = idx % COLS
    cx0, cy0 = col * CELL_W, row * CELL_H
    cx1, cy1 = cx0 + CELL_W, cy0 + CELL_H
    ccx, ccy = (cx0 + cx1) / 2, (cy0 + cy1) / 2
    ex, ey = CELL_W * expand_frac, CELL_H * expand_frac
    x0, y0, x1, y1 = cx0 - ex, cy0 - ey, cx1 + ex, cy1 + ey
    x0 = max(0, x0); y0 = max(0, y0)
    x1 = min(W, x1); y1 = min(H, y1)
    if col > 0:
        left_center_x = ccx - CELL_W
        mid = (ccx + left_center_x) / 2
        x0 = max(x0, mid)
    if col < COLS - 1:
        right_center_x = ccx + CELL_W
        mid = (ccx + right_center_x) / 2
        x1 = min(x1, mid)
    if row > 0:
        up_center_y = ccy - CELL_H
        mid = (ccy + up_center_y) / 2
        y0 = max(y0, mid)
    if row < ROWS - 1:
        down_center_y = ccy + CELL_H
        mid = (ccy + down_center_y) / 2
        y1 = min(y1, mid)
    return int(round(x0)), int(round(y0)), int(round(x1)), int(round(y1))


def region_grow_background(crop_arr, step_thresh=STEP_THRESH, border=BORDER_RING):
    h, w, _ = crop_arr.shape
    included = np.zeros((h, w), dtype=bool)
    from collections import deque
    q = deque()
    for y in range(h):
        for x in range(w):
            if y < border or y >= h - border or x < border or x >= w - border:
                if not included[y, x]:
                    included[y, x] = True
                    q.append((y, x))
    neighbors = [(-1,-1),(-1,0),(-1,1),(0,-1),(0,1),(1,-1),(1,0),(1,1)]
    while q:
        y, x = q.popleft()
        base_color = crop_arr[y, x]
        for dy, dx in neighbors:
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and not included[ny, nx]:
                diff = crop_arr[ny, nx] - base_color
                dist = np.sqrt((diff ** 2).sum())
                if dist <= step_thresh:
                    included[ny, nx] = True
                    q.append((ny, nx))
    return included


def largest_component_mask(fg_mask):
    labeled, num = ndimage.label(fg_mask, structure=np.ones((3, 3)))
    if num == 0:
        return np.zeros_like(fg_mask)
    sizes = ndimage.sum(fg_mask, labeled, range(1, num + 1))
    if len(sizes) == 0:
        return np.zeros_like(fg_mask)
    largest_label = np.argmax(sizes) + 1
    return labeled == largest_label


def touches_border(mask, margin=2):
    h, w = mask.shape
    top = mask[:margin, :].any()
    bottom = mask[-margin:, :].any()
    left = mask[:, :margin].any()
    right = mask[:, -margin:].any()
    return top or bottom or left or right


def process_index(idx, debug=False):
    expand = 0.25
    attempt = 0
    max_retries = 2
    while True:
        x0, y0, x1, y1 = cell_bounds(idx, expand)
        crop_rgb = arr[y0:y1, x0:x1]
        fg_seed_bg = region_grow_background(crop_rgb)
        fg_mask = ~fg_seed_bg
        kept = largest_component_mask(fg_mask)
        if touches_border(kept, margin=2) and attempt < max_retries:
            attempt += 1
            expand += 0.15
            continue
        break

    struct = ndimage.generate_binary_structure(2, 2)
    closed = ndimage.binary_dilation(kept, structure=struct, iterations=2)
    closed = ndimage.binary_erosion(closed, structure=struct, iterations=2)

    alpha = (closed.astype(np.float32) * 255.0)
    alpha_img = Image.fromarray(alpha.astype(np.uint8), mode="L")
    alpha_img = alpha_img.filter(ImageFilter.GaussianBlur(radius=1.5))
    alpha_arr = np.array(alpha_img)

    rgb_crop_img = Image.fromarray(crop_rgb.astype(np.uint8), mode="RGB")
    rgba = np.dstack([np.array(rgb_crop_img), alpha_arr])
    rgba_img = Image.fromarray(rgba.astype(np.uint8), mode="RGBA")

    if debug:
        return rgba_img, kept, fg_seed_bg, (x0, y0, x1, y1)
    return rgba_img, (x0, y0, x1, y1)


def autocrop(rgba_img, pad=6):
    a = np.array(rgba_img)[:, :, 3]
    ys, xs = np.where(a > 10)
    if len(ys) == 0:
        return rgba_img
    y0, y1 = ys.min(), ys.max()
    x0, x1 = xs.min(), xs.max()
    h, w = a.shape
    y0 = max(0, y0 - pad); x0 = max(0, x0 - pad)
    y1 = min(h - 1, y1 + pad); x1 = min(w - 1, x1 + pad)
    return rgba_img.crop((x0, y0, x1 + 1, y1 + 1))


if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "all"

    if mode == "test":
        test_indices = [0, 1, 7]
        for idx in test_indices:
            rgba_img, kept, bgmask, bounds = process_index(idx, debug=True)
            rgba_img.save(f"{OUTDIR}/_test_raw_{idx}.png")
            mask_img = Image.fromarray((kept * 255).astype(np.uint8))
            mask_img.save(f"{OUTDIR}/_test_mask_{idx}.png")
            cropped = autocrop(rgba_img)
            cropped.save(f"{OUTDIR}/_test_crop_{idx}.png")
            print(idx, bounds, "cropped size", cropped.size)
    else:
        results = []
        for idx in range(15):
            rgba_img, bounds = process_index(idx)
            cropped = autocrop(rgba_img)
            path = f"{OUTDIR}/char-{idx}.png"
            cropped.save(path)
            results.append((idx, cropped.size, bounds))
            print(idx, cropped.size, bounds)
