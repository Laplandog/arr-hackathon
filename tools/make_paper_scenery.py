"""
画纸艺风的场景代替图（美术交真图后用同名文件覆盖）：

  python tools/make_paper_scenery.py [--preview out.png]

写 public/assets/bg/：
  bg_05_ground.png          孩子脚下的一小块纸地面（俯视图，在场景里平放在 y=0）
  bg_50_windmill_body.png   风车塔身（立在右侧小岛上）
  bg_51_windmill_blades.png 风车叶片（画布中心 = 转轴，代码里绕中心转）
同时打印风车转轴在塔身图里的位置（摆 layout 用）。
"""
import argparse
import math
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
from make_paper_flowers import CREAM, Paper, hexc, petal_pts  # noqa: E402


def to_img(P):
    out = np.dstack([np.clip(P.rgb, 0, 1), np.clip(P.a, 0, 1)])
    return Image.fromarray((out * 255 + 0.5).astype(np.uint8), 'RGBA')


def blob(cx, cy, rx, ry, rng, n=180, rough=0.035, waves=((3, 0.05), (7, 0.025), (13, 0.012))):
    """不规则的撕纸边圆形"""
    ph = [rng.uniform(0, 2 * math.pi) for _ in waves]
    pts = []
    for t in np.linspace(0, 2 * math.pi, n, endpoint=False):
        r = 1 + sum(a * math.sin(k * t + p) for (k, a), p in zip(waves, ph)) + rng.uniform(-rough, rough) * 0.5
        pts.append((cx + rx * r * math.cos(t), cy + ry * r * math.sin(t)))
    return pts


def ground():
    W, H = 1200, 860
    P = Paper(W, H, seed=5)
    rng = np.random.default_rng(5)
    cx, cy = W / 2, H / 2
    # 底层：深一点的青绿纸，撕纸边露出奶油色纸芯
    base = P.mask(blob(cx, cy, W * 0.47, H * 0.46, rng))
    P.piece(base, hexc('#79b3a3'), 1.0, edge=6, shadow=(0, 10, 8, 0.3))
    # 上层：和主岛顶面一样的浅青绿
    top = P.mask(blob(cx, cy - H * 0.01, W * 0.42, H * 0.4, rng))
    s = np.clip((P.Y - cy) / (H * 0.5), -1, 1)
    P.piece(top, hexc('#a2d8c8'), 1.0 + 0.04 * s, edge=3, edge_col=CREAM * 0.6 + hexc('#a2d8c8') * 0.4, shadow=(0, 5, 4, 0.22))
    # 散落的小纸片：三叶草、草叶、小花（俯视）
    for _ in range(26):
        x, y = rng.uniform(0.15, 0.85) * W, rng.uniform(0.15, 0.85) * H
        if ((x - cx) / (W * 0.4)) ** 2 + ((y - cy) / (H * 0.38)) ** 2 > 0.85:
            continue
        ang = rng.uniform(0, 2 * math.pi)
        for k in range(3):
            a = ang + k * 2 * math.pi / 3
            P.piece(P.mask(petal_pts(x, y, a, 26, 20, prof=(0.5, 0.5))) * top, hexc('#c4e8d9'), 1.0, edge=1.2, shadow=(1, 2, 1.2, 0.15))
    for _ in range(9):
        x, y = rng.uniform(0.2, 0.8) * W, rng.uniform(0.2, 0.8) * H
        if ((x - cx) / (W * 0.38)) ** 2 + ((y - cy) / (H * 0.36)) ** 2 > 0.8:
            continue
        col = hexc(['#f6bfca', '#f8dc8c', '#f6a891'][rng.integers(3)])
        for k in range(5):
            a = k * 2 * math.pi / 5 + rng.uniform(0, 1)
            P.piece(P.mask(petal_pts(x, y, a, 20, 15, prof=(0.45, 0.25))), col, 1.0, edge=1.2, shadow=(1, 2, 1.2, 0.15))
        P.piece(P.disk(x, y, 6), hexc('#e98a4a'), 1.0, edge=0, shadow=(0, 0, 1, 0))
    img = to_img(P)
    return img.crop(img.getbbox())


def rect_polar(cx, cy, ang, r0, r1, off0, off1):
    """沿 ang 方向、离中心 r0..r1、横向偏移 off0..off1 的长方形"""
    ca, sa = math.cos(ang), math.sin(ang)
    pts = []
    for r, o in ((r0, off0), (r1, off0), (r1, off1), (r0, off1)):
        pts.append((cx + r * ca - o * sa, cy + r * sa + o * ca))
    return pts


