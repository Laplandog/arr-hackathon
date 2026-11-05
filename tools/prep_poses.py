"""把美术给的整张 Mochi 姿势图（透明背景）处理成游戏用的姿势贴图。

用法（在项目根目录运行，需要 Python + Pillow + numpy + scipy）：
    python tools/prep_poses.py idle=站立.webp sleep=睡觉.webp rest=趴下.webp happy=开心.webp \
                               huff=哈气.webp sneeze=喷嚏.webp dizzy=晕.webp

做了什么：
- 只保留最大的那块贴纸（以及完全落在它范围内的小装饰），去掉旁边零散的 Zzz、气团、闪光线（这些由代码做动画）
- 站立类姿势统一缩放到同一身高、脚底对齐到同一点；睡姿/趴姿底边也对齐到这一点（切换姿势时角色不会跳、不会忽大忽小）
- 所有姿势裁成同一个矩形，输出 public/assets/mochi/mochi_pose_<姿势>.png 和 public/assets/mochi/mochi_poses.json

idle 和 sleep 两张是必须的；其余缺了游戏里会用 idle / sleep 代替。
锚点用原图像素坐标：mouth（火苗出口，按 huff 图）、head_top（星星落点，按 happy 图）、zzz（Zzz 起点，按 sleep 图）。
可用 --mouth=930,405 这类参数覆盖。
"""
import json
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

OUT = os.path.join('public', 'assets', 'mochi')
MARGIN = 12
LYING = {'sleep', 'rest'}
ANCHORS = {'mouth': [930, 405], 'head_top': [790, 150], 'zzz': [1000, 330]}
ANCHOR_SRC = {'mouth': ['huff', 'idle'], 'head_top': ['happy', 'idle'], 'zzz': ['sleep']}


def clean(alpha):
    """保留最大连通块 + 完全落在它范围内的小块；返回新的 alpha 和主体 bbox (x0, y0, x1, y1)。"""
    solid = alpha > 16
    lab, n = ndimage.label(solid)
    if n == 0:
        return alpha, (0, 0, alpha.shape[1], alpha.shape[0])
    sizes = ndimage.sum(solid, lab, range(1, n + 1))
    k = int(np.argmax(sizes)) + 1
    ys, xs = np.where(lab == k)
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    keep = lab == k
    for i, sl in enumerate(ndimage.find_objects(lab), start=1):
        if i == k or sl is None:
            continue
        if sl[1].start >= x0 and sl[1].stop <= x1 and sl[0].start >= y0 and sl[0].stop <= y1:
            keep |= lab == i
    keep = ndimage.binary_dilation(keep, iterations=3)  # 带上抗锯齿的软边
    return np.where(keep, alpha, 0).astype(np.uint8), (int(x0), int(y0), int(x1), int(y1))


def main(argv):
    poses, anchors = {}, dict(ANCHORS)
    for arg in argv:
        k, _, v = arg.partition('=')
        k = k.lstrip('-')
        if k in anchors:
            anchors[k] = [int(t) for t in v.split(',')]
        else:
            poses[k] = v
    if 'idle' not in poses or 'sleep' not in poses:
        sys.exit('至少需要 idle=… 和 sleep=… 两张图')

    src, box = {}, {}
    for name, path in poses.items():
        arr = np.array(Image.open(path).convert('RGBA'))
        arr[..., 3], box[name] = clean(arr[..., 3])
        src[name] = Image.fromarray(arr)
    W, H = next(iter(src.values())).size

    # 站立类姿势：参考身高 = 身高中位数；脚底中心 = 中位数
    standing = [n for n in src if n not in LYING]
    heights = {n: box[n][3] - box[n][1] for n in standing}
    ref_h = float(np.median(list(heights.values())))
    feet_x = float(np.median([(box[n][0] + box[n][2]) / 2 for n in standing]))
    feet_y = float(np.median([box[n][3] for n in standing]))

    # 每个姿势：缩放 k，平移使 (bbox 底边中点) → (feet_x, feet_y)
    placed, xf = {}, {}
    pad = 400
    for n, im in src.items():
        x0, y0, x1, y1 = box[n]
        k = 1.0 if n in LYING else ref_h / heights[n]
        piece = im.crop((x0, y0, x1, y1))
        if abs(k - 1) > 0.005:
            piece = piece.resize((max(1, round((x1 - x0) * k)), max(1, round((y1 - y0) * k))), Image.LANCZOS)
        ox = round(feet_x - piece.width / 2) + pad
        oy = round(feet_y - piece.height) + pad
        canvas = Image.new('RGBA', (W + 2 * pad, H + 2 * pad), (0, 0, 0, 0))
        canvas.alpha_composite(piece, (ox, oy))
        placed[n] = canvas
        xf[n] = (k, x0, y0, ox, oy)  # 原图点 p → 新画布：(p - (x0,y0)) * k + (ox, oy)
        if abs(k - 1) > 0.005:
            print(f'{n}: 缩放 {k:.3f}（身高 {heights[n]} → {ref_h:.0f} px）')

    bbs = [p.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox() for p in placed.values()]
    cx0 = max(0, min(b[0] for b in bbs) - MARGIN)
    cy0 = max(0, min(b[1] for b in bbs) - MARGIN)
    cx1 = max(b[2] for b in bbs) + MARGIN
    cy1 = max(b[3] for b in bbs) + MARGIN

    os.makedirs(OUT, exist_ok=True)
    for n, p in placed.items():
        out = os.path.join(OUT, f'mochi_pose_{n}.png')
        p.crop((cx0, cy0, cx1, cy1)).save(out, optimize=True)
        print(f'{out}  {cx1 - cx0}x{cy1 - cy0}  ({os.path.getsize(out) // 1024} KB)')

    def map_pt(n, pt):
        k, x0, y0, ox, oy = xf[n]
        return [round((pt[0] - x0) * k + ox - cx0), round((pt[1] - y0) * k + oy - cy0)]

    out_anchors = {}
    for a, pt in anchors.items():
        n = next((s for s in ANCHOR_SRC[a] if s in xf), 'idle')
        out_anchors[a] = map_pt(n, pt)

    fx, fy = feet_x + pad - cx0, feet_y + pad - cy0
    meta = {
        '_note': '由 tools/prep_poses.py 生成。canvas = 姿势图尺寸；charBox = 站立角色的范围（游戏里把它的高度缩放成 layout.json 的 mochi.height，底边中点 = 脚底）；anchors = 火苗出口 / 星星落点 / Zzz 起点（像素，左上角原点）；artFacing = 1 表示角色脸朝右。',
        'canvas': [cx1 - cx0, cy1 - cy0],
        'charBox': [round(fx - ref_h * 0.4), round(fy - ref_h), round(fx + ref_h * 0.4), round(fy)],
        'artFacing': 1,
        'anchors': out_anchors,
        'poses': sorted(placed),
    }
    with open(os.path.join(OUT, 'mochi_poses.json'), 'w', encoding='utf-8') as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)
    print(json.dumps({k: v for k, v in meta.items() if k != '_note'}, ensure_ascii=False))


if __name__ == '__main__':
    main(sys.argv[1:])
