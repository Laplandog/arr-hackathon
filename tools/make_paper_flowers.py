"""
画两丛纸艺风的花（代替图）：主岛花位用，美术交真花之前先顶上。

  python tools/make_paper_flowers.py            # 写 public/assets/bg/bg_41_flowers_{big,small}_{open,closed}.png
  python tools/make_paper_flowers.py --preview out.png

open  = 开花（彩色）；closed = 花苞（直接做成跟场景一样的灰紫色，第 4 次哈气时交叉淡入成 open）。
美术交了真花图，用同样的文件名覆盖即可，不用改代码。

风格跟美术的纸片对齐：每片纸有奶油色纸边、往右下的柔和投影、纸纤维颗粒、花瓣根部略暗。
"""
import argparse
import math
import os

import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import gaussian_filter, grey_dilation

SS = 4  # 超采样，边缘抗锯齿
CREAM = np.array([246, 236, 212], np.float32) / 255
TINT = np.array([0.78, 0.74, 0.86], np.float32)  # 跟 config.layerRules.grayTint 一致


def shift0(a, dx, dy):
    """平移（不回卷，空出来的地方补 0）"""
    out = np.zeros_like(a)
    H, W = a.shape
    out[max(dy, 0):H + min(dy, 0), max(dx, 0):W + min(dx, 0)] = a[max(-dy, 0):H + min(-dy, 0), max(-dx, 0):W + min(-dx, 0)]
    return out


def hexc(h):
    h = h.lstrip('#')
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], np.float32) / 255


