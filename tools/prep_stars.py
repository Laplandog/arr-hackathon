"""把美术给的星星图（浅色纯底、不透明）抠成透明 PNG，并用色相旋转多做几种颜色。

用法（在项目根目录运行，需要 Python + Pillow + numpy + scipy）：
    python tools/prep_stars.py 黄星星.png 紫星星.png

输出 public/assets/fx/fx_star_01.png … fx_star_06.png：
    01 黄（原图1） 02 紫（原图2） 03 陶土橙（星形1） 04 青石绿（星形1） 05 粉（星形2） 06 天蓝（星形2）
游戏里光团每次送星星按顺序换一种颜色。
"""
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

OUT = os.path.join('public', 'assets', 'fx')
SIZE = 384      # 输出边长（像素）
MARGIN = 10


def cutout(path):
    a = np.array(Image.open(path).convert('RGB')).astype(np.float32)
    h, w, _ = a.shape
    edge = np.concatenate([a[:8].reshape(-1, 3), a[-8:].reshape(-1, 3), a[:, :8].reshape(-1, 3), a[:, -8:].reshape(-1, 3)])
    bg = np.median(edge, axis=0)
    diff = np.abs(a - bg).max(axis=2)
    # 去掉 AI 出图常见的淡绿杂边：绿色明显高于红和蓝、而且很浅（黄色 r>g，不会被误判）
    greenish = ((a[..., 1] - np.maximum(a[..., 0], a[..., 2])) > 3) & (a.min(axis=2) > 200)
    cand = (diff <= 14) | greenish
    lab, _ = ndimage.label(cand)
    border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    bgmask = np.isin(lab, list(border))
    fg = ndimage.binary_fill_holes(~bgmask)
    lab2, n = ndimage.label(fg)
    if n > 1:
        sizes = ndimage.sum(fg, lab2, range(1, n + 1))
        fg = lab2 == (int(np.argmax(sizes)) + 1)
    fg = ndimage.binary_erosion(fg, iterations=2)
    alpha = np.clip(ndimage.gaussian_filter(fg.astype(np.float32), 1.0) * 1.15, 0, 1)
    ys, xs = np.where(alpha > 0.02)
    x0, x1, y0, y1 = xs.min() - MARGIN, xs.max() + MARGIN + 1, ys.min() - MARGIN, ys.max() + MARGIN + 1
    rgba = np.dstack([a, alpha * 255]).astype(np.uint8)[max(0, y0):y1, max(0, x0):x1]
    im = Image.fromarray(rgba, 'RGBA')
    side = max(im.size)
    sq = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    sq.alpha_composite(im, ((side - im.width) // 2, (side - im.height) // 2))
    return sq.resize((SIZE, SIZE), Image.LANCZOS)


def recolor(im, hue_deg, sat=1.0, val=1.0, min_sat=0.16):
    """把有颜色的部分转到目标色相（白色/奶油色纸边基本不变）。"""
    rgba = np.array(im).astype(np.float32) / 255
    hsv = np.array(im.convert('RGB').convert('HSV')).astype(np.float32) / 255
    s = hsv[..., 1]
    mask = s > min_sat
    hsv[..., 0] = np.where(mask, (hue_deg / 360.0) % 1.0, hsv[..., 0])
    hsv[..., 1] = np.where(mask, np.clip(s * sat, 0, 1), s)
    hsv[..., 2] = np.where(mask, np.clip(hsv[..., 2] * val, 0, 1), hsv[..., 2])
    rgb = np.array(Image.fromarray((hsv * 255).astype(np.uint8), 'HSV').convert('RGB')).astype(np.float32) / 255
    out = np.dstack([rgb, rgba[..., 3]])
    return Image.fromarray((out * 255).astype(np.uint8), 'RGBA')


def main(argv):
    if len(argv) != 2:
        sys.exit('用法：python tools/prep_stars.py 黄星星.png 紫星星.png')
    yellow, purple = cutout(argv[0]), cutout(argv[1])
    stars = [
        yellow,
        purple,
        recolor(yellow, 22, sat=1.25, val=0.98),   # 陶土橙 #F38B52
        recolor(yellow, 166, sat=0.85, val=0.82),  # 青石绿 #6FB7A9
        recolor(purple, 338, sat=0.95, val=1.06),  # 粉
        recolor(purple, 205, sat=1.0, val=1.05),   # 天蓝
    ]
    os.makedirs(OUT, exist_ok=True)
    for i, im in enumerate(stars, start=1):
        p = os.path.join(OUT, f'fx_star_{i:02d}.png')
        im.save(p, optimize=True)
        print(p, im.size, f'{os.path.getsize(p) // 1024} KB')


if __name__ == '__main__':
    main(sys.argv[1:])