def windmill_body():
    W, H = 520, 900
    P = Paper(W, H, seed=9)
    cx = W / 2
    top_y, base_y = 300, 870
    tw, bw = 86, 150  # 半宽
    tower = P.mask([(cx - tw, top_y), (cx + tw, top_y), (cx + bw, base_y), (cx - bw, base_y)])
    sx = np.clip((P.X - cx) / bw, -1, 1)
    P.piece(tower, hexc('#f2d4a8'), 1.04 - 0.1 * (sx > 0.05) - 0.03 * sx, edge=3.5, shadow=(5, 7, 5, 0.3))
    # 横向木板纹
    for k in range(6):
        y = top_y + 70 + k * 85
        hw = tw + (bw - tw) * (y - top_y) / (base_y - top_y)
        P.over(np.broadcast_to(hexc('#c99a6a'), (H, W, 3)), P.line_mask([(cx - hw + 8, y), (cx + hw - 8, y + 4)], 2.2) * tower * 0.55)
    # 门
    door = P.mask([(cx - 42, base_y), (cx - 42, base_y - 100)] + [(cx + 42 * math.cos(t), base_y - 100 - 40 * math.sin(t)) for t in np.linspace(math.pi, 0, 24)] + [(cx + 42, base_y)])
    P.piece(door, hexc('#8a5a3c'), 1.0, edge=2.5, shadow=(2, 3, 2, 0.25))
    # 圆窗
    P.piece(P.disk(cx, 520, 34), hexc('#7cc2b5'), 1.0, edge=4, shadow=(2, 3, 2, 0.25))
    P.over(np.broadcast_to(CREAM, (H, W, 3)), (P.line_mask([(cx - 34, 520), (cx + 34, 520)], 3) + P.line_mask([(cx, 486), (cx, 554)], 3)) * P.disk(cx, 520, 34))
    # 屋顶
    roof = P.mask([(cx - 118, top_y + 18)] + [(cx + 118 * math.cos(t), top_y + 18 - 150 * math.sin(t) ** 1.2) for t in np.linspace(math.pi, 0, 40)] + [(cx + 118, top_y + 18)])
    P.piece(roof, hexc('#de7b55'), 1.04 - 0.12 * (P.X > cx + 4), edge=3.5, shadow=(4, 6, 4, 0.3))
    P.piece(P.disk(cx, top_y - 128, 12), hexc('#f2d4a8'), 1.0, edge=2, shadow=(1, 2, 1.5, 0.2))
    img = to_img(P)
    bb = img.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox()
    hub = (cx, top_y - 10)  # 转轴（叶片中心）在屋顶下沿附近
    img = img.crop(bb)
    hub_frac = ((hub[0] - bb[0]) / img.width, (hub[1] - bb[1]) / img.height)
    return img, hub_frac


def windmill_blades():
    S = 900
    P = Paper(S, S, seed=11)
    c = S / 2
    cols = ['#fbecd2', '#f7c9a0', '#fbecd2', '#bfe3d8']
    for k in range(4):
        a = math.radians(20 + k * 90)
        P.piece(P.mask(rect_polar(c, c, a, 30, 425, -9, 9)), hexc('#c08a5c'), 1.0, edge=2, shadow=(3, 5, 3, 0.25))
        sail = P.mask(rect_polar(c, c, a, 95, 410, 10, 120))
        P.piece(sail, hexc(cols[k]), 1.0, edge=3, shadow=(3, 5, 3, 0.25))
        lat = sum(P.line_mask([(c + r * math.cos(a) - 10 * math.sin(a), c + r * math.sin(a) + 10 * math.cos(a)),
                               (c + r * math.cos(a) - 120 * math.sin(a), c + r * math.sin(a) + 120 * math.cos(a))], 2.4)
                  for r in (170, 250, 330))
        lat = lat + P.line_mask([(c + 95 * math.cos(a) - 65 * math.sin(a), c + 95 * math.sin(a) + 65 * math.cos(a)),
                                 (c + 410 * math.cos(a) - 65 * math.sin(a), c + 410 * math.sin(a) + 65 * math.cos(a))], 2.4)
        P.over(np.broadcast_to(hexc('#c08a5c'), (S, S, 3)), np.clip(lat, 0, 1) * sail * 0.7)
    P.piece(P.disk(c, c, 46), hexc('#de7b55'), 1.0, edge=3, shadow=(2, 4, 3, 0.3))
    P.piece(P.disk(c, c, 18), hexc('#f2d4a8'), 1.0, edge=0, shadow=(0, 0, 1, 0))
    return to_img(P)  # 不裁边：画布中心必须是转轴


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default='public/assets/bg')
    ap.add_argument('--preview', default=None)
    a = ap.parse_args()
    g = ground()
    body, hub = windmill_body()
    blades = windmill_blades()
    for n, im in (('bg_05_ground', g), ('bg_50_windmill_body', body), ('bg_51_windmill_blades', blades)):
        p = os.path.join(a.out, f'{n}.png')
        im.save(p, optimize=True)
        print(p, im.size)
    print('windmill hub (fraction of body image, from top-left):', [round(v, 4) for v in hub], 'body aspect h/w:', round(body.height / body.width, 4))
    if a.preview:
        pad = 20
        Wt = g.width + body.width + blades.width + 4 * pad
        Ht = max(g.height, body.height, blades.height) + 2 * pad
        bg = Image.new('RGBA', (Wt, Ht), (198, 185, 211, 255))
        x = pad
        for im in (g, body, blades):
            bg.alpha_composite(im, (x, pad))
            x += im.width + pad
        bg.convert('RGB').save(a.preview)
        print('preview', a.preview)


if __name__ == '__main__':
    main()
