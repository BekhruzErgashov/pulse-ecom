import numpy as np
from PIL import Image
import heapq

img = Image.open('/sessions/upbeat-loving-darwin/mnt/app/public/characters.png').convert("RGB")
arr = np.array(img).astype(np.float64)
crop = arr[0:341, 0:307]

h, w, _ = crop.shape
INF = 1e18
dist = np.full((h, w), INF)
border = 4
visited = np.zeros((h, w), dtype=bool)
heap = []
for y in range(h):
    for x in range(w):
        if y < border or y >= h - border or x < border or x >= w - border:
            dist[y, x] = 0.0
            heapq.heappush(heap, (0.0, y, x))

neighbors = [(-1,-1),(-1,0),(-1,1),(0,-1),(0,1),(1,-1),(1,0),(1,1)]
while heap:
    d, y, x = heapq.heappop(heap)
    if visited[y, x]:
        continue
    visited[y, x] = True
    base = crop[y, x]
    for dy, dx in neighbors:
        ny, nx = y + dy, x + dx
        if 0 <= ny < h and 0 <= nx < w and not visited[ny, nx]:
            step = np.sqrt(((crop[ny, nx] - base) ** 2).sum())
            nd = d + step
            if nd < dist[ny, nx]:
                dist[ny, nx] = nd
                heapq.heappush(heap, (nd, ny, nx))

np.save('/sessions/upbeat-loving-darwin/mnt/app/public/characters/_dist0.npy', dist)
print("max finite", dist[dist<INF].max(), "min", dist.min())
# save a normalized visualization
d2 = dist.copy()
d2[d2>200] = 200
d2 = (d2 / 200.0 * 255).astype(np.uint8)
Image.fromarray(d2).save('/sessions/upbeat-loving-darwin/mnt/app/public/characters/_dist0_vis.png')
