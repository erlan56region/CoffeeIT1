"""
Нарезка спрайтов на части для «бумажной» (cut-out) скелетной анимации.

Берёт исходники на зелёном фоне из art/src/, вырезает фон, режет персонажей на части
по полигонам и сохраняет в game/assets/rig/ + rig.json (позиции частей и точки вращения
в координатах исходной картинки).

Запуск:  python3 art/rig.py
"""
import json, os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, 'src')
OUT = os.path.join(ROOT, '..', 'game', 'assets', 'rig')
os.makedirs(OUT, exist_ok=True)


def keyed(name):
    """Хромакей: зелёный фон -> прозрачность, убираем зелёный ореол."""
    im = np.array(Image.open(os.path.join(SRC, name + '.png')).convert('RGBA')).astype(np.float32)
    r, g, b = im[..., 0], im[..., 1], im[..., 2]
    gr = g - np.maximum(r, b)
    a = np.clip(1 - (gr - 40) / 80, 0, 1)
    im[..., 1] = np.where(g > np.maximum(r, b), np.maximum(r, b), g)
    im[..., 3] = a * 255
    return im.clip(0, 255).astype(np.uint8)


def poly_mask(shape, pts):
    m = Image.new('L', (shape[1], shape[0]), 0)
    ImageDraw.Draw(m).polygon(pts, fill=255)
    return np.array(m) > 0


def save_part(arr, mask, name, scale, pad=2):
    """Сохраняет часть (пиксели под маской), обрезая по содержимому. Возвращает [x, y, w, h] в коорд. исходника."""
    a = arr.copy()
    a[..., 3] = np.where(mask, a[..., 3], 0)
    ys, xs = np.where(a[..., 3] > 8)
    x0, x1 = max(0, xs.min() - pad), min(a.shape[1], xs.max() + pad + 1)
    y0, y1 = max(0, ys.min() - pad), min(a.shape[0], ys.max() + pad + 1)
    img = Image.fromarray(a[y0:y1, x0:x1])
    w, h = max(1, round((x1 - x0) * scale)), max(1, round((y1 - y0) * scale))
    img.resize((w, h), Image.LANCZOS).save(os.path.join(OUT, name + '.png'), optimize=True)
    return [int(x0), int(y0), int(x1 - x0), int(y1 - y0)]


rig = {}

