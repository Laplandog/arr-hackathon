"""把一张浅色纯底的素材合集图（例如 4 个雾团、一堆散落的云）拆成单独的透明 PNG。

用法（在项目根目录运行，需要 Python + Pillow + numpy + scipy）：
    python tools/cutout_sheet.py 雾团合集.png  public/assets/fog/fog_puff_  --soft
    python tools/cutout_sheet.py 散落的云.png  public/assets/bg/bg_25_cloud_

- 按从上到下、从左到右的顺序编号：<前缀>01.png、<前缀>02.png …
- --soft：毛茸茸的边（雾团）—— 按和底色的差别算半透明，并把边缘的浅色底“去掉”
- 默认：纸片硬边（云、星星）—— 从四周填充底色，边缘柔化 1 px
- 两种模式都会去掉 AI 出图常见的淡绿杂边
"""
import argparse
import os

import numpy as np
from PIL import Image
from scipy import ndimage

MARGIN = 8


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('sheet')
    ap.add_argument('prefix')
    ap.add_argument('--soft', action='store_true')
    ap.add_argument('--min-area', type=int, default=300)
    ap.add_argument('--row', type=int, default=0, help='排序时同一行的高度容差（像素，默认自动）')
    args = ap.parse_args()

    a = np.array(Image.open(args.sheet).convert('RGB')).astype(np.float32)
    edge = np.concatenate([a[:6].reshape(-1, 3), a[-6:].reshape(-1, 3), a[:, :6].reshape(-1, 3), a[:, -6:].reshape(-1, 3)])
    bg = np.median(edge, axis=0)

    # 去淡绿杂边：绿色高于红和蓝的像素，把绿压到不超过红蓝（灰紫的雾、奶油色的云都不受影响）
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    a[..., 1] = np.minimum(g, np.maximum(r, b))

    diff = np.abs(a - bg).max(axis=2)
    if args.soft:
        lo, hi = 8.0, 55.0
        alpha = np.clip((diff - lo) / (hi - lo), 0, 1)
        alpha = ndimage.gaussian_filter(alpha, 0.6)
        # 去掉边缘混进来的浅色底：c = (观察色 − (1−α)·底色) / α
        al = np.maximum(alpha, 0.05)[..., None]
        a = np.clip((a - (1 - al) * bg) / al, 0, 255)
        solid = alpha > 0.1
    else:
        cand = diff <= 10
        lab, _ = ndimage.label(cand)
        border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
        fg = ndimage.binary_fill_holes(~np.isin(lab, list(border)))
        fg = ndimage.binary_erosion(fg, iterations=1)
        alpha = np.clip(ndimage.gaussian_filter(fg.astype(np.float32), 0.8) * 1.2, 0, 1)
        solid = fg

    lab, n = ndimage.label(ndimage.binary_dilation(solid, iterations=4))
    items = []
    for i, sl in enumerate(ndimage.find_objects(lab), start=1):
        if sl is None:
            continue
        area = int((solid[sl] & (lab[sl] == i)).sum())
        if area < args.min_area:
            continue
        items.append((sl, i))
    if not items:
        raise SystemExit('没找到素材')
    hs = [sl[0].stop - sl[0].start for sl, _ in items]
    row = args.row or max(20, int(np.median(hs) * 0.6))
    items.sort(key=lambda t: (round(((t[0][0].start + t[0][0].stop) / 2) / row), (t[0][1].start + t[0][1].stop) / 2))

    os.makedirs(os.path.dirname(args.prefix) or '.', exist_ok=True)
    for k, (sl, i) in enumerate(items, start=1):
        y0, y1 = max(0, sl[0].start - MARGIN), min(a.shape[0], sl[0].stop + MARGIN)
        x0, x1 = max(0, sl[1].start - MARGIN), min(a.shape[1], sl[1].stop + MARGIN)
        own = ndimage.binary_dilation(lab == i, iterations=2)[y0:y1, x0:x1]
        rgba = np.dstack([a[y0:y1, x0:x1], alpha[y0:y1, x0:x1] * own * 255]).astype(np.uint8)
        out = f'{args.prefix}{k:02d}.png'
        Image.fromarray(rgba, 'RGBA').save(out, optimize=True)
        print(out, f'{x1 - x0}x{y1 - y0}')


if __name__ == '__main__':
    main()
