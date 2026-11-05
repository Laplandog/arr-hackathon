"""
画纸艺风的小动物（代替图，美术交真图后用同名文件覆盖）：

  python tools/make_paper_critters.py [--preview out.png]

写 public/assets/fx/：
  fx_bird_01.png / fx_bird_02.png   纸鸟两帧（翅膀朝上 / 朝下），同一张画布，鸟头朝右。身体是浅色，代码里按每只鸟染一点颜色
  fx_butterfly_01.png / _02.png     纸蝴蝶（俯视、左右对称；代码里左右压扁表现扇翅膀），粉色 / 黄色
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


def bird(frame):
    W, H = 420, 320
    P = Paper(W, H, seed=21)
    cx, cy = 200, 175
    wing = hexc('#e4e9f4')
    body = hexc('#f8f4ec')
    # 远处那只翅膀（在身体后面，深一点）
    if frame == 0:
        far = petal_pts(cx - 5, cy - 8, math.radians(-118), 135, 62, prof=(0.45, 0.5), bend=-0.15)
    else:
        far = petal_pts(cx - 5, cy + 4, math.radians(112), 105, 52, prof=(0.45, 0.5), bend=0.15)
    P.piece(P.mask(far), wing * 0.86, 1.0, edge=2.5, shadow=(2, 4, 2.5, 0.2))
    # 尾巴：两片尖瓣
    for a in (172, 190):
        P.piece(P.mask(petal_pts(cx - 70, cy + 4, math.radians(a), 95, 34, prof=(0.5, 0.7))), wing * 0.92, 1.0, edge=2.2, shadow=(2, 3, 2, 0.2))
    # 身体（横着的泪滴）+ 肚子
    P.piece(P.mask(petal_pts(cx - 85, cy + 6, math.radians(-4), 200, 92, prof=(0.75, 0.45))), body, P.axis_shade(cx, cy - 40, math.radians(90), 90, 1.04, 0.9), edge=3, shadow=(3, 5, 3, 0.25))
    P.piece(P.mask(petal_pts(cx - 40, cy + 24, math.radians(-8), 120, 38, prof=(0.6, 0.6))), hexc('#fff7ea'), 1.0, edge=0, shadow=(0, 0, 1, 0))
    # 头
    hx, hy = cx + 88, cy - 20
    P.piece(P.disk(hx, hy, 40), body, 1.0, edge=3, shadow=(2, 4, 2.5, 0.22))
    # 喙
    P.piece(P.mask([(hx + 34, hy - 6), (hx + 70, hy + 4), (hx + 34, hy + 14)]), hexc('#f2a25e'), 1.0, edge=1.8, shadow=(1, 2, 1.5, 0.2))
    # 眼睛 + 腮红
    P.piece(P.disk(hx + 14, hy - 6, 6.5), hexc('#4a3b4f'), 1.0, edge=0, shadow=(0, 0, 1, 0))
    P.piece(P.disk(hx + 6, hy + 14, 9, 0.6), hexc('#f6b3b0'), 1.0, edge=0, shadow=(0, 0, 1, 0))
    # 近处那只翅膀（在身体前面）
    if frame == 0:
        near = petal_pts(cx + 6, cy - 4, math.radians(-100), 150, 70, prof=(0.45, 0.5), bend=-0.18)
    else:
        near = petal_pts(cx + 6, cy + 8, math.radians(100), 118, 60, prof=(0.45, 0.5), bend=0.18)
    m = P.mask(near)
    P.piece(m, wing, P.axis_shade(cx, cy, math.radians(-100 if frame == 0 else 100), 140, 0.95, 1.05), edge=3, shadow=(2, 4, 2.5, 0.22))
    # 翅膀上两道折痕
    for k in (-14, 14):
        ang = math.radians((-100 if frame == 0 else 100) + k * 0.4)
        P.over(np.broadcast_to(wing * 0.82, (H, W, 3)), P.line_mask([(cx + 6, cy), (cx + 6 + 95 * math.cos(ang) + k, cy + 95 * math.sin(ang))], 1.6) * m * 0.7)
    return to_img(P)


def butterfly(main, edge_col, spot):
    W, H = 320, 260
    P = Paper(W, H, seed=33)
    cx, cy = W / 2, H / 2 + 6
    for side in (-1, 1):
        # 上翅（大）
        up = petal_pts(cx + side * 6, cy - 6, math.radians(-90 + side * 52), 140, 120, prof=(0.45, 0.35), bend=side * 0.08)
        m = P.mask(up)
        P.piece(m, hexc(main), P.axis_shade(cx, cy, math.radians(-90 + side * 52), 140, 0.92, 1.05), edge=3, edge_col=CREAM * 0.6 + hexc(edge_col) * 0.4, shadow=(2, 4, 3, 0.22))
        # 下翅（小）
        lo = petal_pts(cx + side * 4, cy + 6, math.radians(90 - side * 48), 95, 82, prof=(0.45, 0.4))
        P.piece(P.mask(lo), hexc(edge_col), 1.0, edge=2.6, edge_col=CREAM * 0.6 + hexc(edge_col) * 0.4, shadow=(2, 4, 3, 0.22))
        # 翅上的小圆点
        a = math.radians(-90 + side * 52)
        P.piece(P.disk(cx + side * 6 + math.cos(a) * 92, cy - 6 + math.sin(a) * 92, 15) * m, hexc(spot), 1.0, edge=1.5, shadow=(1, 2, 1.2, 0.15))
    # 身体 + 触角
    P.piece(P.mask(petal_pts(cx, cy - 46, math.radians(90), 104, 18, prof=(0.5, 0.5))), hexc('#6e5a6a'), 1.0, edge=1.5, shadow=(1, 2, 1.5, 0.2))
    for side in (-1, 1):
        P.over(np.broadcast_to(hexc('#6e5a6a'), (H, W, 3)), P.line_mask([(cx, cy - 44), (cx + side * 16, cy - 74), (cx + side * 26, cy - 90)], 2.2))
        P.piece(P.disk(cx + side * 26, cy - 90, 5), hexc('#6e5a6a'), 1.0, edge=0, shadow=(0, 0, 1, 0))
    img = to_img(P)
    return img.crop(img.getbbox())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default='public/assets/fx')
    ap.add_argument('--preview', default=None)
    a = ap.parse_args()
    b0, b1 = bird(0), bird(1)
    bb = [im.getchannel('A').point(lambda v: 255 if v > 4 else 0).getbbox() for im in (b0, b1)]
    box = (min(b[0] for b in bb), min(b[1] for b in bb), max(b[2] for b in bb), max(b[3] for b in bb))
    imgs = {
        'fx_bird_01': b0.crop(box), 'fx_bird_02': b1.crop(box),
        'fx_butterfly_01': butterfly('#f6b8bd', '#ee9a8e', '#fff3dc'),
        'fx_butterfly_02': butterfly('#f8dc8c', '#f1b860', '#fff6e2'),
    }
    for n, im in imgs.items():
        p = os.path.join(a.out, f'{n}.png')
        im.save(p, optimize=True)
        print(p, im.size)
    if a.preview:
        pad = 20
        Wt = sum(im.width for im in imgs.values()) + pad * (len(imgs) + 1)
        Ht = max(im.height for im in imgs.values()) + 2 * pad
        bg = Image.new('RGBA', (Wt, Ht), (198, 185, 211, 255))
        x = pad
        for im in imgs.values():
            bg.alpha_composite(im, (x, pad))
            x += im.width + pad
        bg.convert('RGB').save(a.preview)
        print('preview', a.preview)


if __name__ == '__main__':
    main()
