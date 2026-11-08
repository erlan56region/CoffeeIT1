"""Extract Jim's original animation sequences from the public SNES sprite sheet.

Source and attribution: see ART_SOURCES.md.
Requires Pillow and numpy only for rebuilding; the game uses the generated PNGs directly.
"""
from pathlib import Path
from collections import deque
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'art' / 'source' / 'earthworm-jim-snes-sheet.png'
DEST = ROOT / 'game' / 'assets'
SHEET = Image.open(SOURCE).convert('RGB')


def transparent_cell(box, clean=True):
    """Remove the green screen and only the white area connected to the cell border."""
    image = SHEET.crop(box).convert('RGBA')
    data = np.array(image).astype(np.float32)
    r, g, b = data[..., 0], data[..., 1], data[..., 2]
    greenness = g - np.maximum(r, b)
    alpha = np.clip(1 - (greenness - 35) / 70, 0, 1)
    # Reduce green fringe while preserving the white suit and dark pixel-art outlines.
    spill = g > np.maximum(r, b)
    data[..., 1] = np.where(spill, np.maximum(r, b) + (g - np.maximum(r, b)) * .18, g)
    data[..., 3] = alpha * 255
    image = Image.fromarray(data.clip(0, 255).astype(np.uint8)).copy()

    # Some irregular cells include a white corner. Flood only from the outside so
    # white highlights and the white electrocution pose remain intact.
    px = image.load()
    w, h = image.size
    queue = deque()
    seen = set()
    for x in range(w):
        queue.extend([(x, 0), (x, h - 1)])
    for y in range(h):
        queue.extend([(0, y), (w - 1, y)])
    while queue:
        x, y = queue.popleft()
        if (x, y) in seen or not (0 <= x < w and 0 <= y < h):
            continue
        seen.add((x, y))
        red, green, blue, a = px[x, y]
        if a < 12 or min(red, green, blue) < 250:
            continue
        px[x, y] = (red, green, blue, 0)
        queue.extend([(x-1,y),(x+1,y),(x,y-1),(x,y+1)])

    # Keep the character and details inside its silhouette; discard neighbouring cells.
    alpha = image.getchannel('A')
    seen = set()
    components = []
    for y in range(h):
        for x in range(w):
            if (x, y) in seen or alpha.getpixel((x, y)) < 12:
                continue
            component = []
            queue = deque([(x, y)])
            seen.add((x, y))
            while queue:
                cx, cy = queue.popleft()
                component.append((cx, cy))
                for nx, ny in ((cx-1,cy),(cx+1,cy),(cx,cy-1),(cx,cy+1)):
                    if 0 <= nx < w and 0 <= ny < h and (nx, ny) not in seen and alpha.getpixel((nx, ny)) >= 12:
                        seen.add((nx, ny))
                        queue.append((nx, ny))
            components.append(component)
    if components and clean:
        main = max(components, key=len)
        xs = [p[0] for p in main]
        ys = [p[1] for p in main]
        main_box = (min(xs)-8, min(ys)-8, max(xs)+8, max(ys)+8)
        for component in components:
            xs = [p[0] for p in component]
            ys = [p[1] for p in component]
            inside = max(xs) >= main_box[0] and min(xs) <= main_box[2] and max(ys) >= main_box[1] and min(ys) <= main_box[3]
            if component is not main and (not inside or len(component) < 4):
                for cx, cy in component:
                    px[cx, cy] = (0, 0, 0, 0)
    bbox = image.getchannel('A').point(lambda value: 255 if value > 12 else 0).getbbox()
    return image.crop(bbox) if bbox else image


def sequence(name, boxes):
    for index, box in enumerate(boxes):
        # The yellow electrocution outline consists of many intentionally disconnected lines.
        frame = transparent_cell(box, clean=not (name == 'death' and index == 2))
        frame.save(DEST / f'{name}-{index}.png', optimize=True)
    print(f'{name}: {len(boxes)} frames')


def cells(y_top, y_bottom, boundaries):
    return [(left + 1, y_top + 1, right, y_bottom) for left, right in zip(boundaries, boundaries[1:])]


# Full original running cycle (16 drawings).
sequence('run', cells(1130, 1195, [0,42,76,116,169,217,264,314,355,388,429,482,534,585,632,674,716,756]))

# Gun raise / firing / recoil drawings.
sequence('shoot', cells(55, 140, [0,49,107,165,222]))
sequence('idle', cells(0, 55, [0,41,79,117,155]))
face = Image.open(DEST / 'shoot-0.png').crop((7, 0, 38, 27))
face.save(DEST / 'jim-face.png', optimize=True)

# Takeoff, airborne split, falling and landing.
for name, box in [
    ('jump-rise', (60, 820, 97, 900)),
    ('jump-top', (348, 811, 400, 895)),
    ('jump-fall', (401, 811, 449, 895)),
    ('land', (544, 851, 600, 915)),
]:
    transparent_cell(box).save(DEST / f'{name}.png', optimize=True)
    print(f'{name}: 1 frame')

# Original electrocution sequence: normal, black silhouette, white flash and outline.
sequence('death', cells(5520, 5615, [108,187,267,349,409]))
print('External SNES animation frames written to game/assets/')