class Paper:
    def __init__(self, W, H, seed):
        self.W, self.H = W, H
        self.rgb = np.zeros((H, W, 3), np.float32)
        self.a = np.zeros((H, W), np.float32)
        self.Y, self.X = np.mgrid[0:H, 0:W].astype(np.float32)
        rng = np.random.default_rng(seed)
        fine = gaussian_filter(rng.standard_normal((H, W)), 0.7)
        mott = gaussian_filter(rng.standard_normal((H, W)), 7)
        fib = Image.new('L', (W, H), 0)
        d = ImageDraw.Draw(fib)
        for _ in range(W * H // 900):
            x, y = rng.uniform(0, W), rng.uniform(0, H)
            ang, ln = rng.uniform(0, math.pi), rng.uniform(4, 14)
            d.line([(x, y), (x + math.cos(ang) * ln, y + math.sin(ang) * ln)], fill=int(rng.uniform(60, 160)), width=1)
        fib = gaussian_filter(np.asarray(fib, np.float32) / 255, 0.5)
        self.grain = 1 + 0.03 * fine / fine.std() + 0.025 * mott / mott.std() + 0.05 * fib
        self.rng = rng

    # ---- 形状 ----
    def mask(self, pts):
        im = Image.new('L', (self.W * SS, self.H * SS), 0)
        ImageDraw.Draw(im).polygon([(x * SS, y * SS) for x, y in pts], fill=255)
        return np.asarray(im.resize((self.W, self.H), Image.BOX), np.float32) / 255

    def line_mask(self, pts, width):
        im = Image.new('L', (self.W * SS, self.H * SS), 0)
        ImageDraw.Draw(im).line([(x * SS, y * SS) for x, y in pts], fill=255, width=int(width * SS), joint='curve')
        return np.asarray(im.resize((self.W, self.H), Image.BOX), np.float32) / 255

    def disk(self, cx, cy, r, squish=1.0):
        n = 64
        return self.mask([(cx + r * math.cos(t), cy + r * squish * math.sin(t)) for t in np.linspace(0, 2 * math.pi, n, endpoint=False)])

    # ---- 合成 ----
    def over(self, rgb, a):
        a3 = a[..., None]
        out = a + self.a * (1 - a)
        num = rgb * a3 + self.rgb * (self.a * (1 - a))[..., None]
        self.rgb = np.where(out[..., None] > 1e-5, num / np.maximum(out, 1e-5)[..., None], self.rgb)
        self.a = out

    def piece(self, m, color, shade=None, edge=3.0, edge_col=None, shadow=(3, 5, 3.2, 0.3)):
        """一片纸：投影 → 纸边 → 纸面"""
        r = max(1, int(round(edge)))
        yy, xx = np.mgrid[-r:r + 1, -r:r + 1]
        em = grey_dilation(m, footprint=(xx * xx + yy * yy) <= r * r)
        em = np.maximum(gaussian_filter(em, 0.6), m)
        dx, dy, blur, sa = shadow
        if sa > 0:
            sm = shift0(gaussian_filter(em, blur), dx, dy)
            self.over(np.zeros(3, np.float32), sm * sa)
        ec = CREAM if edge_col is None else edge_col
        self.over(np.broadcast_to(ec, (self.H, self.W, 3)) * self.grain[..., None] ** 0.5, em)
        s = 1.0 if shade is None else shade
        col = color[None, None, :] * (s * self.grain)[..., None] if np.ndim(s) else color[None, None, :] * (s * self.grain)[..., None]
        self.over(np.clip(col, 0, 1), m)

    def axis_shade(self, bx, by, ang, L, lo=0.86, hi=1.04):
        t = ((self.X - bx) * math.cos(ang) + (self.Y - by) * math.sin(ang)) / L
        return lo + (hi - lo) * np.clip(t, 0, 1)


# ---- 几何 ----
def petal_pts(bx, by, ang, L, Wd, prof=(0.55, 0.32), bend=0.0, squish=1.0, cy=None, n=48):
    """花瓣 / 叶子：沿 ang 方向长 L，最宽 Wd。prof 控制宽处的位置和尖头的圆钝。"""
    a, b = prof
    ss = np.linspace(0, 1, n)
    f = ss ** a * (1 - ss) ** b
    f = f / f.max()
    ca, sa = math.cos(ang), math.sin(ang)
    left, right = [], []
    for s, w in zip(ss, f):
        u = s * L
        off = bend * (s ** 2) * L
        for side, arr in ((1, left), (-1, right)):
            v = side * w * Wd / 2 + off
            x = bx + u * ca - v * sa
            y = by + u * sa + v * ca
            if cy is not None:
                y = cy + (y - cy) * squish
            arr.append((x, y))
    return left + right[::-1]


def bezier(p0, p1, p2, n=40):
    t = np.linspace(0, 1, n)[:, None]
    p0, p1, p2 = map(np.array, (p0, p1, p2))
    return [tuple(p) for p in ((1 - t) ** 2 * p0 + 2 * (1 - t) * t * p1 + t ** 2 * p2)]


# 纸的颜色（跟美术的草、岛、Mochi 的暖橙同一套）
LEAF = ['#7b7e52', '#9caf8a', '#a2c0b6', '#b8c8a0', '#8fa77f']
STEM = hexc('#7f8a5a')
FLOWERS = {
    'coral':  ('#e98572', '#f6a891', '#f3c95c', '#e0874a'),
    'peach':  ('#ec9a55', '#f8be7e', '#f7dc8e', '#d9733f'),
    'pink':   ('#e397a7', '#f6bfca', '#f5d070', '#e48a5a'),
    'butter': ('#e7bd57', '#f8dc8c', '#ef9a5a', '#d26e3e'),
    'lilac':  ('#b99ad3', '#d9c2ea', '#f5d070', '#e48a5a'),
}


def leaf(P, bx, by, ang_deg, L, Wd, col, bend=0.0):
    ang = math.radians(ang_deg - 90)
    pts = petal_pts(bx, by, ang, L, Wd, prof=(0.7, 0.55), bend=bend)
    m = P.mask(pts)
    sh = P.axis_shade(bx, by, ang, L, 0.82, 1.06)
    # 中间一道折痕：一半稍暗
    crease = P.line_mask(bezier((bx, by), (bx + math.cos(ang) * L * 0.5 - math.sin(ang) * bend * L * 0.12,
                                           by + math.sin(ang) * L * 0.5 + math.cos(ang) * bend * L * 0.12),
                                (bx + math.cos(ang) * L * 0.85 - math.sin(ang) * bend * L * 0.7,
                                 by + math.sin(ang) * L * 0.85 + math.cos(ang) * bend * L * 0.7)), 1.6)
    sh = sh * (1 - 0.07 * crease)
    P.piece(m, hexc(col), sh, edge=3.2)


def stem(P, p0, p1, p2, w=5.0):
    m = P.line_mask(bezier(p0, p1, p2), w)
    P.piece(m, STEM, 1.0, edge=1.6, shadow=(2, 3, 2.0, 0.22))


def flower(P, cx, cy, R, kind, rot=0.0, squish=0.9, n=5):
    back, front, center, ring = (hexc(c) for c in FLOWERS[kind])
    # 后层花瓣（深一点、多一片）
    nb = n + 1
    for i in range(nb):
        ang = rot + i * 2 * math.pi / nb
        pts = petal_pts(cx, cy, ang, R, R * 0.72, prof=(0.45, 0.22), squish=squish, cy=cy)
        P.piece(P.mask(pts), back, P.axis_shade(cx, cy, ang, R, 0.78, 1.02), edge=2.4,
                edge_col=CREAM * 0.6 + back * 0.4, shadow=(2, 4, 2.6, 0.25))
    # 前层花瓣（浅、转半格、带一道折痕）
    for i in range(n):
        ang = rot + math.pi / n + i * 2 * math.pi / n
        pts = petal_pts(cx, cy, ang, R * 0.8, R * 0.62, prof=(0.45, 0.25), squish=squish, cy=cy)
        m = P.mask(pts)
        c0 = (cx + math.cos(ang) * R * 0.2, cy + math.sin(ang) * R * 0.2 * squish)
        c1 = (cx + math.cos(ang) * R * 0.66, cy + math.sin(ang) * R * 0.66 * squish)
        crease = P.line_mask([c0, c1], 1.4)
        sh = P.axis_shade(cx, cy, ang, R * 0.8, 0.84, 1.05) * (1 - 0.08 * crease)
        P.piece(m, front, sh, edge=2.2, edge_col=CREAM * 0.7 + front * 0.3, shadow=(2, 3, 2.2, 0.22))
    # 花心：外圈 + 内圈 + 几个小点
    P.piece(P.disk(cx, cy, R * 0.3, squish), ring, 1.0, edge=1.8, shadow=(1, 3, 2.0, 0.25))
    P.piece(P.disk(cx - R * 0.02, cy - R * 0.03, R * 0.21, squish), center, 1.0, edge=0, shadow=(0, 0, 1, 0))
    for k in range(7):
        t = k * 2 * math.pi / 7 + rot
        P.piece(P.disk(cx + math.cos(t) * R * 0.12, cy + math.sin(t) * R * 0.12 * squish, R * 0.028),
                ring * 0.85, 1.0, edge=0, shadow=(0, 0, 1, 0))


def bud(P, cx, cy, R, kind, tilt=0.0):
    """合上的花苞：三片尖瓣 + 底下两片绿萼片"""
    back, front, _, _ = (hexc(c) for c in FLOWERS[kind])
    base_y = cy + R * 0.55
    up = math.radians(-90 + tilt)
    for d, col in ((-0.38, back), (0.38, back), (0.0, front)):
        ang = up + d
        L = R * (1.05 if d == 0 else 0.92)
        pts = petal_pts(cx, base_y, ang, L, R * 0.62, prof=(0.6, 0.6))
        P.piece(P.mask(pts), col, P.axis_shade(cx, base_y, ang, L, 0.8, 1.04), edge=2.2,
                edge_col=CREAM * 0.7 + col * 0.3, shadow=(2, 3, 2.2, 0.22))
    for d in (-0.9, 0.9):
        ang = up + d
        pts = petal_pts(cx, base_y + R * 0.05, ang, R * 0.55, R * 0.26, prof=(0.6, 0.7))
        P.piece(P.mask(pts), hexc(LEAF[1]), 1.0, edge=1.8, shadow=(1, 2, 1.6, 0.2))


def dot_bud(P, x, y, r):
    """美术草丛上那种黄色小圆球，留一点呼应"""
    P.piece(P.disk(x, y, r), hexc('#f0cd6e'), P.axis_shade(x - r, y - r, math.radians(45), 2 * r, 0.9, 1.04),
            edge=2.0, shadow=(2, 3, 2.0, 0.25))


# ---- 两丛花的构图 ----
BIG = dict(W=1000, H=820, seed=41,
           base=(500, 800),
           back_leaves=[(-62, 300, 88, 0, 0.10), (60, 290, 84, 1, -0.10), (-34, 330, 92, 2, 0.06), (30, 340, 90, 3, -0.05)],
           flowers=[  # (x, y, R, 品种, 转角, 压扁, 瓣数)
               (305, 350, 122, 'coral', 0.2, 0.86, 5),
               (570, 265, 140, 'peach', -0.1, 0.9, 5),
               (770, 395, 106, 'pink', 0.5, 0.84, 6),
               (450, 500, 98, 'butter', 0.9, 0.9, 5),
               (660, 560, 80, 'coral', 0.3, 0.86, 5),
           ],
           dots=[(175, 470, 15), (850, 265, 14), (905, 510, 12)],
           front_leaves=[(-48, 210, 78, 4, 0.12), (52, 200, 74, 1, -0.12), (-8, 170, 70, 3, 0.04)])

SMALL = dict(W=680, H=600, seed=42,
             base=(340, 585),
             back_leaves=[(-55, 220, 70, 0, 0.10), (52, 215, 68, 2, -0.10), (-15, 240, 72, 3, 0.04)],
             flowers=[
                 (220, 300, 98, 'pink', 0.3, 0.86, 5),
                 (450, 245, 110, 'butter', -0.2, 0.9, 6),
                 (345, 420, 76, 'coral', 0.7, 0.88, 5),
             ],
             dots=[(115, 380, 12), (575, 340, 11)],
             front_leaves=[(-44, 150, 60, 4, 0.12), (46, 145, 58, 1, -0.12)])


def render(spec, opened):
    W, H = spec['W'], spec['H']
    P = Paper(W, H, spec['seed'])
    bx, by = spec['base']
    for ang, L, wd, ci, bend in spec['back_leaves']:
        leaf(P, bx + ang * 1.2, by, ang, L, wd, LEAF[ci], bend)
    # 花茎：从底部弯到花下
    for (x, y, R, kind, rot, sq, n) in spec['flowers']:
        top = (x, y + (R * 0.2 if opened else R * 0.45))
        stem(P, (bx + (x - bx) * 0.25, by - 10), (bx + (x - bx) * 0.8, (by + y) / 2 + 40), top, w=5.5)
    for (x, y, r) in spec['dots']:
        stem(P, (bx + (x - bx) * 0.3, by - 10), (bx + (x - bx) * 0.85, (by + y) / 2 + 30), (x, y + r * 0.6), w=3.2)
    # 后面的花先画（y 小的在后）
    for (x, y, R, kind, rot, sq, n) in sorted(spec['flowers'], key=lambda f: f[1]):
        if opened:
            flower(P, x, y, R, kind, rot, sq, n)
        else:
            bud(P, x, y + R * 0.25, R * 0.62, kind, tilt=(x - bx) / W * 30)
    for (x, y, r) in spec['dots']:
        dot_bud(P, x, y, r)
    for ang, L, wd, ci, bend in spec['front_leaves']:
        leaf(P, bx + ang * 0.9, by + 6, ang, L, wd, LEAF[ci], bend)
    rgb = np.clip(P.rgb, 0, 1)
    if not opened:  # 花苞版直接做成场景开场时的灰紫色
        lum = rgb @ np.array([0.2126, 0.7152, 0.0722], np.float32)
        rgb = np.clip(lum[..., None] * TINT[None, None, :] * 1.06, 0, 1)
    out = np.dstack([rgb, np.clip(P.a, 0, 1)])
    return Image.fromarray((out * 255 + 0.5).astype(np.uint8), 'RGBA')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default='public/assets/bg')
    ap.add_argument('--preview', default=None)
    a = ap.parse_args()
    imgs = {}
    for name, spec in (('big', BIG), ('small', SMALL)):
        pair = {st: render(spec, st == 'open') for st in ('open', 'closed')}
        # 开 / 合两张要交叉淡入，必须同一块画布：按两张的并集裁
        boxes = [im.getchannel('A').point(lambda v: 255 if v > 4 else 0).getbbox() for im in pair.values()]
        box = (min(b[0] for b in boxes), min(b[1] for b in boxes), max(b[2] for b in boxes), max(b[3] for b in boxes))
        for st, im in pair.items():
            im = im.crop(box)
            imgs[(name, st)] = im
            p = os.path.join(a.out, f'bg_41_flowers_{name}_{st}.png')
            im.save(p, optimize=True)
            print(p, im.size)
    if a.preview:
        pad = 30
        cols = [imgs[('big', 'closed')], imgs[('big', 'open')], imgs[('small', 'closed')], imgs[('small', 'open')]]
        Wt = sum(i.width for i in cols) + pad * (len(cols) + 1)
        Ht = max(i.height for i in cols) + 2 * pad
        bg = Image.new('RGBA', (Wt, Ht), (198, 185, 211, 255))
        x = pad
        for i in cols:
            bg.alpha_composite(i, (x, Ht - pad - i.height))
            x += i.width + pad
        bg.convert('RGB').save(a.preview)
        print('preview', a.preview)


if __name__ == '__main__':
    main()
