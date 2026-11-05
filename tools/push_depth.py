"""把 layout.json 里的场景整体往远处推（以孩子眼睛为中心），近处推得少、远处推得多。

用法（项目根目录）：
    python tools/push_depth.py                       # 默认：距离 近×1.5 远×2；看起来的大小 近80% 远70%
    python tools/push_depth.py 1.5 2.0 1.0 1.0       # 只拉开远近，构图完全不变（只有头显里感觉得到）

每个层：z' = z × s；x、y（相对眼睛）和 w 乘 s × a。
s = 距离倍数，a = 看起来的大小比例；两者都随原来的距离从“近”平滑过渡到“远”。
Mochi 高度、起飞高度、舒适带、光团位置也一起换算。
"""
import json
import sys

PATH = 'public/assets/layout.json'
arg = lambda i, d: float(sys.argv[i]) if len(sys.argv) > i else d
NEAR_S, FAR_S, NEAR_A, FAR_A = arg(1, 1.5), arg(2, 2.0), arg(3, 0.8), arg(4, 0.7)
D0, D1 = 2.6, 9.0   # 原来距离 ≤ D0 用“近”的值，≥ D1 用“远”的值，中间线性


def lerp_d(d, a, b):
    if d <= D0:
        return a
    if d >= D1:
        return b
    return a + (b - a) * (d - D0) / (D1 - D0)


def s_of(d):
    return lerp_d(d, NEAR_S, FAR_S)


def l_of(d):  # 横向/大小倍数 = 距离倍数 × 看起来的大小比例
    return s_of(d) * lerp_d(d, NEAR_A, FAR_A)


data = json.load(open(PATH, encoding='utf-8'))
eye = float(data.get('eyeHeight', 1.1))


def move(p):
    d = -p[2]
    s, l = s_of(d), l_of(d)
    return [round(p[0] * l, 3), round(eye + (p[1] - eye) * l, 3), round(p[2] * s, 3)], l


for group in ('layers', 'fog'):
    for k, e in data.get(group, {}).items():
        if k.startswith('_') or not isinstance(e, dict) or 'pos' not in e:
            continue
        if e.get('dome'):
            continue
        e['pos'], s = move(e['pos'])
        for f in ('w', 'h', 'bobAmp'):
            if f in e:
                e[f] = round(e[f] * s, 3)

m = data['mochi']
home, sm = move(m['homePos'])
m['homePos'] = home
m['height'] = round(m['height'] * sm, 3)
f = data.setdefault('flight', {})
f['groundY'] = round(eye + (f.get('groundY', home[1]) - eye) * sm, 3)
cb = data['comfortBand']
cb['yMin'] = round(eye + (cb['yMin'] - eye) * sm, 3)
cb['yMax'] = round(eye + (cb['yMax'] - eye) * sm, 3)
cb['w'] = round(cb['w'] * sm, 3)
data['orb']['restPos'], _ = move(data['orb']['restPos'])


def dump(d):
    """每个层一行，方便在 GitHub 网页上改"""
    out = ['{']
    keys = list(d.keys())
    for i, k in enumerate(keys):
        v = d[k]
        comma = ',' if i < len(keys) - 1 else ''
        if k in ('layers', 'fog') and isinstance(v, dict):
            out.append(f'  "{k}": {{')
            items = list(v.items())
            width = max(len(n) for n, _ in items) + 3
            for j, (n, e) in enumerate(items):
                c2 = ',' if j < len(items) - 1 else ''
                out.append(f'    {json.dumps(n) + ":":<{width}} {json.dumps(e, ensure_ascii=False)}{c2}')
            out.append(f'  }}{comma}')
        else:
            out.append(f'  {json.dumps(k)}: {json.dumps(v, ensure_ascii=False)}{comma}')
    out.append('}')
    return '\n'.join(out) + '\n'


open(PATH, 'w', encoding='utf-8').write(dump(data))
print(f'距离 近×{NEAR_S} 远×{FAR_S}，看起来的大小 近{NEAR_A:.0%} 远{FAR_A:.0%}；Mochi 高度 {m["height"]} m，位置 {home}')