# ------------------------------------------------------------------ ДЖИМ
def build_jim():
    S = 0.4
    a = keyed('jim')
    H, W = a.shape[:2]
    yy, xx = np.mgrid[0:H, 0:W]
    alpha = a[..., 3] > 8
    r, g, b = [a[..., i].astype(int) for i in range(3)]

    # Голова: всё выше y=286 + розовая шея (с контуром) до воротника
    pink = (r > 150) & (r - b > 25) & (g > 70) & (r > g)
    pink_d = np.array(Image.fromarray((pink * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(11))) > 0
    neck_band = (yy >= 286) & (yy <= 352) & (xx > 440) & (xx < 585)
    head = alpha & ((yy < 286) & (xx > 360) & (xx < 660) | (neck_band & pink_d))

    armB = poly_mask(a.shape, [(140, 488), (300, 468), (350, 500), (354, 572), (340, 640), (344, 790), (140, 790)])
    armF = poly_mask(a.shape, [(650, 468), (712, 380), (910, 366), (910, 604), (782, 618), (700, 634), (652, 612)])
    thighL = poly_mask(a.shape, [(362, 676), (522, 676), (522, 736), (470, 790), (468, 842), (290, 842), (318, 790), (344, 790)])
    shinL = poly_mask(a.shape, [(236, 812), (480, 812), (480, 1012), (236, 1012)])
    thighR = poly_mask(a.shape, [(522, 676), (688, 676), (705, 818), (530, 818), (522, 736)])
    shinR = poly_mask(a.shape, [(505, 796), (770, 796), (770, 985), (505, 985)])
    CUT = 706
    legs_low = (thighL | thighR) & (yy >= CUT) | shinL | shinR

    torso = alpha & ~head & ~armB & ~armF & ~legs_low
    t = a.copy()
    # дырку от шеи в воротнике заливаем тёмной «внутренностью» скафандра
    hole = head & neck_band
    t[hole] = [38, 32, 44, 255]
    torso = torso | hole

    parts = {}
    parts['torso'] = save_part(t, torso, 'jim_torso', S)
    parts['head'] = save_part(a, head, 'jim_head', S)
    parts['armB'] = save_part(a, armB & alpha, 'jim_armB', S)
    parts['armF'] = save_part(a, armF & alpha, 'jim_armF', S)
    parts['thighL'] = save_part(a, thighL & alpha & ~(shinL & (yy > 842)), 'jim_thighL', S)
    parts['shinL'] = save_part(a, shinL & alpha, 'jim_shinL', S)
    parts['thighR'] = save_part(a, thighR & alpha, 'jim_thighR', S)
    parts['shinR'] = save_part(a, shinR & alpha, 'jim_shinR', S)
    rig['jim'] = {
        'scale': S,
        'parts': parts,
        # точки вращения (суставы) в координатах исходника 1024x1024
        'pivots': {
            'hip': [505, 700], 'neck': [505, 350], 'shoulderB': [292, 500], 'shoulderF': [662, 540],
            'hipL': [425, 700], 'kneeL': [378, 832], 'hipR': [600, 700], 'kneeR': [612, 808],
        },
        'feet': [500, 1003],       # точка опоры (низ ботинок)
        'height': 951,             # высота фигуры (52..1003)
        'muzzle': [893, 414],      # дуло бластера
        'headTop': [520, 60],
    }


# ------------------------------------------------------------------ ВОРОНА
def build_crow():
    S = 0.3
    a = keyed('crow')
    H, W = a.shape[:2]
    yy, xx = np.mgrid[0:H, 0:W]
    alpha = a[..., 3] > 8
    # убираем «линии скорости» рядом с крыльями
    alpha &= ~poly_mask(a.shape, [(240, 395), (300, 400), (372, 470), (372, 500), (240, 500)])
    alpha &= ~((xx > 1118) & (yy > 328) & (yy < 450))
    helmet = ((xx - 583) ** 2 + (yy - 345) ** 2) < 122 ** 2
    wingL = poly_mask(a.shape, [(140, 140), (470, 200), (470, 290), (462, 345), (452, 440), (440, 500), (300, 470), (140, 420)]) & ~helmet
    wingR = poly_mask(a.shape, [(690, 330), (800, 240), (1020, 50), (1280, 50), (1280, 470), (1010, 470), (900, 455), (790, 420), (705, 380)])
    body = alpha & ~wingL & ~wingR
    parts = {
        'wingL': save_part(a, wingL & alpha, 'crow_wingL', S),
        'wingR': save_part(a, wingR & alpha, 'crow_wingR', S),
        'body': save_part(a, body, 'crow_body', S),
    }
    rig['crow'] = {'scale': S, 'parts': parts, 'pivots': {'wingL': [500, 350], 'wingR': [735, 355]},
                   'center': [700, 400], 'width': 1110}


# ------------------------------------------------------------------ ПРИНЦЕССА
def build_princess():
    S = 0.35
    a = keyed('princess')
    alpha = a[..., 3] > 8
    arm = poly_mask(a.shape, [(250, 60), (345, 60), (436, 236), (414, 282), (396, 286), (300, 176), (250, 140)])
    body = alpha & ~arm
    parts = {
        'arm': save_part(a, arm & alpha, 'princess_arm', S),
        'body': save_part(a, body, 'princess_body', S),
    }
    rig['princess'] = {'scale': S, 'parts': parts, 'pivots': {'shoulder': [416, 268]},
                       'feet': [512, 1000], 'height': 980, 'waistY': 430}


build_jim()
build_crow()
build_princess()
with open(os.path.join(OUT, 'rig.json'), 'w') as f:
    json.dump(rig, f, indent=1)
# rig.js — те же данные в виде скрипта (работает и при открытии через file://, где fetch недоступен)
with open(os.path.join(OUT, 'rig.js'), 'w') as f:
    f.write('// Сгенерировано art/rig.py — не редактировать вручную\nwindow.RIG = ' + json.dumps(rig) + ';\n')
print(json.dumps({k: list(v['parts'].keys()) for k, v in rig.items()}))
