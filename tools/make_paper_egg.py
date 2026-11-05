"""
画纸艺风的龙蛋（代替图，美术交真图后用同名文件覆盖）。

  python tools/make_paper_egg.py [--preview out.png]

写 public/assets/egg/：
  egg_cold.png          冰凉（淡蓝紫）
  egg_warm.png          变暖（奶油桃色 + 橙色斑点）
  egg_crack.png         出现裂纹（暖色 + 一圈锯齿裂缝）
  egg_shell_top.png     孵化时飞起来的上半个壳
  egg_shell_bottom.png  留在窝里的下半个壳
五张图同一块画布、蛋在同一个位置（代码里叠在一起交叉淡入，孵化时上下壳从裂缝处分开）。
"""
import argparse
import math
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
from make_paper_flowers import CREAM, Paper, hexc, petal_pts  # noqa: E402

W, H = 560, 720
CX, CY, A, B = 280, 372, 212, 300  # 蛋中心、半宽、半高
SPOTS = [  # (x, y, r, 色号) 相对蛋中心，单位 = 半宽
    (-0.42, -0.42, 0.17, 0), (0.30, -0.62, 0.11, 1), (0.48, -0.08, 0.2, 2), (-0.18, 0.05, 0.12, 1),
    (-0.6, 0.32, 0.14, 2), (0.12, 0.48, 0.22, 0), (0.62, 0.55, 0.1, 1), (-0.22, 0.82, 0.1, 2),
]
PALETTE = {
    'cold': dict(base='#c9d4ec', spots=['#a6b5de', '#e2e9f6', '#b7c2e8'], hi='#eef3fb'),
    'warm': dict(base='#f8dcb0', spots=['#f2a25e', '#f7c47c', '#ec8b6c'], hi='#fff3dc'),
}


def egg_pts(n=160, scale=1.0, dx=0.0, dy=0.0):
    pts = []
    for t in np.linspace(0, 2 * math.pi, n, endpoint=False):
        y = CY + dy - B * scale * math.cos(t)
        x = CX + dx + A * scale * math.sin(t) * (1 - 0.13 * math.cos(t))
        pts.append((x, y))
    return pts


def crack_line():
    """横穿蛋身的锯齿裂缝（略高于中线）"""
    pts, y0, x = [], CY - B * 0.12, CX - A * 1.25
    i = 0
    while x <= CX + A * 1.25:
        pts.append((x, y0 + (24 if i % 2 else -20) + (6 if i % 3 == 0 else 0)))
        x += 38
        i += 1
    return pts


def draw_egg(kind, cracked=False):
    P = Paper(W, H, seed=7)
    pal = PALETTE[kind]
    egg = P.mask(egg_pts())
    # 左上亮、右下暗（纸的弧面感）
    s = np.clip(((P.X - (CX - A * 0.5)) * 0.55 + (P.Y - (CY - B * 0.55))) / (2.1 * B), 0, 1)
    P.piece(egg, hexc(pal['base']), 1.06 - 0.2 * s, edge=3.5, shadow=(5, 8, 5.0, 0.32))
    # 斑点（裁在蛋里面）
    for (sx, sy, r, ci) in SPOTS:
        m = P.mask([(CX + (sx + r * math.cos(t)) * A, CY + sy * B + r * A * 0.92 * math.sin(t))
                    for t in np.linspace(0, 2 * math.pi, 48, endpoint=False)]) * egg
        P.piece(m, hexc(pal['spots'][ci]), 1.0 - 0.12 * s, edge=2.0, edge_col=CREAM * 0.6 + hexc(pal['spots'][ci]) * 0.4,
                shadow=(2, 3, 2.0, 0.2))
    # 左上一小片浅色高光纸（泪滴形）
    hl = P.mask(petal_pts(CX - A * 0.62, CY - B * 0.12, math.radians(-75), B * 0.5, A * 0.2, prof=(0.5, 0.45), bend=0.12)) * egg
    P.over(np.broadcast_to(hexc(pal['hi']), (H, W, 3)) * P.grain[..., None], hl * 0.8)
    if cracked:
        line = crack_line()
        dark = P.line_mask(line, 6) * egg
        rim = P.line_mask([(x, y + 4) for x, y in line], 2.5) * egg
        # 几条小分叉
        br = []
        for k, (x, y) in enumerate(line):
            if k % 3 == 1 and abs(x - CX) < A * 0.85:
                d = 1 if k % 2 else -1
                br.append(P.line_mask([(x, y), (x + 10, y + d * 26), (x + 4, y + d * 44)], 3.2))
        P.over(np.broadcast_to(hexc('#6b3f2a'), (H, W, 3)), np.clip(dark + sum(br) * egg, 0, 1) * 0.92)
        P.over(np.broadcast_to(CREAM, (H, W, 3)), rim * 0.75)
    out = np.dstack([np.clip(P.rgb, 0, 1), np.clip(P.a, 0, 1)])
    return Image.fromarray((out * 255 + 0.5).astype(np.uint8), 'RGBA'), P


def split_shell(img):
    """沿裂缝切成上下两半，切口描一道奶油色的壳厚度"""
    from PIL import ImageDraw
    line = crack_line()
    top = Image.new('L', (W, H), 0)
    ImageDraw.Draw(top).polygon(line + [(W, line[-1][1]), (W, 0), (0, 0), (0, line[0][1])], fill=255)
    top_a = np.asarray(top, np.float32) / 255
    arr = np.asarray(img, np.float32) / 255
    rim_img = Image.new('L', (W, H), 0)
    ImageDraw.Draw(rim_img).line(line, fill=255, width=7, joint='curve')
    rim = np.asarray(rim_img, np.float32) / 255
    outs = []
    for m in (top_a, 1 - top_a):
        a = arr[..., 3] * m
        rgb = arr[..., :3].copy()
        r = (rim * (a > 0.5))[..., None]
        rgb = rgb * (1 - r) + CREAM[None, None, :] * r
        outs.append(Image.fromarray((np.dstack([rgb, a]) * 255 + 0.5).astype(np.uint8), 'RGBA'))
    return outs


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default='public/assets/egg')
    ap.add_argument('--preview', default=None)
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    cold, _ = draw_egg('cold')
    warm, _ = draw_egg('warm')
    crack, _ = draw_egg('warm', cracked=True)
    top, bottom = split_shell(crack)
    imgs = {'egg_cold': cold, 'egg_warm': warm, 'egg_crack': crack, 'egg_shell_top': top, 'egg_shell_bottom': bottom}
    for n, im in imgs.items():
        p = os.path.join(a.out, f'{n}.png')
        im.save(p, optimize=True)
        print(p, im.size)
    if a.preview:
        pad = 20
        bg = Image.new('RGBA', (len(imgs) * (W + pad) + pad, H + 2 * pad), (198, 185, 211, 255))
        for i, im in enumerate(imgs.values()):
            bg.alpha_composite(im, (pad + i * (W + pad), pad))
        bg.convert('RGB').save(a.preview)
        print('preview', a.preview)


if __name__ == '__main__':
    main()
