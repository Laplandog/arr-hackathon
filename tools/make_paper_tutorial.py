"""
新手引导用的纸艺代替图（美术交真图后用同名文件覆盖）：

  python tools/make_paper_tutorial.py [--preview out.png]

写 public/assets/fx/：
  tut_flower_closed.png / tut_flower_open.png   孩子鼻子前面那朵花（花苞 / 开花），同一张画布
"""
import argparse
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
from make_paper_flowers import LEAF, Paper, bud, flower, leaf, stem  # noqa: E402


def single_flower(opened):
    W, H = 380, 560
    P = Paper(W, H, seed=61)
    cx, fy = 190, 165
    stem(P, (cx, H - 12), (cx - 18, (H + fy) / 2), (cx, fy + (24 if opened else 60)), w=8)
    leaf(P, cx - 4, H - 70, -48, 150, 62, LEAF[1], 0.12)
    leaf(P, cx + 4, H - 110, 44, 130, 56, LEAF[3], -0.12)
    if opened:
        flower(P, cx, fy, 128, 'peach', rot=0.15, squish=0.92, n=6)
    else:
        bud(P, cx, fy + 40, 86, 'peach')
    out = np.dstack([np.clip(P.rgb, 0, 1), np.clip(P.a, 0, 1)])
    return Image.fromarray((out * 255 + 0.5).astype(np.uint8), 'RGBA')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default='public/assets/fx')
    ap.add_argument('--preview', default=None)
    a = ap.parse_args()
    imgs = {'tut_flower_closed': single_flower(False), 'tut_flower_open': single_flower(True)}
    bbs = [im.getchannel('A').point(lambda v: 255 if v > 4 else 0).getbbox() for im in imgs.values()]
    box = (min(b[0] for b in bbs), min(b[1] for b in bbs), max(b[2] for b in bbs), max(b[3] for b in bbs))
    for n, im in imgs.items():
        im = im.crop(box)
        imgs[n] = im
        p = os.path.join(a.out, f'{n}.png')
        im.save(p, optimize=True)
        print(p, im.size)
    if a.preview:
        pad = 20
        ims = list(imgs.values())
        bg = Image.new('RGBA', (sum(i.width for i in ims) + pad * 3, max(i.height for i in ims) + pad * 2), (198, 185, 211, 255))
        x = pad
        for i in ims:
            bg.alpha_composite(i, (x, pad))
            x += i.width + pad
        bg.convert('RGB').save(a.preview)
        print('preview', a.preview)


if __name__ == '__main__':
    main()
