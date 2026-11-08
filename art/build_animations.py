"""Build visible, frame-by-frame Jim animations from the original hand-drawn sprite.

Run with Pillow installed: python3 art/build_animations.py
The game itself has no Python/Pillow dependency; generated PNGs are committed assets.
"""
from pathlib import Path
from math import sin, cos, pi
from PIL import Image, ImageDraw, ImageChops

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'game' / 'assets'
SRC = Image.open(ASSETS / 'jim.png').convert('RGBA')
W, H = 300, 300  # wider canvas gives swinging legs room; feet remain at y=300
OX = 34


def polygon_mask(points):
    mask = Image.new('L', SRC.size, 0)
    ImageDraw.Draw(mask).polygon(points, fill=255)
    return mask


def extract(points):
    mask = polygon_mask(points)
    part = Image.new('RGBA', SRC.size, (0, 0, 0, 0))
    part.paste(SRC, (0, 0), mask)
    return part, mask


def keep_largest_component(image):
    """Remove tiny detached pixels left where two hand-drawn parts overlapped."""
    from collections import deque
    alpha = image.getchannel('A')
    px = alpha.load()
    seen = set()
    components = []
    for y in range(image.height):
        for x in range(image.width):
            if px[x, y] < 8 or (x, y) in seen:
                continue
            component = []
            queue = deque([(x, y)])
            seen.add((x, y))
            while queue:
                cx, cy = queue.popleft()
                component.append((cx, cy))
                for nx, ny in ((cx-1,cy),(cx+1,cy),(cx,cy-1),(cx,cy+1)):
                    if 0 <= nx < image.width and 0 <= ny < image.height and (nx, ny) not in seen and px[nx, ny] >= 8:
                        seen.add((nx, ny))
                        queue.append((nx, ny))
            components.append(component)
    if not components:
        return image
    largest = max(components, key=len)
    cleaned = Image.new('RGBA', image.size, (0, 0, 0, 0))
    mask = Image.new('L', image.size, 0)
    draw = ImageDraw.Draw(mask)
    for x, y in largest:
        mask.putpixel((x, y), 255)
    cleaned.paste(image, (0, 0), ImageChops.multiply(image.getchannel('A'), mask))
    return cleaned


# Independent firing arm (elbow pivot: 153,145).
ARM_POINTS = [(153,134),(168,139),(178,132),(184,122),(182,113),(191,106),(201,107),
              (208,102),(220,107),(225,113),(231,113),(231,142),(221,145),(220,156),
              (214,166),(205,169),(198,164),(190,168),(183,165),(179,176),(167,185),
              (151,182),(140,175),(138,162),(144,147)]
arm, arm_mask = extract(ARM_POINTS)
body = SRC.copy()
body.putalpha(ImageChops.subtract(body.getchannel('A'), arm_mask))
body = keep_largest_component(body)
body.save(ASSETS / 'jim-body.png', optimize=True)
arm.save(ASSETS / 'jim-arm.png', optimize=True)

# Separate legs at the hips. They are drawn behind the torso for real alternating steps.
BACK_POINTS = [(37,193),(61,187),(82,192),(96,207),(96,224),(87,241),(84,254),
               (91,271),(89,289),(77,298),(43,298),(27,287),(29,270),(37,253),
               (35,232),(31,211)]
FRONT_POINTS = [(91,193),(112,181),(136,184),(150,199),(153,215),(145,232),(144,247),
                (158,260),(174,276),(168,291),(151,298),(113,296),(99,287),(101,267),
                (104,246),(94,228),(87,210)]
back_leg, back_mask = extract(BACK_POINTS)
front_leg, front_mask = extract(FRONT_POINTS)
leg_mask = ImageChops.lighter(back_mask, front_mask)
torso = body.copy()
torso.putalpha(ImageChops.subtract(torso.getchannel('A'), leg_mask))
torso = keep_largest_component(torso)


def place(canvas, image, offset=(0, 0)):
    canvas.alpha_composite(image, (OX + offset[0], offset[1]))


def rotated(part, angle, pivot, lift=0):
    # PIL positive angles are counter-clockwise. Translate for foot lift after rotation.
    result = part.rotate(angle, resample=Image.Resampling.BICUBIC, center=pivot)
    if lift:
        shifted = Image.new('RGBA', SRC.size, (0, 0, 0, 0))
        shifted.alpha_composite(result, (0, int(lift)))
        return shifted
    return result


def frame(back_angle=0, front_angle=0, back_lift=0, front_lift=0, bob=0,
          torso_angle=0, arm_angle=None, squash=1.0):
    out = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    place(out, rotated(back_leg, back_angle, (70, 204), back_lift))
    place(out, rotated(front_leg, front_angle, (116, 201), front_lift))
    body_part = torso
    if squash != 1.0:
        resized = torso.resize((torso.width, round(torso.height * squash)), Image.Resampling.LANCZOS)
        body_part = Image.new('RGBA', SRC.size, (0, 0, 0, 0))
        body_part.alpha_composite(resized, (0, torso.height - resized.height))
    if torso_angle:
        body_part = body_part.rotate(torso_angle, resample=Image.Resampling.BICUBIC, center=(105, 182))
    place(out, body_part, (0, bob))
    if arm_angle is not None:
        place(out, rotated(arm, arm_angle, (153, 145)), (0, bob))
    return out


# Eight genuinely different running poses: opposite leg swings, lifts and body bounce.
for i in range(8):
    a = 2 * pi * i / 8
    img = frame(back_angle=sin(a) * 43, front_angle=-sin(a) * 43,
                back_lift=-max(0, sin(a)) * 13, front_lift=-max(0, -sin(a)) * 13,
                bob=-round(abs(cos(a)) * 6), torso_angle=sin(a) * 3)
    img.save(ASSETS / f'run-{i}.png', optimize=True)

# Takeoff, tucked apex, falling and a deep landing pose.
frame(-32, 38, -12, -16, bob=-4, torso_angle=-4).save(ASSETS / 'jump-rise.png', optimize=True)
frame(-58, 61, -27, -25, bob=-9, torso_angle=4, squash=.98).save(ASSETS / 'jump-top.png', optimize=True)
frame(18, -24, -3, -9, bob=0, torso_angle=5).save(ASSETS / 'jump-fall.png', optimize=True)
frame(-15, 18, 0, 0, bob=2, squash=.89).save(ASSETS / 'land.png', optimize=True)

# Braced shooting stance and a stronger recoil pose.
frame(-22, 25, 0, 0, bob=0, torso_angle=-3).save(ASSETS / 'shoot-0.png', optimize=True)
frame(-29, 31, 0, 0, bob=2, torso_angle=-8, squash=.98).save(ASSETS / 'shoot-1.png', optimize=True)

# Four loose-limbed death poses. The arm is baked in because aiming stops on death.
for i, angles in enumerate([(-55, 62, -75), (55, -62, 65), (-70, 45, 95), (65, -48, -95)]):
    b, f, a = angles
    frame(b, f, -8, -8, torso_angle=(-1) ** i * 9, arm_angle=a).save(ASSETS / f'death-{i}.png', optimize=True)

# Contact sheet is only a development preview, not a game asset.
sheet = Image.new('RGBA', (150 * 8, 190), (20, 17, 38, 255))
for i in range(8):
    img = Image.open(ASSETS / f'run-{i}.png').resize((150, 150), Image.Resampling.LANCZOS)
    sheet.alpha_composite(img, (i * 150, 25))
sheet.save(ROOT / 'art' / 'run-preview.png', optimize=True)
print('Built 8 run, 4 jump/land, 2 shoot and 4 death frames in game/assets/')
